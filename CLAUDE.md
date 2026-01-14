# auto-scaffold

Unplugin that auto-scaffolds empty files from `.scaffold/` templates. Dev-only (Vite server hook).

## Commands

```bash
pnpm dev        # watch build
pnpm build      # production build
pnpm test       # vitest
pnpm play       # dev playground
pnpm lint       # oxlint
pnpm format     # oxfmt
```

## Structure

- `src/patterns.ts` - bracket syntax parsing, path matching
- `src/core.ts` - file watching, template loading
- `src/index.ts` - unplugin factory, Vite integration
- `src/types.ts` - Options interface

## Template Patterns

Bracket syntax (Vue Router-like):

- `[name].vue` - direct children only
- `[...path].vue` - any depth (0+ nested)
- `[name].component.vue` - with static suffix

Scaffold mirrors project structure:

```
.scaffold/src/components/[...path].vue → src/components/**/*.vue
```
