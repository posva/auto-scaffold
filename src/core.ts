import type { Options, PresetName, ResolvedOptions } from './entries/types'
import type { ParsedTemplate } from './patterns'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { FSWatcher } from 'chokidar'
import chokidar from 'chokidar'
import { join, relative, resolve } from 'pathe'
import { inferWatchDirs, matchFile, parseTemplatePath } from './patterns'
import { scanDirSync } from './utils'

/**
 * Get template content by reading from disk.
 */
export function getTemplateContent(template: ParsedTemplate): string {
  return readFileSync(join(template.scaffoldDir, template.templatePath), 'utf-8')
}

/**
 * Apply defaults to user options.
 */
export function resolveOptions(options: Options = {}): ResolvedOptions {
  // Normalize presets to array
  let presets: PresetName[] = []
  if (options.presets) {
    presets = Array.isArray(options.presets) ? options.presets : [options.presets]
  }

  return {
    scaffoldDir: options.scaffoldDir ?? '.scaffold',
    enabled: options.enabled ?? true,
    presets,
  }
}

/**
 * Represents a discovered .scaffold folder with its scope.
 */
export interface ScaffoldSource {
  /** Absolute path to .scaffold folder */
  scaffoldDir: string
  /** Absolute path to the directory containing .scaffold (scope root) */
  scopeRoot: string
  /** Depth: 0 = root scaffold, higher = closer to file (higher priority) */
  depth: number
}

/**
 * Recursively discover all .scaffold folders in the project tree.
 */
export function discoverScaffoldDirs(
  root: string,
  scaffoldDirName = '.scaffold',
): ScaffoldSource[] {
  const sources: ScaffoldSource[] = []

  function scan(dir: string, depth: number) {
    const scaffoldPath = join(dir, scaffoldDirName)
    if (existsSync(scaffoldPath) && statSync(scaffoldPath).isDirectory()) {
      sources.push({
        scaffoldDir: scaffoldPath,
        scopeRoot: dir,
        depth,
      })
    }

    // Continue scanning subdirectories (skip .scaffold itself and hidden dirs)
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== scaffoldDirName && !entry.name.startsWith('.')) {
          scan(join(dir, entry.name), depth + 1)
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  }

  scan(root, 0)
  return sources
}

/**
 * Merge templates from presets and user config.
 * User templates override presets with the same templatePath.
 */
export function mergeTemplates(
  presetTemplates: ParsedTemplate[],
  userTemplates: ParsedTemplate[],
): ParsedTemplate[] {
  const templateMap = new Map<string, ParsedTemplate>()

  // Presets first (lower precedence)
  for (const t of presetTemplates) {
    templateMap.set(t.templatePath, t)
  }

  // User templates override (higher precedence)
  for (const t of userTemplates) {
    templateMap.set(t.templatePath, t)
  }

  return [...templateMap.values()]
}

/**
 * Load templates from a scaffold directory, parsing paths into patterns.
 */
export async function loadTemplatesFromDir(
  scaffoldDir: string,
  root: string,
  scopePrefix = '',
  scopeDepth = 0,
): Promise<ParsedTemplate[]> {
  const dir = resolve(root, scaffoldDir)
  if (!existsSync(dir)) {
    return []
  }

  const files = scanDirSync(dir, dir)
  return files.map((file) => parseTemplatePath(file, dir, scopePrefix, scopeDepth))
}

/**
 * Discover all .scaffold folders and load templates from each.
 */
export async function loadAllTemplates(
  root: string,
  scaffoldDirName = '.scaffold',
): Promise<ParsedTemplate[]> {
  const sources = discoverScaffoldDirs(root, scaffoldDirName)
  const allTemplates: ParsedTemplate[] = []

  for (const source of sources) {
    // Compute scope prefix: relative path from project root to scope root
    const scopePrefix = source.scopeRoot === root ? '' : relative(root, source.scopeRoot)
    const files = scanDirSync(source.scaffoldDir, source.scaffoldDir)
    for (const file of files) {
      allTemplates.push(parseTemplatePath(file, source.scaffoldDir, scopePrefix, source.depth))
    }
  }

  return allTemplates
}

/**
 * Check if a file exists and has zero size.
 */
export function isFileEmpty(filePath: string): boolean {
  try {
    const s = statSync(filePath)
    return s.size === 0
  } catch {
    return false
  }
}

/**
 * Find the matching template for a file path.
 */
export function findTemplateForFile(
  filePath: string,
  templates: ParsedTemplate[],
): ParsedTemplate | undefined {
  let bestTemplate: ParsedTemplate | undefined
  let bestSpecificity: number[] | undefined

  for (const template of templates) {
    const match = matchFile(filePath, template)
    if (match !== null) {
      const specificity = getTemplateSpecificity(template)
      if (!bestSpecificity || compareSpecificity(specificity, bestSpecificity) > 0) {
        bestTemplate = template
        bestSpecificity = specificity
      }
    }
  }
  return bestTemplate
}

function getTemplateSpecificity(template: ParsedTemplate): number[] {
  let staticDirParts = 0
  let staticFilenameParts = 0
  let paramParts = 0
  let spreadParts = 0

  for (const segment of template.segments) {
    if (segment.type === 'static') {
      staticDirParts++
    } else if (segment.type === 'param') {
      paramParts++
    } else {
      spreadParts++
    }
  }

  for (const part of template.filename) {
    if (part.type === 'static') {
      staticFilenameParts++
    } else if (part.type === 'param') {
      paramParts++
    } else {
      spreadParts++
    }
  }

  const isFullyStatic = paramParts === 0 && spreadParts === 0 ? 1 : 0

  // Specificity first, depth as tiebreaker:
  // - Exact match (fully static) always wins
  // - More specific filename parts
  // - More specific directory parts
  // - Fewer wildcards (spread patterns)
  // - Fewer params
  // - Depth only breaks ties (deeper scaffolds closer to file)
  return [
    isFullyStatic,
    staticFilenameParts,
    staticDirParts,
    -spreadParts,
    -paramParts,
    template.scopeDepth,
  ]
}

function compareSpecificity(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i]
    }
  }
  return 0
}

/**
 * Write a template's content into a file path.
 * Reads template content from disk dynamically to pick up changes.
 */
export async function applyTemplate(filePath: string, template: ParsedTemplate): Promise<void> {
  const content = getTemplateContent(template)
  writeFileSync(filePath, content, 'utf-8')
}

/**
 * Handles the lifecycle of file watchers.
 */
export interface WatcherContext {
  watchers: FSWatcher[]
  ready: Promise<void>
  stop: () => Promise<void>
}

/**
 * Start file watchers and apply templates for new empty files.
 * Also watches .scaffold directories for template changes.
 */
export function startWatchers(
  options: ResolvedOptions,
  root: string,
  templates: ParsedTemplate[],
  log: (msg: string) => void,
): WatcherContext {
  const watchers: FSWatcher[] = []
  const readyPromises: Promise<void>[] = []
  const usePolling = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)
  const initialFiles = new Set<string>()

  // Watch scaffold directories for template changes
  const sources = discoverScaffoldDirs(root, options.scaffoldDir)
  for (const source of sources) {
    const scaffoldWatcher = chokidar.watch(source.scaffoldDir, {
      ignoreInitial: true,
      usePolling,
      depth: 99,
    })
    readyPromises.push(
      new Promise((resolve) => {
        scaffoldWatcher.once('ready', resolve)
      }),
    )

    const scopePrefix = source.scopeRoot === root ? '' : relative(root, source.scopeRoot)

    // Handle template file added or changed
    const handleTemplateChange = (filePath: string) => {
      const templatePath = relative(source.scaffoldDir, filePath)
      // Skip non-files (directories)
      try {
        if (!statSync(filePath).isFile()) return
      } catch {
        return
      }

      // Remove existing template with same path and scope
      const existingIndex = templates.findIndex(
        (t) => t.templatePath === templatePath && t.scaffoldDir === source.scaffoldDir,
      )
      if (existingIndex !== -1) {
        templates.splice(existingIndex, 1)
      }

      // Add new/updated template
      const newTemplate = parseTemplatePath(
        templatePath,
        source.scaffoldDir,
        scopePrefix,
        source.depth,
      )
      templates.push(newTemplate)
      log(`[auto-scaffold] Template ${existingIndex !== -1 ? 'updated' : 'added'}: ${templatePath}`)
    }

    // Handle template file removed
    const handleTemplateRemove = (filePath: string) => {
      const templatePath = relative(source.scaffoldDir, filePath)
      const existingIndex = templates.findIndex(
        (t) => t.templatePath === templatePath && t.scaffoldDir === source.scaffoldDir,
      )
      if (existingIndex !== -1) {
        templates.splice(existingIndex, 1)
        log(`[auto-scaffold] Template removed: ${templatePath}`)
      }
    }

    scaffoldWatcher.on('add', handleTemplateChange)
    scaffoldWatcher.on('change', handleTemplateChange)
    scaffoldWatcher.on('unlink', handleTemplateRemove)

    watchers.push(scaffoldWatcher)
  }

  const watchDirs = inferWatchDirs(templates)

  for (const watchDir of watchDirs) {
    const dir = resolve(root, watchDir)
    if (!existsSync(dir)) {
      continue
    }

    for (const file of scanDirSync(dir, root)) {
      initialFiles.add(file)
    }

    const watcher = chokidar.watch(dir, {
      ignoreInitial: false,
      usePolling,
      depth: 99,
      ...(usePolling
        ? {}
        : {
            awaitWriteFinish: {
              stabilityThreshold: 100,
              pollInterval: 50,
            },
          }),
    })
    readyPromises.push(
      new Promise((resolve) => {
        watcher.once('ready', resolve)
      }),
    )

    watcher.on('add', async (filePath) => {
      const relativePath = relative(root, filePath)
      if (initialFiles.has(relativePath)) {
        return
      }

      if (!isFileEmpty(filePath)) {
        return
      }

      const template = findTemplateForFile(relativePath, templates)
      if (!template) {
        return
      }

      const filename = relative(dir, filePath)
      log(`[auto-scaffold] Scaffolding ${filename}`)
      await applyTemplate(filePath, template)
    })

    watcher.on('unlink', (filePath) => {
      const relativePath = relative(root, filePath)
      initialFiles.delete(relativePath)
    })

    watchers.push(watcher)
  }

  return {
    watchers,
    ready: Promise.all(readyPromises).then(() => undefined),
    stop: async () => {
      await Promise.all(watchers.map((watcher) => watcher.close()))
    },
  }
}
