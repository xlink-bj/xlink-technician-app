import { describe, expect, it } from 'vitest'
import {
  isAllowedLoginRequest,
  isAllowedRoleTreeRequest,
  isAllowedR1ContractRequest,
  isAllowedTypeOneOrderRequest,
  isAllowedWorkOrderListRequest,
  r1ContractQueryBody,
} from '../../scripts/r1-order-contract-read-guard.mjs'

const workOrderId = 'role-listed-work-order'
const orderId = 'role-scoped-order'
const contractBody = r1ContractQueryBody(workOrderId)

describe('fixed-scope R1 Order / Contract read runner guard', () => {
  it('allows only a configured local technician login body and exact current-role tree read', () => {
    expect(isAllowedLoginRequest('POST', new URLSearchParams(), {
      method: 'phone', phone: 'configured-in-memory', code: 'configured-in-memory', tenantId: 'configured-in-memory',
    })).toBe(true)
    expect(isAllowedLoginRequest('POST', new URLSearchParams('x=1'), {
      method: 'phone', phone: 'p', code: 'c', tenantId: 't',
    })).toBe(false)
    expect(isAllowedLoginRequest('POST', new URLSearchParams(), {
      method: 'phone', phone: 'p', code: 'c', tenantId: 't', extra: 'unexpected',
    })).toBe(false)
    expect(isAllowedLoginRequest('GET', new URLSearchParams(), {
      method: 'phone', phone: 'p', code: 'c', tenantId: 't',
    })).toBe(false)

    expect(isAllowedRoleTreeRequest('POST', new URLSearchParams('roleId=technician-role'), undefined, 'technician-role')).toBe(true)
    expect(isAllowedRoleTreeRequest('POST', new URLSearchParams('roleId=technician-role'), '', 'technician-role')).toBe(true)
    expect(isAllowedRoleTreeRequest('POST', new URLSearchParams('roleId=other&extra=1'), undefined, 'technician-role')).toBe(false)
    expect(isAllowedRoleTreeRequest('POST', new URLSearchParams('roleId=technician-role'), {}, 'technician-role')).toBe(false)
  })

  it('allows only the next sequential role-visible WorkOrder page with at most three rows', () => {
    const body = {
      page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc', 'is:state|integer#and': 1,
    }
    expect(isAllowedWorkOrderListRequest('basic/serviceAppointment/query', 'POST', new URLSearchParams(), body)).toBe(true)
    expect(isAllowedWorkOrderListRequest('basic/serviceAppointment/query', 'POST', new URLSearchParams(), {
      ...body, page: 2,
    }, 2)).toBe(true)
    expect(isAllowedWorkOrderListRequest('basic/serviceAppointment/querySAWorkflowNode', 'POST', new URLSearchParams(), {
      ...body, sortField: 'updateTime', orderState: '0', 'in:status|array#and': '1,2',
    })).toBe(true)
    for (const changed of [
      { ...body, page: 2 }, { ...body, rows: 4 }, { ...body, _all: '1' },
      { ...body, 'regex:name|string#or': 'search' },
    ]) {
      expect(isAllowedWorkOrderListRequest('basic/serviceAppointment/query', 'POST', new URLSearchParams(), changed)).toBe(false)
    }
    expect(isAllowedWorkOrderListRequest('basic/serviceAppointment/query', 'POST', new URLSearchParams(), {
      ...body, page: 3,
    }, 2)).toBe(false)
    expect(isAllowedWorkOrderListRequest('basic/serviceAppointment/query', 'POST', new URLSearchParams('page=2'), body)).toBe(false)
  })

  it('requires a selected role-listed WorkOrder for a bounded type=1 Order page', () => {
    const body = {
      page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
      'is:serviceAppointmentId|string#and': workOrderId, 'is:type|integer#and': 1,
    }
    expect(isAllowedTypeOneOrderRequest(body, workOrderId)).toBe(true)
    expect(isAllowedTypeOneOrderRequest({ ...body, 'is:type|integer#and': 0 }, workOrderId)).toBe(false)
    expect(isAllowedTypeOneOrderRequest({ ...body, 'is:serviceAppointmentId|string#and': 'other' }, workOrderId)).toBe(false)
    expect(isAllowedTypeOneOrderRequest({ ...body, _all: '1' }, workOrderId)).toBe(false)
    expect(isAllowedTypeOneOrderRequest({ ...body, rows: 4 }, workOrderId)).toBe(false)
    expect(isAllowedTypeOneOrderRequest({ ...body, 'is:serviceAppointmentId|string#and': workOrderId }, null)).toBe(false)
  })

  it('allows one exact R1 Contract page only after a sampled type=1 Order identity exists', () => {
    const base = {
      path: 'basic/contract/query.do', method: 'POST', search: new URLSearchParams(),
      body: contractBody, selectedWorkOrderId: workOrderId,
      selectedOrderIds: new Set([orderId]), requestCount: 0,
    }
    expect(isAllowedR1ContractRequest(base)).toBe(true)
    expect(isAllowedR1ContractRequest({ ...base, requestCount: 1 })).toBe(false)
    expect(isAllowedR1ContractRequest({ ...base, path: 'basic/contract/queryById' })).toBe(false)
    expect(isAllowedR1ContractRequest({ ...base, selectedWorkOrderId: 'other' })).toBe(false)
    expect(isAllowedR1ContractRequest({ ...base, selectedOrderIds: new Set() })).toBe(false)
    expect(isAllowedR1ContractRequest({ ...base, selectedOrderIds: new Set(['invalid/id']) })).toBe(false)
    expect(isAllowedR1ContractRequest({ ...base, search: new URLSearchParams('extra=1') })).toBe(false)
    for (const changed of [
      { ...contractBody, _all: '1' }, { ...contractBody, rows: 4 }, { ...contractBody, page: 2 },
      { ...contractBody, 'is:state|integer#or': '0' },
      { ...contractBody, 'is:exts.contractStatus|string#or': '1' },
      { ...contractBody, 'is:orderId|string#and': orderId },
    ]) {
      expect(isAllowedR1ContractRequest({ ...base, body: changed })).toBe(false)
    }
    expect(isAllowedR1ContractRequest({
      ...base,
      body: 'page=1&page=1&rows=3&is%3AserviceAppointmentId%7Cstring%23and=role-listed-work-order&is%3Astate%7Cinteger%23or=1&is%3Aexts.contractStatus%7Cstring%23or=-2&sortField=createTime&sortOrder=desc',
    })).toBe(false)
  })
})
