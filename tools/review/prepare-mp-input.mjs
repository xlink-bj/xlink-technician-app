#!/usr/bin/env node

import { lstat, readlink, symlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// The uni-app MP compiler expects a shallow input root. Keep the canonical
// Review App under tools/ and materialize only an ignored symlink for this build.
const root = fileURLToPath(new URL('../../', import.meta.url))
const linkPath = resolve(root, '.review-input')
const target = 'tools/review/uni-gallery'

try {
  const stat = await lstat(linkPath)
  if (!stat.isSymbolicLink() || await readlink(linkPath) !== target) {
    throw new Error('.review-input exists but is not the expected isolated Review App symlink')
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  await symlink(target, linkPath, 'dir')
}

console.log('Isolated MP Review input prepared (generated symlink, no Production route)')
