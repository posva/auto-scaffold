export interface TemplateConfig {
  /** File extension to match (e.g., '.vue', '.ts') */
  extension: string
  /** Template content or function returning content */
  template: string | (() => string | Promise<string>)
}

export interface Options {
  /** Folders to watch (default: ['src/components']) */
  watchDirs?: string[]
  /** Template configurations */
  templates?: TemplateConfig[]
  /** Path to .scaffold folder (default: '.scaffold') */
  scaffoldDir?: string
  /** Enable/disable plugin (default: true in dev, false otherwise) */
  enabled?: boolean
}

export interface ResolvedOptions {
  watchDirs: string[]
  templates: TemplateConfig[]
  scaffoldDir: string
  enabled: boolean
}
