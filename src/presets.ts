import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'

const presetNames = new Set(['vue', 'vue-router', 'pinia', 'pinia-colada'])
const presetRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'presets')

export function normalizePresetList(presets?: string | string[]): string[] {
  if (!presets) return []
  const list = Array.isArray(presets) ? presets : [presets]

  return list
    .map((preset) =>
      preset
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, '-'),
    )
    .filter((preset) => presetNames.has(preset))
}

export function resolvePresetScaffoldDirs(presets: string[]): string[] {
  const dirs: string[] = []

  for (const preset of presets) {
    const dir = join(presetRoot, preset)
    if (existsSync(dir)) {
      dirs.push(dir)
    }
  }

  return dirs
}
