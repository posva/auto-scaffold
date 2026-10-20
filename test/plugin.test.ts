import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import autoScaffold from '../src/entries/vite'

describe('dev server scaffolding', () => {
  let root: string | undefined
  let server: Awaited<ReturnType<typeof createServer>> | undefined

  afterEach(async () => {
    await server?.close()
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('fills a new empty file while the dev server runs', async () => {
    root = mkdtempSync(join(tmpdir(), 'auto-scaffold-plugin-'))
    mkdirSync(join(root, '.scaffold/src'), { recursive: true })
    mkdirSync(join(root, 'src'))
    const content = 'export const scaffolded = true\n'
    writeFileSync(join(root, '.scaffold/src/[name].ts'), content)

    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [autoScaffold()],
      server: { port: 0 },
    })
    await server.listen()

    const target = join(root, 'src/example.ts')
    writeFileSync(target, '')

    await expect.poll(() => readFileSync(target, 'utf-8')).toBe(content)
  })
})
