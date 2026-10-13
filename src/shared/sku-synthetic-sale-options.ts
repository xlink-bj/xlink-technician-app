import {
  preflightSkuSourceIdentity,
  type SkuSourceIdentityPreflightInput,
} from './sku-live-read-preflight'

/**
 * #75 — R1 Material ExtField -> valueOption -> i/code/selectCode synthetic
 * option-source audit. The original endpoint accepts a caller tenantId and
 * does NOT establish current WorkOrder/SPU authorization.
 *
 * This module has NO transport, reads NO live data, and grants NO authority.
 */
export interface SyntheticSkuOptionFixture {
  readonly provenance: 'synthetic_fixture'
  /** Simulates the tenant used to resolve the response, NOT server evidence. */
  readonly codeTenantId: string
  readonly complete: boolean
  readonly spu: unknown
  readonly extFields: unknown
  readonly codeResults: unknown
}

export interface SyntheticSaleOption {
  readonly value: string
  readonly label: string
}
export interface SyntheticSaleField {
  readonly name: string
  readonly label: string
  readonly valueOption: string
  readonly options: readonly SyntheticSaleOption[]
}
export type SkuOptionAuditBlock =
  | 'unverified_work_order_scope'
  | 'synthetic_source_missing'
  | 'tenant_mismatch'
  | 'partial_option_response'
  | 'spu_identity_mismatch'
  | 'unverified_sale_field'
  | 'duplicate_field'
  | 'malformed_spu_options'
  | 'missing_code_options'
  | 'duplicate_or_foreign_code_result'
  | 'malformed_code_options'
  | 'unresolved_option_value'
  | 'stale_response'
  | 'read_failed'

export type SyntheticSkuOptionAudit =
  | { readonly state: 'blocked'; readonly reason: SkuOptionAuditBlock; readonly realReadAuthorized: false }
  | {
      readonly state: 'synthetic_structure_only'
      readonly spuId: string
      readonly fields: readonly SyntheticSaleField[]
      readonly realReadAuthorized: false
      readonly backendWorkOrderAcl: 'unverified'
      readonly codeTenantAuthority: 'unverified'
      readonly officialSkuSelection: false
    }

const deny = (reason: SkuOptionAuditBlock): SyntheticSkuOptionAudit =>
  ({ state: 'blocked', reason, realReadAuthorized: false })
const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const id = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.trim() === v
const code = (v: unknown): string | null =>
  id(v) ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null

function salesFlag(raw: unknown): boolean | null {
  if (raw === undefined || raw === null || raw === '') return false
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) as unknown } catch { return null }
  }
  if (!isRecord(parsed)) return null
  if (parsed.salesAttribute === undefined) return false
  return typeof parsed.salesAttribute === 'boolean' ? parsed.salesAttribute : null
}

/** Positive result certifies test-fixture consistency ONLY. */
export function auditSyntheticSkuSalesOptions(
  source: SkuSourceIdentityPreflightInput,
  fixture: SyntheticSkuOptionFixture,
): SyntheticSkuOptionAudit {
  const preflight = preflightSkuSourceIdentity(source)
  if (preflight.state !== 'source_identity_only') return deny('unverified_work_order_scope')
  if (fixture?.provenance !== 'synthetic_fixture') return deny('synthetic_source_missing')
  if (!id(fixture.codeTenantId) || fixture.codeTenantId !== source.principal?.tenantId) {
    return deny('tenant_mismatch')
  }
  if (fixture.complete !== true) return deny('partial_option_response')
  const spu = fixture.spu
  if (!isRecord(spu) || !id(spu._id) || spu.state !== 1
    || spu.tenantId !== fixture.codeTenantId
    || !preflight.selectedMaterialSpuIds.includes(spu._id)
    || !isRecord(spu.exts)) return deny('spu_identity_mismatch')
  if (!Array.isArray(fixture.extFields) || fixture.extFields.length > 30) return deny('unverified_sale_field')
  if (!Array.isArray(fixture.codeResults) || fixture.codeResults.length > 30) return deny('malformed_code_options')

  const codeMap = new Map<string, Readonly<Record<string, unknown>>>()
  for (const raw of fixture.codeResults) {
    if (!isRecord(raw) || !id(raw.eleid) || codeMap.has(raw.eleid)) {
      return deny('duplicate_or_foreign_code_result')
    }
    if (!isRecord(raw.options) || Object.keys(raw.options).length > 60) {
      return deny('malformed_code_options')
    }
    codeMap.set(raw.eleid, raw.options)
  }

  const seenNames = new Set<string>()
  const usedCodeIds = new Set<string>()
  const fields: SyntheticSaleField[] = []
  for (const raw of fixture.extFields) {
    if (!isRecord(raw) || raw.colName !== 'material'
      || raw.state !== 1 || raw.tenantId !== fixture.codeTenantId) {
      return deny('unverified_sale_field')
    }
    const flag = salesFlag(raw.frontEndConfig)
    if (flag === null) return deny('unverified_sale_field')
    if (!flag) continue
    if (!id(raw.name) || !id(raw.nameDisp) || !id(raw.valueOption)) {
      return deny('unverified_sale_field')
    }
    if (seenNames.has(raw.name)) return deny('duplicate_field')
    seenNames.add(raw.name)
    // R1 only shows sale attributes populated on this SPU.
    const rawValues = spu.exts[raw.name]
    if (rawValues === undefined || rawValues === null) continue
    if (!Array.isArray(rawValues) || rawValues.length < 1 || rawValues.length > 40) {
      return deny('malformed_spu_options')
    }
    const selectedValues = rawValues.map(code)
    if (selectedValues.some(v => v === null)
      || new Set(selectedValues).size !== selectedValues.length) return deny('malformed_spu_options')
    const codes = codeMap.get(raw.valueOption)
    if (!codes) return deny('missing_code_options')
    usedCodeIds.add(raw.valueOption)
    const options: SyntheticSaleOption[] = []
    for (const value of selectedValues) {
      if (value === null) return deny('unresolved_option_value')
      const display = codes[value]
      if (!id(display)) return deny('unresolved_option_value')
      options.push({ value, label: display })
    }
    fields.push({ name: raw.name, label: raw.nameDisp, valueOption: raw.valueOption, options })
  }
  // A returned code list may not contain unrelated type IDs.
  if ([...codeMap.keys()].some(key => !usedCodeIds.has(key))) {
    return deny('duplicate_or_foreign_code_result')
  }
  return {
    state: 'synthetic_structure_only', spuId: spu._id,
    fields, realReadAuthorized: false, backendWorkOrderAcl: 'unverified',
    codeTenantAuthority: 'unverified', officialSkuSelection: false,
  }
}

function identityKey(s: SkuSourceIdentityPreflightInput | null): string | null {
  if (!s || preflightSkuSourceIdentity(s).state !== 'source_identity_only') return null
  const p = s.principal!, c = s.catalogContext!
  return JSON.stringify([
    p.sessionRef, p.userId, p.roleId, p.roleVersion, p.tenantId, p.workOrderId,
    c.workOrderId, c.serviceType, c.sourceType,
    [...s.listedMaterialSpuIds].sort(), [...s.selectedMaterialSpuIds].sort(),
    s.catalogListingComplete,
  ])
}

/**
 * Async integration is restricted to an explicitly injected in-memory synthetic
 * fixture. NEVER supply a network transport or wire this into production composition.
 */
export function createSyntheticSkuOptionAuditReader(options: {
  readonly enabled: () => boolean
  readonly currentSource: () => SkuSourceIdentityPreflightInput | null
  readonly fetchSyntheticFixture: () => Promise<SyntheticSkuOptionFixture>
}) {
  let revision = 0
  return {
    invalidate(): void { revision += 1 },
    async read(): Promise<SyntheticSkuOptionAudit> {
      const requestRevision = ++revision
      if (!options.enabled()) return deny('synthetic_source_missing')
      let source: SkuSourceIdentityPreflightInput | null
      try { source = options.currentSource() } catch { return deny('unverified_work_order_scope') }
      const started = identityKey(source)
      if (!started || !source) return deny('unverified_work_order_scope')
      let fixture: SyntheticSkuOptionFixture
      try { fixture = await options.fetchSyntheticFixture() }
      catch { return deny('read_failed') }
      if (revision !== requestRevision || !options.enabled()) return deny('stale_response')
      let current: SkuSourceIdentityPreflightInput | null
      try { current = options.currentSource() } catch { return deny('stale_response') }
      if (identityKey(current) !== started) return deny('stale_response')
      return auditSyntheticSkuSalesOptions(source, fixture)
    },
  }
}
