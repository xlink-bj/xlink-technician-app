#!/usr/bin/env node

import { access, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const fileAt = (file) => resolve(root, file)
const fail = (reason) => { throw new Error(`Config layout: ${reason}`) }
const expectedEntrypoints = new Map([
  ['playwright.config.ts', './config/playwright/review.config'],
  ['vite.config.ts', './config/vite/app.config'],
  ['vitest.config.ts', './config/vitest/unit.config'],
])
const expectedDirectories = ['config/playwright', 'config/vite', 'config/vitest']
const oldSpecializedName = /^(playwright|vite|vitest)\..+\.config\.ts$/
const referencedConfig = /config\/(?:playwright|vite|vitest)\/[a-z0-9-]+\.config\.ts/g
const obsoleteReference = /(?<![\w/])(?:playwright|vite|vitest)\.[\w.-]+\.config\.ts/g

const rootEntries = await readdir(root)
for (const name of rootEntries) {
  if (oldSpecializedName.test(name)) fail(`unexpected root config: ${name}`)
}
for (const [name, target] of expectedEntrypoints) {
  const content = await readFile(fileAt(name), 'utf8')
  if (!content.includes(target)) fail(`conventional entrypoint ${name} must delegate to ${target}`)
}
for (const directory of expectedDirectories) {
  const children = await readdir(fileAt(directory))
  if (!children.some((name) => name.endsWith('.config.ts'))) fail(`no configs in ${directory}`)
}

const sources = ['package.json']
for (const name of await readdir(fileAt('.github/workflows'))) {
  if (name.endsWith('.yml') || name.endsWith('.yaml')) sources.push(`.github/workflows/${name}`)
}
for (const file of sources) {
  const content = await readFile(fileAt(file), 'utf8')
  for (const match of content.matchAll(referencedConfig)) {
    try {
      await access(fileAt(match[0]))
    } catch {
      fail(`${file} references missing config ${match[0]}`)
    }
  }
  for (const match of content.matchAll(obsoleteReference)) {
    if (!expectedEntrypoints.has(match[0])) fail(`${file} still references old root config ${match[0]}`)
  }
}
console.log('Config layout PASS: conventional root shims, nested configs, package and CI paths')
