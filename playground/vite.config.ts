import { defineConfig } from 'vite'
import Inspect from 'vite-plugin-inspect'
import AutoScaffold from '../src/vite'

export default defineConfig({
  plugins: [Inspect(), AutoScaffold()],
})
