import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: {
    index: 'src/index.ts',
    '*': 'src/entries/*.ts',
  },
  exports: true,
})
