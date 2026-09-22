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

function commercialValues(record: AdapterRecord) {
  return Object.fromEntries(
    commercialFieldNames.map((field) => [field, optionalFiniteNumber(record, field)]).filter((entry) => entry[1] !== undefined),
  )
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
    ...commercialValues(record),
  }
}

function packageItem(raw: unknown): QuotationPackageRead {
  const record = asRecord(raw, 'quotation package')
  const type = optionalString(record, ['type'])
  const code = optionalString(record, ['code'])
  const ageLimit = optionalNonNegativeInteger(record, ['agelimit'])
  const repairPart = optionalString(record, ['repairPart'])
  return {
    ...catalogItemBase(record),
    kind: 'package',
    ...(type ? { type } : {}),
    ...(code ? { code } : {}),
    ...(ageLimit === undefined ? {} : { ageLimit }),
    ...(repairPart ? { repairPart } : {}),
  }
}

function procedureItem(raw: unknown): QuotationProcedureRead {
  return { ...catalogItemBase(asRecord(raw, 'quotation procedure')), kind: 'procedure' }
}

function materialItem(raw: unknown): QuotationMaterialRead {
  const record = asRecord(raw, 'quotation material')
  const code = optionalString(record, ['code'])
  const materialUnit = optionalString(record, ['materialUnit'])
  const specUnit = optionalString(record, ['specUnit'])
  const type = optionalNonNegativeInteger(record, ['type'])
  return {
    ...catalogItemBase(record),
    kind: 'material',
    ...(code ? { code } : {}),
    ...(materialUnit ? { materialUnit } : {}),
    ...(specUnit ? { specUnit } : {}),
    ...(type === undefined ? {} : { type }),
  }
}

function measureItem(raw: unknown): QuotationMeasureRead {
  return { ...catalogItemBase(asRecord(raw, 'quotation measure')), kind: 'measure' }
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
    ...commercialValues(record),
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
  return {
    ...fields,
    kind: 'material',
    item,
    ...(layer === undefined ? {} : { layer }),
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

function listRequest(path: string, context: QuotationCatalogContext): ApiReadRequest {
  if (!context || typeof context.serviceType !== 'string' || !context.serviceType.trim()) {
    throw new AdapterMappingError('work-order catalog context with service type is required')
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
  constructor(private readonly transport: ApiReadTransport) {}

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
    return this.read(() => listRequest('biz/projPackage/queryWithRank', context), (raw) => pageEnvelope(raw, packageItem))
  }

  getPackageDetail(packageId: string) {
    return this.read(
      () => {
        if (!packageId.trim()) throw new AdapterMappingError('quotation package identity is required')
        return { method: 'POST', path: `biz/projPackage/findById/${encodeURIComponent(packageId)}` }
      },
      (raw) => packageDetail(raw, packageId),
    )
  }

  listProcedures(context: QuotationCatalogContext) {
    return this.read(() => listRequest('biz/procedure/queryWithRank', context), (raw) => pageEnvelope(raw, procedureItem))
  }

  listMaterials(context: QuotationCatalogContext) {
    return this.read(() => listRequest('basic/material/queryWithRank', context), (raw) => pageEnvelope(raw, materialItem))
  }

  listMeasures(context: QuotationCatalogContext) {
    return this.read(() => listRequest('biz/measure/queryWithRank', context), (raw) => pageEnvelope(raw, measureItem))
  }
}

export function createQuotationCatalogReadAdapter(transport: ApiReadTransport): QuotationCatalogReadPort {
  return new QuotationCatalogReadAdapter(transport)
}
