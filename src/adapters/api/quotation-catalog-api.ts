import type {
  QuotationCatalogItemRead,
  QuotationCatalogQuery,
  QuotationCatalogReadPort,
  QuotationPackageComponentRead,
  QuotationPackageDetailRead,
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

function commercialValues(record: AdapterRecord): Partial<QuotationCatalogItemRead> {
  return Object.fromEntries(
    commercialFieldNames.map((field) => [field, optionalFiniteNumber(record, field)]).filter((entry) => entry[1] !== undefined),
  )
}

function catalogItem(raw: unknown): QuotationCatalogItemRead {
  const record = asRecord(raw, 'quotation catalog item')
  const order = optionalNonNegativeInteger(record, ['order'])
  const unit = optionalString(record, ['unit'])
  const specification = optionalString(record, ['spec'])
  const serviceTypes = optionalStringList(record, 'serviceType')
  const sourceTypeList = optionalStringList(record, 'sourceTypeList')
  const description = optionalString(record, ['desc'])
  const content = optionalString(record, ['content'])
  const repairPart = optionalString(record, ['repairPart'])
  return {
    id: requiredString(record, ['_id'], 'catalog item identity'),
    name: requiredString(record, ['name'], 'catalog item name'),
    ...(unit ? { unit } : {}),
    ...(specification ? { specification } : {}),
    ...(serviceTypes ? { serviceTypes } : {}),
    ...(sourceTypeList ? { sourceTypeList } : {}),
    ...(description ? { description } : {}),
    ...(content ? { content } : {}),
    ...(repairPart ? { repairPart } : {}),
    ...(order === undefined ? {} : { order }),
    ...commercialValues(record),
  }
}

function packageComponent(
  raw: unknown,
  referenceKey: 'procedureId' | 'materialId' | 'measureId',
  itemKey: 'procedure' | 'material' | 'measure',
): QuotationPackageComponentRead {
  const record = asRecord(raw, 'quotation package component')
  const embedded = optionalRecord(record[itemKey])
  const referenceId = optionalString(record, [referenceKey])
  const embeddedItem = embedded ? catalogItem(embedded) : null
  if (!referenceId && !embeddedItem) {
    throw new AdapterMappingError(`quotation package ${itemKey} reference is missing`)
  }
  if (referenceId && embeddedItem && embeddedItem.id !== referenceId) {
    throw new AdapterMappingError(`quotation package ${itemKey} identity does not match its reference`)
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
    item: embeddedItem,
    ...(number === undefined ? {} : { number }),
    ...(coefficient === undefined ? {} : { coefficient }),
    ...(coefficientUnit ? { coefficientUnit } : {}),
    ...(unit ? { unit } : {}),
    ...(order === undefined ? {} : { order }),
    ...commercialValues(record),
  }
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
  const item = catalogItem(entity)
  if (item.id !== requestedId) throw new AdapterMappingError('quotation package detail identity does not match request')
  const procedureRows = entity.procedureList
  const materialRows = entity.materialList
  const measureRows = entity.measureList
  if (!Array.isArray(procedureRows) || !Array.isArray(materialRows) || !Array.isArray(measureRows)) {
    throw new AdapterMappingError('quotation package detail child lists are incomplete')
  }
  return {
    package: item,
    procedures: procedureRows.map((row) => packageComponent(row, 'procedureId', 'procedure')),
    materials: materialRows.map((row) => packageComponent(row, 'materialId', 'material')),
    measures: measureRows.map((row) => packageComponent(row, 'measureId', 'measure')),
  }
}

function listRequest(path: string, query: QuotationCatalogQuery): ApiReadRequest {
  if (!query.serviceType.trim()) throw new AdapterMappingError('quotation catalog service type is required')
  if (query.sourceType !== undefined && !query.sourceType.trim()) {
    throw new AdapterMappingError('quotation catalog source type must be omitted when unavailable')
  }
  return {
    method: 'POST',
    path,
    body: {
      _all: '1',
      'is:state|integer#and': 1,
      'in:serviceType|array#and': query.serviceType,
      ...(query.sourceType === undefined ? {} : { sourceType: query.sourceType }),
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

  listPackages(query: QuotationCatalogQuery) {
    return this.read(() => listRequest('biz/projPackage/queryWithRank', query), (raw) => pageEnvelope(raw, catalogItem))
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

  listProcedures(query: QuotationCatalogQuery) {
    return this.read(() => listRequest('biz/procedure/queryWithRank', query), (raw) => pageEnvelope(raw, catalogItem))
  }

  listMaterials(query: QuotationCatalogQuery) {
    return this.read(() => listRequest('basic/material/queryWithRank', query), (raw) => pageEnvelope(raw, catalogItem))
  }

  listMeasures(query: QuotationCatalogQuery) {
    return this.read(() => listRequest('biz/measure/queryWithRank', query), (raw) => pageEnvelope(raw, catalogItem))
  }
}

export function createQuotationCatalogReadAdapter(transport: ApiReadTransport): QuotationCatalogReadPort {
  return new QuotationCatalogReadAdapter(transport)
}
