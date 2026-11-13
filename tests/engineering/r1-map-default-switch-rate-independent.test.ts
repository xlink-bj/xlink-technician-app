import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {existingRecordFixture} from '../support/r1-existing-record-edit-fixture'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
import {normalizeFieldValue} from '@runtimes/dynamic-form'

beforeEach(()=>installLocalFixtureBrowser())
afterEach(()=>vi.unstubAllGlobals())

type Kind='switch'|'rate'

function fixture(kind:Kind,required=false,typed=false){
  const h=existingRecordFixture()
  if(!typed)h.mapRoute()
  const key=typed?'memo':'renamedDefaultControl'

  Object.assign(h.fields[1],{
    name:key,type:kind,multiple:false,
    preset:typed?1:0,required:required?'1':'0',
  })
  for(const r of [h.record,h.other]){
    r[key]=kind==='switch'?'1':3
    if(!typed)r.exts[key]=r[key]
  }
  return {...h,key}
}

async function edit(h:ReturnType<typeof fixture>){
  const snapshot=await h.load()
  const action=h.provider().forSnapshot(snapshot)
  expect(action?.canEdit?.(h.record._id)).toBe(true)
  if(!action){
    throw Error('Source-bound default switch/rate existing editing is not implemented')
  }
  return action
}

function zero(h:ReturnType<typeof fixture>){
  expect(h.writes).toEqual([])
  expect(h.events.filter(e=>
    /process|updateExts|upload|upToken|delete|remove/i.test(e),
  )).toEqual([])
}

it('shared codec defaults are representation evidence, not controller authority',()=>{
  expect(normalizeFieldValue('switch','0'))
    .toEqual({ok:true,value:'0'})
  expect(normalizeFieldValue('switch','1'))
    .toEqual({ok:true,value:'1'})
  expect(normalizeFieldValue('rate',1))
    .toEqual({ok:true,value:1})
  expect(normalizeFieldValue('rate',5))
    .toEqual({ok:true,value:5})
})

it.each([
  {kind:'switch' as const,value:'0'},
  {kind:'switch' as const,value:'1'},
  {kind:'rate' as const,value:1},
  {kind:'rate' as const,value:5},
])('same-ID default $kind preserves the literal $value and complete original',
async({kind,value})=>{
  const h=fixture(kind,true)

  // 每个正例都实际改变值；required switch 的 '0' 仍是合法值。
  if(kind==='switch'&&value==='1'){
    for(const r of [h.record,h.other]){
      r[h.key]=r.exts[h.key]='0'
    }
  }
  const before=structuredClone(h.record)
  const other=structuredClone(h.other)
  const a=await edit(h)

  await a.saveOnly({
    ...a.initialValues!(h.record._id),
    [h.key]:value,
  },h.record._id)

  expect(h.writes).toHaveLength(1)
  const sent=JSON.parse(h.writes[0].body.dataStr)
  expect(sent._id).toBe(before._id)
  expect(sent[h.key]).toBe(value)
  expect(sent.exts[h.key]).toBe(value)
  expect(h.record[h.key]).toBe(value)
  expect(h.record.exts[h.key]).toBe(value)
  expect(sent.exts.preserved).toEqual(before.exts.preserved)

  for(const [key,old] of Object.entries(before)){
    if(key===h.key||key==='exts')continue
    expect(sent[key]).toEqual(old)
  }
  expect(h.other).toEqual(other)
  expect(h.events.filter(e=>
    /process|updateExts|upload|delete|remove/i.test(e),
  )).toEqual([])
})

it('optional rate explicit empty-string clear reaches both original slots',
async()=>{
  const h=fixture('rate')
  const other=structuredClone(h.other)
  const a=await edit(h)

  await a.saveOnly({
    ...a.initialValues!(h.record._id),
    [h.key]:'',
  },h.record._id)

  expect(h.writes).toHaveLength(1)
  const sent=JSON.parse(h.writes[0].body.dataStr)
  expect(Object.hasOwn(sent,h.key)).toBe(true)
  expect(Object.hasOwn(sent.exts,h.key)).toBe(true)
  expect(sent[h.key]).toBe('')
  expect(sent.exts[h.key]).toBe('')
  expect(h.record[h.key]).toBe('')
  expect(h.record.exts[h.key]).toBe('')
  expect(h.other).toEqual(other)
})

it.each(['switch','rate'] as const)(
  'required %s empty refuses before dispatch',
  async kind=>{
    const h=fixture(kind,true)
    const a=await edit(h)
    const before=structuredClone(h.record)

    await expect(a.saveOnly({
      ...a.initialValues!(h.record._id),
      [h.key]:'',
    },h.record._id)).rejects.toThrow()

    expect(h.record).toEqual(before)
    zero(h)
  },
)

it.each([true,1,'true','2',''])(
  'switch rejects non-R1 literal %s without normalization fallback',
  async value=>{
    const h=fixture('switch')
    const a=await edit(h)
    await expect(a.saveOnly({
      ...a.initialValues!(h.record._id),
      [h.key]:value,
    },h.record._id)).rejects.toThrow()
    zero(h)
  },
)

it.each([0,6,1.5,'3',true,Number.NaN])(
  'rate rejects non-default integer value %s',
  async value=>{
    const h=fixture('rate')
    const a=await edit(h)
    await expect(a.saveOnly({
      ...a.initialValues!(h.record._id),
      [h.key]:value,
    },h.record._id)).rejects.toThrow()
    zero(h)
  },
)

it.each(['switch','rate'] as const)(
  'node-readonly %s is preserved while another field saves; tampering refuses',
  async kind=>{
    const h=fixture(kind)
    h.node.nodeDef.formFieldIdsFill=[h.fields[0]._id]
    h.node.nodeDef.formFieldIdsReadOnly=[h.fields[1]._id]
    h.grant.fieldIds=[h.fields[0]._id]
    h.setGrant()

    const a=await edit(h)
    const initial=a.initialValues!(h.record._id)!
    const before=structuredClone(h.record)

    await expect(a.saveOnly({
      ...initial,
      [h.key]:kind==='switch'?'0':4,
    },h.record._id)).rejects.toThrow()
    zero(h)

    await a.saveOnly({
      ...initial,
      [h.keys[0]]:14.5,
    },h.record._id)

    expect(h.writes).toHaveLength(1)
    expect(h.record[h.key]).toEqual(before[h.key])
    expect(h.record.exts[h.key]).toEqual(before.exts[h.key])
    expect(h.record[h.keys[0]]).toBe(14.5)
  },
)

it.each(['switch','rate'] as const)(
  'fresh %s readonly revocation invalidates the old editor',
  async kind=>{
    const h=fixture(kind)
    const a=await edit(h)
    const initial=a.initialValues!(h.record._id)!

    h.node.nodeDef.formFieldIdsFill=[h.fields[0]._id]
    h.node.nodeDef.formFieldIdsReadOnly=[h.fields[1]._id]

    await expect(a.saveOnly({
      ...initial,
      [h.key]:kind==='switch'?'0':4,
    },h.record._id)).rejects.toThrow()
    zero(h)
  },
)

it.each(['switch','rate'] as const)(
  'fresh %s custom-config drift refuses before dispatch',
  async kind=>{
    const h=fixture(kind)
    const a=await edit(h)
    const initial=a.initialValues!(h.record._id)!

    h.fields[1].frontEndConfig=JSON.stringify(
      kind==='switch'?{activeValue:'yes'}:{allowHalf:true},
    )

    await expect(a.saveOnly({
      ...initial,
      [h.key]:kind==='switch'?'0':4,
    },h.record._id)).rejects.toThrow()
    zero(h)
  },
)

it.each(['switch','rate'] as const)(
  'fresh %s injected choice provider cannot become default-control authority',
  async kind=>{
    const h=fixture(kind)
    const a=await edit(h)
    const initial=a.initialValues!(h.record._id)!

    h.fields[1].valueOption='unexpected-default-control-provider'

    await expect(a.saveOnly({
      ...initial,
      [h.key]:kind==='switch'?'0':4,
    },h.record._id)).rejects.toThrow()

    expect(h.events.filter(e=>
      e==='i/code/selectCode.do',
    )).toEqual([])
    zero(h)
  },
)

it.each(['switch','rate'] as const)(
  'Map extension does not enable typed Survey %s',
  async kind=>{
    const h=fixture(kind,false,true)
    const s=await h.load()
    expect(
      h.provider().forSnapshot(s)?.canEdit?.(h.record._id)??false,
    ).toBe(false)
    zero(h)
  },
)