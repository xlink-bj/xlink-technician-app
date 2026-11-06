import { describe, it, expect } from 'vitest'
import { currentFormDefPageDiagnostics, currentFormDefRequestBody, isAllowedCurrentFormDefRead, verifyCurrentFormDefPage, verifyCurrentFormDefPages } from '../../scripts/lib/r1-current-formdef-read.mjs'
describe('Owner-authorized current node FormDef field-only capture', () => {
  const id = 'synthetic-current-definition'
  const encode = (body: Record<string, unknown>) => new URLSearchParams(Object.entries(body).map(([k,v]) => [k,String(v)])).toString()
  it('allows exactly one bounded shape and refuses expanded scope or duplicate keys', () => {
    const body = currentFormDefRequestBody(id)
    expect(isAllowedCurrentFormDefRead(encode(body), id)).toBe(true)
    for (const change of [{ _all: 1 }, { extId: 'other' }, { page: 2 }, { rows: 51 }, { 'is:state|integer#and': 0 }]) expect(isAllowedCurrentFormDefRead(encode({ ...body, ...change }), id)).toBe(false)
    expect(isAllowedCurrentFormDefRead(`${encode(body)}&rows=50`, id)).toBe(false)
  })
  it('retains only structural diagnostics when a page is incomplete', () => {
    const diagnostics = currentFormDefPageDiagnostics({ data: [{ _id: 'secret-id', privateValue: 'secret-customer' }], total: 51 }, 200)
    expect(diagnostics).toMatchObject({ httpStatus: 200, returnedRows: 1, reportedTotal: 51, complete: false })
    expect(JSON.stringify(diagnostics)).not.toContain('secret')
  })
  it('requires complete page and exact unique field/FormDef identity', () => {
    const row = { _id: 'synthetic-field', extId: id, state: 1, name: 'answer' }
    expect(verifyCurrentFormDefPage({ data: [row], total: 1 }, id)).toEqual({ ok: true, fields: 1 })
    for (const page of [{ data: [row], total: 51 }, { data: [row,row], total: 2 }, { data: [{ ...row, extId: 'other' }], total: 1 }, { data: [{ ...row, id: 'other' }], total: 1 }]) expect(verifyCurrentFormDefPage(page, id).ok).toBe(false)
  })
})

it('requires both pages of the same definition, consistent totals and distinct field identities', () => {
  const extId = 'synthetic-definition'
  const rows = Array.from({ length: 59 }, (_, index) => ({ _id: `field-${index}`, extId, state: 1, name: `field${index}` }))
  const first = { total: 59, data: rows.slice(0, 50) }
  const second = { total: 59, data: rows.slice(50) }
  expect(verifyCurrentFormDefPages([first], extId)).toMatchObject({ ok: true, complete: false })
  expect(verifyCurrentFormDefPages([first, second], extId)).toMatchObject({ ok: true, complete: true, total: 59 })
  expect(verifyCurrentFormDefPages([first, { ...second, total: 60 }], extId).ok).toBe(false)
  expect(verifyCurrentFormDefPages([first, { ...second, data: [rows[0], ...second.data.slice(1)] }], extId).ok).toBe(false)
  const body = new URLSearchParams({ extId, 'is:state|integer#and': '1', sortField: 'order,_id', sortOrder: 'asc', page: '2', rows: '50' }).toString()
  expect(isAllowedCurrentFormDefRead(body, extId, 2, true)).toBe(true)
  expect(isAllowedCurrentFormDefRead(body, extId)).toBe(false)
})
