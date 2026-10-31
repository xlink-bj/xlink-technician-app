import { defineConfig } from 'vitest/config'
import { sourceAliases } from '../paths'

export default defineConfig({
  resolve: { alias: sourceAliases },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: false
  }
})
