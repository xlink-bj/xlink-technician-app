import type {
  QuotationCatalogContext,
  QuotationCatalogItemBaseRead,
  QuotationCatalogReadPort,
  QuotationMaterialRead,
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
  }
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

function listRequest(path: string, context: QuotationCatalogContext, productionReadOnly: boolean): ApiReadRequest {
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
  if (context.sourceType !== undefined && (typeof context.sourceType !== 'string' || !context.sourceType.trim())) {
    throw new AdapterMappingError('quotation catalog source type must be omitted when unavailable')
  }
  return {
    method: 'POST',
    path,
    body: {
      _all: '1',
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
  ): Promise<OperationSnapshot<T>> {
    const productionReadOnly = this.isProductionReadOnly()
    const scopeAtStart = productionReadOnly ? this.synchronizeProductionReadScope() : null
    const catalogContextAtStart = productionReadOnly
      ? this.synchronizeCatalogContext(context)
      : null
    const generationAtStart = productionReadOnly ? this.authorizationContextGeneration : null
    const result = await this.read(() => listRequest(path, context, productionReadOnly), map)
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

  listPackages(context: QuotationCatalogContext) {
    return this.list(
      'biz/projPackage/queryWithRank',
      context,
      (raw) => pageEnvelope(raw, packageItem),
      (page) => page.items,
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

  listProcedures(context: QuotationCatalogContext) {
    return this.list('biz/procedure/queryWithRank', context, (raw) => pageEnvelope(raw, procedureItem))
  }

  listMaterials(context: QuotationCatalogContext) {
    return this.list('basic/material/queryWithRank', context, (raw) => pageEnvelope(raw, materialItem))
  }

  listMeasures(context: QuotationCatalogContext) {
    return this.list('biz/measure/queryWithRank', context, (raw) => pageEnvelope(raw, measureItem))
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
): QuotationCatalogReadPort {
  return new QuotationCatalogReadAdapter(transport, getReadAuthorizationScope)
}
