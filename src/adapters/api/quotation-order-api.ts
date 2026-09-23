import type { QuotationOrderRead, QuotationOrderReadPort } from '@shared/ports'
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
}

export function createQuotationOrderReadAdapter(transport: ApiReadTransport): QuotationOrderReadPort {
  return new QuotationOrderReadAdapter(transport)
}
