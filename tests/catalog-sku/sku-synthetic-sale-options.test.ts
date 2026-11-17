import { describe, expect, it } from 'vitest'
import { asOpaqueId } from '@shared/types'
import type { SkuSourceIdentityPreflightInput } from '@shared/sku-live-read-preflight'
import {
  auditSyntheticSkuSalesOptions,
  createSyntheticSkuOptionAuditReader,
  type SyntheticSkuOptionFixture,
} from '@shared/sku-synthetic-sale-options'

const workOrderId = asOpaqueId<'WorkOrderId'>('mock-work-order')
const source: SkuSourceIdentityPreflightInput = {
  principal: {
    sessionRef: 'mock-session', userId: 'mock-user', roleId: 'mock-role',
    roleVersion: '1', tenantId: 'mock-tenant', workOrderId: 'mock-work-order',
  },
  catalogContext: { workOrderId, serviceType: '11', sourceType: '3' },
  catalogListingComplete: true,
  listedMaterialSpuIds: ['mock-spu', 'mock-other-spu'],
  selectedMaterialSpuIds: ['mock-spu'],
}
const field = (name: string, valueOption: string) => ({
  colName: 'material', state: 1, tenantId: 'mock-tenant',
  name, nameDisp: name, valueOption,
  frontEndConfig: '{"salesAttribute":true}',
})
const fixture: SyntheticSkuOptionFixture = {
  provenance: 'synthetic_fixture', codeTenantId: 'mock-tenant', complete: true,
  spu: {
    _id: 'mock-spu', tenantId: 'mock-tenant', state: 1,
    exts: { color: ['grey', 'white'], thickness: [2], ordinary: 'sample' },
  },
  extFields: [
    field('color', 'mock-color-code'),
    field('thickness', 'mock-thickness-code'),
    { ...field('ordinary', 'mock-not-sale'), frontEndConfig: '{}' },
  ],
  codeResults: [
    { eleid: 'mock-color-code', options: { grey: '灰色', white: '白色', blue: '蓝色' } },
    { eleid: 'mock-thickness-code', options: { '2': '2 mm', '3': '3 mm' } },
  ],
}

const block = (reason: string) =>
  ({ state: 'blocked', reason, realReadAuthorized: false })

describe('P1 #75 synthetic Material sales options: source and tenant provenance', () => {
  it('projects only the listed SPU values with precise R1 valueOption mappings', () => {
    expect(auditSyntheticSkuSalesOptions(source, fixture)).toEqual({
      state: 'synthetic_structure_only', spuId: 'mock-spu',
      fields: [
        {
          name: 'color', label: 'color', valueOption: 'mock-color-code',
          options: [{ value: 'grey', label: '灰色' }, { value: 'white', label: '白色' }],
        },
        {
          name: 'thickness', label: 'thickness', valueOption: 'mock-thickness-code',
          options: [{ value: '2', label: '2 mm' }],
        },
      ],
      realReadAuthorized: false, backendWorkOrderAcl: 'unverified',
      codeTenantAuthority: 'unverified', officialSkuSelection: false,
    })
    expect(auditSyntheticSkuSalesOptions(source, fixture)).not.toHaveProperty('price')
  })

  it('never accepts a caller tenant override or an ExtField belonging to a foreign tenant', () => {
    expect(auditSyntheticSkuSalesOptions(source, { ...fixture, codeTenantId: 'foreign-tenant' }))
      .toEqual(block('tenant_mismatch'))
    expect(auditSyntheticSkuSalesOptions(source, {
      ...fixture,
      extFields: [{ ...field('color', 'mock-color-code'), tenantId: 'foreign-tenant' }],
    })).toEqual(block('unverified_sale_field'))
    expect(auditSyntheticSkuSalesOptions(source, {
      ...fixture, spu: { ...(fixture.spu as object), tenantId: 'foreign-tenant' },
    })).toEqual(block('spu_identity_mismatch'))
  })

  it('requires current WorkOrder and explicit sourceType, never treating ID matches as ACL', () => {
    expect(auditSyntheticSkuSalesOptions({
      ...source, catalogContext: { workOrderId, serviceType: '11' },
    }, fixture)).toEqual(block('unverified_work_order_scope'))
    expect(auditSyntheticSkuSalesOptions({
      ...source, principal: { ...source.principal!, workOrderId: 'foreign-wo' },
    }, fixture)).toEqual(block('unverified_work_order_scope'))
    expect(auditSyntheticSkuSalesOptions({
      ...source, catalogListingComplete: false,
    }, fixture)).toEqual(block('unverified_work_order_scope'))
  })

  it('blocks missing/foreign/inactive Material SPU even when code options look valid', () => {
    for (const changes of [
      { _id: 'foreign-spu' }, { _id: '' }, { state: 0 }, { exts: null },
    ]) {
      expect(auditSyntheticSkuSalesOptions(source, {
        ...fixture, spu: { ...(fixture.spu as object), ...changes },
      })).toEqual(block('spu_identity_mismatch'))
    }
  })

  it('rejects partial, missing, duplicate and unrelated code option types', () => {
    expect(auditSyntheticSkuSalesOptions(source, { ...fixture, complete: false }))
      .toEqual(block('partial_option_response'))
    expect(auditSyntheticSkuSalesOptions(source, { ...fixture, codeResults: [] }))
      .toEqual(block('missing_code_options'))
    expect(auditSyntheticSkuSalesOptions(source, { ...fixture, codeResults: [
      ...(fixture.codeResults as unknown[]), (fixture.codeResults as unknown[])[0],
    ] })).toEqual(block('duplicate_or_foreign_code_result'))
    expect(auditSyntheticSkuSalesOptions(source, { ...fixture, codeResults: [
      ...(fixture.codeResults as unknown[]), { eleid: 'other-tenant-code', options: { any: 'any' } },
    ] })).toEqual(block('duplicate_or_foreign_code_result'))
  })

  it('denies unresolved material sales values instead of making up labels', () => {
    expect(auditSyntheticSkuSalesOptions(source, { ...fixture, codeResults: [
      { eleid: 'mock-color-code', options: { grey: '灰色' } },
      (fixture.codeResults as unknown[])[1],
    ] })).toEqual(block('unresolved_option_value'))
    expect(auditSyntheticSkuSalesOptions(source, { ...fixture, codeResults: [
      { eleid: 'mock-color-code', options: { grey: '灰色', white: '' } },
      (fixture.codeResults as unknown[])[1],
    ] })).toEqual(block('unresolved_option_value'))
  })

  it('denies malformed, duplicate or out-of-range sales-attribute definitions', () => {
    expect(auditSyntheticSkuSalesOptions(source, { ...fixture, extFields: [
      field('color', 'mock-color-code'), field('color', 'mock-color-code'),
    ] })).toEqual(block('duplicate_field'))
    for (const config of ['{bad json}', '{"salesAttribute":"yes"}']) {
      expect(auditSyntheticSkuSalesOptions(source, { ...fixture, extFields: [
        { ...field('color', 'mock-color-code'), frontEndConfig: config },
      ] })).toEqual(block('unverified_sale_field'))
    }
    expect(auditSyntheticSkuSalesOptions(source, { ...fixture, spu: {
      ...(fixture.spu as object), exts: { color: ['grey', 'grey'], thickness: [2] },
    } })).toEqual(block('malformed_spu_options'))
  })

  it('treats fields without salesAttribute as ordinary non-sale inputs', () => {
    const result = auditSyntheticSkuSalesOptions(source, {
      ...fixture,
      spu: { ...(fixture.spu as object), exts: {} },
      extFields: [
        { ...field('ordinary', 'not-used'), frontEndConfig: '' },
        { ...field('ordinary2', 'not-used2'), frontEndConfig: '{}' },
      ],
      codeResults: [],
    })
    expect(result).toMatchObject({
      state: 'synthetic_structure_only', fields: [], realReadAuthorized: false,
    })
  })

  it('never mutates fixture input or silently enables official submission', () => {
    const before = JSON.stringify({ source, fixture })
    const result = auditSyntheticSkuSalesOptions(source, fixture)
    expect(JSON.stringify({ source, fixture })).toBe(before)
    expect(result.realReadAuthorized).toBe(false)
    if (result.state === 'synthetic_structure_only') {
      expect(result.officialSkuSelection).toBe(false)
    }
  })
})

describe('#75 async synthetic-only option audit: scope and race rejection', () => {
  it('discards responses when principal, WorkOrder, sourceType, or catalog changes', async () => {
    const changes = [
      { ...source, principal: { ...source.principal!, roleId: 'new-role' } },
      { ...source, principal: { ...source.principal!, roleVersion: 'new-role-version' } },
      { ...source, catalogContext: { workOrderId, serviceType: '11', sourceType: 'other' } },
      { ...source, catalogContext: { workOrderId: asOpaqueId<'WorkOrderId'>('foreign'), serviceType: '11', sourceType: '3' } },
      { ...source, listedMaterialSpuIds: ['mock-spu'] },
      { ...source, selectedMaterialSpuIds: ['mock-other-spu'] },
    ]
    for (const next of changes) {
      let current = source
      let resolve!: (f: SyntheticSkuOptionFixture) => void
      const reader = createSyntheticSkuOptionAuditReader({
        enabled: () => true,
        currentSource: () => current,
        fetchSyntheticFixture: () => new Promise(res => { resolve = res }),
      })
      const pending = reader.read()
      current = next
      resolve(fixture)
      expect(await pending).toEqual(block('stale_response'))
    }
  })

  it('rejects overlapping reads, invalidation, disabled runtime and failed provider', async () => {
    const releases: ((f: SyntheticSkuOptionFixture) => void)[] = []
    const reader = createSyntheticSkuOptionAuditReader({
      enabled: () => true, currentSource: () => source,
      fetchSyntheticFixture: () => new Promise(res => { releases.push(res) }),
    })
    const first = reader.read(), second = reader.read()
    releases[0](fixture); releases[1](fixture)
    expect(await first).toEqual(block('stale_response'))
    expect((await second).state).toBe('synthetic_structure_only')

    const third = reader.read()
    reader.invalidate()
    releases[2](fixture)
    expect(await third).toEqual(block('stale_response'))

    let calls = 0
    const disabled = createSyntheticSkuOptionAuditReader({
      enabled: () => false, currentSource: () => source,
      fetchSyntheticFixture: async () => { calls++; return fixture },
    })
    expect(await disabled.read()).toEqual(block('synthetic_source_missing'))
    expect(calls).toBe(0)
    const failure = createSyntheticSkuOptionAuditReader({
      enabled: () => true, currentSource: () => source,
      fetchSyntheticFixture: async () => { throw new Error('synthetic failure') },
    })
    expect(await failure.read()).toEqual(block('read_failed'))
  })
})
