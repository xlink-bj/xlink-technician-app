import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

// Execute only the generated entry with inert dependency stubs. A successful
// bundle alone can leave createApp exported but never register the MP App,
// causing getApp().$vm to fail when the first page attaches.
const entry = readFileSync(resolve('dist/build/mp-weixin/app.js'), 'utf8')
const exports = {}
let mounts = 0
runInNewContext(entry, {
  exports,
  require(path) {
    if (path.includes('bootstrap')) return {
      createApplication: () => ({ app: { mount: () => { mounts++ } } }),
    }
    return {}
  },
}, { filename: 'dist/build/mp-weixin/app.js', timeout: 1000 })

if (mounts !== 1 || typeof exports.createApp !== 'function') {
  throw new Error(`MP entry did not synchronously register App once (mounts=${mounts})`)
}
exports.createApp()
if (mounts !== 1) {
  throw new Error(`MP createApp export is not idempotent (mounts=${mounts})`)
}
console.log('MP App bootstrap: synchronous registration and idempotent export PASS')
