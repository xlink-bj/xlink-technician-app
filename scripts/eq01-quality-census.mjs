#!/usr/bin/env node
/**
 * EQ-01 reproducible engineering quality census.
 * Heuristics are reported, never mislabeled as executed branch coverage.
 * No environment secrets, network requests or repository writes.
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'

const root = process.cwd()
const trackedExtensions = /\.(?:ts|tsx|vue|mjs)$/
function walk(directory) {
  const entries = []
  for (const dirent of readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const path = join(directory, dirent.name)
    if (dirent.isDirectory()) entries.push(...walk(path))
    else if (dirent.isFile() && trackedExtensions.test(dirent.name)) entries.push(path)
  }
  return entries
}
function metric(file) {
  const source = readFileSync(file, 'utf8')
  const name = relative(root, file).replace(/\\/g, '/')
  const lines = source.split(/\r?\n/).length
  const matches = re => [...source.matchAll(re)].length
  const category = name.startsWith('tests/') ? 'test'
    : name.startsWith('src/') ? 'source'
      : name.startsWith('scripts/') ? 'tooling' : 'other'
  return {
    name, lines, category,
    ...(category === 'test' ? {
      cases: matches(/\b(?:it|test)(?:\.(?:each|skip|only))?\s*\(/g),
      assertions: matches(/\bexpect\s*\(/g),
      sourceContractAssertions: matches(/\.toContain\(['"`]|\.not\.toContain\(['"`]/g),
      fileReads: matches(/\breadFile(?:Sync)?\s*\(/g),
      mockedInteractions: matches(/\bvi\.(?:fn|mock|stubEnv|stubGlobal)\s*\(/g),
    } : {}),
  }
}
const dirs = ['src','tests','scripts'].filter(d => {
  try {return statSync(join(root,d)).isDirectory()} catch {return false}
})
const files = dirs.flatMap(d => walk(join(root,d))).map(metric).sort((a,b)=>a.name.localeCompare(b.name))
const source = files.filter(f => f.category === 'source')
const tests = files.filter(f => f.category === 'test')
const testsWithStaticAssertions = tests.filter(f => f.sourceContractAssertions > 0 || f.fileReads > 0)
const sum = (xs, field) => xs.reduce((total,row) => total + (row[field] ?? 0), 0)
const hotspots = source.filter(f => f.lines >= 500).sort((a,b) => b.lines-a.lines || a.name.localeCompare(b.name))
const report = {
  schemaVersion:1,
  method:'static source census only; NOT behavior, mutation or branch coverage',
  sample:'working tree at execution time; SHA recorded separately by GitHub Actions',
  source:{files:source.length,lines:sum(source,'lines'),hotspotsOver500:hotspots},
  tests:{
    files:tests.length,lines:sum(tests,'lines'),
    sourceContractFiles:testsWithStaticAssertions.length,
    sourceContractAssertions:sum(tests,'sourceContractAssertions'),
    executedCases:'NOT_MEASURED_BY_STATIC_CENSUS',
    measuredCoverage:'NOT_CONFIGURED',
    largestTestFiles:tests.slice().sort((a,b)=>b.lines-a.lines).slice(0,12),
  },
  tooling:{files:files.filter(f => f.category === 'tooling').length},
  codeHotspots:source.slice().sort((a,b)=>b.lines-a.lines).slice(0,20),
}
const arg=process.argv.indexOf('--output')
if(arg !== -1){
  const path=process.argv[arg+1]
  if(!path?.startsWith('.review/eq01/') || path.includes('..')) throw Error('Output must be under .review/eq01/')
  const output=resolve(root,path)
  mkdirSync(dirname(output),{recursive:true})
  writeFileSync(output,JSON.stringify(report,null,2)+'\n')
}
if(process.argv.includes('--check')){
  // Budgets are regression sentinels, not an aspirational modularity target.
  // Never bless new giant components as part of EQ without explicit review.
  const newGiants=source.filter(f=>f.lines>800
    && ![
      'src/features/work-orders/quotation/QuotationActionContent.vue',
      'src/features/work-orders/action-workspace.ts',
      'src/adapters/api/mock/fixtures.ts',
      'src/adapters/api/mock/router.ts',
    ].includes(f.name))
  // Historical large files must be inventoried; don't fail existing debt here.
  // The check detects new >800-line files only when their source is not part
  // of the historical giant-file cohort (review exception not auto-accepted).
  if(newGiants.length) {
    process.stderr.write('EQ01 oversized source review required: '+newGiants.map(x=>x.name+':'+x.lines).join(', ')+'\n')
    process.exitCode=1
  }
}
process.stdout.write(JSON.stringify({
  sourceFiles:report.source.files,sourceLines:report.source.lines,
  largeModules:hotspots.slice(0,12).map(f=>f.name+':'+f.lines),
  testFiles:report.tests.files,staticContractFiles:report.tests.sourceContractFiles,
  staticAssertions:report.tests.sourceContractAssertions,
  note:report.method,
})+'\n')
