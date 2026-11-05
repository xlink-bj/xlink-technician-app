import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import wire from '../../contracts/production/technician-role-readonly-20261105/effective-order-wire.json'
import context from '../../contracts/production/technician-role-readonly-20261105/context1.json'
import coverage from '../../contracts/production/technician-role-readonly-20261105/coverage-f01-f21.json'
import { projectR1EvidenceSyntheticWire } from '../../scripts/lib/r1-evidence-synthetic-wire.mjs'
import { dynamicCodeOptions, cascadeCodeOptions } from '../../src/adapters/api/read-models/code-options'
import { createOrderExtFieldEffectivePlan } from '../../src/features/work-orders/quotation/order-extfield-effective-plan'
import type { FormFieldOptionRead } from '../../src/shared/ports'
describe('committed deidentified R1 evidence integrity', () => {
  it('retains all 21 domain classifications without claiming full production models or write authority', () => {
    expect(coverage.domains.map(row => row.id)).toEqual(Array.from({ length: 21 }, (_, i) => `F${String(i + 1).padStart(2,'0')}`))
    expect(coverage.domains.filter(row => row.productionBoundedResponseObserved)).toHaveLength(15)
    expect(coverage.domains.every(row => !row.serverBusinessWritePermissionTested)).toBe(true)
    for (const row of coverage.domains) expect(existsSync(row.evidence)).toBe(true)
  })
  it('pins executed audit sources and reproduces the explicitly synthetic effective subset', () => {
    for (const [path, expected] of Object.entries(context.provenance.auditCodeSha256)) { expect(existsSync(path)).toBe(true); expect(expected).toMatch(/^[a-f0-9]{64}$/) }
    const { provenance: _provenance, captureId: _captureId, ...fixture } = wire
    expect(projectR1EvidenceSyntheticWire(context.projection)).toEqual(fixture)
    expect(wire.observedTenantTotal).toBe(32)
    expect(wire.fieldResponse.total).toBe(9)
    expect(wire.syntheticOnly).toBe(true)
    expect(wire.notForProductionRequests).toBe(true)
    expect(wire.configurationReviewRequired.map(row => row.valueKey)).toEqual(['partDescription','clientname','maintainAreaNum','button'])
  })
  it('maps observed Code/Cascade fields through the real runtime and keeps both special actions blocked', () => {
    const rows = wire.fieldResponse.data.map(row => ({ ...row, rowId: row._id, valueKey: row.name }))
    const options: Record<string, readonly FormFieldOptionRead[]> = {}
    for (const row of rows) if ('valueOption' in row && row.valueOption) options[row.rowId] = row.type === 'cascade'
      ? cascadeCodeOptions(wire.cascadeResponse, row.valueOption).items
      : dynamicCodeOptions(wire.codeResponse, row.valueOption).items
    const place = createOrderExtFieldEffectivePlan(rows, { ...wire.context, stage: 'placeOrder' }, options)
    const submit = createOrderExtFieldEffectivePlan(rows, { ...wire.context, stage: 'submitOrder' }, options)
    expect(place.fields).toHaveLength(3)
    expect(submit.fields).toHaveLength(4)
    expect(place.rows.filter(row => row.disposition === 'blocked').map(row => row.controlType)).toEqual(['button'])
    expect(submit.rows.filter(row => row.disposition === 'blocked').map(row => row.controlType)).toEqual(['area'])
  })
})
