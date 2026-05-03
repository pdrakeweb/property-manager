import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // jsdom for ActiveModuleContext + any module test that touches DOM
    // APIs through the registry (badge hooks call window.addEventListener
    // when they run, even though they don't run at module load).
    environment: 'jsdom',
    globals:     true,
    setupFiles:  ['./src/modules/__tests__/vitestSetup.ts'],
    // Tests live next to or under modules; vault tests stay on node:test
    // (already wired up via the `test:vault` script).
    include: [
      'src/modules/**/*.test.ts',
      'src/modules/**/*.test.tsx',
    ],
  },
})
