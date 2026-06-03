import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // e2e tests wait on chokidar's watch events, whose latency varies a lot on
    // slow CI runners. Give them ample headroom so the polling helpers (which
    // time out below this) can succeed instead of vitest killing the test.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
