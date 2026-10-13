import type {
  QuotationOrderBrowseGroup,
  QuotationOrderBrowseIdentity,
  QuotationOrderBrowseItem,
  QuotationOrderBrowseKind,
  QuotationOrderBrowseLine,
  QuotationOrderRead,
  QuotationOrderReadPort,
  ScopedSigningOrderReviewRead,
  R1ScopedContractRead,
  R1ScopedContractSummary,
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

function quotationOrderBrowsePage(raw: unknown, requestedWorkOrderId: string, requestedPageSize: 1 | 3): ReadPage<QuotationOrderBrowseItem> {
  const envelope = asRecord(raw, 'Work Order-scoped Order list response')
  const data = optionalRecord(envelope.data)
  const candidateItems = [envelope.data, envelope.items, envelope.records, data?.items, data?.records, data?.data]
  const items = candidateItems.find(Array.isArray)
  if (!Array.isArray(items)) throw new AdapterMappingError('Work Order-scoped Order list rows are missing')
  if (items.length > requestedPageSize) throw new AdapterMappingError('Work Order-scoped Order list exceeded the requested bounded page size')
  const mappedItems = items.map(quotationOrderBrowseItem)
  if (mappedItems.some((item) => item.serviceAppointmentId !== requestedWorkOrderId)) {
    throw new AdapterMappingError('Work-Order-scoped Order list returned a record with mismatched ownership')
  }
  const ids = mappedItems.map((item) => item.id)
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
    throw new AdapterMappingError('Work-Order-scoped Order list returned duplicate or empty Order IDs')
  }
  return {
    items: mappedItems,
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
  constructor(
    private readonly transport: ApiReadTransport,
    private readonly isWorkOrderListedForCurrentSession: (id: string) => boolean = () => false,
    // Absent unless a future authorized caller supplies a current authenticated
    // session/user/roleVersion fingerprint. Never enable from a static fixture.
    private readonly getCurrentAuthorizationIdentity: () => string | null = () => null,
    /** Never infer Contract read authorization from environment != prod. */
    private readonly allowSyntheticContractRead: (workOrderId: string) => boolean = () => false,
  ) {}

  async getQuotationOrderById(id: string): Promise<OperationSnapshot<QuotationOrderRead>> {
    if (!id.trim()) return adapterFailure('validation', 'quotation order id is required')
    try {
      const raw = await this.transport.execute({ method: 'POST', path: 'basic/order/queryById', body: { id } })
      return succeeded(quotationOrderRecord(raw))
    } catch (error) {
      return readFailure(error)
    }
  }

  private scopedReviewIdentity(): string | null {
    try {
      const identity = this.getCurrentAuthorizationIdentity()
      return typeof identity === 'string' && identity.trim() === identity && identity.length > 0
        ? identity : null
    } catch {
      return null
    }
  }

  /**
   * Signing PRECHECK read: deliberately re-reads only the previously audited
   * bounded, WorkOrder-scoped type=1 list. Never invoke queryById here:
   * queryById's server-side per-Order authorization has NOT been established.
   *
   * It can confirm a selected official Order for this session/role, but it
   * proves no Contract access, PDF visibility or signing authority.
   */
  async readScopedTypeOneOrderForSigningReview(
    workOrderId: string,
    orderId: string,
  ): Promise<OperationSnapshot<ScopedSigningOrderReviewRead>> {
    const valid = /^[A-Za-z0-9_-]{1,100}$/
    if (!valid.test(workOrderId) || !valid.test(orderId)) {
      return adapterFailure('validation', '当前工单和正式订单身份不完整。')
    }
    const identity = this.scopedReviewIdentity()
    if (!identity || !this.isAuthorizedForCurrentSession(workOrderId)) {
      return adapterFailure('authorization_denied', '当前工单尚未获得签约订单只读准入。')
    }
    try {
      // Reuse a reviewed list endpoint rather than introducing a broader
      // lookup. Absence from the top three is "cannot verify", NOT no Order.
      const reread = await this.listTypeOneOrdersForWorkOrder(workOrderId, 3)
      if (identity !== this.scopedReviewIdentity() || !this.isAuthorizedForCurrentSession(workOrderId)) {
        return adapterFailure('authorization_denied', '读取期间账号或工单权限已变化。')
      }
      if (reread.state !== 'succeeded' || !reread.data) {
        return adapterFailure(
          reread.state === 'failed_retryable' ? 'network_retryable' : 'server_terminal',
          '当前工单的正式订单二次核验暂不可用。',
        )
      }
      const orders = reread.data.items
      // listTypeOneOrdersForWorkOrder verifies every row's type, ownership,
      // size and unique identity; independently bound the chosen Order.
      const matching = orders.filter(item =>
        item.id === orderId && item.serviceAppointmentId === workOrderId && item.type === 1,
      )
      if (matching.length !== 1) {
        return adapterFailure('authorization_denied', '本次有限订单列表无法确认目标订单归属。')
      }
      return succeeded({
        order: matching[0]!,
        contractReadAuthorized: false,
        signingAuthorized: false,
      })
    } catch {
      // Never return response bodies, personal fields or exception messages.
      if (identity !== this.scopedReviewIdentity() || !this.isAuthorizedForCurrentSession(workOrderId)) {
        return adapterFailure('authorization_denied', '读取期间账号或工单权限已变化。')
      }
      return adapterFailure('network_retryable', '正式订单只读服务暂不可用。')
    }
  }

  /**
   * Source-accurate R1 Contract query; this does NOT expand Production's
   * transport allowlist. The pinned R1 query uses workOrderId while its
   * backend Contract model stores serviceAppointmentId. Zero results are
   * therefore INCONCLUSIVE, never "no Contract".
   */
  async listR1ContractsForSigningReview(
    workOrderId: string, orderId: string,
  ): Promise<OperationSnapshot<R1ScopedContractRead>> {
    const validId = /^[A-Za-z0-9_-]{1,100}$/
    if (!validId.test(workOrderId) || !validId.test(orderId)) {
      return adapterFailure('authorization_denied', '合同只读身份无效。')
    }
    if (!this.allowSyntheticContractRead(workOrderId)) {
      return adapterFailure('unsupported_capability', '真实环境合同读取未获验收，不执行请求。')
    }
    const identity = this.scopedReviewIdentity()
    if (!identity || !this.isAuthorizedForCurrentSession(workOrderId)) {
      return adapterFailure('authorization_denied', '合同只读尚未获得当前角色工单准入。')
    }
    try {
      // An authoritative, already-listed type=1 Order must be selected first.
      const orders = await this.listTypeOneOrdersForWorkOrder(workOrderId, 3)
      if (this.scopedReviewIdentity() !== identity || !this.isAuthorizedForCurrentSession(workOrderId)) {
        return adapterFailure('authorization_denied', '身份或工单授权已变化。')
      }
      if (orders.state !== 'succeeded' || !orders.data) {
        return adapterFailure(
          orders.state === 'failed_retryable' ? 'network_retryable' : 'server_terminal',
          '无法核验正式订单。',
        )
      }
      if (orders.data.items.filter(item =>
        item.type === 1 && item.id === orderId && item.serviceAppointmentId === workOrderId
      ).length !== 1) {
        return adapterFailure('authorization_denied', '目标正式订单不属于已验证列表。')
      }
      // Exactly R1's field/filter/sort semantics, adding only a page bound.
      // In particular do NOT silently substitute serviceAppointmentId here.
      const raw = await this.transport.execute({
        method: 'POST', path: 'basic/contract/query.do',
        body: {
          _all: '1', page: 1, rows: 3,
          'is:workOrderId|string#and': workOrderId,
          'in:state|array-integer#and': '1',
          sortField: 'updateTime', sortOrder: 'asc',
        },
      })
      if (this.scopedReviewIdentity() !== identity || !this.isAuthorizedForCurrentSession(workOrderId)) {
        return adapterFailure('authorization_denied', '合同读取期间身份或工单权限已变化。')
      }
      const envelope = asRecord(raw, 'R1 Contract list')
      const data = optionalRecord(envelope.data)
      const rawRows = [envelope.data, envelope.items, data?.items, data?.records, data?.data]
        .find(Array.isArray)
      if (!Array.isArray(rawRows) || rawRows.length > 3) {
        return adapterFailure('server_terminal', '合同列表格式或数量超出本次只读范围。')
      }
      const seen = new Set<string>()
      const summaries: R1ScopedContractSummary[] = []
      for (const item of rawRows) {
        const row = optionalRecord(item)
        if (!row) return adapterFailure('server_terminal', '合同响应包含无效记录。')
        const id = optionalString(row, ['_id', 'id'])
        const owningWorkOrder = optionalString(row, ['serviceAppointmentId'])
        const owningOrder = optionalString(row, ['orderId'])
        if (!id || !validId.test(id) || seen.has(id) || !owningWorkOrder
          || !owningOrder || owningWorkOrder !== workOrderId) {
          return adapterFailure('server_terminal', '合同身份或工单归属无法核验。')
        }
        seen.add(id)
        // R1 lists Contracts for the WorkOrder, which may belong to other
        // Orders. Only project metadata attached to the exact selected Order.
        if (owningOrder !== orderId) continue
        const exts = optionalRecord(row.exts)
        const rawStatus = optionalString(exts ?? {}, ['contractStatus'])
        const status = rawStatus && /^-?\d{1,3}$/.test(rawStatus) ? rawStatus : undefined
        const signedDate = optionalString(row, ['signedDate'])
        const state = optionalNonNegativeInteger(row, ['state'])
        summaries.push({
          id, orderId, serviceAppointmentId: workOrderId,
          ...(optionalString(row, ['contractdocNum']) ? { displayNumber: optionalString(row, ['contractdocNum']) } : {}),
          ...(status ? { contractStatus: status } : {}),
          ...(state === undefined ? {} : { state }),
          ...(signedDate ? { signedDate } : {}),
        })
      }
      return succeeded({ items: summaries, completeness: 'bounded_unverified' })
    } catch {
      if (this.scopedReviewIdentity() !== identity || !this.isAuthorizedForCurrentSession(workOrderId)) {
        return adapterFailure('authorization_denied', '合同读取期间权限已变化。')
      }
      return adapterFailure('network_retryable', 'R1 合同只读请求暂不可用或未开放。')
    }
  }

  private isAuthorizedForCurrentSession(workOrderId: string): boolean {
    try {
      return this.isWorkOrderListedForCurrentSession(workOrderId)
    } catch {
      // Authorization sources are fail-closed; exceptions must never reach or escape the read path.
      return false
    }
  }

  async listTypeOneOrdersForWorkOrder(
    workOrderId: string,
    pageSize: 1 | 3 = 3,
  ): Promise<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>> {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(workOrderId) || (pageSize !== 1 && pageSize !== 3)) {
      return adapterFailure('validation', 'a listed Work Order identity is required to read its quotations')
    }
    if (!this.isAuthorizedForCurrentSession(workOrderId)) {
      return adapterFailure('authorization_denied', 'Work Order quotation reads require an ID listed in the current session')
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
      if (!this.isAuthorizedForCurrentSession(workOrderId)) {
        return adapterFailure('authorization_denied', 'Work Order session changed during quotation read')
      }
      return succeeded(quotationOrderBrowsePage(raw, workOrderId, pageSize))
    } catch (error) {
      return readFailure(error)
    }
  }
}

export function createQuotationOrderReadAdapter(
  transport: ApiReadTransport,
  isWorkOrderListedForCurrentSession?: (id: string) => boolean,
  getCurrentAuthorizationIdentity?: () => string | null,
  allowSyntheticContractRead?: (workOrderId: string) => boolean,
): QuotationOrderReadPort {
  return new QuotationOrderReadAdapter(transport, isWorkOrderListedForCurrentSession, getCurrentAuthorizationIdentity, allowSyntheticContractRead)
}
