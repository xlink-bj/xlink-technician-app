#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
const disallowed = files.filter((path) => /^(?:__review|review-app|review-app-g4f|\.review)(?:\/|$)/.test(path))
if (disallowed.length) {
  throw new Error(`Legacy root Review paths must not be tracked: ${disallowed.join(', ')}`)
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
for (const [name, command] of Object.entries(pkg.scripts)) {
  if (/\b(?:scripts\/check-g4e-review-harness|scripts\/check-g4f-phase1[ab]|scripts\/check-g4f-synthetic-extfield-review|scripts\/check-s2-ux-review|scripts\/dev-mp-isolated-ux)\b/.test(command)) {
    throw new Error(`Script ${name} still uses a retired review root: ${command}`)
  }
}

const ignore = readFileSync(resolve(root, '.gitignore'), 'utf8')
if (!ignore.split(/\r?\n/).includes('/.review/') || !ignore.split(/\r?\n/).includes('/.review-input')) {
  throw new Error('Review build outputs and MP input link must remain ignored')
}

console.log(`Review root hygiene PASS: ${files.length} tracked files, no legacy tracked root Review paths`)
