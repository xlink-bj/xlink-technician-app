#!/usr/bin/env node
/**
 * EQ10: deterministic source-level dependency/ownership ratchet.
 * Pure static audit, not behavior coverage or backend authorization proof.
 * No remote APIs, secrets, Production reads, business commands or filesystem writes.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, posix, relative } from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const slash = path => path.replace(/\\/g, '/')
const aliases = {
  '@app': 'src/app', '@shared': 'src/shared',
  '@runtimes': 'src/runtimes', '@features': 'src/features',
  '@adapters': 'src/adapters',
}
const canon = {
  appointment: 'src/features/work-orders/appointment-form-runtime.ts',
  dynamic: 'src/features/work-orders/dynamic-form-action.ts',
  schema: 'src/features/work-orders/action-form-schema.ts',
  workspace: 'src/features/work-orders/action-workspace.ts',
  workflow: 'src/features/work-orders/detail-workflow.ts',
  pricing: 'src/features/work-orders/quotation/engine.ts',
  command: 'src/adapters/api/technician-api-commands.ts',
  wire: 'src/adapters/api/action-command-wires.ts',
  catalog: 'src/adapters/api/quotation-catalog-api.ts',
  order: 'src/features/work-orders/quotation/order-submission.ts',
}

function walk(directory) {
  const all = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) all.push(...walk(absolute))
    else if (entry.isFile() && /\.(?:ts|tsx|vue)$/.test(entry.name)) {
      all.push([slash(relative(root, absolute)), readFileSync(absolute, 'utf8')])
    }
  }
  return all
}

function modulesFrom(source, filename) {
  const candidates = filename.endsWith('.vue')
    ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(item => item[1])
    : [source]
  const imports = []
  for (const content of candidates) {
    const sf = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    for (const statement of sf.statements) {
      if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
        && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        imports.push(statement.moduleSpecifier.text)
      }
    }
  }
  return imports
}

function targetOf(from, specifier) {
  for (const [alias, directory] of Object.entries(aliases)) {
    if (specifier === alias || specifier.startsWith(alias + '/')) {
      return directory + specifier.slice(alias.length)
    }
  }
  if (specifier.startsWith('.')) return posix.normalize(posix.join(posix.dirname(from), specifier))
  return specifier
}

export function auditOwnership(sourceFiles) {
  const issues = []
  const all = sourceFiles instanceof Map ? sourceFiles : new Map(Object.entries(sourceFiles))
  for (const [name, content] of all) {
    if (!name.startsWith('src/')) continue
    const deps = modulesFrom(content, name).map(spec => targetOf(name, spec))
    const protectedConsumer = name.startsWith('src/features/') || name.startsWith('src/pages/')
      || name.startsWith('src/runtimes/') || name.startsWith('src/shared/')
    if (protectedConsumer && deps.some(dep => dep.startsWith('src/adapters/api/action-command-wires'))) {
      issues.push(name + ': R1 business wire codec must be imported only by adapters')
    }
    if (name.startsWith('src/pages/') && deps.some(dep =>
      dep.startsWith('src/features/work-orders/quotation/pricing')
      || dep.startsWith('src/features/work-orders/quotation/order-encoder'))) {
      issues.push(name + ': page cannot own financial calculation or Order wire encoding')
    }
    if (name === canon.workspace && deps.some(dep =>
      dep.startsWith('src/features/work-orders/quotation/pricing')
      || dep.startsWith('src/features/work-orders/quotation/order-encoder'))) {
      issues.push(name + ': Action Workspace cannot bypass pure Quotation Engine')
    }
    if ((name.startsWith('src/pages/') || name.startsWith('src/features/'))
      && /\b(?:path|url)\s*:\s*['"`](?:biz\/extForm\/upsert\/|workflow\/process\b)/.test(content)) {
      issues.push(name + ': Workflow/FormData transport path may not live in UI/feature')
    }
    if (name.startsWith('src/features/work-orders/') && name !== canon.schema
      && /\bworkflowReadOnlyFieldIds\s*\?\.\s*some\s*\(/.test(content)) {
      issues.push(name + ': duplicated workflow field readonly decision outside Form Schema owner')
    }
  }
  for (const [label, file] of Object.entries(canon)) {
    if (!all.has(file)) issues.push('missing required canonical owner: ' + label + ' (' + file + ')')
  }
  const has = name => all.get(canon[name]) ?? ''
  const importCheck = (name, target, label) => {
    const file = canon[name]
    if (!modulesFrom(has(name), file).some(dep => targetOf(file, dep).startsWith(target))) {
      issues.push(file + ': missing canonical import ' + label)
    }
  }
  importCheck('appointment', 'src/features/work-orders/action-form-schema', 'Form Schema')
  importCheck('dynamic', 'src/features/work-orders/action-form-schema', 'Form Schema')
  importCheck('command', 'src/adapters/api/action-command-wires', 'R1 command wire')
  importCheck('workflow', 'src/runtimes/workflow', 'Workflow Runtime')
  importCheck('workspace', 'src/features/work-orders/detail-workflow', 'Detail Workflow Projection')
  importCheck('workspace', 'src/features/work-orders/quotation/engine-store', 'Quotation Engine Store')
  importCheck('pricing', 'src/features/work-orders/quotation/pricing', 'pure pricing')
  importCheck('pricing', 'src/features/work-orders/quotation/order-encoder', 'pure type=1 encoder')

  if (!/export\s+function\s+actionFormSchemaFor\s*\(/.test(has('schema')))
    issues.push(canon.schema + ': shared Form metadata owner is missing')
  if (!/export\s+function\s+isWorkflowFieldReadOnly\s*\(/.test(has('schema')))
    issues.push(canon.schema + ': canonical Workflow field readonly projection is missing')
  if (!/\bformDataUpsertCommand\s*\(/.test(has('command'))
    || !/\bworkflowCompleteCommand\s*\(/.test(has('command')))
    issues.push(canon.command + ': dispatch must route through pure R1 codecs')
  if (!/export\s+function\s+formDataUpsertCommand\s*\(/.test(has('wire'))
    || !/export\s+function\s+workflowCompleteCommand\s*\(/.test(has('wire')))
    issues.push(canon.wire + ': distinct saveOnly and Workflow command encoders are missing')
  if (/\b(?:path|url)\s*:\s*['"`](?:biz\/extForm\/upsert\/|workflow\/process\b)/.test(has('command')))
    issues.push(canon.command + ': R1 path encoding duplicated outside wire owner')
  if (/\b(?:calculateQuotationPricing|encodeR1OfficialOrderType1)\s*\(/.test(has('workspace')))
    issues.push(canon.workspace + ': quote price/order calculation bypasses Engine')
  if (!/\bcalculateQuotationPricing\s*\(/.test(has('pricing'))
    || !/\bencodeR1OfficialOrderType1\s*\(/.test(has('pricing')))
    issues.push(canon.pricing + ': pure Quotation Engine calculation/encoding stage missing')
  if (!/authorizationFingerprint/.test(has('order'))
    || !/authorizationCurrent/.test(has('order'))
    || !/failed_ambiguous_after_dispatch/.test(has('order')))
    issues.push(canon.order + ': actor-bound idempotency and ambiguous receipt protections missing')
  if (!/authorizationIdentityKey/.test(has('catalog')))
    issues.push(canon.catalog + ': actor-scoped price-bearing catalog fence missing')
  return issues.sort()
}

const all = new Map(walk(join(root, 'src')))
const issues = auditOwnership(all)
if (issues.length) {
  console.error('EQ10 architecture ownership violations:')
  for (const issue of issues) console.error('- ' + issue)
  process.exitCode = 1
} else {
  console.log('EQ10 ownership audit PASS: '+all.size+' source modules; runtime, Form, Workflow, pricing, command and actor scopes protected.')
}
if (process.argv.includes('--self-test')) {
  if (issues.length) throw new Error('Real source audit must pass before testing negative sentinels')
  const actual = name => all.get(canon[name]) ?? ''
  const failures = [
    ['direct business codec import', 'src/pages/eq10-negative.ts', "import { formDataUpsertCommand } from '@adapters/api/action-command-wires'"],
    ['page pricing import', 'src/pages/eq10-negative.ts', "import { calculateQuotationPricing } from '@features/work-orders/quotation/pricing'"],
    ['raw Workflow dispatch in feature', 'src/features/eq10-negative.ts', "const request = { path: 'workflow/process' }"],
    ['missing form owner import', canon.appointment, actual('appointment').replace("import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'", '')],
    ['adapter raw wire bypass', canon.command, actual('command') + "\nconst eq10Unsafe = { path: 'workflow/process' }"],
    ['Action Workspace pricing bypass', canon.workspace, actual('workspace') + '\ncalculateQuotationPricing(hydration)'],
    ['removed actor receipt scope', canon.order, actual('order').replaceAll('authorizationFingerprint', 'legacyFingerprint').replaceAll('authorizationCurrent', 'legacyCurrent')],
    ['duplicate Workflow readonly decision', canon.dynamic, actual('dynamic') + '\nconst unsafeReadOnly = form.workflowReadOnlyFieldIds?.some((id) => String(id) === String(field.fieldId))'],
  ]
  for (const [label, filename, source] of failures) {
    const modified = new Map(all)
    modified.set(filename, source)
    const negative = auditOwnership(modified)
    if (negative.length === 0) throw new Error('EQ10 negative sentinel did not fail: '+label)
  }
  console.log('EQ10 negative sentinel PASS: '+failures.length+' injected boundary regressions detected without changing working tree.')
}
