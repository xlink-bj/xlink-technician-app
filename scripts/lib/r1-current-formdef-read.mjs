import { parseOrderExtFieldPage } from './g4f-order-extfield-shape.mjs'
export function currentFormDefRequestBody(extId, page = 1, stableOrder = false) {
  if (typeof extId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(extId)) throw new Error('INVALID_FORMDEF_ID')
  if (page !== 1 && !(page === 2 && stableOrder)) throw new Error('INVALID_FORMDEF_PAGE')
  return { extId, 'is:state|integer#and': 1, sortField: stableOrder ? 'order,_id' : 'order', sortOrder: 'asc', page, rows: 50 }
}
export function isAllowedCurrentFormDefRead(body, extId, page = 1, stableOrder = false) {
  try {
    const pairs = [...new URLSearchParams(body).entries()]
    const expected = Object.entries(currentFormDefRequestBody(extId, page, stableOrder)).map(([k,v]) => [k,String(v)])
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

/** Structural diagnostics only: no keys, IDs, labels or business values. */
export function currentFormDefPageDiagnostics(payload, httpStatus) {
  const page = parseOrderExtFieldPage(payload)
  return {
    httpStatus: Number.isInteger(httpStatus) ? httpStatus : null,
    envelopeType: Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload,
    hasDataArray: Array.isArray(payload?.data),
    returnedRows: Array.isArray(payload?.data) ? payload.data.length : null,
    reportedTotal: Number.isSafeInteger(payload?.total) && payload.total >= 0 ? payload.total : null,
    parser: page.ok ? 'VALID_PAGE_SHAPE' : page.reason,
    complete: page.ok && page.total === page.rows.length,
  }
}

export function verifyCurrentFormDefPages(payloads, extId) {
  const first = parseOrderExtFieldPage(payloads[0])
  if (!first.ok || first.total > 100 || payloads.length < 1 || payloads.length > 2) {
    return { ok: false, reason: 'INVALID_OR_OUT_OF_BOUND_FIELD_PAGE' }
  }
  const ids = new Set()
  for (const [index, payload] of payloads.entries()) {
    const page = parseOrderExtFieldPage(payload)
    const expectedRows = Math.min(50, Math.max(0, first.total - index * 50))
    if (!page.ok || page.total !== first.total || page.rows.length !== expectedRows || (index > 0 && expectedRows === 0)) {
      return { ok: false, reason: 'FIELD_PAGE_COUNT_MISMATCH' }
    }
    const verified = verifyCurrentFormDefPage({ data: page.rows, total: page.rows.length }, extId)
    if (!verified.ok) return verified
    for (const row of page.rows) {
      if (ids.has(row._id)) return { ok: false, reason: 'DUPLICATE_FIELD_ACROSS_PAGES' }
      ids.add(row._id)
    }
  }
  return { ok: true, total: first.total, complete: ids.size === first.total }
}
