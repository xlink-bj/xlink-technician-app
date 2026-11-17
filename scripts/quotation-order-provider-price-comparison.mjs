/** Compare direct R1 Procedure/Measure Order unit snapshots to exact current providers. */

const supportedKinds = ['procedure', 'measure']

function finiteMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e21
}

function kindSummary() {
  return {
    directLines: 0,
    catalogMatches: 0,
    comparableLines: 0,
    equalToCurrent: 0,
    differentFromCurrent: 0,
    unknownLines: 0,
  }
}

export function summarizeDirectProviderPriceSnapshots({
  expectedWorkOrderId,
  orders,
  catalogProcedures,
  catalogMeasures,
  procedureCatalogComplete,
  measureCatalogComplete,
  orderListTruncated = false,
}) {
  const empty = {
    orders: 0,
    directProcedureLines: 0,
    directMeasureLines: 0,
    catalogProviderMatches: 0,
    comparableLines: 0,
    equalToCurrent: 0,
    differentFromCurrent: 0,
    unknownLines: 0,
    identityConflicts: 0,
    orderListTruncated: false,
    byKind: { procedure: kindSummary(), measure: kindSummary() },
  }
  if (typeof expectedWorkOrderId !== 'string' || !expectedWorkOrderId.trim()
    || !Array.isArray(orders) || !Array.isArray(catalogProcedures) || !Array.isArray(catalogMeasures)) {
    return Object.freeze({ state: 'UNKNOWN_INVALID_INPUT', ...empty })
  }

  const catalogs = {
    procedure: { rows: catalogProcedures, complete: procedureCatalogComplete === true, priceKey: 'guideUnitPrice' },
    measure: { rows: catalogMeasures, complete: measureCatalogComplete === true, priceKey: 'guideUnitPrice' },
  }
  const catalogByKindAndId = Object.create(null)
  for (const kind of supportedKinds) {
    catalogByKindAndId[kind] = new Map()
    for (const row of catalogs[kind].rows) {
      if (!row || row.kind !== kind || typeof row.id !== 'string' || !row.id.trim()) continue
      const rows = catalogByKindAndId[kind].get(row.id) ?? []
      rows.push(row)
      catalogByKindAndId[kind].set(row.id, rows)
    }
  }

  let identityConflicts = 0
  const byKind = { procedure: kindSummary(), measure: kindSummary() }
  for (const order of orders) {
    if (!order || order.type !== 1 || order.serviceAppointmentId !== expectedWorkOrderId) {
      identityConflicts += 1
      continue
    }
    for (const group of Array.isArray(order.groups) ? order.groups : []) {
      // Package children are deliberately excluded; only top-level R1 direct
      // provider selections appear in group.lines.
      for (const line of Array.isArray(group?.lines) ? group.lines : []) {
        const kind = line?.kind
        if (!supportedKinds.includes(kind)) continue
        const summary = byKind[kind]
        summary.directLines += 1
        if (!catalogs[kind].complete) {
          summary.unknownLines += 1
          continue
        }
        const id = line.identity?.providerRowId
        const referenceId = line.identity?.providerReferenceId
        if (line.identity?.providerRowIdSource !== 'r1_direct_provider_row_id'
          || typeof id !== 'string' || !id.trim()
          || (referenceId !== undefined && referenceId !== id)) {
          summary.unknownLines += 1
          continue
        }
        const matches = catalogByKindAndId[kind].get(id) ?? []
        if (matches.length !== 1) {
          summary.unknownLines += 1
          continue
        }
        summary.catalogMatches += 1
        const currentPrice = matches[0][catalogs[kind].priceKey]
        if (!finiteMoney(currentPrice) || !finiteMoney(line.unitPrice)
          || !finiteMoney(line.lineTotal) || !Number.isFinite(line.quantity) || line.quantity <= 0
          || line.contentSupported !== true) {
          summary.unknownLines += 1
          continue
        }
        summary.comparableLines += 1
        if (line.unitPrice === currentPrice) summary.equalToCurrent += 1
        else summary.differentFromCurrent += 1
      }
    }
  }

  const totals = { ...empty, orders: orders.length, identityConflicts, byKind }
  for (const kind of supportedKinds) {
    const prefix = kind === 'procedure' ? 'directProcedure' : 'directMeasure'
    totals[`${prefix}Lines`] = byKind[kind].directLines
    totals.catalogProviderMatches += byKind[kind].catalogMatches
    totals.comparableLines += byKind[kind].comparableLines
    totals.equalToCurrent += byKind[kind].equalToCurrent
    totals.differentFromCurrent += byKind[kind].differentFromCurrent
    totals.unknownLines += byKind[kind].unknownLines
  }
  const directLines = totals.directProcedureLines + totals.directMeasureLines
  const state = identityConflicts > 0 ? 'ORDER_ASSOCIATION_CONFLICT'
    : orders.length === 0 ? 'NO_ORDER_IN_BOUND'
      : directLines === 0 ? 'NO_DIRECT_PROVIDER_LINES'
        : totals.comparableLines === 0 ? 'NO_COMPARABLE_LINES'
          : totals.unknownLines > 0 || orderListTruncated ? 'PARTIAL_COMPARISON' : 'COMPARED'
  totals.orderListTruncated = orderListTruncated === true
  return Object.freeze({ state, ...totals })
}
