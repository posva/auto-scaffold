import type { UnpluginFactory } from 'unplugin'
import type { Options } from './entries/types'
import type { WatcherContext } from './core'
import { createUnplugin } from 'unplugin'
import { loadTemplatesFromDir, mergeTemplates, resolveOptions, startWatchers } from './core'
import { loadPresets } from './presets'

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options) => {
  let watcherContext: WatcherContext | null = null
  let root = process.cwd()

  return {
    name: 'auto-scaffold',

    vite: {
      configResolved(config) {
        root = config.root
      },

      async configureServer(server) {
        const resolved = resolveOptions(options)

        // Only enable in serve mode (dev)
        if (!resolved.enabled) {
          return
        }

        // Load preset templates
        const presetTemplates = loadPresets(resolved.presets)

        // Load user templates from .scaffold folder
        const userTemplates = await loadTemplatesFromDir(resolved.scaffoldDir, root)

        // Merge: user templates override presets
        const templates = mergeTemplates(presetTemplates, userTemplates)

        if (templates.length === 0) {
          server.config.logger.warn(
            '[auto-scaffold] No templates found. Add presets or create templates in .scaffold/ folder.',
          )
          return
        }

        watcherContext = startWatchers(resolved, root, templates, (msg) =>
          server.config.logger.info(msg),
        )

        server.httpServer?.on('close', () => {
          watcherContext?.stop()
        })
      },
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin

// Re-export types and preset utilities
export type { Options, PresetName } from './entries/types'
export { loadPreset, loadPresets } from './presets'
