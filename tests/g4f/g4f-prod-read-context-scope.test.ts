import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  createPlaceOrderCatalogContextSelector,
  parseCatalogContextAuditArgs,
} from '../../scripts/g4f-prod-read-context-scope.mjs'
import { inspectDirectMaterialOrderPage } from '../../scripts/g4f-direct-material-order-discovery.mjs'
import { workOrderOrderLineageReadState } from '../../scripts/g4f-prod-read-summary.mjs'

describe('bounded Production catalog context audit selection', () => {
  it('defaults to the first context and accepts an explicit bounded ordinal', () => {
    expect(parseCatalogContextAuditArgs([])).toEqual({ catalogContextOrdinal: 1, catalogContextOnly: false, activeOrderFieldsOnly: false, compareSelectedOrderMaterialPrices: false, compareSelectedOrderPackagePrices: false, compareSelectedOrderProcedureMeasurePrices: false, discoverDirectMaterialOrder: false, discoverDirectProviderOrder: false, discoverDirectMeasureOrder: false })
    expect(parseCatalogContextAuditArgs(['--catalog-context-only', '--catalog-context-ordinal=2']))
      .toEqual({ catalogContextOrdinal: 2, catalogContextOnly: true, activeOrderFieldsOnly: false, compareSelectedOrderMaterialPrices: false, compareSelectedOrderPackagePrices: false, compareSelectedOrderProcedureMeasurePrices: false, discoverDirectMaterialOrder: false, discoverDirectProviderOrder: false, discoverDirectMeasureOrder: false })
    expect(parseCatalogContextAuditArgs(['--catalog-context-only', '--compare-selected-order-material-prices']))
      .toEqual({ catalogContextOrdinal: 1, catalogContextOnly: true, activeOrderFieldsOnly: false, compareSelectedOrderMaterialPrices: true, compareSelectedOrderPackagePrices: false, compareSelectedOrderProcedureMeasurePrices: false, discoverDirectMaterialOrder: false, discoverDirectProviderOrder: false, discoverDirectMeasureOrder: false })
    expect(parseCatalogContextAuditArgs(['--catalog-context-only', '--compare-selected-order-package-prices']))
      .toEqual({ catalogContextOrdinal: 1, catalogContextOnly: true, activeOrderFieldsOnly: false, compareSelectedOrderMaterialPrices: false, compareSelectedOrderPackagePrices: true, compareSelectedOrderProcedureMeasurePrices: false, discoverDirectMaterialOrder: false, discoverDirectProviderOrder: false, discoverDirectMeasureOrder: false })
    expect(parseCatalogContextAuditArgs(['--catalog-context-only', '--compare-selected-order-procedure-measure-prices']))
      .toMatchObject({ catalogContextOnly: true, compareSelectedOrderProcedureMeasurePrices: true })
    expect(parseCatalogContextAuditArgs([
      '--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--discover-direct-provider-order',
    ])).toMatchObject({ catalogContextOnly: true, compareSelectedOrderProcedureMeasurePrices: true, discoverDirectProviderOrder: true })
    expect(parseCatalogContextAuditArgs([
      '--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--discover-direct-measure-order',
    ])).toMatchObject({ catalogContextOnly: true, compareSelectedOrderProcedureMeasurePrices: true, discoverDirectMeasureOrder: true })
    expect(parseCatalogContextAuditArgs(['--', '--catalog-context-ordinal', '20']))
      .toEqual({ catalogContextOrdinal: 20, catalogContextOnly: false, activeOrderFieldsOnly: false, compareSelectedOrderMaterialPrices: false, compareSelectedOrderPackagePrices: false, compareSelectedOrderProcedureMeasurePrices: false, discoverDirectMaterialOrder: false, discoverDirectProviderOrder: false, discoverDirectMeasureOrder: false })
    expect(parseCatalogContextAuditArgs(['--active-order-fields-only', '--catalog-context-ordinal=3']))
      .toEqual({ catalogContextOrdinal: 3, catalogContextOnly: false, activeOrderFieldsOnly: true, compareSelectedOrderMaterialPrices: false, compareSelectedOrderPackagePrices: false, compareSelectedOrderProcedureMeasurePrices: false, discoverDirectMaterialOrder: false, discoverDirectProviderOrder: false, discoverDirectMeasureOrder: false })
    expect(parseCatalogContextAuditArgs([
      '--catalog-context-only', '--compare-selected-order-material-prices', '--discover-direct-material-order',
    ])).toMatchObject({
      catalogContextOnly: true, compareSelectedOrderMaterialPrices: true, discoverDirectMaterialOrder: true,
    })
  })

  it('rejects unsupported, duplicate, malformed, and unbounded command arguments', () => {
    for (const args of [
      ['--all'],
      ['--catalog-context-ordinal'],
      ['--catalog-context-ordinal=0'],
      ['--catalog-context-ordinal=21'],
      ['--catalog-context-ordinal=2x'],
      ['--catalog-context-ordinal=2', '--catalog-context-ordinal=3'],
      ['--catalog-context-only', '--catalog-context-only'],
      ['--compare-selected-order-material-prices'],
      ['--compare-selected-order-procedure-measure-prices'],
      ['--active-order-fields-only', '--compare-selected-order-material-prices'],
      ['--catalog-context-only', '--compare-selected-order-material-prices', '--compare-selected-order-material-prices'],
      ['--catalog-context-only', '--compare-selected-order-material-prices', '--discover-direct-material-order', '--catalog-context-ordinal=1'],
      ['--catalog-context-only', '--discover-direct-material-order'],
      ['--catalog-context-only', '--compare-selected-order-package-prices', '--discover-direct-material-order'],
      ['--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--discover-direct-material-order'],
      ['--catalog-context-only', '--compare-selected-order-material-prices', '--discover-direct-material-order', '--discover-direct-material-order'],
      ['--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--compare-selected-order-material-prices'],
      ['--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--compare-selected-order-package-prices'],
      ['--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--compare-selected-order-procedure-measure-prices'],
      ['--catalog-context-only', '--discover-direct-provider-order'],
      ['--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--discover-direct-provider-order', '--catalog-context-ordinal=1'],
      ['--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--discover-direct-provider-order', '--compare-selected-order-package-prices'],
      ['--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--discover-direct-provider-order', '--discover-direct-material-order'],
      ['--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--discover-direct-measure-order', '--discover-direct-provider-order'],
      ['--catalog-context-only', '--compare-selected-order-procedure-measure-prices', '--discover-direct-measure-order', '--catalog-context-ordinal=1'],
      ['--compare-selected-order-package-prices'],
      ['--catalog-context-only', '--compare-selected-order-material-prices', '--compare-selected-order-package-prices'],
      ['--active-order-fields-only', '--active-order-fields-only'],
      ['--active-order-fields-only', '--catalog-context-only'],
      ['--authorize-bounded-prod-read', '--authorize-bounded-prod-read'],
      ['--preflight-only', '--authorize-bounded-prod-read'],
    ]) expect(() => parseCatalogContextAuditArgs(args)).toThrow()
  })

  it('counts distinct exact service/source pairs only when WorkOrder identity matches', () => {
    const selector = createPlaceOrderCatalogContextSelector(2)
    const first = { workOrderId: 'wo-1', serviceType: 'service-a', sourceType: 'source-a' }
    expect(selector.consider(first, 'wo-1')).toMatchObject({ eligible: true, distinct: true, ordinal: 1, selected: false })
    expect(selector.consider({ ...first, workOrderId: 'wo-2' }, 'wo-2'))
      .toMatchObject({ eligible: true, distinct: false, ordinal: 1, selected: false })
    expect(selector.consider({ ...first, workOrderId: 'other-id', sourceType: 'source-b' }, 'wo-2'))
      .toMatchObject({ eligible: false, distinct: false, ordinal: null, selected: false })
    expect(selector.distinctCount).toBe(1)
    expect(selector.consider({ ...first, workOrderId: 'wo-3', sourceType: 'source-b' }, 'wo-3'))
      .toMatchObject({ eligible: true, distinct: true, ordinal: 2, selected: true })
    expect(selector.distinctCount).toBe(2)
  })

  it('discovers only direct top-level Material lines and fails closed on Order ownership conflicts', () => {
    const line = { kind: 'material', identity: { spuId: 'spu-1' } }
    expect(inspectDirectMaterialOrderPage('wo-1', {
      items: [{ type: 1, serviceAppointmentId: 'wo-1', groups: [{ lines: [line] }] }],
    })).toMatchObject({ state: 'FOUND', orders: 1, directMaterialLines: 1 })
    expect(inspectDirectMaterialOrderPage('wo-1', {
      items: [{ type: 1, serviceAppointmentId: 'wo-1', groups: [{
        lines: [{ kind: 'package', children: [line] }],
      }] }],
    })).toMatchObject({ state: 'NO_DIRECT_MATERIAL_LINES', directMaterialLines: 0 })
    expect(inspectDirectMaterialOrderPage('wo-1', {
      items: [{ type: 1, serviceAppointmentId: 'other-wo', groups: [{ lines: [line] }] }],
    })).toMatchObject({ state: 'ORDER_ASSOCIATION_CONFLICT', directMaterialLines: 0 })
  })

  it('keeps an unqueried Order lineage separate from successful reads', () => {
    expect(workOrderOrderLineageReadState([])).toBe('NOT_RUN')
    expect(workOrderOrderLineageReadState(['SUCCEEDED', 'SUCCEEDED'])).toBe('SUCCEEDED')
    expect(workOrderOrderLineageReadState(['SUCCEEDED', 'FAILED_TERMINAL'])).toBe('PARTIAL')
  })

  it('keeps the Production audit runner at zero network by default', () => {
    const run = spawnSync(process.execPath, ['scripts/verify-g4f-prod-read.mjs'], { encoding: 'utf8' })
    expect(run.status).toBe(0)
    expect(JSON.parse(run.stdout)).toMatchObject({
      status: 'NO_NETWORK_DEFAULT',
      loginRequests: 0,
      blockedUnexpectedNetworkRequests: 0,
      productionBusinessMutationNetworkRequests: 0,
    })
  })

  it('keeps the selected Order price comparison at zero network without explicit authorization', () => {
    const run = spawnSync(process.execPath, [
      'scripts/verify-g4f-prod-read.mjs',
      '--catalog-context-only',
      '--compare-selected-order-material-prices',
    ], { encoding: 'utf8' })
    expect(run.status).toBe(0)
    expect(JSON.parse(run.stdout)).toMatchObject({
      status: 'NO_NETWORK_DEFAULT',
      loginRequests: 0,
      blockedUnexpectedNetworkRequests: 0,
      productionBusinessMutationNetworkRequests: 0,
    })
  })

  it('keeps the selected Package price comparison at zero network without explicit authorization', () => {
    const run = spawnSync(process.execPath, [
      'scripts/verify-g4f-prod-read.mjs',
      '--catalog-context-only',
      '--compare-selected-order-package-prices',
    ], { encoding: 'utf8' })
    expect(run.status).toBe(0)
    expect(JSON.parse(run.stdout)).toMatchObject({
      status: 'NO_NETWORK_DEFAULT',
      loginRequests: 0,
      blockedUnexpectedNetworkRequests: 0,
      productionBusinessMutationNetworkRequests: 0,
    })
  })

  it('keeps the selected Procedure/Measure price comparison at zero network without explicit authorization', () => {
    const run = spawnSync(process.execPath, [
      'scripts/verify-g4f-prod-read.mjs',
      '--catalog-context-only',
      '--compare-selected-order-procedure-measure-prices',
    ], { encoding: 'utf8' })
    expect(run.status).toBe(0)
    expect(JSON.parse(run.stdout)).toMatchObject({
      status: 'NO_NETWORK_DEFAULT',
      loginRequests: 0,
      blockedUnexpectedNetworkRequests: 0,
      productionBusinessMutationNetworkRequests: 0,
    })
  })

  it('keeps direct Procedure/Measure discovery at zero network without explicit authorization', () => {
    const run = spawnSync(process.execPath, [
      'scripts/verify-g4f-prod-read.mjs',
      '--catalog-context-only',
      '--compare-selected-order-procedure-measure-prices',
      '--discover-direct-provider-order',
    ], { encoding: 'utf8' })
    expect(run.status).toBe(0)
    expect(JSON.parse(run.stdout)).toMatchObject({
      status: 'NO_NETWORK_DEFAULT',
      loginRequests: 0,
      blockedUnexpectedNetworkRequests: 0,
      productionBusinessMutationNetworkRequests: 0,
    })
  })

  it('keeps direct Measure discovery at zero network without explicit authorization', () => {
    const run = spawnSync(process.execPath, [
      'scripts/verify-g4f-prod-read.mjs',
      '--catalog-context-only',
      '--compare-selected-order-procedure-measure-prices',
      '--discover-direct-measure-order',
    ], { encoding: 'utf8' })
    expect(run.status).toBe(0)
    expect(JSON.parse(run.stdout)).toMatchObject({
      status: 'NO_NETWORK_DEFAULT',
      loginRequests: 0,
      blockedUnexpectedNetworkRequests: 0,
      productionBusinessMutationNetworkRequests: 0,
    })
  })

  it('keeps direct Material discovery at zero network without explicit authorization', () => {
    const run = spawnSync(process.execPath, [
      'scripts/verify-g4f-prod-read.mjs',
      '--catalog-context-only',
      '--compare-selected-order-material-prices',
      '--discover-direct-material-order',
    ], { encoding: 'utf8' })
    expect(run.status).toBe(0)
    expect(JSON.parse(run.stdout)).toMatchObject({
      status: 'NO_NETWORK_DEFAULT',
      loginRequests: 0,
      blockedUnexpectedNetworkRequests: 0,
      productionBusinessMutationNetworkRequests: 0,
    })
  })
})
