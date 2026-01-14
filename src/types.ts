export interface Options {
  /** Folders to watch (inferred from scaffold structure if not provided) */
  watchDirs?: string[]
  /** Path to .scaffold folder (default: '.scaffold') */
  scaffoldDir?: string
  /** Enable/disable plugin (default: true in dev, false otherwise) */
  enabled?: boolean
}

export interface ResolvedOptions {
  /** Folders to watch (inferred from scaffold structure if not provided) */
  watchDirs?: string[]
  scaffoldDir: string
  enabled: boolean
}
