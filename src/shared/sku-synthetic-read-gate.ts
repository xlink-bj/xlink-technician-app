/**
 * Synthetic-only future SKU read admission gate.
 * No network or business adapter. NOT tenant/role/WorkOrder authorization.
 */
export interface SkuMockReadScope {
  readonly sessionRef: string
  readonly userId: string
  readonly roleId: string
  readonly roleVersion: string
  readonly tenantId: string
  readonly workOrderId: string
  readonly serviceType: string
  readonly sourceType: string
  readonly contextRevision: number
  /** From the CURRENT synthetic catalog result, not user input. */
  readonly listedSpuIds: readonly string[]
  readonly provenance: 'verified_synthetic_catalog'
}
export interface SkuMockPage {
  readonly items: readonly unknown[]
  readonly hasMore: boolean
  readonly total: number
}
export type SkuMockReadFailure =
  | 'synthetic_runtime_disabled' | 'missing_or_changed_scope'
  | 'invalid_requested_spu' | 'catalog_scope_unverified'
  | 'partial_page' | 'malformed_sku' | 'duplicate_sku'
  | 'foreign_sku' | 'read_failed' | 'stale_response'
export type SkuMockReadOutcome =
  | { readonly state: 'accepted_synthetic'; readonly skuRows: readonly Readonly<Record<string, unknown>>[] }
  | { readonly state: 'blocked'; readonly reason: SkuMockReadFailure }
const deny = (reason: SkuMockReadFailure): SkuMockReadOutcome => ({ state: 'blocked', reason })
const valid = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v === v.trim()
function scopeKey(s: SkuMockReadScope | null): string | null {
  if (!s || s.provenance !== 'verified_synthetic_catalog'
    || !Number.isSafeInteger(s.contextRevision) || s.contextRevision < 0
    || ![s.sessionRef,s.userId,s.roleId,s.roleVersion,s.tenantId,s.workOrderId,s.serviceType,s.sourceType].every(valid)
    || !Array.isArray(s.listedSpuIds) || !s.listedSpuIds.length
    || s.listedSpuIds.length > 40 || !s.listedSpuIds.every(valid)
    || new Set(s.listedSpuIds).size !== s.listedSpuIds.length) return null
  return JSON.stringify([s.sessionRef,s.userId,s.roleId,s.roleVersion,
    s.tenantId,s.workOrderId,s.serviceType,s.sourceType,
    s.contextRevision,[...s.listedSpuIds].sort()])
}
/**
 * Callback is only an explicitly synthetic in-memory provider. Never pass an
 * ApiReadTransport or live HTTP to this developmental read boundary.
 */
export function createSkuSyntheticReadGate(options: {
  readonly enabled: () => boolean
  readonly currentScope: () => SkuMockReadScope | null
  readonly fetchSyntheticPage: (ids: readonly string[], pageSize: number) => Promise<SkuMockPage>
}) {
  let revision = 0
  return {
    invalidate(): void { revision += 1 },
    async read(input: { readonly workOrderId: string; readonly requestedSpuIds: readonly string[] }): Promise<SkuMockReadOutcome> {
      const currentRevision = ++revision
      if (!options.enabled()) return deny('synthetic_runtime_disabled')
      let scope: SkuMockReadScope | null
      try { scope = options.currentScope() } catch { return deny('missing_or_changed_scope') }
      const started = scopeKey(scope)
      if (!scope || !started || scope.workOrderId !== input.workOrderId) return deny('missing_or_changed_scope')
      const ids = input.requestedSpuIds
      if (!Array.isArray(ids) || !ids.length || ids.length > 10
        || !ids.every(valid) || new Set(ids).size !== ids.length) return deny('invalid_requested_spu')
      const listedSpuIds = scope.listedSpuIds
      if (!ids.every(id => listedSpuIds.includes(id))) return deny('catalog_scope_unverified')
      const pageSize = 40
      let page: SkuMockPage
      try { page = await options.fetchSyntheticPage([...ids], pageSize) }
      catch { return deny('read_failed') }
      if (revision !== currentRevision || !options.enabled()) return deny('stale_response')
      let fresh: SkuMockReadScope | null
      try { fresh = options.currentScope() } catch { return deny('stale_response') }
      if (scopeKey(fresh) !== started) return deny('stale_response')
      if (!page || !Array.isArray(page.items) || page.hasMore !== false
        || !Number.isSafeInteger(page.total) || page.total !== page.items.length
        || page.items.length > pageSize) return deny('partial_page')
      const seen = new Set<string>()
      const rows: Readonly<Record<string, unknown>>[] = []
      for (const unknownRow of page.items) {
        if (!unknownRow || typeof unknownRow !== 'object' || Array.isArray(unknownRow)) return deny('malformed_sku')
        const row = unknownRow as Readonly<Record<string, unknown>>
        if (!valid(row._id) || row.state !== 1 || !row.exts
          || typeof row.exts !== 'object' || Array.isArray(row.exts)) return deny('malformed_sku')
        if (!valid(row.spuid) || !ids.includes(row.spuid)) return deny('foreign_sku')
        if (seen.has(row._id)) return deny('duplicate_sku')
        seen.add(row._id)
        if (row.number !== undefined && (typeof row.number !== 'number'
          || !Number.isSafeInteger(row.number) || row.number < 0)) return deny('malformed_sku')
        // Whitelist only the data needed for R1 source projections.
        rows.push({
          _id: row._id, spuid: row.spuid, state: row.state,
          exts: { ...(row.exts as Readonly<Record<string, unknown>>) },
          ...(row.number === undefined ? {} : { number: row.number }),
        })
      }
      return { state: 'accepted_synthetic', skuRows: rows }
    },
  }
}
