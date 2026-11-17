import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asOpaqueId } from '@shared/types'
import type { SessionSnapshot } from '@shared/ports'
import { setBusinessMockMode, resetBusinessMockCache } from '@adapters/api/mock/config'
import { mockJourneyWorkOrderId } from '@adapters/api/mock/journey'
import {
  createSyntheticSkuReviewCoordinator, syntheticSkuReviewScope,
} from '@app/material-sku-mock-coordinator'
import { matchR1MaterialSku } from '@shared/material-sku-contract'
import { matchR1PackageMaterialSku } from '@shared/package-material-sku-contract'

beforeEach(() => {
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  resetBusinessMockCache()
  setBusinessMockMode('data')
})
afterEach(() => { resetBusinessMockCache(); vi.unstubAllEnvs() })

const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('local-mock-only-session'),
  user: { id: asOpaqueId<'UserId'>('synthetic-user'), displayName: '合成技术员' },
  currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role'), name: '合成角色' },
  capabilityNames: ['work-order.read'],
}
const scope = () => syntheticSkuReviewScope({ session, workOrderId: mockJourneyWorkOrderId })
const make = () => createSyntheticSkuReviewCoordinator({ currentScope: scope })
describe('DEV main-App SKU page: actual admission → source projection integration', () => {
  it('admits only the pinned DEV Mock principal, not a real or altered session', () => {
    expect(scope()?.provenance).toBe('verified_synthetic_catalog')
    expect(scope()?.tenantId).toBe('synthetic-no-real-tenant')
    expect(syntheticSkuReviewScope({ session, workOrderId: 'foreign' })).toBeNull()
    expect(syntheticSkuReviewScope({
      session: { ...session, sessionRef: asOpaqueId<'SessionRef'>('prod-session') },
      workOrderId: mockJourneyWorkOrderId,
    })).toBeNull()
    expect(syntheticSkuReviewScope({
      session: { ...session, currentRole: { id: asOpaqueId<'RoleId'>('foreign'), name: 'Other' } },
      workOrderId: mockJourneyWorkOrderId,
    })).toBeNull()
    expect(syntheticSkuReviewScope({ session: null, workOrderId: mockJourneyWorkOrderId })).toBeNull()
  })
  it('validates and projects direct Material SKU before allowing an exact match', async () => {
    const result = await make().direct('normal')
    expect(result.admission.status).toBe('accepted_synthetic')
    expect(result.read.state).toBe('ready')
    expect(matchR1MaterialSku(result.read, { thickness: '2', color: 'grey' }))
      .toEqual({ state: 'matched', skuId: 'synthetic-sku-2-grey', existingQuantity: 3 })
  })
  it('validates all package SPU parents, body links and two material layers before matching', async () => {
    const result = await make().package('normal')
    expect(result.admission.status).toBe('accepted_synthetic')
    const selected = [
      { layer: '1', linkId: 'synthetic-link-l1-roof', attributes: { thickness: '2', color: 'grey' } },
      { layer: '2', linkId: 'synthetic-link-l2-coating', attributes: { thickness: '3', color: 'black' } },
    ]
    const matched = matchR1PackageMaterialSku(result.read, selected)
    expect(matched.state).toBe('ready')
    if (matched.state !== 'ready') return
    expect(matched.rows.map(x => x.skuId)).toEqual(['synthetic-sku-2-grey', 'synthetic-sku-coat-3-black'])
  })
  it('rejects foreign and duplicated SKU at gate BEFORE projection can offer selection', async () => {
    const x = await make().direct('foreign')
    expect(x.admission).toEqual({ status: 'blocked', reason: 'foreign_sku' })
    expect(x.read.state).toBe('blocked')
    const y = await make().package('orphan')
    expect(y.admission).toEqual({ status: 'blocked', reason: 'foreign_sku' })
    expect(y.read.state).toBe('blocked')
    const z = await make().package('duplicate')
    expect(z.admission).toEqual({ status: 'blocked', reason: 'duplicate_sku' })
    expect(z.read.state).toBe('blocked')
  })
  it('leaves source-verified but semantically invalid sales metadata to pure R1 mapping', async () => {
    const malformed = await make().direct('malformed')
    expect(malformed.admission.status).toBe('accepted_synthetic')
    expect(malformed.read.state).toBe('blocked')
    const ambiguous = await make().direct('ambiguous')
    expect(ambiguous.admission.status).toBe('accepted_synthetic')
    expect(matchR1MaterialSku(ambiguous.read, { thickness: '2', color: 'grey' }).state).toBe('ambiguous')
  })
  it('treats fully returned empty rows as source-valid but not a usable SKU', async () => {
    const a = await make().direct('no_skus')
    expect(a.admission.status).toBe('accepted_synthetic')
    expect(a.read.state).toBe('no_skus')
    const b = await make().package('no_skus')
    expect(b.admission.status).toBe('accepted_synthetic')
    expect(b.read.state).toBe('ready')
    expect(matchR1PackageMaterialSku(b.read, [
      { layer: '1', linkId: 'synthetic-link-l1-roof', attributes: { thickness: '2', color: 'grey' } },
      { layer: '2', linkId: 'synthetic-link-l2-coating', attributes: { thickness: '3', color: 'black' } },
    ]).state).toBe('unavailable')
  })
  it('denies when Mock mode is off without any SKU match', async () => {
    setBusinessMockMode('off')
    const x = await make().direct('normal')
    const y = await make().package('normal')
    expect(x.admission.status).toBe('blocked')
    expect(y.admission.status).toBe('blocked')
    expect(x.read.state).toBe('blocked')
    expect(y.read.state).toBe('blocked')
  })
  it('drops earlier overlapping scenario reads and forbids stale matches', async () => {
    const client = make()
    const earlier = client.direct('normal')
    const later = client.direct('foreign')
    const [a, b] = await Promise.all([earlier, later])
    expect(a.admission).toEqual({ status: 'blocked', reason: 'stale_response' })
    expect(b.admission).toEqual({ status: 'blocked', reason: 'foreign_sku' })
    expect(a.read.state).toBe('blocked')
  })
})
