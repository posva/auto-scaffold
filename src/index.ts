import type { UnpluginFactory } from 'unplugin'
import type { Options } from './types'
import type { WatcherContext } from './core'
import { createUnplugin } from 'unplugin'
import { loadTemplatesFromDir, resolveOptions, startWatchers } from './core'

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

        // Load templates from .scaffold folder
        const templates = await loadTemplatesFromDir(resolved.scaffoldDir, root)

        if (templates.length === 0) {
          server.config.logger.warn(
            '[auto-scaffold] No templates found. Create templates in .scaffold/ folder.',
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
