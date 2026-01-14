import type { Options, ResolvedOptions } from './types'
import type { ParsedTemplate } from './patterns'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
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

/**
 * Recursively scan a directory and return all file paths relative to the base
 */
async function scanDir(dir: string, base: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await scanDir(fullPath, base)))
    } else if (entry.isFile()) {
      files.push(relative(base, fullPath))
    }
  }

  return files
}

function scanDirSync(dir: string, base: string, files: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      scanDirSync(fullPath, base, files)
    } else if (entry.isFile()) {
      files.push(relative(base, fullPath))
    }
  }
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

  const files = await scanDir(dir, dir)
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
  ready: Promise<void>
  stop: () => Promise<void>
}

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

  // Infer watch dirs from templates if not explicitly provided
  const watchDirs = options.watchDirs ?? inferWatchDirs(templates)

  for (const watchDir of watchDirs) {
    const dir = resolve(root, watchDir)
    if (!existsSync(dir)) {
      continue
    }

    const existingFiles: string[] = []
    scanDirSync(dir, root, existingFiles)
    for (const file of existingFiles) {
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
