import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import wire from '../../contracts/production/technician-role-readonly-20261105/effective-order-wire.json'
import context from '../../contracts/production/technician-role-readonly-20261105/context1.json'
import coverage from '../../contracts/production/technician-role-readonly-20261105/coverage-f01-f21.json'
import { projectR1EvidenceSyntheticWire } from '../../scripts/lib/r1-evidence-synthetic-wire.mjs'
import { dynamicCodeOptions, cascadeCodeOptions } from '../../src/adapters/api/read-models/code-options'
import { createOrderExtFieldEffectivePlan } from '../../src/features/work-orders/quotation/order-extfield-effective-plan'
import { evaluateOrderExtFields } from '../../src/features/work-orders/quotation/order-extfield-runtime'
import { provinceList, cityList } from '../../src/adapters/api/reference/area-region-dictionary'
import { countyList } from '../../src/adapters/api/reference/area-county-dictionary'
import type { FormFieldOptionRead } from '../../src/shared/ports'
describe('committed deidentified R1 evidence integrity', () => {
  it('accepts the captured Order area row only with a verified complete dictionary path', () => {
    const field = wire.fieldResponse.data.find(row => row.name === 'projectArea')!
    expect(field).toMatchObject({ type: 'area', required: '1', frontEndConfig: { showType: 'submitOrder' } })
    const row = { ...field, rowId: field._id, valueKey: field.name }
    // Public reference codes only; no captured customer address or provider ID.
    const path = ['110000', '110100', '110101']
    const options = [{ value: path[0], label: provinceList[path[0]], children: [
      { value: path[1], label: cityList[path[1]], children: [{ value: path[2], label: countyList[path[2]] }] },
    ] }]
    expect([options[0].label, options[0].children[0].label, options[0].children[0].children[0].label])
      .toEqual(['北京市', '北京市', '东城区'])
    const input = { rows: [row], context: { ...wire.context, stage: 'submitOrder' as const },
      values: { [field.name]: path }, optionsByRowId: { [field._id]: options } }
    expect(evaluateOrderExtFields(input, 'submit')).toMatchObject({ state: 'ready', exts: { projectArea: path } })
    for (const value of [['110000'], ['110000', '110100'], ['110000', '110100', '999999']]) {
      expect(evaluateOrderExtFields({ ...input, values: { [field.name]: value } }, 'submit').state).toBe('blocked')
    }
    expect(evaluateOrderExtFields({ ...input, optionsByRowId: {} }, 'submit').state).toBe('blocked')
  })
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
