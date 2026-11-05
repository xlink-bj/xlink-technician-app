import { parseOrderExtFieldPage } from './g4f-order-extfield-shape.mjs'
export function currentFormDefRequestBody(extId) {
  if (typeof extId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(extId)) throw new Error('INVALID_FORMDEF_ID')
  return { extId, 'is:state|integer#and': 1, sortField: 'order', sortOrder: 'asc', page: 1, rows: 50 }
}
export function isAllowedCurrentFormDefRead(body, extId) {
  try {
    const pairs = [...new URLSearchParams(body).entries()]
    const expected = Object.entries(currentFormDefRequestBody(extId)).map(([k,v]) => [k,String(v)])
    return pairs.length === expected.length && expected.every(([k,v]) => pairs.filter(([key,value]) => key === k && value === v).length === 1)
  } catch { return false }
}
export function verifyCurrentFormDefPage(payload, extId) {
  const page = parseOrderExtFieldPage(payload)
  if (!page.ok || page.total !== page.rows.length) return { ok: false, reason: 'INCOMPLETE_OR_INVALID_PAGE' }
  const ids = new Set()
  for (const row of page.rows) {
    if (row.extId !== extId || ![1,'1'].includes(row.state) || typeof row._id !== 'string' || !row._id || ids.has(row._id)
      || (row.id !== undefined && row.id !== row._id) || typeof row.name !== 'string' || !row.name) return { ok: false, reason: 'FIELD_IDENTITY_OR_STATE_MISMATCH' }
    ids.add(row._id)
  }
  return { ok: true, fields: page.rows.length }
}
