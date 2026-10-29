import { describe, expect, it } from 'vitest'
import { createSkuSyntheticReadGate, type SkuMockReadScope, type SkuMockPage } from '@shared/sku-synthetic-read-gate'
import { syntheticPackageSkuRows } from '@adapters/api/mock/package-material-sku'
const scope: SkuMockReadScope = {
  sessionRef: 'synthetic-session', userId: 'synthetic-user', roleId: 'synthetic-role',
  roleVersion: '1', tenantId: 'synthetic-tenant', workOrderId: 'synthetic-work-order',
  serviceType: '11', sourceType: '3', contextRevision: 1,
  listedSpuIds: ['synthetic-spu-roof', 'synthetic-spu-alternative', 'synthetic-spu-coating'],
  provenance: 'verified_synthetic_catalog',
}
const request = { workOrderId: scope.workOrderId, requestedSpuIds: ['synthetic-spu-roof'] }
const all = syntheticPackageSkuRows.map(row => ({ ...row, price: 100, orgId: 'do-not-leak' }))
const pageFor = (ids: readonly string[]): SkuMockPage => {
  const items = all.filter(row => ids.includes(row.spuid))
  return { items, total: items.length, hasMore: false }
}
function gate(opts: Partial<{
  enabled: () => boolean
  currentScope: () => SkuMockReadScope | null
  fetchSyntheticPage: (ids: readonly string[], pageSize: number) => Promise<SkuMockPage>
}> = {}) {
  return createSkuSyntheticReadGate({
    enabled: opts.enabled ?? (() => true),
    currentScope: opts.currentScope ?? (() => scope),
    fetchSyntheticPage: opts.fetchSyntheticPage ?? (async ids => pageFor(ids)),
  })
}
describe('SKU synthetic-only current principal/workorder/source/ID admission', () => {
  it('accepts only scoped unique active SKU and strips price and org information', async () => {
    const result = await gate().read(request)
    expect(result.state).toBe('accepted_synthetic')
    if (result.state !== 'accepted_synthetic') return
    expect(result.skuRows).toHaveLength(2)
    expect(result.skuRows[0]).toMatchObject({ _id: 'synthetic-sku-2-grey', spuid: 'synthetic-spu-roof', number: 3 })
    expect('price' in result.skuRows[0]).toBe(false)
    expect('orgId' in result.skuRows[0]).toBe(false)
  })
  it('blocks empty tenant, role, source, role version and unrelated WorkOrder before read', async () => {
    let calls = 0
    const tryScope = (s: SkuMockReadScope | null, req = request) => gate({
      currentScope: () => s,
      fetchSyntheticPage: async ids => { calls += 1; return pageFor(ids) },
    }).read(req)
    for (const patch of [{tenantId:''},{roleId:''},{roleVersion:''},{sourceType:''},{serviceType:''}]) {
      expect((await tryScope({...scope,...patch})).state).toBe('blocked')
    }
    expect((await tryScope(null)).state).toBe('blocked')
    expect((await tryScope(scope,{...request,workOrderId:'foreign'})).state).toBe('blocked')
    expect(calls).toBe(0)
  })
  it('blocks disabled DEV mock without invoking its injected provider', async () => {
    let calls = 0
    const result = await gate({ enabled: () => false,
      fetchSyntheticPage: async ids => { calls += 1; return pageFor(ids) },
    }).read(request)
    expect(result).toEqual({state:'blocked',reason:'synthetic_runtime_disabled'})
    expect(calls).toBe(0)
  })
  it('refuses unlisted and duplicated SPU IDs before provider read', async () => {
    let calls=0
    const g=gate({fetchSyntheticPage:async ids=>{calls+=1;return pageFor(ids)}})
    for (const ids of [['foreign'],[],['synthetic-spu-roof','synthetic-spu-roof'],Array(11).fill('synthetic-spu-roof')]) {
      expect((await g.read({...request,requestedSpuIds:ids})).state).toBe('blocked')
    }
    expect(calls).toBe(0)
  })
  it('rejects unknown response origin, partial page and incorrect total', async () => {
    for (const response of [
      {...pageFor(request.requestedSpuIds),hasMore:true},
      {...pageFor(request.requestedSpuIds),total:100},
      {...pageFor(request.requestedSpuIds),total:-1},
    ]) expect((await gate({fetchSyntheticPage:async()=>response}).read(request)).state).toBe('blocked')
    const foreign=pageFor(['synthetic-spu-coating'])
    expect(await gate({fetchSyntheticPage:async()=>foreign}).read(request))
      .toEqual({state:'blocked',reason:'foreign_sku'})
  })
  it('rejects duplicate/inactive/malformed SKU, including invalid quantity', async () => {
    const row=all[0]
    const cases = [
      { items:[row,row], reason:'duplicate_sku' },
      { items:[{...row,state:0}], reason:'malformed_sku' },
      { items:[{...row,number:-1}], reason:'malformed_sku' },
      { items:[{...row,exts:null}], reason:'malformed_sku' },
    ]
    for(const c of cases){
      expect(await gate({fetchSyntheticPage:async()=>({items:c.items,total:c.items.length,hasMore:false})}).read(request))
        .toEqual({state:'blocked',reason:c.reason})
    }
  })
  it('drops outstanding SKU read on role, tenant, WorkOrder, sourceType or allowed list change', async () => {
    const patches: Partial<SkuMockReadScope>[] = [
      {roleId:'new-role'},{roleVersion:'2'},{userId:'other'},
      {sessionRef:'new-session'},{tenantId:'other-tenant'},{workOrderId:'changed'},
      {serviceType:'40'},{sourceType:'other-source'},{contextRevision:2},
      {listedSpuIds:['synthetic-spu-coating']},
    ]
    for(const patch of patches) {
      let current:SkuMockReadScope=scope
      let release!: (value: SkuMockPage)=>void
      const pending=gate({
        currentScope:()=>current,
        fetchSyntheticPage:()=>new Promise<SkuMockPage>(resolve=>{release=resolve}),
      }).read(request)
      current={...scope,...patch}
      release(pageFor(request.requestedSpuIds))
      expect(await pending).toEqual({state:'blocked',reason:'stale_response'})
    }
  })
  it('rejects overlapping earlier result and explicit invalidation', async () => {
    const releases: ((value:SkuMockPage)=>void)[]=[]
    const g=gate({fetchSyntheticPage:()=>new Promise<SkuMockPage>(resolve=>{releases.push(resolve)})})
    const a=g.read(request),b=g.read(request)
    releases[0](pageFor(request.requestedSpuIds))
    releases[1](pageFor(request.requestedSpuIds))
    expect((await a).state).toBe('blocked')
    expect((await b).state).toBe('accepted_synthetic')
    const c=g.read(request)
    g.invalidate()
    releases[2](pageFor(request.requestedSpuIds))
    expect((await c).state).toBe('blocked')
  })
  it('denies provider errors but accepts a complete empty synthetic page', async () => {
    expect(await gate({fetchSyntheticPage:async()=>{throw Error('fake outage')}}).read(request))
      .toEqual({state:'blocked',reason:'read_failed'})
    expect(await gate({fetchSyntheticPage:async()=>({items:[],total:0,hasMore:false})}).read(request))
      .toEqual({state:'accepted_synthetic',skuRows:[]})
  })
})
