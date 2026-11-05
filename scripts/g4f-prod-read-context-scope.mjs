const MAX_CONTEXT_ORDINAL = 20
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/

export function parseCatalogContextAuditArgs(args = []) {
  let catalogContextOrdinal = 1
  let hasOrdinal = false
  let catalogContextOnly = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--' || argument === '--preflight-only') continue
    if (argument === '--catalog-context-only') {
      if (catalogContextOnly) throw new Error('duplicate_catalog_context_only_argument')
      catalogContextOnly = true
      continue
    }
    if (argument === '--catalog-context-ordinal' || argument.startsWith('--catalog-context-ordinal=')) {
      if (hasOrdinal) throw new Error('duplicate_catalog_context_ordinal_argument')
      hasOrdinal = true
      const value = argument === '--catalog-context-ordinal'
        ? args[++index]
        : argument.slice('--catalog-context-ordinal='.length)
      if (typeof value !== 'string' || !/^\d{1,2}$/.test(value)) {
        throw new Error('invalid_catalog_context_ordinal_argument')
      }
      catalogContextOrdinal = Number(value)
      if (!Number.isSafeInteger(catalogContextOrdinal)
        || catalogContextOrdinal < 1 || catalogContextOrdinal > MAX_CONTEXT_ORDINAL) {
        throw new Error('catalog_context_ordinal_out_of_bounds')
      }
      continue
    }
    throw new Error('unsupported_g4f_prod_read_argument')
  }

  return Object.freeze({ catalogContextOrdinal, catalogContextOnly })
}

/** Select a requested distinct service/source pair from verified current Place Order WorkOrders. */
export function createPlaceOrderCatalogContextSelector(targetOrdinal = 1) {
  if (!Number.isSafeInteger(targetOrdinal) || targetOrdinal < 1 || targetOrdinal > MAX_CONTEXT_ORDINAL) {
    throw new Error('catalog_context_ordinal_out_of_bounds')
  }

  const ordinalByContext = new Map()
  return Object.freeze({
    consider(context, expectedWorkOrderId) {
      if (!context || typeof context !== 'object' || Array.isArray(context)
        || typeof expectedWorkOrderId !== 'string' || !ID_PATTERN.test(expectedWorkOrderId)
        || context.workOrderId !== expectedWorkOrderId
        || typeof context.serviceType !== 'string' || !context.serviceType.trim() || context.serviceType.length > 200
        || typeof context.sourceType !== 'string' || !context.sourceType.trim() || context.sourceType.length > 200) {
        return Object.freeze({ eligible: false, distinct: false, ordinal: null, selected: false })
      }

      const key = JSON.stringify([context.serviceType, context.sourceType])
      let ordinal = ordinalByContext.get(key)
      const distinct = ordinal === undefined
      if (distinct) {
        ordinal = ordinalByContext.size + 1
        ordinalByContext.set(key, ordinal)
      }
      return Object.freeze({
        eligible: true,
        distinct,
        ordinal,
        selected: ordinal === targetOrdinal,
      })
    },
    get distinctCount() {
      return ordinalByContext.size
    },
  })
}
