import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false, // Disable DTS generation for now due to minimatch issue
  splitting: false,
  sourcemap: true,
  clean: true,
  banner: {
    js: '// SuperPool Shared Types',
  },
})
