import type { PresetName } from './types'
import type { ParsedTemplate } from './patterns'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'pathe'
import { fileURLToPath } from 'node:url'
import { parseTemplatePath } from './patterns'

// Resolve presets directory relative to this module
const __dirname = dirname(fileURLToPath(import.meta.url))
const PRESETS_DIR = join(__dirname, '..', 'presets')

/**
 * Scan directory recursively for all files.
 */
function scanDirSync(dir: string, base: string): string[] {
  const files: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...scanDirSync(fullPath, base))
    } else if (entry.isFile()) {
      files.push(relative(base, fullPath))
    }
  }
  return files
}

/**
 * Load templates from a single preset.
 */
export function loadPreset(name: PresetName): ParsedTemplate[] {
  const presetDir = join(PRESETS_DIR, name)
  if (!existsSync(presetDir)) {
    return []
  }

  const files = scanDirSync(presetDir, presetDir)
  return files.map((file) => {
    const content = readFileSync(join(presetDir, file), 'utf-8')
    return parseTemplatePath(file, content)
  })
}

/**
 * Load and merge templates from multiple presets.
 * Later presets override earlier ones (by templatePath key).
 */
export function loadPresets(presets: PresetName[]): ParsedTemplate[] {
  const templateMap = new Map<string, ParsedTemplate>()

  for (const preset of presets) {
    const templates = loadPreset(preset)
    for (const template of templates) {
      templateMap.set(template.templatePath, template)
    }
  }

  return [...templateMap.values()]
}
