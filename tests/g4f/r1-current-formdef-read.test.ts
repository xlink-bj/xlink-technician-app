import { describe, it, expect } from 'vitest'
import { currentFormDefPageDiagnostics, currentFormDefRequestBody, isAllowedCurrentFormDefRead, verifyCurrentFormDefPage } from '../../scripts/lib/r1-current-formdef-read.mjs'
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
