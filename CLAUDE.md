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

- `src/core.ts` - file watching, template loading
- `src/index.ts` - unplugin factory, Vite integration
- `src/types.ts` - Options, TemplateConfig interfaces
- `playground/` - test with `pnpm play`, create empty `.vue` in `src/components/`
