import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute paths independent of which tool loads a nested configuration. */
export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
export const rootPath = (...segments: string[]) => resolve(repositoryRoot, ...segments)

/** One alias contract for the official app, review Vite and Vitest runners. */
export const sourceAliases = {
  '@': rootPath('src'),
  '@app': rootPath('src/app'),
  '@shared': rootPath('src/shared'),
  '@adapters': rootPath('src/adapters'),
  '@runtimes': rootPath('src/runtimes'),
  '@features': rootPath('src/features'),
}
