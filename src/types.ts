export interface Options {
  /** Path to .scaffold folder (default: '.scaffold') */
  scaffoldDir?: string
  /** Enable/disable plugin (default: true in dev, false otherwise) */
  enabled?: boolean
}

export interface ResolvedOptions {
  scaffoldDir: string
  enabled: boolean
}
