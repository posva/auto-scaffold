# auto-scaffold

[![NPM version](https://img.shields.io/npm/v/auto-scaffold?color=a1b858&label=)](https://www.npmjs.com/package/auto-scaffold)

Dev-only plugin that automatically populates empty files with templates when they're created.

## Features

- Watch folders for new empty files
- Auto-populate with configurable templates
- Support for any file extension (.vue, .ts, .tsx, etc.)
- Templates stored in `.scaffold/` folder or inline config
- Dev-only - doesn't run during builds

## Install

```bash
npm i -D auto-scaffold
```

## Usage

Create a `.scaffold` folder in your project root with template files:

```
.scaffold/
├── src/components/[...path].component.vue  # Template for nested components
├── src/composables/[name].ts               # Template for direct children
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
      // Optional: customize watched folders (default: ['src/components'])
      watchDirs: ['src/components', 'src/views'],
      // Optional: inline templates (merged with .scaffold/ files)
      templates: [{ extension: '.vue', template: '<template></template>' }],
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
    watchDirs: ['components'],
  },
})
```

<br></details>

## Options

| Option        | Type               | Default              | Description                         |
| ------------- | ------------------ | -------------------- | ----------------------------------- |
| `watchDirs`   | `string[]`         | `['src/components']` | Folders to watch for new files      |
| `scaffoldDir` | `string`           | `'.scaffold'`        | Directory containing template files |
| `templates`   | `TemplateConfig[]` | `[]`                 | Inline template configurations      |
| `enabled`     | `boolean`          | `true`               | Enable/disable the plugin           |

## How It Works

1. When the dev server starts, auto-scaffold loads templates from `.scaffold/` folder
2. It watches the configured directories for file changes
3. When an empty file is created (0 bytes), it matches the extension to a template
4. The template content is automatically written to the file

## License

MIT
