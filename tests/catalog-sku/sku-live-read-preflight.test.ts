import { describe, expect, it } from 'vitest'
import { preflightSkuSourceIdentity, type SkuSourceIdentityPreflightInput } from '@shared/sku-live-read-preflight'
import { asOpaqueId } from '@shared/types'

const workOrderId = asOpaqueId<'WorkOrderId'>('work-order-1')
const base: SkuSourceIdentityPreflightInput = {
  principal: {
    sessionRef: 'session-1', userId: 'user-1', roleId: 'role-1',
    roleVersion: 'revision-1', tenantId: 'tenant-1', workOrderId: 'work-order-1',
  },
  catalogContext: { workOrderId, serviceType: '11', sourceType: '3' },
  listedMaterialSpuIds: ['spu-a', 'spu-b', 'spu-c'],
  selectedMaterialSpuIds: ['spu-a', 'spu-b'],
  catalogListingComplete: true,
}

describe('#75 real SKU source preflight — identity is never backend authority', () => {
  it('returns source ID evidence only, not a real read, SKU price or permission', () => {
    const result = preflightSkuSourceIdentity(base)
    expect(result).toEqual({
      state: 'source_identity_only', workOrderId: 'work-order-1',
      serviceType: '11', sourceType: '3',
      selectedMaterialSpuIds: ['spu-a', 'spu-b'],
      liveReadAuthorized: false, backendAuthorization: 'unverified',
      salesAttributes: 'unverified', tenantCodeOptions: 'unverified',
      paginationAndSkuScope: 'unverified',
    })
    expect(result).not.toHaveProperty('request')
    expect(result).not.toHaveProperty('skuRows')
    expect(result).not.toHaveProperty('price')
  })

  it('blocks absent or incomplete current principal before any source check', () => {
    const missing = [null, ...[
      'sessionRef', 'userId', 'roleId', 'roleVersion', 'tenantId', 'workOrderId',
    ].map(k => ({ ...base.principal!, [k]: '' }))]
    for (const principal of missing) {
      expect(preflightSkuSourceIdentity({ ...base, principal }))
        .toEqual({ state: 'blocked', reason: 'principal_missing', liveReadAuthorized: false })
    }
  })

  it('requires exact current WorkOrder and ServiceAppointment source filters', () => {
    const contexts = [
      [null, 'work_order_context_missing'],
      [{ serviceType: '11', sourceType: '3' }, 'work_order_context_missing'],
      [{ workOrderId, serviceType: '', sourceType: '3' }, 'work_order_context_missing'],
      [{ workOrderId, serviceType: '11' }, 'source_type_missing'],
      [{ workOrderId, serviceType: '11', sourceType: '' }, 'source_type_missing'],
      [{ workOrderId: asOpaqueId<'WorkOrderId'>('foreign-wo'), serviceType: '11', sourceType: '3' }, 'work_order_mismatch'],
    ] as const
    for (const [catalogContext, reason] of contexts) {
      expect(preflightSkuSourceIdentity({ ...base, catalogContext }))
        .toEqual({ state: 'blocked', reason, liveReadAuthorized: false })
    }
  })

  it('rejects missing page-completeness evidence and invalid listed identities', () => {
    expect(preflightSkuSourceIdentity({ ...base, catalogListingComplete: false }))
      .toEqual({ state: 'blocked', reason: 'catalog_incomplete', liveReadAuthorized: false })
    for (const listedMaterialSpuIds of [
      [], ['spu-a', 'spu-a'], [''], ['foreign ', 'spu-b'], Array.from({length: 201}, (_, i) => 'id-'+i),
    ]) {
      expect(preflightSkuSourceIdentity({ ...base, listedMaterialSpuIds }))
        .toEqual({ state: 'blocked', reason: 'catalog_ids_invalid', liveReadAuthorized: false })
    }
  })

  it('rejects unlisted, duplicate and unbounded requested SPU IDs even if labels match', () => {
    for (const selectedMaterialSpuIds of [
      [], ['spu-a', 'spu-a'], ['foreign-spu'], ['spu-a '],
      Array.from({length: 11}, (_, i) => 'id-'+i),
    ]) {
      const result = preflightSkuSourceIdentity({ ...base, selectedMaterialSpuIds })
      expect(result.state).toBe('blocked')
      expect(result.liveReadAuthorized).toBe(false)
    }
    expect(preflightSkuSourceIdentity({ ...base, selectedMaterialSpuIds: ['foreign-spu'] }))
      .toEqual({ state: 'blocked', reason: 'selected_spu_not_in_catalog', liveReadAuthorized: false })
  })

  it('is a pure review and never mutates the original catalog or selection', () => {
    const before = JSON.stringify(base)
    const result = preflightSkuSourceIdentity(base)
    expect(JSON.stringify(base)).toBe(before)
    if (result.state !== 'source_identity_only') throw Error('expected source identity')
    expect(result.selectedMaterialSpuIds).not.toBe(base.selectedMaterialSpuIds)
  })
})
