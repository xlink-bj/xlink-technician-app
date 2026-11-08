import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { expect, it } from 'vitest'

it('compiles the actual fragment page with route attrs excluded from DOM inheritance', () => {
  const filename = path.resolve('src/pages/work-orders/action-workspace.vue')
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  const compiled = compileScript(descriptor, { id: 'workspace-route-attrs' })
  const js = ts.transpileModule(compiled.content.replaceAll('import.meta.env', '({})'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} as { default: { inheritAttrs?: boolean; props?: unknown } } }
  // Inspect the real compiled component options without calling setup or the
  // route/store/API side effects. Real H5 tests exercise route handling.
  new Function('require', 'module', 'exports', js)(
    (name: string) => name === 'vue' ? Vue : {}, module, module.exports,
  )
  expect(module.exports.default.inheritAttrs).toBe(false)
  expect(module.exports.default.props).toBeUndefined()
})
