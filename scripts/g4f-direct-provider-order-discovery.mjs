/** Inspect bounded role-scoped type-1 Order pages for top-level Procedure/Measure rows. */
export function inspectDirectProviderOrderPage(expectedWorkOrderId, page) {
  const empty = {
    state: 'UNKNOWN_INVALID_INPUT',
    orders: 0,
    directProcedureLines: 0,
    directMeasureLines: 0,
  }
  if (typeof expectedWorkOrderId !== 'string' || !expectedWorkOrderId.trim()
    || !page || typeof page !== 'object' || !Array.isArray(page.items)) {
    return Object.freeze(empty)
  }

  let directProcedureLines = 0
  let directMeasureLines = 0
  for (const order of page.items) {
    if (!order || order.type !== 1 || order.serviceAppointmentId !== expectedWorkOrderId) {
      return Object.freeze({
        state: 'ORDER_ASSOCIATION_CONFLICT',
        orders: page.items.length,
        directProcedureLines,
        directMeasureLines,
      })
    }
    for (const group of Array.isArray(order.groups) ? order.groups : []) {
      // Package children are nested under package.children and are excluded.
      for (const line of Array.isArray(group?.lines) ? group.lines : []) {
        if (line?.kind === 'procedure') directProcedureLines += 1
        else if (line?.kind === 'measure') directMeasureLines += 1
      }
    }
  }

  return Object.freeze({
    state: directProcedureLines + directMeasureLines > 0 ? 'FOUND' : 'NO_DIRECT_PROVIDER_LINES',
    orders: page.items.length,
    directProcedureLines,
    directMeasureLines,
  })
}

export function hasRequestedDirectProviderLines(summary, requestedKind = 'procedure_or_measure') {
  if (!summary || typeof summary !== 'object') return false
  if (requestedKind === 'measure') return summary.directMeasureLines > 0
  return summary.directProcedureLines + summary.directMeasureLines > 0
}
