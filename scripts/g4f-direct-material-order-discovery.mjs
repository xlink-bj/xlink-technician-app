/** Inspect only top-level Material Order lines from a role-scoped Order page. */
export function inspectDirectMaterialOrderPage(expectedWorkOrderId, page) {
  const empty = { state: 'UNKNOWN_INVALID_INPUT', orders: 0, directMaterialLines: 0 }
  if (typeof expectedWorkOrderId !== 'string' || !expectedWorkOrderId.trim()
    || !page || typeof page !== 'object' || !Array.isArray(page.items)) {
    return Object.freeze(empty)
  }

  let directMaterialLines = 0
  for (const order of page.items) {
    if (!order || order.type !== 1 || order.serviceAppointmentId !== expectedWorkOrderId) {
      return Object.freeze({
        state: 'ORDER_ASSOCIATION_CONFLICT', orders: page.items.length, directMaterialLines,
      })
    }
    for (const group of Array.isArray(order.groups) ? order.groups : []) {
      // Package components are nested under package.children and are excluded.
      for (const line of Array.isArray(group?.lines) ? group.lines : []) {
        if (line?.kind === 'material') directMaterialLines += 1
      }
    }
  }

  return Object.freeze({
    state: directMaterialLines > 0 ? 'FOUND' : 'NO_DIRECT_MATERIAL_LINES',
    orders: page.items.length,
    directMaterialLines,
  })
}
