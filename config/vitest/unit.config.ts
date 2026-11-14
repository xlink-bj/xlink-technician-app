import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { sourceAliases } from '../paths'

export default defineConfig({
  // Pure tests must not inherit private local login/API configuration. Tests
  // exercising a runtime environment opt in explicitly with vi.stubEnv.
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: sourceAliases },
  test: {
    env: { VITE_XLINK_ENVIRONMENT: 'test' },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: false
  }
})
