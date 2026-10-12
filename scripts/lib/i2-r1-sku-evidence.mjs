/**
 * I2 live-evidence reducer. Data is held in memory only; output deliberately
 * contains no SKU ids, attribute names/codes, labels, prices or user identity.
 */
export const I2_LIMITS = Object.freeze({ fields: 12, sku: 30, codeOptions: 50 })
export const I2_CODE_TENANT = '1340835581184723420'
const shape = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null
const validSpu = value => typeof value === 'string'
  && /^[A-Za-z0-9_.-]{6,100}$/.test(value)

export function buildI2ReadPlan(spuId) {
  if (!validSpu(spuId)) return { ok: false, reason: 'INVALID_BOUNDED_SPU_ID' }
  return {
    ok: true,
    steps: [
      { name: 'fields', route: 'biz/extField/query', body: {
        colName: 'material', 'is:state|integer#and': '1',
        sortField: 'order', sortOrder: 'asc', page: '1', rows: String(I2_LIMITS.fields),
      } },
      { name: 'sku', route: 'basic/material/query', body: {
        spuid: spuId, 'is:state|integer#and': '1',
        page: '1', rows: String(I2_LIMITS.sku),
      } },
    ],
  }
}
export function buildI2CodeRequest(fields) {
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > I2_LIMITS.fields
    || fields.some(f => !shape(f) || typeof f.valueOption !== 'string' || !f.valueOption)) {
    return { ok: false, reason: 'INVALID_SALES_FIELD_IDENTITIES' }
  }
  const ids = [...new Set(fields.map(f => f.valueOption))]
  if (ids.length > I2_LIMITS.fields) return { ok: false, reason: 'TOO_MANY_CODE_IDENTITIES' }
  return {
    ok: true,
    step: { name: 'codes', route: 'i/code/selectCode.do', body: {
      tenantId: I2_CODE_TENANT,
      jsonPara: JSON.stringify(ids.map(id => ({ codeId: id, eleid: id }))),
    } },
  }
}
function rowsFor(value, limit) {
  const payload = shape(value)
  const rows = Array.isArray(value) ? value : Array.isArray(payload?.data) ? payload.data
    : Array.isArray(shape(payload?.data)?.data) ? payload.data.data : null
  if (!rows || rows.length > limit || rows.some(row => !shape(row))) {
    return { ok: false, reason: 'INVALID_OR_UNBOUNDED_PAGE' }
  }
  const total = payload?.total === undefined ? null : Number(payload.total)
  return { ok: true, rows, incomplete: rows.length >= limit || (total !== null && (!Number.isInteger(total) || total > rows.length)) }
}
export function inspectI2Fields(raw) {
  const page = rowsFor(raw, I2_LIMITS.fields)
  if (!page.ok) return page
  const fields = []
  const names = new Set()
  for (const row of page.rows) {
    if (row.state !== undefined && String(row.state) !== '1') continue
    if (row.colName !== undefined && row.colName !== 'material') return { ok: false, reason: 'FOREIGN_FIELD_DOMAIN' }
    let cfg = shape(row.frontEndConfig)
    if (typeof row.frontEndConfig === 'string') {
      if (row.frontEndConfig.length > 4000) return { ok: false, reason: 'OVERSIZED_FIELD_CONFIG' }
      try { cfg = shape(JSON.parse(row.frontEndConfig)) } catch { return { ok: false, reason: 'UNPARSABLE_SALES_CONFIG' } }
    }
    if (cfg?.salesAttribute !== true) continue
    if (typeof row.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,80}$/.test(row.name)
      || typeof row.valueOption !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(row.valueOption)
      || names.has(row.name)) return { ok: false, reason: 'INVALID_SALES_FIELD' }
    names.add(row.name)
    fields.push({ name: row.name, valueOption: row.valueOption })
  }
  return { ok: true, fields, incomplete: page.incomplete }
}
function inspectCodes(raw, fields) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(shape(raw)?.data) ? raw.data : null
  if (!arr || arr.length > I2_LIMITS.fields) return { ok: false, reason: 'INVALID_CODE_RESPONSE' }
  const expected = new Set(fields.map(f => f.valueOption))
  const found = new Map()
  for (const item of arr) {
    if (!shape(item) || typeof item.eleid !== 'string' || !expected.has(item.eleid)
      || found.has(item.eleid) || !shape(item.options)) return { ok: false, reason: 'FOREIGN_OR_DUPLICATE_CODE' }
    const values = Object.keys(item.options)
    if (values.length > I2_LIMITS.codeOptions || values.some(v => !v || typeof item.options[v] !== 'string')) {
      return { ok: false, reason: 'INVALID_CODE_OPTIONS' }
    }
    found.set(item.eleid, new Set(values))
  }
  if (found.size !== expected.size) return { ok: false, reason: 'MISSING_CODE_DICTIONARY' }
  return { ok: true, optionsById: found }
}
export function reduceI2SkuEvidence({ spuId, fieldsRaw, codesRaw, skuRaw }) {
  if (!validSpu(spuId)) return { status: 'BLOCKED', reason: 'INVALID_BOUNDED_SPU_ID' }
  const f = inspectI2Fields(fieldsRaw)
  if (!f.ok) return { status: 'BLOCKED', reason: f.reason }
  if (!f.fields.length) return { status: 'NOT_PROVEN', reason: 'NO_ACTIVE_SALES_FIELDS', pageIncomplete: f.incomplete }
  const c = inspectCodes(codesRaw, f.fields)
  if (!c.ok) return { status: 'BLOCKED', reason: c.reason }
  const p = rowsFor(skuRaw, I2_LIMITS.sku)
  if (!p.ok) return { status: 'BLOCKED', reason: p.reason }
  const seen = new Set()
  let rawMatchable = 0
  let missingExts = 0
  let invalidAttributeCodes = 0
  for (const row of p.rows) {
    if (typeof row._id !== 'string' || !row._id || seen.has(row._id)
      || row.spuid !== spuId || row.state !== undefined && String(row.state) !== '1') {
      return { status: 'BLOCKED', reason: 'INVALID_FOREIGN_OR_DUPLICATE_SKU' }
    }
    seen.add(row._id)
    const attrs = shape(row.exts)
    if (!attrs) { missingExts++; continue }
    const valid = f.fields.every(field => {
      const value = attrs[field.name]
      const code = typeof value === 'number' && Number.isFinite(value) ? String(value)
        : typeof value === 'string' ? value.trim() : ''
      return Boolean(code) && c.optionsById.get(field.valueOption)?.has(code)
    })
    if (valid) rawMatchable++
    else invalidAttributeCodes++
  }
  // Counts and booleans only: never serialize SKU IDs, code values or prices.
  return {
    status: p.rows.length && rawMatchable > 0 && !f.incomplete && !p.incomplete
      ? 'RAW_R1_SHAPE_MATCHABLE_NOT_UI_PARITY' : 'NOT_PROVEN',
    salesFieldCount: f.fields.length,
    activeSkuCount: p.rows.length,
    rawMatchableCount: rawMatchable,
    missingExtsCount: missingExts,
    invalidAttributeCodesCount: invalidAttributeCodes,
    pageIncomplete: Boolean(f.incomplete || p.incomplete),
    fixedR1SourceProjectionConflict: 'REQUIRES_AUTHORIZED_RUNTIME_REPRO',
    r1UiAndBackendEquivalence: 'NOT_VERIFIED',
    sourceKind: 'AUTHORIZED_READ_ONLY',
  }
}
