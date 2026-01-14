import type { PresetName } from './types'
import type { ParsedTemplate } from './patterns'
import { existsSync } from 'node:fs'
import { dirname, join } from 'pathe'
import { fileURLToPath } from 'node:url'
import { parseTemplatePath } from './patterns'
import { scanDirSync } from './utils'

// Resolve presets directory relative to this module
const __dirname = dirname(fileURLToPath(import.meta.url))
const PRESETS_DIR = join(__dirname, '..', 'presets')

/**
 * Load templates from a single preset.
 */
export function loadPreset(name: PresetName): ParsedTemplate[] {
  const presetDir = join(PRESETS_DIR, name)
  if (!existsSync(presetDir)) {
    return []
  }

  const files = scanDirSync(presetDir, presetDir)
  return files.map((file) => parseTemplatePath(file, presetDir))
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
