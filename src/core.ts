import type { Options, ResolvedOptions } from './types'
import type { ParsedTemplate } from './patterns'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import type { FSWatcher } from 'chokidar'
import chokidar from 'chokidar'
import { join, relative, resolve } from 'pathe'
import { inferWatchDirs, matchFile, parseTemplatePath } from './patterns'

export function resolveOptions(options: Options = {}): ResolvedOptions {
  return {
    watchDirs: options.watchDirs,
    scaffoldDir: options.scaffoldDir ?? '.scaffold',
    enabled: options.enabled ?? true,
  }
}

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
 * Load templates from scaffold directory, parsing paths into patterns
 */
export async function loadTemplatesFromDir(
  scaffoldDir: string,
  root: string,
): Promise<ParsedTemplate[]> {
  const dir = resolve(root, scaffoldDir)
  if (!existsSync(dir)) {
    return []
  }

  const files = scanDirSync(dir, dir)
  const templates: ParsedTemplate[] = []

  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8')
    templates.push(parseTemplatePath(file, content))
  }

  return templates
}

export function isFileEmpty(filePath: string): boolean {
  try {
    const s = statSync(filePath)
    return s.size === 0
  } catch {
    return false
  }
}

/**
 * Find matching template for a file path
 */
export function findTemplateForFile(
  filePath: string,
  templates: ParsedTemplate[],
): ParsedTemplate | undefined {
  for (const template of templates) {
    const match = matchFile(filePath, template)
    if (match !== null) {
      return template
    }
  }
  return undefined
}

export async function applyTemplate(filePath: string, template: ParsedTemplate): Promise<void> {
  writeFileSync(filePath, template.content, 'utf-8')
}

export interface WatcherContext {
  watchers: FSWatcher[]
  stop: () => Promise<void>
}

export function startWatchers(
  options: ResolvedOptions,
  root: string,
  templates: ParsedTemplate[],
  log: (msg: string) => void,
): WatcherContext {
  const watchers: FSWatcher[] = []
  const startTime = Date.now()
  const usePolling = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)

  // Infer watch dirs from templates if not explicitly provided
  const watchDirs = options.watchDirs ?? inferWatchDirs(templates)

  for (const watchDir of watchDirs) {
    const dir = resolve(root, watchDir)
    if (!existsSync(dir)) {
      continue
    }

    const watcher = chokidar.watch(dir, {
      ignoreInitial: false,
      usePolling,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    })

    watcher.on('add', async (filePath) => {
      let stats
      try {
        stats = statSync(filePath)
      } catch {
        return
      }

      const isNewFile = stats.birthtimeMs >= startTime || stats.ctimeMs >= startTime
      if (!isNewFile || stats.size !== 0) {
        return
      }

      const relativePath = relative(root, filePath)
      const template = findTemplateForFile(relativePath, templates)
      if (!template) {
        return
      }

      const filename = relative(dir, filePath)
      log(`[auto-scaffold] Scaffolding ${filename}`)
      await applyTemplate(filePath, template)
    })

    watchers.push(watcher)
  }

  return {
    watchers,
    stop: async () => {
      await Promise.all(watchers.map((watcher) => watcher.close()))
    },
  }
}
