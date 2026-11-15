import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {build} from './build.mjs'

const local = JSON.parse(fs.readFileSync(new URL('tokens.json',import.meta.url),'utf8'))
const css = source => build(source).get('theme.css')
const copy = value => structuredClone(value)

// The fixture represents a sibling product which also defines the six historical
// public names at a broader scope. It is used only in tests and never shipped as a style.
const siblingFixture = `:root, page, .ds-root {
  --palette-xlink-600: #1769DC;
  --palette-neutral-50: #F4F5F5;
  --radius-card: 8px;
  --layout-page-inset: 16px;
  --color-action-primary: var(--palette-xlink-600);
  --color-surface-page: var(--palette-neutral-50);
  --yh-action-primary: var(--color-action-primary);
  --yh-page-inset-mobile: var(--layout-page-inset);
}
[data-theme="xlink"], .theme-xlink {
  --color-action-primary: var(--palette-xlink-600);
  --color-surface-page: var(--palette-neutral-50);
  --yh-action-primary: var(--color-action-primary);
  --yh-page-inset-mobile: var(--layout-page-inset);
}`

function blocks(cssText) {
  const unannotated = cssText.replace(/\/\*[\s\S]*?\*\//g,'')
  return [...unannotated.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selectors,declarations]) => ({
    selectors: selectors.trim().split(',').map(x=>x.trim()),
    values: new Map([...declarations.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)].map(([,k,v]) => [k,v.trim()]))
  }))
}

// Resolve the restricted custom-property cascade used in these flat theme sheets.
// Aliases are computed on the element where they are defined, then inherited.
function resolveAt(sheets, selector, parent = new Map()) {
  const merged = new Map(parent)
  for (const rule of sheets.flatMap(blocks)) {
    if (rule.selectors.includes(selector)) {
      for (const [k,v] of rule.values) merged.set(k,v)
    }
  }
  const computed = new Map()
  function get(key, seen=new Set()) {
    if (computed.has(key)) return computed.get(key)
    if (seen.has(key)) throw Error('Alias cycle: '+key)
    seen.add(key)
    const value=merged.get(key)
    const ref=/^var\((--[a-zA-Z0-9-]+)\)$/.exec(value)
    const out=ref?get(ref[1],seen):value
    if(out===undefined) throw Error('Unresolved CSS property '+key)
    computed.set(key,out)
    return out
  }
  for (const key of merged.keys()) get(key)
  return computed
}

function sibling(sheets, selector) {
  return resolveAt(sheets, selector, resolveAt(sheets,':root'))
}

function alternative(source) {
  const next = copy(source)
  next.palette['palette.brand.600'].value = '#782230'
  next.palette['palette.neutral.50'].value = '#F2F1EE'
  next.metrics['radius.card'].value = 12
  next.metrics['type.title.size'].value = 22
  return next
}

function ownValues(sheet, source) {
  const resolved = sibling(sheet, '.yh-service')
  const owned = [...Object.keys(source.palette),...Object.keys(source.semantic),...Object.keys(source.metrics)]
    .map(k=>'--yh-'+k.replaceAll('.','-')).concat(Object.keys(source.compatibility).map(k=>'--'+k))
  return Object.fromEntries(owned.map(k=>[k,resolved.get(k)]))
}

function roundTrip(siblingCSS, changedSibling) {
  const initial = css(local), modified = css(alternative(local))
  for(const externalFirst of [true,false]) {
    const compose = (a,b)=>externalFirst?[a,b]:[b,a]
    const base = compose(siblingCSS, initial), changedLocal=compose(siblingCSS, modified)
    assert.deepEqual(sibling(base,'.theme-xlink'),sibling(changedLocal,'.theme-xlink'))
    assert.deepEqual(ownValues(base,local),ownValues(compose(changedSibling,initial),local))
    const a=ownValues(base,local), b=ownValues(changedLocal,local)
    assert.equal(b['--yh-action-primary'],'#782230')
    assert.equal(b['--yh-color-surface-page'],'#F2F1EE')
    assert.equal(b['--yh-radius-card'],'12px')
    assert.equal(b['--yh-type-title-size'],'22px')
    assert.notDeepEqual(a,b)
    assert.notEqual(sibling(base,'.theme-xlink').get('--yh-action-primary'),
      sibling(compose(changedSibling,initial),'.theme-xlink').get('--yh-action-primary'))
  }
}

test('all outputs use only this product and six published aliases match their semantic values',()=>{
  const output=build(local), rules=blocks(output.get('theme.css'))
  assert.equal(rules.length,1)
  assert.deepEqual(rules[0].selectors,['.yh-service'])
  for(const [name,value] of rules[0].values) {
    assert(name.startsWith('--yh-'))
    for(const ref of value.matchAll(/var\((--[^)]+)\)/g)) assert(rules[0].values.has(ref[1]))
  }
  const own=ownValues([output.get('theme.css')],local)
  for(const [alias,key] of Object.entries(local.compatibility)) assert.equal(own['--'+alias],own['--yh-'+key.replaceAll('.','-')])
  assert.equal(output.get('contrast.tsv').trimEnd().split('\n').length,local.contrastPairs.length+1)
})

test('sibling roots are isolated in both CSS load orders, including historic public names',()=>{
  const changed=siblingFixture.replace('#1769DC','#0A5660').replace('#F4F5F5','#ECEEEF').replace('8px','20px')
  roundTrip(siblingFixture,changed)
})

test('link, focus and informational state may evolve independently; disabled button and field use distinct roles',()=>{
  const next=copy(local)
  next.palette['palette.focus.700'].value='#46385C'
  const before=ownValues([css(local)],local),after=ownValues([css(next)],next)
  assert.equal(after['--yh-focus-ring'],'#46385C')
  assert.equal(before['--yh-link'],after['--yh-link'])
  assert.equal(before['--yh-color-status-info-fg'],after['--yh-color-status-info-fg'])
  assert.notEqual(local.semantic['color.field.disabled-bg'].value, local.semantic['color.action.disabled-bg'].value)
})

test('invalid contrast or cross-product fallbacks stop generation',()=>{
  const light=copy(local)
  light.palette['palette.brand.600'].value='#FFFFFF'
  assert.throws(()=>build(light), /color.action.on-primary on color.action.primary/)
  const borrowed=copy(local)
  borrowed.semantic['color.action.link'].value='var(--other-link)'
  assert.throws(()=>build(borrowed),/Unresolved local color alias/)
  const outer=copy(local)
  outer.scope=':root'
  assert.throws(()=>build(outer), /Invalid product or scope/)
})

const externalFolder=process.env.YH_VERIFY_BASELINE
if(externalFolder) {
  test('optional user-provided v1.0 baseline: exact delivered CSS, both directions and source-file integrity',async()=>{
    const paths=['tokens.json','theme.css','_xlink.scss','_yuhong.scss','contrast.tsv']
    const dir=path.resolve(externalFolder)
    const digest=()=>Object.fromEntries(paths.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')]))
    const {build:buildBaseline}=await import(pathToFileURL(path.join(dir,'build.mjs')).href)
    const before=digest(), raw=fs.readFileSync(path.join(dir,'theme.css'),'utf8')
    const previous=JSON.parse(fs.readFileSync(path.join(dir,'tokens.json'),'utf8'))
    assert.equal(buildBaseline(previous).get('theme.css'),raw)
    const alternate=copy(previous)
    alternate.palette['palette.xlink.600'].value='#0A5660'
    alternate.palette['palette.neutral.50'].value='#F2F1EE'
    alternate.metrics['radius.card'].value=15
    roundTrip(raw,buildBaseline(alternate).get('theme.css'))
    assert.deepEqual(before,digest())
  })
}
