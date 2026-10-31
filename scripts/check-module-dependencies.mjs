#!/usr/bin/env node
/**
 * M1 static architecture inventory + no-growth guard.
 *
 * Checks TS/Vue source import/export edges. This is not a runtime dependency
 * tracer, a bundle audit, or proof that similar names implement the same rule.
 * --report: read-only summary; --check: compare protected exceptions to the
 * reviewed baseline; --refresh-baseline: explicitly regenerate the snapshot.
 */
import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repo = fileURLToPath(new URL('../', import.meta.url))
const sourceRoot = resolve(repo, 'src')
const baselineFile = resolve(repo, 'docs/governance/M1_SOURCE_DEPENDENCY_BASELINE_20261031.json')
const graphFile = resolve(repo, 'docs/governance/M1_SOURCE_DEPENDENCY_GRAPH_20261031.json')
const slash = value => value.replaceAll('\\', '/')
const supportedSource = /\.(?:ts|tsx|vue)$/
const aliases = new Map([
  ['@', 'src'],
  ['@app', 'src/app'],
  ['@features', 'src/features'],
  ['@runtimes', 'src/runtimes'],
  ['@shared', 'src/shared'],
  ['@adapters', 'src/adapters'],
])
const domainNames = /(?:price|pricing|quote|quotation|order|workflow|formdata|schema|permission|eligib|identity|authoriz)/i

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const file = resolve(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collect(file))
    else if (entry.isFile() && supportedSource.test(file) && !file.endsWith('.d.ts')) {
      files.push(slash(relative(repo, file)))
    }
  }
  return files.sort()
}

function parseCode(file, code) {
  const scripts = file.endsWith('.vue')
    ? [...code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1])
    : [code]
  const imports = []
  const exportedFunctions = []
  for (const script of scripts) {
    const parsed = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const clause = node.importClause
          const named = clause?.namedBindings
          const allNamedTypes = named && ts.isNamedImports(named)
            && named.elements.length > 0 && named.elements.every(item => item.isTypeOnly)
          const allExportedTypes = ts.isExportDeclaration(node)
            && node.exportClause && ts.isNamedExports(node.exportClause)
            && node.exportClause.elements.length > 0
            && node.exportClause.elements.every(item => item.isTypeOnly)
          imports.push({
            specifier: node.moduleSpecifier.text,
            typeOnly: Boolean(node.isTypeOnly || clause?.isTypeOnly || allNamedTypes || allExportedTypes),
          })
        }
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
          imports.push({ specifier: node.arguments[0].text, typeOnly: false })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
    for (const statement of parsed.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name
        && statement.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) {
        const name = statement.name.text
        if (domainNames.test(name)) exportedFunctions.push(name)
      } else if (ts.isVariableStatement(statement)
        && statement.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)
            && declaration.initializer
            && (ts.isArrowFunction(declaration.initializer)
              || ts.isFunctionExpression(declaration.initializer))
            && domainNames.test(declaration.name.text)) {
            exportedFunctions.push(declaration.name.text)
          }
        }
      }
    }
  }
  return { imports, exportedFunctions }
}

function resolveImport(from, specifier, known) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@')) return null
  if (/\.(?:css|scss|sass|less|json|png|svg|jpg|jpeg|webp|woff2?)($|\?)/.test(specifier)) return null
  let base
  if (specifier.startsWith('.')) {
    base = posix.normalize(posix.join(posix.dirname(from), specifier))
  } else {
    const alias = [...aliases.keys()].sort((a, b) => b.length - a.length)
      .find(key => specifier === key || specifier.startsWith(key + '/'))
    if (!alias) return null
    base = aliases.get(alias) + specifier.slice(alias.length)
  }
  if (!base.startsWith('src/')) return null
  const candidates = [base, base + '.ts', base + '.tsx', base + '.vue',
    base + '/index.ts', base + '/index.tsx', base + '/index.vue']
  const target = candidates.find(candidate => known.has(candidate))
  return target ? { target } : { unresolved: base }
}

function ownerOf(file) {
  const parts = file.split('/')
  const layer = parts[1]
  if (layer === 'features') {
    if (parts[2] === 'work-orders') {
      return ['quotation', 'signing'].includes(parts[3])
        ? 'features/work-orders/' + parts[3] : 'features/work-orders/core'
    }
    return 'features/' + (parts[2] || 'unknown')
  }
  if (layer === 'runtimes') return 'runtimes/' + (parts[2] || 'core')
  if (layer === 'adapters') {
    if (parts[2] === 'api' && parts[3] === 'mock') return 'adapters/api/mock'
    if (parts[2] === 'api' && parts[3] === 'read-models') return 'adapters/api/read-models'
    return 'adapters/' + (parts[2] || 'core')
  }
  if (layer === 'shared') return 'shared/' + (parts[2] || 'core')
  return layer || 'other'
}

function violationOf(from, to) {
  const source = from.split('/')[1]
  const target = to.split('/')[1]
  if (source === 'shared' && target !== 'shared') return 'shared-outward'
  if (source === 'runtimes' && !['runtimes', 'shared'].includes(target)) return 'runtime-outward'
  if (source === 'adapters' && ['pages', 'features', 'app'].includes(target)) return 'adapter-upward'
  if (source === 'features' && ['app', 'adapters', 'pages'].includes(target)) return 'feature-outward'
  if (source === 'pages' && target === 'adapters') return 'page-direct-adapter'
  if (source === 'features' && target === 'features'
      && from.split('/')[2] !== to.split('/')[2] && !to.endsWith('/index.ts')) {
    return 'cross-feature-private'
  }
  return null
}

function stronglyConnected(modules, edges) {
  const outgoing = new Map(modules.map(name => [name, []]))
  for (const edge of edges) outgoing.get(edge.from)?.push(edge.to)
  const indices = new Map()
  const low = new Map()
  const stack = []
  const onStack = new Set()
  const groups = []
  let counter = 0
  const visit = node => {
    indices.set(node, counter)
    low.set(node, counter++)
    stack.push(node)
    onStack.add(node)
    for (const target of outgoing.get(node) || []) {
      if (!indices.has(target)) {
        visit(target)
        low.set(node, Math.min(low.get(node), low.get(target)))
      } else if (onStack.has(target)) {
        low.set(node, Math.min(low.get(node), indices.get(target)))
      }
    }
    if (low.get(node) !== indices.get(node)) return
    const members = []
    let current
    do {
      current = stack.pop()
      onStack.delete(current)
      members.push(current)
    } while (current !== node)
    if (members.length > 1 || (outgoing.get(node) || []).includes(node)) {
      groups.push(members.sort())
    }
  }
  for (const module of modules) if (!indices.has(module)) visit(module)
  return groups.sort((a, b) => a.join('|').localeCompare(b.join('|')))
}

export function auditModules(sourceFiles) {
  const known = new Set(sourceFiles.keys())
  const modules = [...known].sort()
  const rawEdges = new Map()
  const unresolved = new Set()
  const declarations = new Map()
  for (const file of modules) {
    const { imports, exportedFunctions } = parseCode(file, sourceFiles.get(file))
    for (const name of exportedFunctions) {
      if (!declarations.has(name)) declarations.set(name, new Set())
      declarations.get(name).add(file)
    }
    for (const item of imports) {
      const resolved = resolveImport(file, item.specifier, known)
      if (!resolved) continue
      if (resolved.unresolved) {
        unresolved.add(file + ' -> ' + item.specifier)
        continue
      }
      const signature = file + ' -> ' + resolved.target
      const previous = rawEdges.get(signature)
      rawEdges.set(signature, {
        from: file,
        to: resolved.target,
        typeOnly: (previous?.typeOnly ?? true) && item.typeOnly,
      })
    }
  }
  const edges = [...rawEdges.values()].sort((a, b) =>
    (a.from + ' -> ' + a.to).localeCompare(b.from + ' -> ' + b.to))
  const runtimeEdges = edges.filter(edge => !edge.typeOnly)
  const runtimeCycles = stronglyConnected(modules, runtimeEdges)
  const allCycles = stronglyConnected(modules, edges)
  const violations = edges.flatMap(edge => {
    const reason = violationOf(edge.from, edge.to)
    return reason ? [reason + ': ' + edge.from + ' -> ' + edge.to] : []
  }).sort()
  const outbound = new Map(modules.map(name => [name, 0]))
  const inbound = new Map(modules.map(name => [name, 0]))
  const byOwner = new Map()
  for (const edge of edges) {
    outbound.set(edge.from, outbound.get(edge.from) + 1)
    inbound.set(edge.to, inbound.get(edge.to) + 1)
    const from = ownerOf(edge.from)
    const to = ownerOf(edge.to)
    const key = from + ' -> ' + to
    byOwner.set(key, (byOwner.get(key) || 0) + 1)
  }
  const rank = values => [...values].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12).map(([path, count]) => ({ path, count }))
  const duplicateCandidates = [...declarations].filter(([, files]) =>
    new Set([...files].map(ownerOf)).size > 1).map(([name, files]) =>
    ({ name, files: [...files].sort() })).sort((a, b) => a.name.localeCompare(b.name))
  return {
    summary: {
      modules: modules.length,
      edges: edges.length,
      runtimeEdges: runtimeEdges.length,
      typeOnlyEdges: edges.length - runtimeEdges.length,
      runtimeCycles: runtimeCycles.length,
      allStaticCycles: allCycles.length,
      ownershipViolations: violations.length,
      unresolvedImports: unresolved.size,
      crossOwnerEdges: edges.filter(edge => ownerOf(edge.from) !== ownerOf(edge.to)).length,
      duplicateExportCandidates: duplicateCandidates.length,
    },
    runtimeCycles,
    allCycles,
    violations,
    unresolved: [...unresolved].sort(),
    duplicateCandidates,
    topIncoming: rank(inbound),
    topOutgoing: rank(outbound),
    ownerEdges: rank(byOwner),
    graph: {
      nodes: modules.map(path => ({ path, owner: ownerOf(path) })),
      edges,
    },
  }
}

function checkedExceptions(audit) {
  return {
    runtimeCycles: audit.runtimeCycles.map(group => group.join(' | ')),
    allStaticCycles: audit.allCycles.map(group => group.join(' | ')),
    violations: audit.violations,
    unresolved: audit.unresolved,
  }
}

function regressionsSince(current, approved) {
  return Object.keys(current).flatMap(key => {
    const known = approved[key]
    if (!Array.isArray(known)) throw new Error('M1 baseline is missing protected key: ' + key)
    return current[key].filter(item => !known.includes(item)).map(item => key + ': ' + item)
  })
}

async function selfTest() {
  const sample = new Map([
    ['src/features/a/index.ts', "import { b } from '../b/private'; export const a = b"],
    ['src/features/b/private.ts', "import { a } from '../a'; export const b = a"],
    ['src/runtimes/workflow/demo.ts', "import { a } from '../../features/a'; export const value = a"],
    ['src/shared/demo.ts', "import { value } from '../runtimes/workflow/demo'; export { value }"],
  ])
  const result = auditModules(sample)
  if (result.summary.runtimeCycles !== 1
    || result.summary.allStaticCycles !== 1
    || !result.violations.some(item => item.includes('runtime-outward'))
    || !result.violations.some(item => item.includes('shared-outward'))
    || !result.violations.some(item => item.includes('cross-feature-private'))) {
    throw new Error('M1 negative self-test failed to find cycle and owner boundary violations')
  }
  const cleaned = new Map([['src/features/a/index.ts', 'export const safe = true']])
  const safeAudit = auditModules(cleaned)
  if (safeAudit.summary.runtimeCycles !== 0) {
    throw new Error('M1 negative self-test failed on acyclic safe fixture')
  }
  if (regressionsSince(checkedExceptions(result), checkedExceptions(safeAudit)).length < 4
    || regressionsSince(checkedExceptions(safeAudit), checkedExceptions(result)).length) {
    throw new Error('M1 no-growth ratchet failed to reject new dependencies or allow removals')
  }
  const typeCycle = auditModules(new Map([
    ['src/shared/a.ts', "import type { B } from './b'; export type A = B"],
    ['src/shared/b.ts', "import type { A } from './a'; export type B = A"],
  ]))
  if (typeCycle.summary.runtimeCycles !== 0 || typeCycle.summary.allStaticCycles !== 1
    || !regressionsSince(checkedExceptions(typeCycle), checkedExceptions(safeAudit))
      .some(item => item.startsWith('allStaticCycles:'))) {
    throw new Error('M1 no-growth ratchet failed to detect a type-only SCC')
  }
  const missing = auditModules(new Map([
    ['src/features/a/index.ts', "import './missing'; export const safe = true"],
  ]))
  if (missing.summary.unresolvedImports !== 1 || !regressionsSince(
    checkedExceptions(missing), checkedExceptions(safeAudit)).some(item =>
    item.startsWith('unresolved:'))) {
    throw new Error('M1 no-growth ratchet failed to detect an unresolved local import')
  }
  console.log('M1 negative self-test PASS: runtime/type cycles, three boundary failures and missing import detected')
}

const files = await collect(sourceRoot)
const sourceFiles = new Map(await Promise.all(files.map(async file =>
  [file, await readFile(resolve(repo, file), 'utf8')])))
const audit = auditModules(sourceFiles)
const flags = new Set(process.argv.slice(2))
if (flags.has('--self-test')) await selfTest()
const currentCommit = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
if (flags.has('--refresh-baseline')) {
  const baseline = {
    schemaVersion: 1,
    sourceCommit: currentCommit(),
    date: '2026-10-31',
    scope: 'TS/Vue static imports and exports; not runtime coverage',
    summary: audit.summary,
    approvedExceptions: checkedExceptions(audit),
  }
  await writeFile(baselineFile, JSON.stringify(baseline, null, 2) + '\n', 'utf8')
  console.log('M1 static dependency baseline written: ' + relative(repo, baselineFile))
}
if (flags.has('--write-graph')) {
  const graph = {
    schemaVersion: 1,
    sourceCommit: currentCommit(),
    date: '2026-10-31',
    method: 'Static TS/Vue import and export edges; type-only edges are marked',
    summary: audit.summary,
    ...audit.graph,
  }
  await writeFile(graphFile, JSON.stringify(graph, null, 2) + '\n', 'utf8')
  console.log('M1 static dependency graph written: ' + relative(repo, graphFile))
}
if (flags.has('--check')) {
  const baseline = JSON.parse(await readFile(baselineFile, 'utf8'))
  if (baseline.schemaVersion !== 1) throw new Error('M1 unknown baseline schema version')
  const previous = baseline.approvedExceptions
  const current = checkedExceptions(audit)
  const regressions = regressionsSince(current, previous)
  if (regressions.length) {
    console.error('M1 dependency no-growth check FAILED:')
    regressions.forEach(item => console.error('- ' + item))
    process.exitCode = 1
  } else {
    console.log('M1 dependency no-growth PASS: ' + audit.summary.modules
      + ' modules, ' + audit.summary.edges + ' edges, '
      + audit.summary.runtimeCycles + ' existing runtime SCCs')
  }
}
if (flags.has('--report') || (!flags.has('--check') && !flags.has('--refresh-baseline'))) {
  const { graph, ...report } = audit
  if (flags.has('--report') || !flags.has('--write-graph')) console.log(JSON.stringify(report, null, 2))
}
