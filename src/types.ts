/**
 * User-facing configuration for auto-scaffold.
 */
export interface Options {
  /** Path to scaffold folder (default: '.scaffold'). */
  scaffoldDir?: string
  /** Enable/disable plugin (default: true in dev, false otherwise). */
  enabled?: boolean
}

/**
 * Resolved configuration with defaults applied.
 */
export interface ResolvedOptions {
  scaffoldDir: string
  enabled: boolean
}
