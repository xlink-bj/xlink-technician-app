#!/usr/bin/env node
/**
 * DS-07 non-destructive UI style-ownership ratchet.
 * Counts inline visual CSS debt from source files, without changing styles.
 * Existing debt is grandfathered ONLY as a fixed upper bound; new pages must
 * start with zero style literals and use canonical shared App UI components.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const rel = path => relative(root, path).split(sep).join('/')
const read = path => readFile(resolve(root, path), 'utf8')
const fail = reason => { throw new Error('DS-07 UI Style Ownership: ' + reason) }

const baseline = JSON.parse(await read('docs/design-system/UI_STYLE_DEBT_BASELINE.json'))
if (baseline.schemaVersion !== 1 || !baseline.allowed) {
  fail('missing versioned visual debt baseline')
}

async function walk(dir) {
  const entries = await readdir(resolve(root, dir), { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) paths.push(...await walk(path))
    else if (entry.isFile() && entry.name.endsWith('.vue')) paths.push(rel(resolve(root, path)))
  }
  return paths
}

// Existing actively tested pages + deliberately selected high-value features.
// Any NEW src/pages Vue file has zero exceptions by default; it cannot invent
// typography/colors/radii. The feature-level perimeter expands in DS-07.B.
const sources = new Set([...Object.keys(baseline.allowed), ...await walk('src/pages')])
const indicators = {
  hex: /#[0-9a-fA-F]{3,8}\b/g,
  rgb: /\brgba?\s*\(/gi,
  fontSize: /\bfont-size\s*:\s*(?:\d|\.)/gi,
  radius: /\bborder-radius\s*:\s*(?:\d|\.)/gi,
}
let sum = { hex: 0, rgb: 0, fontSize: 0, radius: 0 }
let checked = 0
for (const path of [...sources].sort()) {
  const source = await read(path)
  const styles = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(match => match[1]).join('\n')
  const allowed = baseline.allowed[path] ?? { hex: 0, rgb: 0, fontSize: 0, radius: 0 }
  for (const [name, pattern] of Object.entries(indicators)) {
    const found = (styles.match(pattern) ?? []).length
    if (!Number.isSafeInteger(allowed[name]) || allowed[name] < 0) fail(path + ' has invalid baseline ' + name)
    if (found > allowed[name]) fail(path + ': ' + name + ' local declarations ' + found
      + ' exceed frozen limit ' + allowed[name] + '. Use shared tokens/primitives; do not raise the baseline.')
    sum[name] += found
  }
  checked++
}

// Existing Mobile Craft naming is a compatibility shim, not a competing theme.
// All 19 formerly self-owned aliases must point into the canonical global root.
const canonical = await read('src/shared/ui/design-system.scss')
const adapter = await read('src/shared/ui/mobile-craft-v1.scss')
const declaration = adapter.split('.xl-craft {')[1]?.split('\n  color: var(--xl-ink);')[0]
if (!declaration) fail('Craft compatibility adapter missing')
const aliases = [...declaration.matchAll(/--xl-[\w-]+:\s*var\((--app-craft-[\w-]+)\);/g)]
if (aliases.length !== 19) fail('expected exactly 19 canonical bridge aliases; found ' + aliases.length)
for (const [_, token] of aliases) {
  if (!canonical.includes(token + ':')) fail('canonical foundation token not found: ' + token)
}
// Parse values explicitly: a regex lookahead after optional spaces can
// backtrack and incorrectly flag valid "var(...)" aliases.
const definitions = [...declaration.matchAll(/--xl-[\w-]+:\s*([^;]+);/g)]
if (definitions.length !== 19 || definitions.some(([, value]) =>
  !value.trim().startsWith('var(--app-craft-'))) {
  fail('visual values must be owned by design-system.scss, not the --xl adapter')
}

process.stdout.write('DS-07 UI ownership ratchet PASS: ' + checked
  + ' page/feature files, 19 global bridge tokens; CSS debt at or below frozen limits: '
  + JSON.stringify(sum) + '\n')
