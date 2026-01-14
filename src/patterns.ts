import { extname, basename, dirname } from 'pathe'

/**
 * A parsed segment of a template path pattern.
 */
export interface PatternSegment {
  type: 'static' | 'param' | 'spread'
  value: string
}

/**
 * Parsed representation of a template file path and content.
 */
export interface ParsedTemplate {
  /** Directory segments (e.g., ['src', 'components']) */
  segments: PatternSegment[]
  /** Filename pattern parts before extension */
  filename: PatternSegment[]
  /** File extension including dot (e.g., '.vue') */
  extension: string
  /** Original template path relative to scaffold dir */
  templatePath: string
  /** Template file content */
  content: string
}

const BRACKET_REGEX = /\[(?:\.\.\.)?([^\]]+)\]/g

/**
 * Parse a single segment (directory or filename part) into PatternSegment(s)
 */
function parseSegment(segment: string): PatternSegment[] {
  const parts: PatternSegment[] = []
  let lastIndex = 0

  for (const match of segment.matchAll(BRACKET_REGEX)) {
    // Add static part before this match
    if (match.index! > lastIndex) {
      parts.push({
        type: 'static',
        value: segment.slice(lastIndex, match.index),
      })
    }

    const isSpread = match[0].startsWith('[...')
    parts.push({
      type: isSpread ? 'spread' : 'param',
      value: match[1],
    })

    lastIndex = match.index! + match[0].length
  }

  // Add remaining static part
  if (lastIndex < segment.length) {
    parts.push({
      type: 'static',
      value: segment.slice(lastIndex),
    })
  }

  // If no brackets found, entire segment is static
  if (parts.length === 0) {
    parts.push({ type: 'static', value: segment })
  }

  return parts
}

/**
 * Parse a template file path into a {@link ParsedTemplate}.
 */
export function parseTemplatePath(relativePath: string, content: string): ParsedTemplate {
  const ext = extname(relativePath)
  const dir = dirname(relativePath)
  const file = basename(relativePath, ext)

  // Parse directory segments
  const segments: PatternSegment[] = []
  if (dir && dir !== '.') {
    for (const seg of dir.split('/')) {
      segments.push(...parseSegment(seg))
    }
  }

  // Parse filename (without extension)
  const filename = parseSegment(file)

  return {
    segments,
    filename,
    extension: ext,
    templatePath: relativePath,
    content,
  }
}

/**
 * Check if a single segment matches a pattern segment
 * Returns captured value or null if no match
 */
function matchSegmentPart(value: string, pattern: PatternSegment): string | null {
  if (pattern.type === 'static') {
    return value === pattern.value ? '' : null
  }
  // param or spread - capture the value
  return value
}

/**
 * Match filename against filename pattern parts
 * Returns captures or null if no match
 */
function matchFilename(filename: string, pattern: PatternSegment[]): Record<string, string> | null {
  const captures: Record<string, string> = {}

  // Build regex from pattern
  let regexStr = '^'
  const paramNames: { name: string; type: 'param' | 'spread' }[] = []

  for (const part of pattern) {
    if (part.type === 'static') {
      regexStr += escapeRegex(part.value)
    } else if (part.type === 'param') {
      regexStr += '([^/]+)'
      paramNames.push({ name: part.value, type: 'param' })
    } else {
      // spread in filename - matches the remaining filename part
      regexStr += '(.+)'
      paramNames.push({ name: part.value, type: 'spread' })
    }
  }
  regexStr += '$'

  const regex = new RegExp(regexStr)
  const match = filename.match(regex)

  if (!match) return null

  for (let i = 0; i < paramNames.length; i++) {
    captures[paramNames[i].name] = match[i + 1]
  }

  return captures
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Get the static prefix path from a parsed template (directories before any dynamic segment).
 */
export function getStaticPrefix(template: ParsedTemplate): string {
  const parts: string[] = []

  for (const seg of template.segments) {
    if (seg.type !== 'static') break
    parts.push(seg.value)
  }

  return parts.join('/')
}

/**
 * Match a file path against a parsed template pattern
 * Returns captured values or null if no match
 *
 * @param filePath - Path relative to root (e.g., 'src/components/forms/Input.vue')
 * @param template - Parsed template pattern
 */
export function matchFile(
  filePath: string,
  template: ParsedTemplate,
): Record<string, string> | null {
  const ext = extname(filePath)

  // Extension must match
  if (ext !== template.extension) return null

  const dir = dirname(filePath)
  const file = basename(filePath, ext)
  const pathSegments = dir === '.' ? [] : dir.split('/')

  const captures: Record<string, string> = {}

  // Match directory segments
  let pathIdx = 0
  let patternIdx = 0

  while (patternIdx < template.segments.length) {
    const pattern = template.segments[patternIdx]

    if (pattern.type === 'static') {
      if (pathIdx >= pathSegments.length || pathSegments[pathIdx] !== pattern.value) {
        return null
      }
      pathIdx++
      patternIdx++
    } else if (pattern.type === 'param') {
      if (pathIdx >= pathSegments.length) {
        return null
      }
      captures[pattern.value] = pathSegments[pathIdx]
      pathIdx++
      patternIdx++
    } else {
      // spread - consume remaining path segments (greedy, but leave room for remaining patterns)
      const remainingPatterns = template.segments.slice(patternIdx + 1)
      const staticCount = remainingPatterns.filter((p) => p.type === 'static').length

      // For spread in directory, we need to check if filename pattern has spread too
      const filenameHasSpread = template.filename.some((p) => p.type === 'spread')

      if (filenameHasSpread) {
        // Spread in both dir and filename - dir spread captures path segments,
        // filename spread captures nested path + filename
        const consumed = pathSegments.slice(pathIdx, pathSegments.length - staticCount)
        captures[pattern.value] = consumed.join('/')
        pathIdx = pathSegments.length - staticCount
      } else {
        // Spread only in directory - capture remaining dirs
        const consumed = pathSegments.slice(pathIdx, pathSegments.length - staticCount)
        captures[pattern.value] = consumed.join('/')
        pathIdx = pathSegments.length - staticCount
      }
      patternIdx++
    }
  }

  // Check for spread in filename that captures remaining path
  const filenameSpread = template.filename.find((p) => p.type === 'spread')

  if (filenameSpread) {
    // Spread in filename captures: remaining path segments + filename
    const remainingPath = pathSegments.slice(pathIdx)
    const fullPath = [...remainingPath, file].join('/')
    captures[filenameSpread.value] = fullPath

    // Match other filename parts (static suffixes)
    const filenameCaptures = matchFilename(
      file,
      template.filename.filter((p) => p.type === 'static'),
    )
    if (filenameCaptures === null && template.filename.some((p) => p.type === 'static')) {
      // Has static parts that didn't match
      const staticParts = template.filename.filter((p) => p.type === 'static')
      for (const part of staticParts) {
        if (!file.includes(part.value)) return null
      }
    }

    return captures
  }

  // All path segments should be consumed
  if (pathIdx !== pathSegments.length) {
    return null
  }

  // Match filename
  const filenameCaptures = matchFilename(file, template.filename)
  if (filenameCaptures === null) return null

  return { ...captures, ...filenameCaptures }
}

/**
 * Infer watch directories from a list of parsed templates.
 * Returns unique directory prefixes that should be watched.
 */
export function inferWatchDirs(templates: ParsedTemplate[]): string[] {
  const dirs = new Set<string>()

  for (const template of templates) {
    const prefix = getStaticPrefix(template)
    if (prefix) {
      dirs.add(prefix)
    }
  }

  return [...dirs]
}
