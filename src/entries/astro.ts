import type { Options } from './types'

import unplugin from '..'

export default (options: Options): any => ({
  name: 'auto-scaffold',
  hooks: {
    'astro:config:setup': async (astro: any) => {
      if (astro.command !== 'dev' || options?.enabled === false) {
        return
      }

      astro.config.vite.plugins ||= []
      astro.config.vite.plugins.push(unplugin.vite(options))
    },
  },
})
