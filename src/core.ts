import type { Options, ResolvedOptions } from './types'
import type { ParsedTemplate } from './patterns'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import type { FSWatcher } from 'chokidar'
import chokidar from 'chokidar'
import { join, relative, resolve } from 'pathe'
import { inferWatchDirs, matchFile, parseTemplatePath } from './patterns'
import { normalizePresetList, resolvePresetScaffoldDirs } from './presets'

/**
 * Apply defaults to user options.
 */
export function resolveOptions(options: Options = {}): ResolvedOptions {
  return {
    scaffoldDir: options.scaffoldDir ?? '.scaffold',
    presets: normalizePresetList(options.presets),
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
 * Load templates from the scaffold directory, parsing paths into patterns.
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

/**
 * Load templates from presets (in order) and the user scaffold directory.
 */
export async function loadTemplates(
  options: ResolvedOptions,
  root: string,
): Promise<ParsedTemplate[]> {
  const userTemplates = await loadTemplatesFromDir(options.scaffoldDir, root)
  if (options.presets.length === 0) {
    return userTemplates
  }

  const presetDirs = resolvePresetScaffoldDirs(options.presets)
  const presetTemplates = (
    await Promise.all(
      presetDirs
        .slice()
        .reverse()
        .map((presetDir) => loadTemplatesFromDir(presetDir, root)),
    )
  ).flat()

  return [...userTemplates, ...presetTemplates]
}

/**
 * Check if a file exists and has zero size.
 */
export function isFileEmpty(filePath: string): boolean {
  try {
    const s = statSync(filePath)
    return s.size === 0
  } catch {
    return false
  }
}

/**
 * Find the matching template for a file path.
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

/**
 * Write a template's content into a file path.
 */
export async function applyTemplate(filePath: string, template: ParsedTemplate): Promise<void> {
  writeFileSync(filePath, template.content, 'utf-8')
}

/**
 * Handles the lifecycle of file watchers.
 */
export interface WatcherContext {
  watchers: FSWatcher[]
  ready: Promise<void>
  stop: () => Promise<void>
}

/**
 * Start file watchers and apply templates for new empty files.
 */
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

  const watchDirs = inferWatchDirs(templates)

  for (const watchDir of watchDirs) {
    const dir = resolve(root, watchDir)
    if (!existsSync(dir)) {
      continue
    }

    for (const file of scanDirSync(dir, root)) {
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
