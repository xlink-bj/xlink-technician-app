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

function identityAlias(record, keys) {
  const values = keys.map(key => record?.[key]).filter(value => value !== undefined && value !== null && value !== '')
  if (values.some(value => !validId(value))) return { ok: false }
  const unique = [...new Set(values)]
  return { ok: unique.length <= 1, value: unique[0] }
}

/**
 * Project the R1 `queryById` material shape. Direct saved SKU rows use `_id` +
 * `spuid`; package materialList rows carry an embedded `material` SPU, while
 * selected package SKU variants, when present, live in `materialList[].skus`.
 * The package relation row `_id` and embedded material `_id` are different
 * identities and must not be conflated.
 */
export function orderDetailMaterialSkuIdentities(raw, expectedOrderId, expectedWorkOrderId) {
  const envelope = safeParse(raw)
  let record = envelope
  if (record && typeof record === 'object' && !Array.isArray(record)) {
    const candidate = safeParse(record.data)
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) record = candidate
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || !validId(expectedOrderId) || !validId(expectedWorkOrderId)) {
    return { verified: false, reason: 'order_detail_envelope_invalid' }
  }
  const orderIdentity = identityAlias(record, ['_id', 'id'])
  const workOrderIdentity = identityAlias(record, ['serviceAppointmentId'])
  const type = record.type === 1 || record.type === '1' ? 1 : undefined
  if (!orderIdentity.ok || orderIdentity.value !== expectedOrderId
    || !workOrderIdentity.ok || workOrderIdentity.value !== expectedWorkOrderId || type !== 1) {
    return { verified: false, reason: 'order_detail_identity_or_ownership_mismatch' }
  }
  const products = safeParse(record.bjProducts)
  if (!products || typeof products !== 'object' || Array.isArray(products) || !Array.isArray(products.orderList)
    || products.orderList.length > 100) {
    return { verified: false, reason: 'order_detail_products_invalid' }
  }

  const identities = []
  const identityKeys = new Set()
  const summary = {
    verifiedOrderDetails: 1,
    materialLines: 0,
    materialLinesWithSkuId: 0,
    materialLinesWithSpuId: 0,
    materialLinesWithBothSkuAndSpuIds: 0,
    materialLinesWithSkuIdOnly: 0,
    materialLinesWithSpuIdOnly: 0,
    materialLinesWithNeitherId: 0,
    packageMaterialLines: 0,
    packageSavedSkuRows: 0,
    packageSavedSkuRowsWithBothIds: 0,
    packageMaterialLinesWithSpuId: 0,
    directMaterialRowsWithTopLevelId: 0,
    directMaterialRowsWithSkuIdField: 0,
    directMaterialRowsWithSpuField: 0,
    directMaterialRowsWithMaterialIdField: 0,
    directMaterialRowsWithNestedMaterial: 0,
    directMaterialRowsWithNestedMaterialId: 0,
    directMaterialRowsWithNestedMaterialSpu: 0,
    directMaterialRowsWithSkuCode: 0,
    directMaterialRowsWithNestedSkuCode: 0,
    packageMaterialRowsWithTopLevelId: 0,
    packageMaterialRowsWithMaterialId: 0,
    packageMaterialRowsWithNestedMaterialId: 0,
    packageMaterialRowsWithNestedMaterialSpu: 0,
    packageMaterialRowsWithSkuArray: 0,
    packageMaterialRowsWithNestedSkuArray: 0,
    packageMaterialRowsWithSkuCode: 0,
    packageMaterialRowsWithNestedSkuCode: 0,
  }
  const rowsOf = value => Array.isArray(value) ? value
    : value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.data) ? value.data : null
  const hasSkuCode = value => typeof value === 'string' && value.trim().length > 0
  const addIdentity = (skuId, spuId, source) => {
    if (!skuId && !spuId) return
    const key = JSON.stringify([skuId ?? null, spuId ?? null])
    if (identityKeys.has(key)) return
    identityKeys.add(key)
    identities.push({
      orderId: expectedOrderId,
      ...(skuId ? { skuId } : {}),
      ...(spuId ? { spuId } : {}),
      source,
    })
  }
  for (const group of products.orderList) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      return { verified: false, reason: 'order_detail_group_invalid' }
    }
    const rows = rowsOf(group.materials)
    if (!rows || rows.length > 1000) return { verified: false, reason: 'order_detail_material_rows_invalid' }
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return { verified: false, reason: 'order_detail_material_row_invalid' }
      }
      summary.materialLines += 1
      const explicitSkuIdentity = identityAlias(row, ['skuId'])
      const rowIdentity = identityAlias(row, ['_id', 'id'])
      const spuIdentity = identityAlias(row, ['spuid', 'spuId'])
      const nestedMaterial = safeParse(row.material)
      const nestedRecord = nestedMaterial && typeof nestedMaterial === 'object' && !Array.isArray(nestedMaterial)
        ? nestedMaterial : undefined
      const nestedExts = safeParse(nestedRecord?.exts)
      const nestedMaterialIdentity = identityAlias(nestedRecord, ['_id', 'id'])
      const nestedSpuIdentity = identityAlias(nestedRecord, ['spuid', 'spuId'])
      const materialReference = identityAlias(row, ['materialId'])
      const rowSkuCode = hasSkuCode(row.skuCode)
        || hasSkuCode(safeParse(row.exts)?.skuCode)
      const nestedSkuCode = hasSkuCode(nestedRecord?.skuCode)
        || hasSkuCode(nestedExts?.skuCode)
      if (rowIdentity.value) summary.directMaterialRowsWithTopLevelId += 1
      if (explicitSkuIdentity.value) summary.directMaterialRowsWithSkuIdField += 1
      if (spuIdentity.value) summary.directMaterialRowsWithSpuField += 1
      if (materialReference.value) summary.directMaterialRowsWithMaterialIdField += 1
      if (nestedRecord) summary.directMaterialRowsWithNestedMaterial += 1
      if (nestedMaterialIdentity.value) summary.directMaterialRowsWithNestedMaterialId += 1
      if (nestedSpuIdentity.value) summary.directMaterialRowsWithNestedMaterialSpu += 1
      if (rowSkuCode) summary.directMaterialRowsWithSkuCode += 1
      if (nestedSkuCode) summary.directMaterialRowsWithNestedSkuCode += 1
      if (!explicitSkuIdentity.ok || !rowIdentity.ok || !spuIdentity.ok || !nestedMaterialIdentity.ok
        || !nestedSpuIdentity.ok || !materialReference.ok) {
        return { verified: false, reason: 'order_detail_material_identity_conflict' }
      }
      if (spuIdentity.value && nestedSpuIdentity.value && spuIdentity.value !== nestedSpuIdentity.value) {
        return { verified: false, reason: 'order_detail_material_spu_conflict' }
      }
      const skuCodeClaim = rowSkuCode || nestedSkuCode
      const spuId = spuIdentity.value ?? nestedSpuIdentity.value ?? nestedMaterialIdentity.value
        ?? materialReference.value ?? (!explicitSkuIdentity.value && !skuCodeClaim ? rowIdentity.value : undefined)
      if (materialReference.value && spuId && materialReference.value !== spuId) {
        return { verified: false, reason: 'order_detail_material_reference_conflict' }
      }
      // R1 direct material rows with `spuid` are selected SKU variants. A row
      // without `spuid` falls back to an SPU/material identity only when its
      // shape has no SKU-ID claim; a code alone never becomes a catalog ID.
      const skuId = explicitSkuIdentity.value ?? (spuIdentity.value ? rowIdentity.value : undefined)
      if (skuId) summary.materialLinesWithSkuId += 1
      if (spuId) summary.materialLinesWithSpuId += 1
      if (skuId && spuId) summary.materialLinesWithBothSkuAndSpuIds += 1
      else if (skuId) summary.materialLinesWithSkuIdOnly += 1
      else if (spuId) summary.materialLinesWithSpuIdOnly += 1
      else summary.materialLinesWithNeitherId += 1
      addIdentity(skuId, spuId, 'direct_order_material_row')
    }

    if (group.projPackages === undefined || group.projPackages === null) continue
    const packages = rowsOf(group.projPackages)
    if (!packages || packages.length > 1000) return { verified: false, reason: 'order_detail_package_rows_invalid' }
    for (const packageRow of packages) {
      if (!packageRow || typeof packageRow !== 'object' || Array.isArray(packageRow)) {
        return { verified: false, reason: 'order_detail_package_row_invalid' }
      }
      if (packageRow.materialList === undefined || packageRow.materialList === null) continue
      const packageMaterials = rowsOf(packageRow.materialList)
      if (!packageMaterials || packageMaterials.length > 1000) {
        return { verified: false, reason: 'order_detail_package_material_rows_invalid' }
      }
      for (const materialLine of packageMaterials) {
        if (!materialLine || typeof materialLine !== 'object' || Array.isArray(materialLine)) {
          return { verified: false, reason: 'order_detail_package_material_row_invalid' }
        }
        summary.packageMaterialLines += 1
        const parentSpu = identityAlias(materialLine, ['materialId'])
        const packageRowIdentity = identityAlias(materialLine, ['_id', 'id'])
        const nestedMaterial = safeParse(materialLine.material)
        const nestedRecord = nestedMaterial && typeof nestedMaterial === 'object' && !Array.isArray(nestedMaterial)
          ? nestedMaterial : undefined
        const nestedSpu = identityAlias(nestedRecord, ['spuid', 'spuId'])
        const nestedMaterialId = identityAlias(nestedRecord, ['_id', 'id'])
        const packageRowSkuCode = hasSkuCode(materialLine.skuCode)
          || hasSkuCode(safeParse(materialLine.exts)?.skuCode)
        const nestedMaterialExts = safeParse(nestedRecord?.exts)
        const packageNestedSkuCode = hasSkuCode(nestedRecord?.skuCode)
          || hasSkuCode(nestedMaterialExts?.skuCode)
        if (packageRowIdentity.value) summary.packageMaterialRowsWithTopLevelId += 1
        if (parentSpu.value) summary.packageMaterialRowsWithMaterialId += 1
        if (nestedMaterialId.value) summary.packageMaterialRowsWithNestedMaterialId += 1
        if (nestedSpu.value) summary.packageMaterialRowsWithNestedMaterialSpu += 1
        if (Array.isArray(materialLine.skus)) summary.packageMaterialRowsWithSkuArray += 1
        if (Array.isArray(nestedRecord?.skus)) summary.packageMaterialRowsWithNestedSkuArray += 1
        if (packageRowSkuCode) summary.packageMaterialRowsWithSkuCode += 1
        if (packageNestedSkuCode) summary.packageMaterialRowsWithNestedSkuCode += 1
        if (!parentSpu.ok || !nestedSpu.ok || !nestedMaterialId.ok
          || (parentSpu.value && nestedSpu.value && parentSpu.value !== nestedSpu.value)
          || (parentSpu.value && nestedMaterialId.value && parentSpu.value !== nestedMaterialId.value)
          || (nestedSpu.value && nestedMaterialId.value && nestedSpu.value !== nestedMaterialId.value)) {
          return { verified: false, reason: 'order_detail_package_material_spu_conflict' }
        }
        // In R1's package editor `material._id` is the nested material/SPU;
        // the enclosing materialList `_id` is a package relation row.
        const spuId = parentSpu.value ?? nestedSpu.value ?? nestedMaterialId.value
        const skuRows = [materialLine.skus, nestedRecord?.skus].filter(value => value !== undefined && value !== null)
        for (const skuValue of skuRows) {
          if (!Array.isArray(skuValue) || skuValue.length > 1000) {
            return { verified: false, reason: 'order_detail_package_sku_rows_invalid' }
          }
          for (const skuRow of skuValue) {
            if (!skuRow || typeof skuRow !== 'object' || Array.isArray(skuRow)) {
              return { verified: false, reason: 'order_detail_package_sku_row_invalid' }
            }
            const quantityValue = skuRow.number ?? skuRow.quantity
            if (quantityValue !== undefined) {
              const quantity = typeof quantityValue === 'number' ? quantityValue
                : typeof quantityValue === 'string' && quantityValue.trim() ? Number(quantityValue) : Number.NaN
              if (!Number.isFinite(quantity)) return { verified: false, reason: 'order_detail_package_sku_quantity_invalid' }
              if (quantity <= 0) continue
            }
            summary.packageSavedSkuRows += 1
            const skuIdIdentity = identityAlias(skuRow, ['_id', 'id', 'skuId'])
            const skuSpuIdentity = identityAlias(skuRow, ['spuid', 'spuId'])
            if (!skuIdIdentity.ok || !skuSpuIdentity.ok
              || (spuId && skuSpuIdentity.value && spuId !== skuSpuIdentity.value)) {
              return { verified: false, reason: 'order_detail_package_sku_identity_conflict' }
            }
            const skuSpuId = skuSpuIdentity.value ?? spuId
            if (skuIdIdentity.value && skuSpuId) summary.packageSavedSkuRowsWithBothIds += 1
            addIdentity(skuIdIdentity.value, skuSpuId, 'package_saved_sku_row')
          }
        }
        if (spuId) summary.packageMaterialLinesWithSpuId += 1
        // Package material code (material.exts.skuCode) participates in R1's
        // composite package SKU code; it is not the selected SKU variant ID.
        if (spuId) addIdentity(undefined, spuId, 'package_material_spu')
      }
    }
  }
  return { verified: true, identities, summary }
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

/** Validate an active SKU page scoped to one Order-derived SPU without exposing catalog IDs. */
export function inspectActiveSkuCatalogPage(raw, selectedSpuId, pageLimit = 30) {
  const rows = rowsFromEnvelope(raw)
  const total = totalFromEnvelope(raw)
  if (!validId(selectedSpuId) || !Number.isSafeInteger(pageLimit) || pageLimit < 1
    || !rows || rows.length > pageLimit) {
    return { verified: false, reason: 'sku_page_shape_invalid' }
  }
  const skuIds = []
  const seen = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || !validId(row._id) || !validId(row.spuid) || row.spuid !== selectedSpuId
      || (row.state !== undefined && row.state !== 1 && row.state !== '1')
      || seen.has(row._id)) {
      return { verified: false, reason: 'sku_identity_or_state_invalid' }
    }
    seen.add(row._id)
    skuIds.push(row._id)
  }
  return {
    verified: true,
    skuIds,
    summary: {
      activeSkuRowsReturned: rows.length,
      totalSkuRows: total,
      pageComplete: total !== undefined && total === rows.length,
    },
  }
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
    selectedSkuIdentityReturned: selectedRows.length === 1,
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
