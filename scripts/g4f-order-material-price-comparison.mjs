/**
 * Compare current R1 mini Material prices to historical type-1 Order snapshots.
 * This helper deliberately returns counts only; identities and literal prices
 * must remain in memory inside the bounded read runner.
 */
export function summarizeDirectMaterialPriceSnapshots({
  expectedWorkOrderId,
  orders,
  catalogMaterials,
  activeSkuRows,
  orderListTruncated = false,
}) {
  if (typeof expectedWorkOrderId !== 'string' || !expectedWorkOrderId.trim()
    || !Array.isArray(orders) || !Array.isArray(catalogMaterials) || !Array.isArray(activeSkuRows)) {
    return Object.freeze({ state: 'UNKNOWN_INVALID_INPUT', orders: 0, directMaterialLines: 0,
      catalogSpuMatches: 0, comparableLines: 0, equalToCurrent: 0, differentFromCurrent: 0,
      unknownLines: 0, skuOrAmbiguousIdentity: 0, currentSkuVariantAmbiguity: 0,
      duplicateCatalogIdentities: 0, rowIdFallbackCatalogIdMatches: 0,
      spuIdentitySources: { orderLine: 0, embeddedProduct: 0, embeddedMaterial: 0,
        materialReference: 0, r1DirectMaterialRow: 0, rowIdFallback: 0, missing: 0, other: 0 },
      identityConflicts: 0, orderListTruncated: false })
  }

  const catalogById = new Map()
  for (const item of catalogMaterials) {
    if (!item || item.kind !== 'material' || typeof item.id !== 'string' || !item.id.trim()) continue
    const rows = catalogById.get(item.id) ?? []
    rows.push(item)
    catalogById.set(item.id, rows)
  }
  const skuCountBySpu = new Map()
  for (const row of activeSkuRows) {
    if (row && typeof row.spuId === 'string' && row.spuId.trim()) {
      skuCountBySpu.set(row.spuId, (skuCountBySpu.get(row.spuId) ?? 0) + 1)
    }
  }

  let identityConflicts = 0
  let directMaterialLines = 0
  let catalogSpuMatches = 0
  let comparableLines = 0
  let equalToCurrent = 0
  let differentFromCurrent = 0
  let unknownLines = 0
  let skuOrAmbiguousIdentity = 0
  let currentSkuVariantAmbiguity = 0
  let duplicateCatalogIdentities = 0
  let rowIdFallbackCatalogIdMatches = 0
  const spuIdentitySources = {
    orderLine: 0, embeddedProduct: 0, embeddedMaterial: 0,
    materialReference: 0, r1DirectMaterialRow: 0, rowIdFallback: 0, missing: 0, other: 0,
  }

  for (const order of orders) {
    if (!order || order.type !== 1 || order.serviceAppointmentId !== expectedWorkOrderId) {
      identityConflicts += 1
      continue
    }
    for (const group of Array.isArray(order.groups) ? order.groups : []) {
      // `group.lines` contains the direct order category rows. Package
      // components live only under package.children and are excluded here.
      for (const line of Array.isArray(group?.lines) ? group.lines : []) {
        if (line?.kind !== 'material') continue
        directMaterialLines += 1
        const spuId = line.identity?.spuId
        const source = line.identity?.spuIdSource
        if (source === 'order_line_spu') spuIdentitySources.orderLine += 1
        else if (source === 'embedded_product_spu') spuIdentitySources.embeddedProduct += 1
        else if (source === 'embedded_material_id') spuIdentitySources.embeddedMaterial += 1
        else if (source === 'material_reference') spuIdentitySources.materialReference += 1
        else if (source === 'r1_direct_material_row_id') spuIdentitySources.r1DirectMaterialRow += 1
        else if (source === 'row_id_fallback') spuIdentitySources.rowIdFallback += 1
        else if (source === undefined) spuIdentitySources.missing += 1
        else spuIdentitySources.other += 1
        if (typeof spuId !== 'string' || !spuId.trim()) {
          unknownLines += 1
          continue
        }
        if (!['order_line_spu', 'embedded_product_spu', 'embedded_material_id', 'material_reference', 'r1_direct_material_row_id']
          .includes(source)) {
          // A generic projected row `_id` fallback can be a variant row ID.
          // Only explicit fields or the source-verified R1 direct category
          // row identity may establish catalog identity.
          if (source === 'row_id_fallback' && (catalogById.get(spuId) ?? []).length === 1) {
            // Record an ID coincidence for diagnostics without promoting it
            // to an SPU identity or a comparable price snapshot.
            rowIdFallbackCatalogIdMatches += 1
          }
          unknownLines += 1
          continue
        }
        const catalogRows = catalogById.get(spuId) ?? []
        if (catalogRows.length > 1) {
          duplicateCatalogIdentities += 1
          unknownLines += 1
          continue
        }
        if (catalogRows.length !== 1) {
          unknownLines += 1
          continue
        }
        catalogSpuMatches += 1
        if (line.identity?.skuId || line.identity?.skuCode) {
          skuOrAmbiguousIdentity += 1
          unknownLines += 1
          continue
        }
        if ((skuCountBySpu.get(spuId) ?? 0) > 0) {
          currentSkuVariantAmbiguity += 1
          unknownLines += 1
          continue
        }
        const currentPrice = catalogRows[0].price
        const snapshotPrice = line.unitPrice
        if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice) || currentPrice < 0
          || typeof snapshotPrice !== 'number' || !Number.isFinite(snapshotPrice) || snapshotPrice < 0
          || line.contentSupported !== true) {
          unknownLines += 1
          continue
        }
        comparableLines += 1
        if (snapshotPrice === currentPrice) equalToCurrent += 1
        else differentFromCurrent += 1
      }
    }
  }

  const state = identityConflicts > 0 ? 'ORDER_ASSOCIATION_CONFLICT'
    : orders.length === 0 ? 'NO_ORDER_IN_BOUND'
      : directMaterialLines === 0 ? 'NO_DIRECT_MATERIAL_LINES'
        : comparableLines === 0 ? 'NO_COMPARABLE_LINES'
          : unknownLines > 0 ? 'PARTIAL_COMPARISON' : 'COMPARED'

  return Object.freeze({
    state,
    orders: orders.length,
    directMaterialLines,
    catalogSpuMatches,
    comparableLines,
    equalToCurrent,
    differentFromCurrent,
    unknownLines,
    skuOrAmbiguousIdentity,
    currentSkuVariantAmbiguity,
    duplicateCatalogIdentities,
    rowIdFallbackCatalogIdMatches,
    spuIdentitySources,
    identityConflicts,
    orderListTruncated: orderListTruncated === true,
  })
}
