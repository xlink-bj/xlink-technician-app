/**
 * Compare a bounded type-1 Order Package snapshot with its exact current R1
 * package and selected package-material rows. This audit returns counts only.
 */

const explicitMaterialSpuSources = new Set([
  'order_line_spu', 'embedded_product_spu', 'embedded_material_id', 'material_reference',
])

function finiteMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e21
}

function layerKey(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? String(number) : null
}

function amountToFixed(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21 || value === 0) return 0
  const rounded = Number(value.toFixed(2))
  return Number.isFinite(rounded) ? rounded : 0
}

function packageLines(orders, expectedWorkOrderId) {
  const lines = []
  let identityConflicts = 0
  for (const order of orders) {
    if (!order || order.type !== 1 || order.serviceAppointmentId !== expectedWorkOrderId) {
      identityConflicts += 1
      continue
    }
    for (const group of Array.isArray(order.groups) ? order.groups : []) {
      for (const line of Array.isArray(group?.lines) ? group.lines : []) {
        if (line?.kind === 'package') lines.push(line)
      }
    }
  }
  return { lines, identityConflicts }
}

function compareSelectedMaterials(line, detail) {
  const currentRows = Array.isArray(detail.materials) ? detail.materials : []
  const selectedRows = Array.isArray(line.children)
    ? line.children.filter((child) => child?.kind === 'material') : []
  const currentLayers = new Map()
  for (const current of currentRows) {
    const key = layerKey(current?.layer)
    if (!key || typeof current?.referenceId !== 'string' || !current.referenceId.trim()) {
      return { state: 'unknown' }
    }
    const rows = currentLayers.get(key) ?? []
    rows.push(current)
    currentLayers.set(key, rows)
  }

  const selectedByLayer = new Map()
  let markup = 0
  let componentSnapshotDifferences = 0
  for (const selected of selectedRows) {
    const key = layerKey(selected.packageMaterialLayer)
    const referencedMaterialId = selected.identity?.providerReferenceId
    const explicitSpuId = explicitMaterialSpuSources.has(selected.identity?.spuIdSource)
      ? selected.identity.spuId : undefined
    if (referencedMaterialId && explicitSpuId && referencedMaterialId !== explicitSpuId) {
      return { state: 'unknown' }
    }
    const ref = referencedMaterialId ?? explicitSpuId
    if (!key || typeof ref !== 'string' || !ref.trim()) return { state: 'unknown' }
    const already = selectedByLayer.get(key)
    if (already) return { state: 'unknown' }

    const candidates = (currentLayers.get(key) ?? []).filter((current) => {
      if (current.referenceId !== ref) return false
      const selectedComponentId = selected.identity?.providerRowId
      return selectedComponentId === undefined || current.id === selectedComponentId
    })
    if (candidates.length !== 1) return { state: 'unknown' }
    const current = candidates[0]
    const historicalMarkup = selected.packageComponentMarkup ?? 0
    const currentMarkup = current.price ?? 0
    if (!Number.isFinite(historicalMarkup) || !Number.isFinite(currentMarkup)) return { state: 'unknown' }
    if (historicalMarkup !== currentMarkup) componentSnapshotDifferences += 1
    if (currentMarkup > 0) markup += currentMarkup
    selectedByLayer.set(key, current)
  }

  if (selectedByLayer.size !== currentLayers.size) return { state: 'unknown' }
  return { state: 'matched', markup, componentSnapshotDifferences }
}

export function summarizePackagePriceSnapshots({
  expectedWorkOrderId,
  orders,
  catalogPackages,
  packageDetails,
  packageCatalogComplete,
  packageDetailsComplete,
  orderListTruncated = false,
}) {
  const empty = {
    orders: 0, packageLines: 0, catalogPackageMatches: 0, detailMatches: 0,
    comparableLines: 0, equalToCurrent: 0, differentFromCurrent: 0, unknownLines: 0,
    skuPackageLines: 0, ambiguousIdentityLines: 0, componentSnapshotDifferences: 0,
    identityConflicts: 0, orderListTruncated: false,
  }
  if (typeof expectedWorkOrderId !== 'string' || !expectedWorkOrderId.trim()
    || !Array.isArray(orders) || !Array.isArray(catalogPackages) || !Array.isArray(packageDetails)) {
    return Object.freeze({ state: 'UNKNOWN_INVALID_INPUT', ...empty })
  }

  const { lines, identityConflicts } = packageLines(orders, expectedWorkOrderId)
  let catalogPackageMatches = 0
  let detailMatches = 0
  let comparableLines = 0
  let equalToCurrent = 0
  let differentFromCurrent = 0
  let unknownLines = 0
  let skuPackageLines = 0
  let ambiguousIdentityLines = 0
  let componentSnapshotDifferences = 0

  const catalogById = new Map()
  for (const item of catalogPackages) {
    if (item?.kind !== 'package' || typeof item.id !== 'string' || !item.id.trim()) continue
    const rows = catalogById.get(item.id) ?? []
    rows.push(item)
    catalogById.set(item.id, rows)
  }
  const detailsById = new Map()
  for (const detail of packageDetails) {
    const id = detail?.package?.id
    if (typeof id !== 'string' || !id.trim()) continue
    const rows = detailsById.get(id) ?? []
    rows.push(detail)
    detailsById.set(id, rows)
  }

  for (const line of lines) {
    if (!packageCatalogComplete || !packageDetailsComplete) {
      unknownLines += 1
      continue
    }
    const packageId = line.identity?.providerRowId
    if (typeof packageId !== 'string' || !packageId.trim()) {
      ambiguousIdentityLines += 1
      unknownLines += 1
      continue
    }
    const catalogRows = catalogById.get(packageId) ?? []
    if (catalogRows.length !== 1) {
      if (catalogRows.length > 1) ambiguousIdentityLines += 1
      unknownLines += 1
      continue
    }
    catalogPackageMatches += 1
    const current = catalogRows[0]
    const detailRows = detailsById.get(packageId) ?? []
    if (detailRows.length !== 1 || detailRows[0].package?.id !== current.id) {
      if (detailRows.length > 1) ambiguousIdentityLines += 1
      unknownLines += 1
      continue
    }
    detailMatches += 1
    const detail = detailRows[0]
    if (line.packagePricingMethod === '1' || current.pricingMethod === '1'
      || line.packageSkuCompositionUnsupported === true) {
      skuPackageLines += 1
      unknownLines += 1
      continue
    }
    const quantity = line.quantity
    if (!finiteMoney(current.price) || (current.minimumPrice !== undefined && !finiteMoney(current.minimumPrice))
      || !Number.isFinite(quantity) || quantity <= 0
      || !finiteMoney(line.r1PackagePriceSnapshot?.unitAmount)
      || !finiteMoney(line.r1PackagePriceSnapshot?.totalAmount)) {
      unknownLines += 1
      continue
    }
    const selectedMaterials = compareSelectedMaterials(line, detail)
    if (selectedMaterials.state !== 'matched') {
      unknownLines += 1
      continue
    }
    const expectedUnit = current.price + selectedMaterials.markup
    const rawTotal = expectedUnit * quantity
    if (!Number.isFinite(rawTotal)) {
      unknownLines += 1
      continue
    }
    const expectedTotal = rawTotal < (current.minimumPrice ?? 0)
      ? current.minimumPrice ?? 0
      : amountToFixed(rawTotal)
    comparableLines += 1
    componentSnapshotDifferences += selectedMaterials.componentSnapshotDifferences
    if (line.r1PackagePriceSnapshot.unitAmount === expectedUnit
      && line.r1PackagePriceSnapshot.totalAmount === expectedTotal) equalToCurrent += 1
    else differentFromCurrent += 1
  }

  const state = identityConflicts > 0 ? 'ORDER_ASSOCIATION_CONFLICT'
    : orders.length === 0 ? 'NO_ORDER_IN_BOUND'
      : lines.length === 0 ? 'NO_PACKAGE_LINES'
        : !packageCatalogComplete || !packageDetailsComplete ? 'INCOMPLETE_CATALOG'
          : comparableLines === 0 ? 'NO_COMPARABLE_LINES'
            : unknownLines > 0 || orderListTruncated ? 'PARTIAL_COMPARISON' : 'COMPARED'

  return Object.freeze({
    state,
    orders: orders.length,
    packageLines: lines.length,
    catalogPackageMatches,
    detailMatches,
    comparableLines,
    equalToCurrent,
    differentFromCurrent,
    unknownLines,
    skuPackageLines,
    ambiguousIdentityLines,
    componentSnapshotDifferences,
    identityConflicts,
    orderListTruncated: orderListTruncated === true,
  })
}
