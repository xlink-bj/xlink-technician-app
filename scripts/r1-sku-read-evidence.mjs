function safeParse(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)
}

/** Select only one material SKU/SPU pair that was projected from a scoped type=1 Order. */
export function firstOrderMaterialSkuIdentity(orders) {
  if (!Array.isArray(orders)) return undefined
  const visit = lines => {
    for (const line of lines ?? []) {
      const identity = line?.identity
      if (line.kind === 'material' && validId(identity?.skuId) && validId(identity?.spuId)) {
        return {
          skuId: identity.skuId,
          spuId: identity.spuId,
          unitPrice: typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice)
            ? line.unitPrice : undefined,
        }
      }
      const nested = visit(line?.children)
      if (nested) return nested
    }
    return undefined
  }
  for (const order of orders) {
    for (const group of order.groups ?? []) {
      const candidate = visit(group.lines)
      if (candidate) return { orderId: order.id, ...candidate }
    }
  }
  return undefined
}

/** Select a scoped material line by its exact SPU ID, even when Order has no SKU ID. */
export function firstOrderMaterialSpuIdentity(orders) {
  return orderMaterialSpuIdentities(orders)[0]
}

/** Return Order-derived material SPU identities for in-memory bounded sample selection. */
export function orderMaterialSpuIdentities(orders) {
  if (!Array.isArray(orders)) return []
  const results = []
  for (const order of orders) {
    if (!validId(order?.id)) continue
    const visit = lines => {
      for (const line of lines ?? []) {
        const identity = line?.identity
        if (line.kind === 'material' && validId(identity?.spuId)) {
          results.push({
            orderId: order.id,
            spuId: identity.spuId,
            ...(validId(identity.skuId) ? { skuId: identity.skuId } : {}),
            ...(typeof identity.skuCode === 'string' && identity.skuCode.trim()
              ? { skuCode: identity.skuCode.trim() }
              : {}),
            unitPrice: typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice)
              ? line.unitPrice : undefined,
          })
        }
        visit(line?.children)
      }
    }
    for (const group of order.groups ?? []) visit(group.lines)
  }
  return results
}

/** Count independent projected material identities without returning business IDs. */
export function summarizeOrderMaterialIdentities(orders) {
  if (!Array.isArray(orders)) return { verified: false, reason: 'order_rows_invalid' }
  const summary = {
    verified: true,
    typeOneOrderRowsReturned: orders.length,
    orderRowsWithMaterialLines: 0,
    materialLines: 0,
    materialLinesWithSkuId: 0,
    materialLinesWithSpuId: 0,
    materialLinesWithBothSkuAndSpuId: 0,
    materialLinesWithSkuIdOnly: 0,
    materialLinesWithSpuIdOnly: 0,
    materialLinesWithNeitherSkuNorSpuId: 0,
    materialLinesWithSkuCode: 0,
    materialLinesWithSpuCode: 0,
  }
  for (const order of orders) {
    if (!order || typeof order !== 'object' || !Array.isArray(order.groups)) {
      return { verified: false, reason: 'order_projection_invalid' }
    }
    let orderHasMaterial = false
    const visit = lines => {
      if (!Array.isArray(lines)) return true
      for (const line of lines) {
        if (!line || typeof line !== 'object' || typeof line.kind !== 'string') return false
        if (line.kind === 'material') {
          orderHasMaterial = true
          summary.materialLines += 1
          const identity = line.identity
          const hasSkuId = Boolean(identity && validId(identity.skuId))
          const hasSpuId = Boolean(identity && validId(identity.spuId))
          if (hasSkuId) summary.materialLinesWithSkuId += 1
          if (hasSpuId) summary.materialLinesWithSpuId += 1
          if (hasSkuId && hasSpuId) summary.materialLinesWithBothSkuAndSpuId += 1
          else if (hasSkuId) summary.materialLinesWithSkuIdOnly += 1
          else if (hasSpuId) summary.materialLinesWithSpuIdOnly += 1
          else summary.materialLinesWithNeitherSkuNorSpuId += 1
          if (identity && typeof identity.skuCode === 'string' && identity.skuCode.trim()) {
            summary.materialLinesWithSkuCode += 1
          }
          if (identity && typeof identity.spuCode === 'string' && identity.spuCode.trim()) {
            summary.materialLinesWithSpuCode += 1
          }
        }
        if (!visit(line.children)) return false
      }
      return true
    }
    for (const group of order.groups) {
      if (!group || typeof group !== 'object' || !Array.isArray(group.lines) || !visit(group.lines)) {
        return { verified: false, reason: 'order_line_projection_invalid' }
      }
    }
    if (orderHasMaterial) summary.orderRowsWithMaterialLines += 1
  }
  return summary
}

export function rowsFromEnvelope(raw) {
  const envelope = safeParse(raw)
  if (Array.isArray(envelope)) return envelope
  if (!envelope || typeof envelope !== 'object') return null
  const data = safeParse(envelope.data)
  const candidates = [envelope.items, envelope.records, envelope.data, data?.items, data?.records, data?.data]
  return candidates.find(Array.isArray) ?? null
}

export function totalFromEnvelope(raw) {
  const envelope = safeParse(raw)
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return undefined
  const data = safeParse(envelope.data)
  for (const candidate of [envelope, data]) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    for (const key of ['totalCount', 'total', 'count', 'recordsTotal']) {
      const value = candidate[key]
      const parsed = typeof value === 'number' ? value
        : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : undefined
      if (parsed !== undefined && Number.isSafeInteger(parsed) && parsed >= 0) return parsed
    }
  }
  return undefined
}

export function parseSalesFieldDefinitions(raw, pageLimit = 50) {
  const rows = rowsFromEnvelope(raw)
  const total = totalFromEnvelope(raw)
  if (!rows || rows.length > pageLimit || total === undefined || total !== rows.length) {
    return { complete: false, reason: 'sales_field_page_not_complete' }
  }
  const fields = []
  const names = new Set()
  const valueOptionIds = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { complete: false, reason: 'sales_field_row_invalid' }
    }
    let config = row.frontEndConfig
    if (typeof config === 'string') {
      try { config = config.trim() ? JSON.parse(config) : {} }
      catch { return { complete: false, reason: 'sales_field_config_invalid' } }
    }
    if (config !== undefined && config !== null && (typeof config !== 'object' || Array.isArray(config))) {
      return { complete: false, reason: 'sales_field_config_invalid' }
    }
    if (config?.salesAttribute !== true) continue
    if (row.colName !== 'material' || (row.state !== 1 && row.state !== '1')
      || typeof row.name !== 'string' || !row.name.trim()
      || typeof row.valueOption !== 'string' || !validId(row.valueOption)
      || names.has(row.name) || valueOptionIds.has(row.valueOption)) {
      return { complete: false, reason: 'sales_field_identity_or_scope_invalid' }
    }
    names.add(row.name)
    valueOptionIds.add(row.valueOption)
    fields.push({ name: row.name, valueOption: row.valueOption })
  }
  return { complete: true, fields, valueOptionIds: [...valueOptionIds] }
}

export function parseCodeDictionaries(raw, fields) {
  const rows = rowsFromEnvelope(raw)
  if (!Array.isArray(fields) || !rows || rows.length !== fields.length || rows.length > 30) {
    return { complete: false, reason: 'code_dictionary_shape_invalid' }
  }
  const expected = new Set(fields.map(field => field.valueOption))
  const seen = new Set()
  const dictionaries = new Map()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || typeof row.eleid !== 'string' || !expected.has(row.eleid) || seen.has(row.eleid)
      || !row.options || typeof row.options !== 'object' || Array.isArray(row.options)) {
      return { complete: false, reason: 'code_dictionary_identity_or_shape_invalid' }
    }
    const options = new Map()
    for (const [value, label] of Object.entries(row.options)) {
      if (!value || typeof label !== 'string' || !label.trim() || options.has(value)) {
        return { complete: false, reason: 'code_option_invalid' }
      }
      options.set(value, true)
    }
    seen.add(row.eleid)
    dictionaries.set(row.eleid, options)
  }
  return { complete: fields.every(field => seen.has(field.valueOption)), dictionaries }
}

function skuAttributeValue(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

/** Return only redacted counts/statuses. Raw SKU rows and commercial values stay in process memory. */
export function summarizeSkuRead(raw, fields, dictionaries, selectedIdentity, pageLimit = 30) {
  const rows = rowsFromEnvelope(raw)
  const total = totalFromEnvelope(raw)
  if (!rows || rows.length > pageLimit) return { verified: false, reason: 'sku_page_shape_invalid' }
  const seen = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || !validId(row._id) || !validId(row.spuid) || row.spuid !== selectedIdentity.spuId
      || (row.state !== undefined && row.state !== 1 && row.state !== '1')
      || seen.has(row._id)) return { verified: false, reason: 'sku_identity_or_state_invalid' }
    seen.add(row._id)
  }
  const selectedRows = rows.filter(row => row._id === selectedIdentity.skuId)
  const selected = selectedRows.length === 1 ? selectedRows[0] : undefined
  const saleValues = new Map()
  let selectedAttributesComplete = Boolean(selected)
  let selectedAttributesMatchCodeOptions = Boolean(selected)
  for (const field of fields) {
    const rawValue = selected ? skuAttributeValue(selected.exts?.[field.name]) : undefined
    if (!rawValue) {
      selectedAttributesComplete = false
      selectedAttributesMatchCodeOptions = false
      continue
    }
    saleValues.set(field.name, rawValue)
    if (!dictionaries.get(field.valueOption)?.has(rawValue)) selectedAttributesMatchCodeOptions = false
  }

  let rawShapeMatchCount = 0
  if (fields.length > 0 && selectedAttributesComplete && selectedAttributesMatchCodeOptions) {
    rawShapeMatchCount = rows.filter(row => fields.every(field =>
      skuAttributeValue(row.exts?.[field.name]) === saleValues.get(field.name))).length
  }

  let originalR1ProjectionMatch = 'UNKNOWN_INCOMPLETE_ATTRIBUTE_EVIDENCE'
  if (fields.length === 0) originalR1ProjectionMatch = 'NO_SALES_ATTRIBUTES_TO_MATCH'
  else if (selectedAttributesComplete && selected) {
    // Pinned R1 getMaterialSKU rebuilds exts as { commonName, attributeValues: {} }.
    // Reproduce skuMatch's exact `sku.exts[key] === chosenValue` lookup against
    // that rebuilt object, not against the wider raw backend exts payload.
    const projectedExts = { commonName: selected.exts?.commonName, attributeValues: {} }
    const matchesAfterProjection = fields.every(field => projectedExts[field.name] === saleValues.get(field.name))
    originalR1ProjectionMatch = matchesAfterProjection
      ? 'MATCH_AFTER_PINNED_R1_GETMATERIALSKU_PROJECTION'
      : 'NO_MATCH_AFTER_PINNED_R1_GETMATERIALSKU_PROJECTION'
  }
  const pageComplete = total !== undefined && total === rows.length
  const rawMatchStatus = fields.length === 0 ? 'NO_SALES_ATTRIBUTES_TO_MATCH'
    : !selectedAttributesComplete || !selectedAttributesMatchCodeOptions ? 'UNKNOWN_INCOMPLETE_EVIDENCE'
      : !pageComplete ? 'BOUNDED_UNVERIFIED'
        : rawShapeMatchCount === 1 ? 'EXACT_SINGLE_MATCH'
          : rawShapeMatchCount === 0 ? 'NO_MATCH' : 'AMBIGUOUS_MULTIPLE_MATCHES'
  const parsedSkuPrice = selected?.price === undefined || selected.price === null || selected.price === ''
    ? Number.NaN
    : typeof selected.price === 'number' ? selected.price
      : typeof selected.price === 'string' ? Number(selected.price) : Number.NaN
  const skuPrice = Number.isFinite(parsedSkuPrice) ? parsedSkuPrice : undefined
  const priceRelationship = skuPrice === undefined || selectedIdentity.unitPrice === undefined ? 'UNKNOWN'
    : skuPrice === selectedIdentity.unitPrice ? 'SAME_AS_CAPTURED_ORDER_UNIT_PRICE' : 'DIFFERS_FROM_CAPTURED_ORDER_UNIT_PRICE'
  return {
    verified: true,
    page: 1,
    pageRows: pageLimit,
    rowsReturned: rows.length,
    reportedTotal: total ?? null,
    pageComplete,
    selectedOrderSkuIdentityReturned: selectedRows.length === 1,
    selectedOrderSkuIdentityDuplicates: selectedRows.length > 1,
    selectedSkuHasPrice: skuPrice !== undefined,
    selectedSkuHasEverySalesAttribute: selectedAttributesComplete,
    selectedSkuAttributesMatchCodeOptions: selectedAttributesMatchCodeOptions,
    rawR1AttributeCombinationMatches: rawShapeMatchCount,
    rawR1AttributeCombinationStatus: rawMatchStatus,
    pinnedR1ProjectionSimulation: originalR1ProjectionMatch,
    capturedOrderVsCurrentCatalogSkuUnitPrice: priceRelationship,
    priceMeaning: 'CATALOG_SKU_UNIT_INPUT_NOT_FINAL_QUOTE_AMOUNT',
  }
}
