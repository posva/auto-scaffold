# auto-scaffold

[![NPM version](https://img.shields.io/npm/v/auto-scaffold?color=a1b858&label=)](https://www.npmjs.com/package/auto-scaffold)

Dev-only plugin that automatically populates empty files with templates when they're created.

## Features

- Watch folders for new empty files (inferred from templates)
- Auto-populate with configurable templates
- Support for any file extension (.vue, .ts, .tsx, etc.)
- Templates stored in `.scaffold/` folder
- Built-in presets for common project structures
- Dev-only - doesn't run during builds

## Install

```bash
npm i -D auto-scaffold
```

## Usage

Create a `.scaffold` folder in your project root with template files:

```
.scaffold/
├── src/components/[...path].vue         # Template for components (nested or not)
├── src/pages/[...path].component.vue    # Allows partial names
├── src/composables/[name].ts            # Template for direct children
└── ...
```

Example `.scaffold/src/components/[...path].component.vue`:

```vue
<script setup lang="ts"></script>

<template>
  <div></div>
</template>
```

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import AutoScaffold from 'auto-scaffold/vite'

export default defineConfig({
  plugins: [
    AutoScaffold({
      // Optional: change scaffold directory (default: '.scaffold')
      scaffoldDir: '.scaffold',
      // Optional: use built-in presets
      // presets: ['vue', 'pinia'],
    }),
  ],
})
```

<br></details>

<details>
<summary>Nuxt</summary><br>

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['auto-scaffold/nuxt'],
  autoScaffold: {
    scaffoldDir: '.scaffold',
    // presets: ['vue-router'],
  },
})
```

<br></details>

## Presets

Built-in presets provide templates without requiring a local `.scaffold/` folder.
Later presets override earlier ones, and user templates (from `.scaffold/`) always win.

Available presets:

- `vue` (components)
- `vue-router` (pages)
- `pinia` (stores)
- `pinia-colada` (queries)

## Options

| Option        | Type                           | Default       | Description                                        |
| ------------- | ------------------------------ | ------------- | -------------------------------------------------- |
| `scaffoldDir` | `string`                       | `'.scaffold'` | Directory containing template files                |
| `enabled`     | `boolean`                      | `true`        | Enable/disable the plugin                          |
| `presets`     | `PresetName` or `PresetName[]` | `[]`          | Built-in presets to apply (later presets override) |

## How It Works

1. When the dev server starts, auto-scaffold loads templates from `.scaffold/` folder
2. It watches the inferred directories for file changes
3. When an empty file is created (0 bytes), it matches the path to a template
4. If multiple templates match, the most specific pattern wins
5. The template content is automatically written to the file

## License

MIT
