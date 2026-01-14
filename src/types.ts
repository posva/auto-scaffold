/** Available built-in presets. */
export type PresetName = 'vue' | 'vue-router' | 'pinia' | 'pinia-colada'

/**
 * User-facing configuration for auto-scaffold.
 */
export interface Options {
  /** Path to scaffold folder (default: '.scaffold'). */
  scaffoldDir?: string
  /** Enable/disable plugin (default: true in dev, false otherwise). */
  enabled?: boolean
  /** Built-in presets to apply. Later presets override earlier ones. */
  presets?: PresetName | PresetName[]
}

/**
 * Resolved configuration with defaults applied.
 */
export interface ResolvedOptions {
  scaffoldDir: string
  enabled: boolean
  presets: PresetName[]
}
