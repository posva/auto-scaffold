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

## Nested Scaffolds

`.scaffold/` folders can exist at any level. Deeper ones take priority:

```
project/.scaffold/              # depth 0 (root)
src/modules/admin/.scaffold/    # depth 3 (wins for admin/*)
```

Key concepts:

- `scopePrefix`: path from root to scaffold's parent (e.g., `src/modules/admin`)
- `scopeDepth`: folder depth (higher = closer to file = wins)
- Templates only match files within their scope
