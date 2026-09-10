import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src', import.meta.url))
const guardedRoots = ['app', 'shared', 'runtimes', 'features', 'adapters']
const sourceExtensions = new Set(['.ts', '.vue'])
const forbiddenPatterns = [
  { label: 'Mini Program API', pattern: /\bwx\s*\./ },
  { label: 'App-Plus API', pattern: /\bplus\s*\./ },
  { label: 'uni platform API', pattern: /\buni\s*\./ },
  { label: 'native module import', pattern: /from\s+['"](?:android|ios|@capacitor|react-native)(?:[/'"]|$)/i },
  { label: 'Legacy source import', pattern: /from\s+['"].*(?:legacy|xlink-business-jishi-3\.0|xlink-business-3\.0|xlink-app).*[/'"]?/i }
]

const inwardBoundaryPatterns = [
  { label: 'adapter implementation import', pattern: /from\s+['"](?:@adapters|(?:\.\.\/)+adapters)(?:[/'"]|$)/ },
  { label: 'feature implementation import', pattern: /from\s+['"](?:@features|(?:\.\.\/)+features)(?:[/'"]|$)/ }
]

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(path))
    else if (sourceExtensions.has(path.slice(path.lastIndexOf('.')))) files.push(path)
  }
  return files
}

const violations = []
for (const guardedRoot of guardedRoots) {
  const directory = join(root, guardedRoot)
  try {
    const files = await collectFiles(directory)
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      const patterns = guardedRoot === 'adapters'
        ? [forbiddenPatterns[4], inwardBoundaryPatterns[1]]
        : [...forbiddenPatterns, ...(guardedRoot !== 'app' ? [inwardBoundaryPatterns[0]] : [])]
      for (const forbidden of patterns) {
        if (forbidden.pattern.test(source)) {
          violations.push(`${relative(root, file)}: ${forbidden.label}`)
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

if (violations.length > 0) {
  console.error('Architecture boundary violations found:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('Architecture boundary check passed.')
}
