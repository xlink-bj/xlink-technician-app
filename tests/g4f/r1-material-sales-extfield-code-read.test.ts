import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuotationCatalogReadAdapter, type QuotationCatalogReadAuthorizationScope } from '@adapters/api/quotation-catalog-api'
import type { ApiReadRequest } from '@adapters/api/technician-api'
import { asOpaqueId } from '@shared/types'

const R1_CODE_TENANT = '1340835581184723420'
const ctx = { workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-work-order-for-sale-fields'), serviceType: 'r1-service', sourceType: 'r1-source' }
const principal: QuotationCatalogReadAuthorizationScope = {
  sessionRef: 'session-1', userId: 'tech-1', roleId: 'role-1', roleVersion: '1',
}
const rawFields = [
  { _id: 'field-1', colName: 'material', state: 1, name: 'thickness', nameDisp: '厚度',
    valueOption: 'r1-thickness', frontEndConfig: '{"salesAttribute":true}', privateField: 'never-forward' },
  { _id: 'field-2', colName: 'material', state: 1, name: 'color', nameDisp: '颜色',
    valueOption: 'r1-color', frontEndConfig: '{"salesAttribute":true}', privateField: 'never-forward' },
  { _id: 'field-3', colName: 'material', state: 1, name: 'internalNotes', nameDisp: '备注',
    valueOption: 'internal-code', frontEndConfig: '{"salesAttribute":false}' },
]
const codeResults = [
  { eleid: 'r1-thickness', options: { '2': '2毫米', '3': '3毫米' } },
  { eleid: 'r1-color', options: { black: '黑色', grey: '灰色' } },
]

function port(execute: (r: ApiReadRequest) => Promise<unknown>, tenant = R1_CODE_TENANT,
  identity: () => QuotationCatalogReadAuthorizationScope | null = () => principal) {
  return createQuotationCatalogReadAdapter({ execute }, identity, tenant)
}

describe('M1 I2 source-pinned R1 ExtField salesAttribute → tenant Code dictionaries', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses the EXACT R1 two-step provider requests, projects only verified sales fields and labels', async () => {
    const execute = vi.fn(async (r: ApiReadRequest) => r.path === 'biz/extField/query'
      ? { data: rawFields } : codeResults)
    const result = await port(execute).listMaterialSalesFields!(ctx)
    expect(result).toMatchObject({
      state: 'succeeded', data: { items: [
        { name: 'thickness', label: '厚度', valueOption: 'r1-thickness',
          options: [{ value: '2', label: '2毫米' }, { value: '3', label: '3毫米' }] },
        { name: 'color', label: '颜色', valueOption: 'r1-color',
          options: [{ value: 'black', label: '黑色' }, { value: 'grey', label: '灰色' }] },
      ] },
    })
    expect(result.data?.items).toHaveLength(2)
    expect(result.data?.items[0]).not.toHaveProperty('privateField')
    expect(result.data?.items[0]).not.toHaveProperty('frontEndConfig')
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute.mock.calls.map(([r]) => r)).toEqual([
      {
        method: 'POST', path: 'biz/extField/query',
        body: { sortField: 'order', colName: 'material', _all: '1',
          'is:state|integer#and': 1, sortOrder: 'asc' },
      },
      {
        method: 'POST', path: 'i/code/selectCode.do',
        body: { jsonPara: JSON.stringify([
          { codeId: 'r1-thickness', eleid: 'r1-thickness' },
          { codeId: 'r1-color', eleid: 'r1-color' },
        ]), tenantId: R1_CODE_TENANT },
      },
    ])
  })

  it('does not call Code service when provider has no material sales attributes', async () => {
    const execute = vi.fn(async (_r: ApiReadRequest) => ({ data: [rawFields[2]] }))
    const result = await port(execute).listMaterialSalesFields!(ctx)
    expect(result).toEqual({ state: 'succeeded', data: { items: [] } })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed, duplicate, foreign, missing or partial dictionaries', async () => {
    for (const fields of [
      [rawFields[0], rawFields[0]],  // duplicate name
      [{ ...rawFields[0], frontEndConfig: '{broken' }],
      [{ ...rawFields[0], colName: 'order' }],
      [{ ...rawFields[0], state: 0 }],
      [{ ...rawFields[0], valueOption: '' }],
      [{ ...rawFields[0], frontEndConfig: '{"salesAttribute":"yes"}' }],
    ]) {
      const execute = vi.fn(async (_r: ApiReadRequest) => ({ data: fields }))
      const result = await port(execute).listMaterialSalesFields!(ctx)
      expect(result.state).toBe('failed_terminal')
      expect(execute).toHaveBeenCalledTimes(1)
    }
    for (const codes of [
      [codeResults[0]], // missing color
      [codeResults[0], codeResults[0]], // duplicate and missing
      [...codeResults, { eleid: 'foreign', options: {} }],
      [{ eleid: 'r1-thickness', options: { '2': '' } }, codeResults[1]],
    ]) {
      const execute = vi.fn(async (r: ApiReadRequest) => r.path === 'biz/extField/query'
        ? { data: rawFields } : codes)
      const result = await port(execute).listMaterialSalesFields!(ctx)
      expect(result.state).toBe('failed_terminal')
      expect(execute).toHaveBeenCalledTimes(2)
    }
  })

  it('fails closed without current WorkOrder, current principal or exact R1 tenant', async () => {
    const execute = vi.fn(async (_r: ApiReadRequest) => ({ data: rawFields }))
    const wrongTenant = await port(execute, 'unverified-tenant').listMaterialSalesFields!(ctx)
    expect(wrongTenant.error?.category).toBe('authorization_denied')
    const unknownActor = await port(execute, R1_CODE_TENANT, () => null).listMaterialSalesFields!(ctx)
    expect(unknownActor.error?.category).toBe('authorization_denied')
    const withoutOrder = await port(execute).listMaterialSalesFields!({ serviceType: 'r1-service' })
    expect(withoutOrder.state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })

  it('discards results if the role changes during ExtField or Code await', async () => {
    for (const step of [1, 2]) {
      let identity: QuotationCatalogReadAuthorizationScope = principal
      let calls = 0
      const execute = vi.fn(async (r: ApiReadRequest) => {
        calls += 1
        if (step === calls) identity = { ...principal, roleVersion: '2' }
        return r.path === 'biz/extField/query' ? { data: rawFields } : codeResults
      })
      const result = await port(execute, R1_CODE_TENANT, () => identity).listMaterialSalesFields!(ctx)
      expect(result.error?.category).toBe('authorization_denied')
      expect(execute).toHaveBeenCalledTimes(step)
    }
  })

  it('blocks Production before any ExtField or Code request', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    vi.stubEnv('VITE_XLINK_API_BASE_URL', 'https://production.invalid')
    const execute = vi.fn(async (_r: ApiReadRequest) => ({ data: rawFields }))
    const result = await port(execute).listMaterialSalesFields!(ctx)
    expect(result.error?.category).toBe('authorization_denied')
    expect(execute).not.toHaveBeenCalled()
  })
})
