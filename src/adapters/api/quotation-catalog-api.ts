import type {
  QuotationCatalogContext,
  QuotationCatalogItemBaseRead,
  QuotationCatalogReadPort,
  QuotationMaterialRead,
  QuotationMaterialSkuVariantRead,
  QuotationMaterialSaleFieldRead,
  QuotationMeasureRead,
  QuotationPackageMaterialRead,
  QuotationPackageDetailRead,
  QuotationPackageProcedureRead,
  QuotationPackageRead,
  QuotationProcedureRead,
  ReadPage,
} from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'
import { isProductionReadOnlyTarget } from '@shared/config'
import { parseR1CatalogFilterCodes } from '@shared/quotation-catalog-eligibility'
import { adapterFailure, succeeded, unknownErrorMessage, AdapterMappingError } from '../common/operations'
import {
  asRecord,
  nestedValue,
  optionalNonNegativeInteger,
  optionalPositiveInteger,
  optionalRecord,
  optionalString,
  requiredString,
  type AdapterRecord,
} from '../common/records'
import { ApiReadTransportError, type ApiReadRequest, type ApiReadTransport } from './technician-api'

const commercialFieldNames = [
  'price',
  'minimumPrice',
  'guideUnitPrice',
  'minimumGuideTotalPrice',
  'servicePrice',
  'serviceCostPrice',
  'storeCostPrice',
  'cost',
] as const
type CommercialField = typeof commercialFieldNames[number]

function pageEnvelope<T>(raw: unknown, mapItem: (value: unknown) => T): ReadPage<T> {
  const envelope = asRecord(raw, 'quotation catalog list response')
  const rawItems = nestedValue(envelope, ['data', 'items', 'records'])
  if (!Array.isArray(rawItems)) throw new AdapterMappingError('quotation catalog response items are missing')
  return {
    items: rawItems.map(mapItem),
    page: optionalPositiveInteger(envelope, ['page']),
    pageSize: optionalPositiveInteger(envelope, ['rows', 'pageSize']),
    totalCount: optionalNonNegativeInteger(envelope, ['total', 'dataCount', 'totalCount']),
  }
}

function optionalFiniteNumber(record: AdapterRecord, key: string): number | undefined {
  const value = record[key]
  if (value === undefined || value === null || value === '') return undefined
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numberValue)) throw new AdapterMappingError(`catalog ${key} is malformed`)
  return numberValue
}

function optionalStringList(record: AdapterRecord, key: string): readonly string[] | undefined {
  const value = record[key]
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new AdapterMappingError(`catalog ${key} list is malformed`)
  }
  return [...value]
}

function commercialValues<Fields extends readonly CommercialField[]>(record: AdapterRecord, fields: Fields) {
  return Object.fromEntries(
    fields.map((field) => [field, optionalFiniteNumber(record, field)]).filter((entry) => entry[1] !== undefined),
  ) as Partial<Record<Fields[number], number>>
}

function catalogItemBase(record: AdapterRecord): QuotationCatalogItemBaseRead {
  const order = optionalNonNegativeInteger(record, ['order'])
  const unit = optionalString(record, ['unit'])
  const specification = optionalString(record, ['spec'])
  const serviceTypes = optionalStringList(record, 'serviceType')
  const sourceTypeList = optionalStringList(record, 'sourceTypeList')
  const description = optionalString(record, ['desc'])
  const content = optionalString(record, ['content'])
  return {
    id: requiredString(record, ['_id'], 'catalog item identity'),
    name: requiredString(record, ['name'], 'catalog item name'),
    ...(unit ? { unit } : {}),
    ...(specification ? { specification } : {}),
    ...(serviceTypes ? { serviceTypes } : {}),
    ...(sourceTypeList ? { sourceTypeList } : {}),
    ...(description ? { description } : {}),
    ...(content ? { content } : {}),
    ...(order === undefined ? {} : { order }),
  }
}

function packageItem(raw: unknown): QuotationPackageRead {
  const record = asRecord(raw, 'quotation package')
  const exts = optionalRecord(record.exts)
  const type = optionalString(record, ['type'])
  const code = optionalString(record, ['code'])
  const ageLimit = optionalNonNegativeInteger(record, ['agelimit'])
  const repairPart = optionalString(record, ['repairPart'])
  const pricingMethod = exts ? optionalString(exts, ['pricingMethod']) : undefined
  const parts = parseR1CatalogFilterCodes(exts?.repairParts, 'strict_array')
  const construction = parseR1CatalogFilterCodes(exts?.constructionParts, 'strict_array')
  return {
    ...catalogItemBase(record),
    kind: 'package',
    ...commercialValues(record, ['price', 'minimumPrice', 'cost']),
    ...(type ? { type } : {}),
    ...(code ? { code } : {}),
    ...(ageLimit === undefined ? {} : { ageLimit }),
    ...(pricingMethod ? { pricingMethod } : {}),
    ...(repairPart ? { repairPart } : {}),
    ...(parts === undefined ? {} : { r1RepairPartsCodes: parts }),
    ...(construction === undefined ? {} : { r1ConstructionPartsCodes: construction }),
  }
}

function procedureItem(raw: unknown): QuotationProcedureRead {
  const record = asRecord(raw, 'quotation procedure')
  const codes = parseR1CatalogFilterCodes(optionalRecord(record.exts)?.repairProcedure, 'procedure')
  return {
    ...catalogItemBase(record),
    kind: 'procedure',
    ...commercialValues(record, ['guideUnitPrice', 'minimumGuideTotalPrice']),
    ...(codes === undefined ? {} : { r1RepairProcedureCodes: codes }),
  }
}

/** Candidate value arrays are NOT verified sale options until matched against R1
 * ExtField + Code dictionaries. No broad exts object leaves the adapter.
 */
function materialSaleCandidates(record: AdapterRecord): Readonly<Record<string, readonly string[]>> | undefined {
  const exts = optionalRecord(record.exts)
  if (!exts) return undefined
  const values: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>
  for (const [key, candidate] of Object.entries(exts)) {
    if (!Array.isArray(candidate) || !key || key.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(key)
      || candidate.length === 0 || candidate.length > 40) continue
    const codes = candidate.map(value => (typeof value === 'number' && Number.isFinite(value))
      ? String(value)
      : typeof value === 'string' && value.trim() ? value.trim() : null)
    if (codes.some(code => code === null) || new Set(codes).size !== codes.length) continue
    values[key] = codes as string[]
    if (Object.keys(values).length > 30) break
  }
  return Object.keys(values).length > 0 ? values : undefined
}

function materialItem(raw: unknown): QuotationMaterialRead {
  const record = asRecord(raw, 'quotation material')
  const spuId = optionalString(record, ['spuid'])
  const code = optionalString(record, ['code'])
  const materialUnit = optionalString(record, ['materialUnit'])
  const specUnit = optionalString(record, ['specUnit'])
  const type = optionalNonNegativeInteger(record, ['type'])
  return {
    ...catalogItemBase(record),
    kind: 'material',
    ...commercialValues(record, ['price', 'servicePrice', 'serviceCostPrice', 'storeCostPrice', 'cost']),
    ...(code ? { code } : {}),
    ...(materialUnit ? { materialUnit } : {}),
    ...(specUnit ? { specUnit } : {}),
    ...(type === undefined ? {} : { type }),
    ...(spuId ? { spuId } : {}),
    ...(materialSaleCandidates(record) ? { saleOptionCandidates: materialSaleCandidates(record) } : {}),
  }
}

/** R1 SKU rows are read only as provider-owned identities here. Their
 * commercial fields and untyped exts are deliberately not exposed until
 * real ExtField/valueOption resolution is source-matched in the quotation UI.
 */
function materialSkuVariantItem(raw: unknown, expectedSpuIds: ReadonlySet<string>, saleFieldNames: readonly string[]): QuotationMaterialSkuVariantRead {
  const record = asRecord(raw, 'R1 material SKU')
  const id = requiredString(record, ['_id'], 'material SKU identity')
  const spuId = requiredString(record, ['spuid'], 'material SKU parent')
  if (!expectedSpuIds.has(spuId)) throw new AdapterMappingError('material SKU parent does not match the requested SPU')
  if (record.state !== undefined && record.state !== 1 && record.state !== '1') {
    throw new AdapterMappingError('material SKU is not active')
  }
  const specification = optionalString(record, ['spec'])
  const unit = optionalString(record, ['unit'])
  const attrs = optionalRecord(record.exts)
  const projected: Record<string, string> = Object.create(null) as Record<string, string>
  for (const name of saleFieldNames) {
    const rawValue = attrs?.[name]
    const code = typeof rawValue === 'number' && Number.isFinite(rawValue)
      ? String(rawValue)
      : typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : undefined
    if (code) projected[name] = code
  }
  return {
    id, spuId, name: requiredString(record, ['name'], 'material SKU name'),
    ...(specification ? { specification } : {}),
    ...(unit ? { unit } : {}),
    ...(saleFieldNames.length ? { saleAttributeValues: projected } : {}),
  }
}

function materialSkuPage(raw: unknown, ids: readonly string[], saleFieldNames: readonly string[]): ReadPage<QuotationMaterialSkuVariantRead> {
  const allowed = new Set(ids)
  const page = pageEnvelope(raw, row => materialSkuVariantItem(row, allowed, saleFieldNames))
  if (new Set(page.items.map(row => row.id)).size !== page.items.length) {
    throw new AdapterMappingError('duplicate material SKU identity in read')
  }
  return page
}

/** Preserve R1's single-spuid vs in:spuid|array#and request contract.
 * This is a request builder, not evidence of backend SKU authorization.
 */
function materialSkuRequest(context: QuotationCatalogContext, route: 'direct_material' | 'package_materials', spuIds: readonly string[]): ApiReadRequest {
  if (!context || !context.workOrderId || !String(context.workOrderId).trim()
    || typeof context.serviceType !== 'string' || !context.serviceType.trim()) {
    throw new AdapterMappingError('current Work Order catalog identity is required for material SKU read')
  }
  if (!Array.isArray(spuIds) || !spuIds.length || spuIds.length > 30
    || spuIds.some(id => typeof id !== 'string' || !id.trim() || id.trim() !== id || id.includes(','))) {
    throw new AdapterMappingError('material SKU SPU identities are invalid or unbounded')
  }
  if (new Set(spuIds).size !== spuIds.length) throw new AdapterMappingError('duplicate material SPU IDs')
  // R1 getMaterialSKU(spu) uses spuid; R1 getPackageMaterialSKU(list)
  // always uses in:spuid|array#and, including a one-material Package.
  if (!['direct_material', 'package_materials'].includes(route)
    || (route === 'direct_material' && spuIds.length !== 1)) {
    throw new AdapterMappingError('R1 SKU lookup route does not match its source shape')
  }
  return {
    method: 'POST',
    path: 'basic/material/query',
    body: {
      _all: '1',
      'is:state|integer#and': 1,
      ...(route === 'direct_material'
        ? { spuid: spuIds[0] }
        : { 'in:spuid|array#and': spuIds.join(',') }),
    },
  }
}

const R1_MATERIAL_CODE_TENANT = '1340835581184723420'

type R1SaleFieldIdentity = Readonly<Pick<QuotationMaterialSaleFieldRead, 'name' | 'label' | 'valueOption'>>

/** R1 placeOrders.vue:3498-3517; exclude non-sales ExtFields, never surface raw config. */
function materialSaleFieldIdentities(raw: unknown): readonly R1SaleFieldIdentity[] {
  const page = asRecord(raw, 'material sales ExtField response')
  const rows = nestedValue(page, ['data', 'items', 'records'])
  if (!Array.isArray(rows) || rows.length > 200) throw new AdapterMappingError('material sales ExtFields are incomplete or unbounded')
  const fields: R1SaleFieldIdentity[] = []
  const seen = new Set<string>()
  for (const item of rows) {
    const row = asRecord(item, 'material sales ExtField')
    const config = row.frontEndConfig
    let parsed: unknown = config
    if (typeof config === 'string') {
      if (!config.trim()) continue
      try { parsed = JSON.parse(config) as unknown }
      catch { throw new AdapterMappingError('material ExtField frontend configuration is malformed') }
    }
    if (parsed === undefined || parsed === null) continue
    const flags = optionalRecord(parsed)
    if (!flags || (flags.salesAttribute !== undefined && typeof flags.salesAttribute !== 'boolean')) {
      throw new AdapterMappingError('material ExtField sales flag is malformed')
    }
    if (flags.salesAttribute !== true) continue
    if ((row.colName !== undefined && row.colName !== 'material')
      || (row.state !== undefined && row.state !== 1 && row.state !== '1')) {
      throw new AdapterMappingError('material sales ExtField is not active in material domain')
    }
    const name = requiredString(row, ['name'], 'material sales field identity')
    const label = requiredString(row, ['nameDisp'], 'material sales field label')
    const valueOption = requiredString(row, ['valueOption'], 'material sales code option identity')
    if (seen.has(name)) throw new AdapterMappingError('duplicate material sales field identity')
    seen.add(name)
    fields.push({ name, label, valueOption })
    if (fields.length > 30) throw new AdapterMappingError('material sales fields are unbounded')
  }
  return fields
}

/** R1 placeOrders.vue:3531-3550 uses [{eleid,options:{code:label}}].
 * Every requested dictionary must be returned unambiguously; no fabricated options.
 */
function materialSalesCodeOptions(raw: unknown, fields: readonly R1SaleFieldIdentity[]): ReadPage<QuotationMaterialSaleFieldRead> {
  if (!Array.isArray(raw) || raw.length > 30) {
    throw new AdapterMappingError('R1 material code option response is malformed')
  }
  const ids = new Set(fields.map(field => field.valueOption))
  const dictionaries = new Map<string, readonly { value: string; label: string }[]>()
  for (const item of raw) {
    const row = asRecord(item, 'material code dictionary')
    const codeId = requiredString(row, ['eleid'], 'material code dictionary identity')
    if (!ids.has(codeId) || dictionaries.has(codeId)) {
      throw new AdapterMappingError('foreign or duplicate material code dictionary')
    }
    const data = asRecord(row.options, 'material code dictionary options')
    const values = Object.entries(data)
    if (values.length > 100) throw new AdapterMappingError('material code option response is unbounded')
    const options = values.map(([value, rawLabel]) => {
      if (!value.trim() || typeof rawLabel !== 'string' || !rawLabel.trim()) {
        throw new AdapterMappingError('malformed material code option')
      }
      return { value, label: rawLabel.trim() }
    })
    dictionaries.set(codeId, options)
  }
  if (dictionaries.size !== ids.size) {
    throw new AdapterMappingError('material code dictionary result is incomplete')
  }
  return { items: fields.map(field => ({ ...field, options: dictionaries.get(field.valueOption)! })) }
}

function measureItem(raw: unknown): QuotationMeasureRead {
  const record = asRecord(raw, 'quotation measure')
  return {
    ...catalogItemBase(record),
    kind: 'measure',
    ...commercialValues(record, ['guideUnitPrice', 'cost']),
  }
}

function rawLayer(record: AdapterRecord): string | number | undefined {
  const layer = optionalRecord(record.exts)?.layer
  if (layer === undefined || layer === null || layer === '') return undefined
  if (typeof layer === 'string' && layer.trim().length > 0) return layer
  if (typeof layer === 'number' && Number.isFinite(layer)) return layer
  throw new AdapterMappingError('quotation package material layer is malformed')
}

function packageComponentFields(
  raw: unknown,
  referenceKey: 'procedureId' | 'materialId' | 'measureId',
  itemKey: 'procedure' | 'material' | 'measure',
): Omit<QuotationPackageProcedureRead, 'kind' | 'item'> {
  const record = asRecord(raw, 'quotation package component')
  const embedded = optionalRecord(record[itemKey])
  const referenceId = optionalString(record, [referenceKey])
  if (!referenceId && !embedded) {
    throw new AdapterMappingError(`quotation package ${itemKey} reference is missing`)
  }
  const number = optionalString(record, ['number'])
  const coefficient = optionalFiniteNumber(record, 'coefficient')
  const order = optionalNonNegativeInteger(record, ['order'])
  const id = optionalString(record, ['_id'])
  const coefficientUnit = optionalString(record, ['coefficientUnit'])
  const unit = optionalString(record, ['unit'])
  return {
    ...(id ? { id } : {}),
    ...(referenceId ? { referenceId } : {}),
    ...(number === undefined ? {} : { number }),
    ...(coefficient === undefined ? {} : { coefficient }),
    ...(coefficientUnit ? { coefficientUnit } : {}),
    ...(unit ? { unit } : {}),
    ...(order === undefined ? {} : { order }),
  }
}

function packageProcedure(raw: unknown): QuotationPackageProcedureRead {
  const record = asRecord(raw, 'quotation package procedure body')
  const fields = packageComponentFields(record, 'procedureId', 'procedure')
  const embedded = optionalRecord(record.procedure)
  const item = embedded ? procedureItem(embedded) : null
  if (fields.referenceId && item && item.id !== fields.referenceId) {
    throw new AdapterMappingError('quotation package procedure identity does not match its reference')
  }
  return { ...fields, kind: 'procedure', item }
}

function packageMaterial(raw: unknown): QuotationPackageMaterialRead {
  const record = asRecord(raw, 'quotation package material body')
  const fields = packageComponentFields(record, 'materialId', 'material')
  const embedded = optionalRecord(record.material)
  const item = embedded ? materialItem(embedded) : null
  if (fields.referenceId && item && item.id !== fields.referenceId) {
    throw new AdapterMappingError('quotation package material identity does not match its reference')
  }
  const layer = rawLayer(record)
  const exts = optionalRecord(record.exts)
  const price = exts ? optionalFiniteNumber(exts, 'price') : undefined
  return {
    ...fields,
    kind: 'material',
    item,
    ...(layer === undefined ? {} : { layer }),
    ...(price === undefined ? {} : { price }),
  }
}

function packageMeasure(raw: unknown): QuotationPackageDetailRead['measures'][number] {
  const record = asRecord(raw, 'quotation package measure body')
  const fields = packageComponentFields(record, 'measureId', 'measure')
  const embedded = optionalRecord(record.measure)
  const item = embedded ? measureItem(embedded) : null
  if (fields.referenceId && item && item.id !== fields.referenceId) {
    throw new AdapterMappingError('quotation package measure identity does not match its reference')
  }
  return { ...fields, kind: 'measure', item }
}

function packageDetailEntity(raw: unknown): AdapterRecord {
  const envelope = asRecord(raw, 'quotation package detail response')
  const data = optionalRecord(envelope.data)
  const entity = optionalRecord(envelope.entity) ?? optionalRecord(data?.entity)
  if (entity) return entity
  if (data && (Array.isArray(data.procedureList) || Array.isArray(data.materialList) || Array.isArray(data.measureList))) {
    return data
  }
  throw new AdapterMappingError('quotation package detail entity is missing')
}

function packageDetail(raw: unknown, requestedId: string): QuotationPackageDetailRead {
  const entity = packageDetailEntity(raw)
  const item = packageItem(entity)
  if (item.id !== requestedId) throw new AdapterMappingError('quotation package detail identity does not match request')
  const procedureRows = entity.procedureList
  const materialRows = entity.materialList
  const measureRows = entity.measureList
  if (!Array.isArray(procedureRows) || !Array.isArray(materialRows) || !Array.isArray(measureRows)) {
    throw new AdapterMappingError('quotation package detail child lists are incomplete')
  }
  return {
    package: item,
    procedures: procedureRows.map(packageProcedure),
    materials: materialRows.map(packageMaterial),
    measures: measureRows.map(packageMeasure),
  }
}

/** Pinned backend FlipPageInfo reads page/rows and EMongoTemplate applies skip/limit.
 * Never send R1's historical _all=1 to a Production catalog endpoint. */
function listRequest(path: string, context: QuotationCatalogContext, productionReadOnly: boolean, page: number): ApiReadRequest {
  if (!Number.isInteger(page) || page < 1 || page > 50) {
    throw new AdapterMappingError('catalog page exceeds the bounded 1–50 read window')
  }
  if (!context || typeof context.serviceType !== 'string' || !context.serviceType.trim()) {
    throw new AdapterMappingError('work-order catalog context with service type is required')
  }
  if (productionReadOnly
    && (typeof context.sourceType !== 'string' || !context.sourceType.trim())) {
    throw new ApiReadTransportError(
      'Production catalog browsing is blocked because this Work Order has no verified source type. Ask an administrator to configure the Work Order; the catalog request was not sent.',
      'authorization_denied',
    )
  }
  // An explicitly empty sourceType is not the same as an absent property:
  // R1 passes sourceType:this.sourceType and GoodsService checks key presence.
  // Production remains fail-closed above; only non-production can mirror the
  // exact empty string taken from the existing ServiceAppointment.
  if (context.sourceType !== undefined
    && (typeof context.sourceType !== 'string'
      || (context.sourceType !== '' && !context.sourceType.trim()))) {
    throw new AdapterMappingError('quotation catalog source type is malformed')
  }
  return {
    method: 'POST',
    path,
    body: {
      page,
      rows: 20,
      'is:state|integer#and': 1,
      'in:serviceType|array#and': context.serviceType,
      ...(context.sourceType === undefined ? {} : { sourceType: context.sourceType }),
      sortField: 'order,_id',
      sortOrder: 'asc',
    },
  }
}

function readFailure<T>(error: unknown): OperationSnapshot<T> {
  if (error instanceof AdapterMappingError) return adapterFailure('server_terminal', error.message)
  if (error instanceof ApiReadTransportError) return adapterFailure(error.category, error.message)
  return adapterFailure('network_retryable', unknownErrorMessage(error, 'Quotation catalog read failed'))
}

class QuotationCatalogReadAdapter implements QuotationCatalogReadPort {
  private currentReadScope: string | null = null
  private currentCatalogContextKey: string | null = null
  private authorizationContextGeneration = 0
  private readonly listedPackageIds = new Set<string>()

  constructor(
    private readonly transport: ApiReadTransport,
    private readonly getReadAuthorizationScope?: () => QuotationCatalogReadAuthorizationScope | null,
    private readonly codeTenantId?: string,
  ) {}

  private isProductionReadOnly(): boolean {
    return isProductionReadOnlyTarget(import.meta.env.VITE_XLINK_ENVIRONMENT, import.meta.env.VITE_XLINK_API_BASE_URL)
  }

  private synchronizeProductionReadScope(): string | null {
    let identityScope: QuotationCatalogReadAuthorizationScope | null = null
    try {
      identityScope = this.getReadAuthorizationScope?.() ?? null
    } catch {
      identityScope = null
    }
    const nextScope = authorizationIdentityKey(identityScope)
    if (nextScope !== this.currentReadScope) {
      this.currentReadScope = nextScope
      this.authorizationContextGeneration += 1
      this.listedPackageIds.clear()
      this.currentCatalogContextKey = null
    }
    return nextScope
  }

  private synchronizeCatalogContext(context: QuotationCatalogContext): string | null {
    const key = typeof context?.workOrderId === 'string'
      && context.workOrderId.trim().length > 0
      && typeof context.serviceType === 'string'
      && context.serviceType.trim().length > 0
      && (context.sourceType === undefined
        || typeof context.sourceType === 'string' && context.sourceType.trim().length > 0)
      ? JSON.stringify([context.workOrderId, context.serviceType, context.sourceType ?? null])
      : null
    if (key !== this.currentCatalogContextKey) {
      this.currentCatalogContextKey = key
      this.authorizationContextGeneration += 1
      this.listedPackageIds.clear()
    }
    return key
  }

  private async list<T>(
    path: string,
    context: QuotationCatalogContext,
    map: (raw: unknown) => T,
    listedPackages?: (data: T) => readonly QuotationPackageRead[],
    page = 1,
  ): Promise<OperationSnapshot<T>> {
    const productionReadOnly = this.isProductionReadOnly()
    const scopeAtStart = productionReadOnly ? this.synchronizeProductionReadScope() : null
    const catalogContextAtStart = productionReadOnly
      ? this.synchronizeCatalogContext(context)
      : null
    const generationAtStart = productionReadOnly ? this.authorizationContextGeneration : null
    // Validate the R1 request shape first, without I/O. This keeps the
    // established sourceType rejection semantics even for malformed contexts,
    // while the subsequent authorization fence still denies transport.
    let request: ApiReadRequest
    try {
      request = listRequest(path, context, productionReadOnly, page)
    } catch (error) {
      return readFailure<T>(error)
    }
    // Price-bearing catalog rows cannot be trusted after identity revocation or
    // without a WorkOrder-derived serviceType/sourceType context. The raw
    // transport may deny Production catalog routes as well; keep this fence
    // independent so enabling an authorized route cannot bypass it.
    if (productionReadOnly && (!scopeAtStart || !catalogContextAtStart)) {
      return adapterFailure<T>(
        'authorization_denied',
        'Production catalog reads require the current authenticated user/role and a Work Order-scoped catalog context.',
      )
    }
    const result = await this.read(request, map)
    if (!productionReadOnly) return result

    this.synchronizeProductionReadScope()
    if (this.authorizationContextGeneration !== generationAtStart) {
      return adapterFailure('authorization_denied', 'Catalog results were discarded because the authenticated identity or Work Order catalog context changed during the read. Reload the current catalog.')
    }
    if (listedPackages && scopeAtStart && catalogContextAtStart && result.state === 'succeeded' && result.data) {
      for (const item of listedPackages(result.data)) {
        if (this.listedPackageIds.size >= 200) break
        this.listedPackageIds.add(item.id)
      }
    }
    return result
  }

  private async read<T>(
    request: ApiReadRequest | (() => ApiReadRequest),
    map: (raw: unknown) => T,
  ): Promise<OperationSnapshot<T>> {
    try {
      const resolvedRequest = typeof request === 'function' ? request() : request
      return succeeded(map(await this.transport.execute(resolvedRequest)))
    } catch (error) {
      return readFailure<T>(error)
    }
  }

  listPackages(context: QuotationCatalogContext, page = 1) {
    return this.list(
      'biz/projPackage/queryWithRank',
      context,
      (raw) => pageEnvelope(raw, packageItem),
      (result) => result.items,
      page,
    )
  }

  async getPackageDetail(packageId: string) {
    const productionReadOnly = this.isProductionReadOnly()
    const scopeAtStart = productionReadOnly ? this.synchronizeProductionReadScope() : null
    const catalogContextAtStart = productionReadOnly ? this.currentCatalogContextKey : null
    const generationAtStart = productionReadOnly ? this.authorizationContextGeneration : null
    if (productionReadOnly) {
      if (!scopeAtStart || !catalogContextAtStart || !this.listedPackageIds.has(packageId)) {
        return adapterFailure<QuotationPackageDetailRead>(
          'authorization_denied',
          'Production package detail requires a complete current user/role identity and an ID from its successful package list.',
        )
      }
    }
    const result = await this.read(
      () => {
        if (!packageId.trim()) throw new AdapterMappingError('quotation package identity is required')
        return { method: 'POST', path: `biz/projPackage/findById/${encodeURIComponent(packageId)}` }
      },
      (raw) => packageDetail(raw, packageId),
    )
    if (productionReadOnly) this.synchronizeProductionReadScope()
    if (productionReadOnly && this.authorizationContextGeneration !== generationAtStart) {
      return adapterFailure<QuotationPackageDetailRead>(
        'authorization_denied',
        'Package detail was discarded because the authenticated identity or Work Order catalog context changed during the read. Reload it under the current context.',
      )
    }
    return result
  }

  listProcedures(context: QuotationCatalogContext, page = 1) {
    return this.list('biz/procedure/queryWithRank', context, (raw) => pageEnvelope(raw, procedureItem), undefined, page)
  }

  listMaterials(context: QuotationCatalogContext, page = 1) {
    return this.list('basic/material/queryWithRank', context, (raw) => pageEnvelope(raw, materialItem), undefined, page)
  }

  listMeasures(context: QuotationCatalogContext, page = 1) {
    return this.list('biz/measure/queryWithRank', context, (raw) => pageEnvelope(raw, measureItem), undefined, page)
  }

  /** Existing R1 two-step read. Scoped to an authenticated WorkOrder context,
   * exact R1 code tenant and stable current login/role; no SKU or Order writes.
   */
  async listMaterialSalesFields(context: QuotationCatalogContext): Promise<OperationSnapshot<ReadPage<QuotationMaterialSaleFieldRead>>> {
    try {
      if (this.isProductionReadOnly()) {
        throw new ApiReadTransportError('Production material sales option reads are not enabled.', 'authorization_denied')
      }
      if (!context?.workOrderId || !String(context.workOrderId).trim()
        || typeof context.serviceType !== 'string' || !context.serviceType.trim()) {
        throw new AdapterMappingError('current WorkOrder material sales scope is missing')
      }
      // R1 hardcodes this tenant for i/code/selectCode.do; do not silently
      // substitute arbitrary login-tenant IDs when they do not match R1.
      if (this.codeTenantId !== R1_MATERIAL_CODE_TENANT) {
        throw new ApiReadTransportError('R1 material Code tenant does not match the current configured tenant.', 'authorization_denied')
      }
      let firstIdentity: string | null = null
      try { firstIdentity = authorizationIdentityKey(this.getReadAuthorizationScope?.() ?? null) }
      catch { firstIdentity = null }
      if (!firstIdentity) {
        throw new ApiReadTransportError('Current authenticated user and role are required for material sale options.', 'authorization_denied')
      }
      const sameIdentity = (): boolean => {
        try { return authorizationIdentityKey(this.getReadAuthorizationScope?.() ?? null) === firstIdentity }
        catch { return false }
      }
      const fields = materialSaleFieldIdentities(await this.transport.execute({
        method: 'POST', path: 'biz/extField/query',
        body: {
          sortField: 'order', colName: 'material', _all: '1',
          'is:state|integer#and': 1, sortOrder: 'asc',
        },
      }))
      if (!sameIdentity()) throw new ApiReadTransportError('Role changed during material sales field read.', 'authorization_denied')
      if (!fields.length) return succeeded({ items: [] })
      const identifiers = [...new Set(fields.map(field => field.valueOption))]
      const codes = await this.transport.execute({
        method: 'POST', path: 'i/code/selectCode.do',
        body: {
          jsonPara: JSON.stringify(identifiers.map(id => ({ codeId: id, eleid: id }))),
          tenantId: R1_MATERIAL_CODE_TENANT,
        },
      })
      if (!sameIdentity()) throw new ApiReadTransportError('Role changed during material Code options read.', 'authorization_denied')
      return succeeded(materialSalesCodeOptions(codes, fields))
    } catch (error) {
      return readFailure<ReadPage<QuotationMaterialSaleFieldRead>>(error)
    }
  }

  /** R1 read-only SKU identity, intentionally not called from any UI yet.
   * The current Production allowlist does not permit basic/material/query.
   */
  async listMaterialSkuVariants(context: QuotationCatalogContext, route: 'direct_material' | 'package_materials', spuIds: readonly string[], saleFieldNames: readonly string[] = []) {
    // The live app supplies an authenticated actor. Discard a result from any
    // previous role/session instead of showing an old technician's SKU list.
    let scopeAtStart: string | null = null
    if (this.getReadAuthorizationScope) {
      try { scopeAtStart = authorizationIdentityKey(this.getReadAuthorizationScope()) }
      catch { scopeAtStart = null }
      if (!scopeAtStart) {
        return adapterFailure<ReadPage<QuotationMaterialSkuVariantRead>>('authorization_denied', 'A current authenticated role is required for material SKU reads.')
      }
    }
    const result = await this.read(
      () => {
        if (this.isProductionReadOnly()) {
          throw new ApiReadTransportError(
            'Production material SKU reads are not enabled in this review profile.',
            'authorization_denied',
          )
        }
        if (!Array.isArray(saleFieldNames) || saleFieldNames.length > 30
          || saleFieldNames.some(name => typeof name !== 'string' || !name.trim() || name.length > 100
            || ['__proto__', 'constructor', 'prototype'].includes(name))
          || new Set(saleFieldNames).size !== saleFieldNames.length) {
          throw new AdapterMappingError('material sales field names are not a verified bounded list')
        }
        return materialSkuRequest(context, route, spuIds)
      },
      raw => materialSkuPage(raw, spuIds, saleFieldNames),
    )
    if (this.getReadAuthorizationScope) {
      let scopeAfter: string | null = null
      try { scopeAfter = authorizationIdentityKey(this.getReadAuthorizationScope()) }
      catch { scopeAfter = null }
      if (!scopeAfter || scopeAfter !== scopeAtStart) {
        return adapterFailure<ReadPage<QuotationMaterialSkuVariantRead>>(
          'authorization_denied', 'Material SKU result discarded after login or role changed.',
        )
      }
    }
    return result
  }
}

function authorizationIdentityKey(scope: QuotationCatalogReadAuthorizationScope | null): string | null {
  if (!scope
    || typeof scope.sessionRef !== 'string' || !scope.sessionRef.trim()
    || typeof scope.userId !== 'string' || !scope.userId.trim()
    || typeof scope.roleId !== 'string' || !scope.roleId.trim()
    || typeof scope.roleVersion !== 'string' || !scope.roleVersion.trim()) return null
  return JSON.stringify([scope.sessionRef, scope.userId, scope.roleId, scope.roleVersion])
}

export interface QuotationCatalogReadAuthorizationScope {
  readonly sessionRef: string | null
  readonly userId: string | null
  readonly roleId: string | null
  readonly roleVersion: string | null
}

export function createQuotationCatalogReadAdapter(
  transport: ApiReadTransport,
  getReadAuthorizationScope?: () => QuotationCatalogReadAuthorizationScope | null,
  codeTenantId?: string,
): QuotationCatalogReadPort {
  return new QuotationCatalogReadAdapter(transport, getReadAuthorizationScope, codeTenantId)
}
