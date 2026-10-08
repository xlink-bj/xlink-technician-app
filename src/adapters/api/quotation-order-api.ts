import type {
  QuotationOrderBrowseGroup,
  QuotationOrderBrowseIdentity,
  QuotationOrderBrowseItem,
  QuotationOrderBrowseKind,
  QuotationOrderBrowseLine,
  QuotationOrderRead,
  QuotationOrderReadPort,
  ReadPage,
} from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'

import { AdapterMappingError, adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'
import { asRecord, optionalNonNegativeInteger, optionalRecord, optionalString, requiredString, type AdapterRecord } from '../common/records'
import { ApiReadTransportError, type ApiReadTransport } from './technician-api'

function quotationOrderRecord(raw: unknown): QuotationOrderRead {
  const envelope = asRecord(raw, 'quotation order read')
  const record = optionalRecord(envelope.data) ?? envelope
  const parseObject = (value: unknown): AdapterRecord | undefined => {
    if (typeof value === 'string') {
      try { return optionalRecord(JSON.parse(value)) } catch { return undefined }
    }
    return optionalRecord(value)
  }
  const id = requiredString(record, ['_id', 'id'], 'quotation order id')
  const type = optionalNonNegativeInteger(record, ['type'])
  const serviceAppointmentId = optionalString(record, ['serviceAppointmentId'])
  const bjProducts = parseObject(record.bjProducts)
  const exts = optionalRecord(record.exts)
  if (type === undefined || !serviceAppointmentId || !bjProducts || !Array.isArray(bjProducts.orderList)) {
    throw new AdapterMappingError('quotation order read model is incomplete')
  }
  const numeric = (key: string): number | undefined => {
    const value = record[key]
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
  }
  const stringList = Array.isArray(record.qiniuList)
    ? record.qiniuList.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : undefined
  const snapshotKeys = [
    '_id', '_version', 'type', 'serviceAppointmentId', 'serviceAppointmentNum', 'workflowId', 'workflowNodeId', 'extId',
    'etags', 'isSettle', 'externalSid', 'state', 'createTime', 'updateTime', 'createUser', 'updateUser',
    'createUserName', 'updateUserName', 'orgId', 'orgName', 'optId', 'optName', 'tenantId', 'belongTo',
    'payIds', 'productIds', 'bjProducts', 'totalPrice', 'paidAmount', 'originPrice', 'ownerId', 'ownerName',
    'ownerPhone', 'payState', 'description', 'orderNumber', 'contractId', 'contractNum', 'discount', 'otherAmount',
    'preferentialAmount', 'documentId', 'productsDetail', 'materialDetail', 'processState', 'depositRatio',
    'depositFixed', 'refundStatus', 'refundMoney', 'cosStartDate', 'cosEndDate', 'cosPlanDays', 'cosOptDays',
    'cosPlanTotal', 'cosOptTotal', 'cosTotalGap', 'cosOrderPlanGap', 'cosOrderOptGap', 'qiniuList', 'warrantyUrl', 'exts',
    'unlockPayState', 'unlockPayStateTime', 'unlockPayRuleId', 'unlockPayRuleGroovyScript',
    'settlePayState', 'settlePayStateTime', 'settledCardinal', 'settledCandidate',
  ]
  const replaceSnapshot = Object.fromEntries(snapshotKeys
    .filter((key) => Object.prototype.hasOwnProperty.call(record, key))
    .map((key) => [key, record[key]]))
  return {
    id,
    type,
    serviceAppointmentId,
    ...(optionalNonNegativeInteger(record, ['state']) !== undefined ? { state: optionalNonNegativeInteger(record, ['state']) } : {}),
    ...(optionalNonNegativeInteger(record, ['processState']) !== undefined ? { processState: optionalNonNegativeInteger(record, ['processState']) } : {}),
    ...(optionalString(record, ['workflowId']) ? { workflowId: optionalString(record, ['workflowId']) } : {}),
    ...(optionalString(record, ['ownerName']) ? { ownerName: optionalString(record, ['ownerName']) } : {}),
    ...(optionalString(record, ['description']) ? { description: optionalString(record, ['description']) } : {}),
    ...(numeric('originPrice') !== undefined ? { originPrice: numeric('originPrice') } : {}),
    ...(numeric('totalPrice') !== undefined ? { totalPrice: numeric('totalPrice') } : {}),
    ...(numeric('preferentialAmount') !== undefined
      ? { preferentialAmount: numeric('preferentialAmount') }
      : typeof bjProducts.preferentialAmount === 'number' && Number.isFinite(bjProducts.preferentialAmount)
        ? { preferentialAmount: bjProducts.preferentialAmount }
        : {}),
    ...(typeof record.discount === 'number' && Number.isFinite(record.discount) ? { discount: record.discount } : {}),
    ...(optionalString(record, ['coupons']) ?? optionalString(exts ?? {}, ['coupons'])
      ? { coupons: optionalString(record, ['coupons']) ?? optionalString(exts ?? {}, ['coupons']) }
      : {}),
    ...(stringList ? { qiniuList: stringList } : {}),
    bjProducts,
    replaceSnapshot,
    ...(optionalString(record, ['updateTime']) ? { updateTime: optionalString(record, ['updateTime']) } : {}),
  }
}

function browseAmount(record: AdapterRecord, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed >= 0) return parsed
    }
  }
  return undefined
}

function stringIdentity(record: AdapterRecord, keys: readonly string[]): string | undefined {
  return optionalString(record, keys)
}

function browseIdentity(
  row: AdapterRecord,
  kind: QuotationOrderBrowseKind,
  embedded?: AdapterRecord,
): QuotationOrderBrowseIdentity {
  const referenceKey = kind === 'package' ? undefined
    : kind === 'procedure' ? 'procedureId'
      : kind === 'material' ? 'materialId' : 'measureId'
  const nestedExts = optionalRecord(embedded?.exts)
  const exts = optionalRecord(row.exts)
  return {
    ...(stringIdentity(row, ['_id']) ? { providerRowId: stringIdentity(row, ['_id']) } : {}),
    ...(referenceKey && stringIdentity(row, [referenceKey]) ? { providerReferenceId: stringIdentity(row, [referenceKey]) } : {}),
    ...(stringIdentity(embedded ?? {}, ['spuid', 'spuId']) || stringIdentity(row, ['spuid', 'spuId'])
      ? { spuId: stringIdentity(embedded ?? {}, ['spuid', 'spuId']) || stringIdentity(row, ['spuid', 'spuId']) }
      : {}),
    ...(stringIdentity(embedded ?? {}, ['skuId']) || stringIdentity(row, ['skuId'])
      ? { skuId: stringIdentity(embedded ?? {}, ['skuId']) || stringIdentity(row, ['skuId']) }
      : {}),
    ...(stringIdentity(embedded ?? {}, ['spuCode']) || stringIdentity(nestedExts ?? {}, ['spuCode']) || stringIdentity(exts ?? {}, ['spuCode'])
      ? { spuCode: stringIdentity(embedded ?? {}, ['spuCode']) || stringIdentity(nestedExts ?? {}, ['spuCode']) || stringIdentity(exts ?? {}, ['spuCode']) }
      : {}),
    ...(stringIdentity(embedded ?? {}, ['skuCode']) || stringIdentity(nestedExts ?? {}, ['skuCode']) || stringIdentity(exts ?? {}, ['skuCode'])
      ? { skuCode: stringIdentity(embedded ?? {}, ['skuCode']) || stringIdentity(nestedExts ?? {}, ['skuCode']) || stringIdentity(exts ?? {}, ['skuCode']) }
      : {}),
  }
}

function categoryRows(value: unknown): readonly AdapterRecord[] | null {
  if (Array.isArray(value)) {
    const rows = value.map(optionalRecord)
    return rows.every(Boolean) ? rows as AdapterRecord[] : null
  }
  const category = optionalRecord(value)
  if (!category || !Array.isArray(category.data)) return null
  const rows = category.data.map(optionalRecord)
  return rows.every(Boolean) ? rows as AdapterRecord[] : null
}

function browseLine(
  row: AdapterRecord,
  kind: QuotationOrderBrowseKind,
  nestedKind?: QuotationOrderBrowseKind,
): QuotationOrderBrowseLine {
  const nested = nestedKind ? optionalRecord(row[nestedKind]) : undefined
  const display = nested ?? row
  const label = optionalString(display, ['name', 'content', 'label'])
    ?? optionalString(row, ['name', 'content', 'label'])
  const quantity = browseAmount(row, ['number', 'quantity'])
  const amount = browseAmount(row, ['totalAmount', 'amount', 'price'])
  let children: QuotationOrderBrowseLine[] = []
  let contentSupported = Boolean(label)

  if (kind === 'package') {
    const childKinds: readonly QuotationOrderBrowseKind[] = ['procedure', 'material', 'measure']
    for (const childKind of childKinds) {
      const source = row[childKind === 'procedure' ? 'procedureList' : childKind === 'material' ? 'materialList' : 'measureList']
      if (source === undefined || source === null) {
        contentSupported = false
        continue
      }
      if (!Array.isArray(source)) {
        contentSupported = false
        continue
      }
      const childRows = source.map(optionalRecord)
      if (childRows.some((child) => child === undefined)) {
        contentSupported = false
        continue
      }
      children.push(...(childRows as AdapterRecord[]).map((child) => browseLine(child, childKind, childKind)))
    }
  }

  return {
    kind,
    label: label ?? '项目内容暂不可识别',
    ...(quantity === undefined ? {} : { quantity }),
    ...(optionalString(display, ['unit']) || optionalString(row, ['unit'])
      ? { unit: optionalString(display, ['unit']) || optionalString(row, ['unit']) }
      : {}),
    ...(amount === undefined ? {} : { amount }),
    identity: browseIdentity(row, kind, nested),
    children,
    contentSupported,
  }
}

function browseGroup(raw: unknown): QuotationOrderBrowseGroup {
  const group = asRecord(raw, 'quotation order browse group')
  const repairParts = Array.isArray(group.repairParts)
    ? group.repairParts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    : []
  const lines: QuotationOrderBrowseLine[] = []
  let contentSupported = repairParts.length > 0
  const categories: readonly [QuotationOrderBrowseKind, string][] = [
    ['package', 'projPackages'],
    ['procedure', 'procedures'],
    ['material', 'materials'],
    ['measure', 'measures'],
  ]
  for (const [kind, key] of categories) {
    const rows = categoryRows(group[key])
    if (!rows) {
      contentSupported = false
      continue
    }
    const embeddedKind = kind === 'package' ? undefined : kind
    const mapped = rows.map((row) => browseLine(row, kind, embeddedKind))
    lines.push(...mapped)
    if (mapped.some((line) => !line.contentSupported)) contentSupported = false
  }
  const area = group.maintainAreaNum
  return {
    repairParts,
    ...(optionalString(group, ['partDescription']) ? { partDescription: optionalString(group, ['partDescription']) } : {}),
    ...(area === undefined || area === null ? {} : { maintainAreaNum: String(area) }),
    ...(browseAmount(group, ['totalAmount']) === undefined ? {} : { totalAmount: browseAmount(group, ['totalAmount']) }),
    lines,
    contentSupported,
  }
}

function quotationOrderBrowseItem(raw: unknown): QuotationOrderBrowseItem {
  const record = asRecord(raw, 'quotation order browse item')
  const type = optionalNonNegativeInteger(record, ['type'])
  if (type !== 1) throw new AdapterMappingError('Work Order-scoped Order list returned a non-type-1 record')
  const id = requiredString(record, ['_id', 'id'], 'quotation order identity')
  const serviceAppointmentId = requiredString(record, ['serviceAppointmentId'], 'quotation work-order identity')
  const productsValue = record.bjProducts
  let products: AdapterRecord | undefined
  if (typeof productsValue === 'string') {
    try { products = optionalRecord(JSON.parse(productsValue)) } catch { products = undefined }
  } else {
    products = optionalRecord(productsValue)
  }
  const rawGroups = products?.orderList
  const groups = Array.isArray(rawGroups) ? rawGroups.map(browseGroup) : []
  const exts = optionalRecord(record.exts)
  const pdfValue = typeof exts?.bjdPDFurl === 'string' ? exts.bjdPDFurl.trim() : ''
  return {
    id,
    type: 1,
    serviceAppointmentId,
    ...(optionalString(record, ['orderNumber']) ? { displayNumber: optionalString(record, ['orderNumber']) } : {}),
    ...(optionalNonNegativeInteger(record, ['state']) !== undefined ? { state: optionalNonNegativeInteger(record, ['state']) } : {}),
    ...(optionalNonNegativeInteger(record, ['processState']) !== undefined ? { processState: optionalNonNegativeInteger(record, ['processState']) } : {}),
    ...(optionalString(record, ['updateTime']) ? { updateTime: optionalString(record, ['updateTime']) } : {}),
    ...(browseAmount(record, ['originPrice']) === undefined ? {} : { originPrice: browseAmount(record, ['originPrice']) }),
    ...(browseAmount(record, ['totalPrice']) === undefined ? {} : { totalPrice: browseAmount(record, ['totalPrice']) }),
    groups,
    contentSupported: Array.isArray(rawGroups) && groups.length > 0 && groups.every((group) => group.contentSupported),
    pdfState: pdfValue ? 'present_no_access' : 'absent',
  }
}

function quotationOrderBrowsePage(raw: unknown): ReadPage<QuotationOrderBrowseItem> {
  const envelope = asRecord(raw, 'Work Order-scoped Order list response')
  const data = optionalRecord(envelope.data)
  const candidateItems = [envelope.data, envelope.items, envelope.records, data?.items, data?.records, data?.data]
  const items = candidateItems.find(Array.isArray)
  if (!Array.isArray(items)) throw new AdapterMappingError('Work Order-scoped Order list rows are missing')
  if (items.length > 3) throw new AdapterMappingError('Work Order-scoped Order list exceeded its bounded page size')
  return {
    items: items.map(quotationOrderBrowseItem),
    page: optionalNonNegativeInteger(data ?? envelope, ['page']),
    pageSize: optionalNonNegativeInteger(data ?? envelope, ['rows', 'pageSize']),
    totalCount: optionalNonNegativeInteger(data ?? envelope, ['total', 'dataCount', 'totalCount']),
  }
}

function readFailure<T>(error: unknown): OperationSnapshot<T> {
  if (error instanceof AdapterMappingError) return adapterFailure('server_terminal', error.message)
  if (error instanceof ApiReadTransportError) return adapterFailure(error.category, error.message)
  return adapterFailure('network_retryable', unknownErrorMessage(error, 'Quotation Order read transport failed'))
}

export class QuotationOrderReadAdapter implements QuotationOrderReadPort {
  constructor(private readonly transport: ApiReadTransport) {}

  async getQuotationOrderById(id: string): Promise<OperationSnapshot<QuotationOrderRead>> {
    if (!id.trim()) return adapterFailure('validation', 'quotation order id is required')
    try {
      const raw = await this.transport.execute({ method: 'POST', path: 'basic/order/queryById', body: { id } })
      return succeeded(quotationOrderRecord(raw))
    } catch (error) {
      return readFailure(error)
    }
  }

  async listTypeOneOrdersForWorkOrder(
    workOrderId: string,
    pageSize: 1 | 3 = 3,
  ): Promise<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>> {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(workOrderId)) {
      return adapterFailure('validation', 'a listed Work Order identity is required to read its quotations')
    }
    try {
      const raw = await this.transport.execute({
        method: 'POST',
        path: 'basic/order/query',
        body: {
          _all: '1',
          page: 1,
          rows: pageSize,
          sortField: 'createTime',
          sortOrder: 'desc',
          'is:serviceAppointmentId|string#and': workOrderId,
          'is:type|integer#and': 1,
        },
      })
      return succeeded(quotationOrderBrowsePage(raw))
    } catch (error) {
      return readFailure(error)
    }
  }
}

export function createQuotationOrderReadAdapter(transport: ApiReadTransport): QuotationOrderReadPort {
  return new QuotationOrderReadAdapter(transport)
}
