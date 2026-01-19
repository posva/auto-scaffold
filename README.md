# auto-scaffold

[![NPM version](https://img.shields.io/npm/v/auto-scaffold?color=a1b858&label=)](https://www.npmjs.com/package/auto-scaffold)

Create empty file → get boilerplate. That's it.

```bash
npm i -D auto-scaffold
```

## Setup

Add to your Vite config:

```ts
import AutoScaffold from 'auto-scaffold/vite'

export default defineConfig({
  plugins: [AutoScaffold()],
})
```

<details>
<summary>Nuxt</summary>

```ts
export default defineNuxtConfig({
  modules: ['auto-scaffold/nuxt'],
})
```

</details>

## Templates

Drop templates in `.scaffold/` mirroring your project structure:

```
.scaffold/
├── src/components/[...path].vue    # any depth
├── src/composables/[name].ts       # direct children only
└── src/stores/[name].store.ts      # with suffix
```

Create `src/components/Button.vue` (empty) → filled with template content.

### Nested Scaffolds

Place `.scaffold/` folders anywhere. Deeper ones win:

```
project/
├── .scaffold/src/components/[...path].vue      # default
└── src/modules/admin/
    ├── .scaffold/components/[...path].vue      # wins for admin/*
    └── components/Button.vue                   # uses admin template
```

### Pattern Syntax

| Pattern           | Matches                          |
| ----------------- | -------------------------------- |
| `[name]`          | Single segment (direct children) |
| `[...path]`       | Any depth (0+ nested)            |
| `[name].store.ts` | With static suffix               |

## Presets

Skip `.scaffold/` setup with built-in templates:

```ts
AutoScaffold({ presets: ['vue', 'pinia'] })
```

Available: `vue`, `vue-router`, `pinia`, `pinia-colada`

User templates always override presets.

## Options

| Option        | Default       | Description          |
| ------------- | ------------- | -------------------- |
| `scaffoldDir` | `'.scaffold'` | Template folder name |
| `presets`     | `[]`          | Built-in presets     |
| `enabled`     | `true`        | Toggle plugin        |

## License

MIT
