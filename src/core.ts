import type { FSWatcher } from 'node:fs'
import type { Options, ResolvedOptions, TemplateConfig } from './types'
import { existsSync, readFileSync, statSync, watch, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

export function resolveOptions(options: Options = {}, root: string): ResolvedOptions {
  return {
    watchDirs: options.watchDirs ?? ['src/components'],
    templates: options.templates ?? [],
    scaffoldDir: options.scaffoldDir ?? '.scaffold',
    enabled: options.enabled ?? true,
  }
}

export async function loadTemplatesFromDir(
  scaffoldDir: string,
  root: string,
): Promise<TemplateConfig[]> {
  const dir = resolve(root, scaffoldDir)
  if (!existsSync(dir)) {
    return []
  }

  const files = await readdir(dir)
  const templates: TemplateConfig[] = []

  for (const file of files) {
    const ext = extname(file)
    if (ext) {
      const content = readFileSync(join(dir, file), 'utf-8')
      templates.push({
        extension: ext,
        template: content,
      })
    }
  }

  return templates
}

export function isFileEmpty(filePath: string): boolean {
  try {
    const stat = statSync(filePath)
    return stat.size === 0
  } catch {
    return false
  }
}

export async function getTemplateContent(template: TemplateConfig): Promise<string> {
  if (typeof template.template === 'function') {
    return await template.template()
  }
  return template.template
}

export function findTemplateForFile(
  filePath: string,
  templates: TemplateConfig[],
): TemplateConfig | undefined {
  const ext = extname(filePath)
  return templates.find((t) => t.extension === ext)
}

export async function applyTemplate(filePath: string, template: TemplateConfig): Promise<void> {
  const content = await getTemplateContent(template)
  writeFileSync(filePath, content, 'utf-8')
}

export interface WatcherContext {
  watchers: FSWatcher[]
  stop: () => void
}

export function startWatchers(
  options: ResolvedOptions,
  root: string,
  templates: TemplateConfig[],
  log: (msg: string) => void,
): WatcherContext {
  const watchers: FSWatcher[] = []

  for (const watchDir of options.watchDirs) {
    const dir = resolve(root, watchDir)
    if (!existsSync(dir)) {
      continue
    }

    const watcher = watch(dir, { recursive: true }, async (eventType, filename) => {
      if (!filename || eventType !== 'rename') {
        return
      }

      const filePath = join(dir, filename)

      // Check file exists and is empty
      if (!existsSync(filePath) || !isFileEmpty(filePath)) {
        return
      }

      const template = findTemplateForFile(filePath, templates)
      if (!template) {
        return
      }

      log(`[auto-scaffold] Scaffolding ${filename}`)
      await applyTemplate(filePath, template)
    })

    watchers.push(watcher)
  }

  return {
    watchers,
    stop: () => {
      for (const watcher of watchers) {
        watcher.close()
      }
    },
  }
}
