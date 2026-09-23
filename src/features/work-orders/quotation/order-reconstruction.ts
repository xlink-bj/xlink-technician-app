import type { QuotationOrderRead } from '@shared/ports'
import type { QuotationDraft, QuotationGroup, QuotationSelection, QuotationPackageSelection } from './model'

export type QuotationOrderReconstruction =
  | { readonly state: 'ready'; readonly draft: QuotationDraft }
  | { readonly state: 'blocked'; readonly reason: string }

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function rows(value: unknown): readonly Record<string, unknown>[] | null {
  const root = record(value)
  if (!root || !Array.isArray(root.data)) return null
  const values = root.data.map(record)
  return values.every(Boolean) ? values as Record<string, unknown>[] : null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function quantity(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function packageComponents(value: unknown, kind: 'procedure' | 'material' | 'measure'): readonly Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null
  const result = value.map(record)
  if (!result.every(Boolean)) return null
  if (kind === 'material') {
    const seenLayers = new Set<string>()
    for (const item of result as Record<string, unknown>[]) {
      const media = record(item.material)
      const exts = record(item.exts)
      const catalogId = text(item.materialId) ?? text(media?._id)
      const rowId = text(item._id)
      const layer = exts?.layer
      const validLayer = typeof layer === 'string' && layer.trim().length > 0 || typeof layer === 'number' && Number.isFinite(layer)
      if (!catalogId || !rowId || item.checked !== true || !validLayer) return null
      const key = JSON.stringify([typeof layer, layer])
      if (seenLayers.has(key)) return null
      seenLayers.add(key)
    }
  }
  return result as Record<string, unknown>[]
}

function componentsFor(
  rawValue: unknown,
  kind: 'procedure' | 'material' | 'measure',
): readonly { providerComponentId: string; providerReferenceId?: string; catalogId: string; label: string; unit?: string; layer?: string | number }[] | null {
  const values = packageComponents(rawValue, kind)
  if (!values) return null
  const output = []
  for (const row of values) {
    const item = record(row[kind])
    const providerComponentId = text(row._id)
    const referenceKey = kind === 'procedure' ? 'procedureId' : kind === 'material' ? 'materialId' : 'measureId'
    const providerReferenceId = text(row[referenceKey])
    const catalogId = text(item?._id)
    const label = text(item?.name)
    const unit = text(item?.unit)
    const layer = record(row.exts)?.layer
    if (!providerComponentId || !catalogId || !label || (providerReferenceId && providerReferenceId !== catalogId)) return null
    const entry = {
      providerComponentId,
      ...(providerReferenceId ? { providerReferenceId } : {}),
      catalogId,
      label,
      ...(unit ? { unit } : {}),
      ...(kind === 'material' && layer !== undefined ? { layer: layer as string | number } : {}),
    }
    output.push(entry)
  }
  return output
}

export function reconstructQuotationOrder(order: QuotationOrderRead, workflowNodeId: string): QuotationOrderReconstruction {
  if (order.type !== 1 || !order.serviceAppointmentId) return { state: 'blocked', reason: '当前记录不是可编辑的官方 type=1 订单。' }
  const orderList = order.bjProducts.orderList
  if (!Array.isArray(orderList)) return { state: 'blocked', reason: '订单缺少可识别的维修部位分组。' }
  const groups: QuotationGroup[] = []
  let selectionIndex = 0
  for (const [groupIndex, rawGroup] of orderList.entries()) {
    const source = record(rawGroup)
    if (!source) return { state: 'blocked', reason: '订单分组结构不完整，不能安全恢复编辑。' }
    const repairParts = Array.isArray(source.repairParts) && source.repairParts.every((item) => typeof item === 'string' && item.trim())
      ? source.repairParts as string[]
      : []
    if (repairParts.length === 0) return { state: 'blocked', reason: '订单缺少维修部位路径，不能安全恢复编辑。' }
    const group: QuotationGroup = {
      groupId: `quotation-group-${groupIndex + 1}`,
      repairParts: [...repairParts],
      partDescription: typeof source.partDescription === 'string' ? source.partDescription : '',
      maintainAreaNum: source.maintainAreaNum === undefined ? '' : String(source.maintainAreaNum),
      projPackages: [], procedures: [], materials: [], measures: [],
    }
    const direct = {
      procedure: rows(source.procedures),
      material: rows(source.materials),
      measure: rows(source.measures),
    }
    if (!direct.procedure || !direct.material || !direct.measure) return { state: 'blocked', reason: '订单目录分组数据结构不完整，不能安全恢复编辑。' }
    const selections: Record<'procedure' | 'material' | 'measure', QuotationSelection[]> = { procedure: [], material: [], measure: [] }
    for (const kind of ['procedure', 'material', 'measure'] as const) {
      for (const row of direct[kind]!) {
        const id = text(row._id)
        const label = text(row.name) ?? text(row.content)
        const count = quantity(row.number)
        if (!id || !label || !count) return { state: 'blocked', reason: `订单${kind}行缺少可验证的目录身份或数量。` }
        selectionIndex += 1
        selections[kind].push({ selectionId: `order-${order.id}-selection-${selectionIndex}`, kind, catalogId: id, label, quantity: count, ...(text(row.unit) ? { unit: text(row.unit) } : {}) } as QuotationSelection)
      }
    }
    const packageRows = rows(source.projPackages)
    if (!packageRows) return { state: 'blocked', reason: '订单套餐分组结构不完整，不能安全恢复编辑。' }
    const packages: QuotationPackageSelection[] = []
    for (const row of packageRows) {
      const id = text(row._id)
      const label = text(row.name)
      const count = quantity(row.number)
      const exts = record(row.exts)
      if (!id || !label || !count) return { state: 'blocked', reason: '订单套餐行缺少可验证的目录身份或数量。' }
      if (exts?.pricingMethod === '1') return { state: 'blocked', reason: '现有订单包含 SKU 套餐，当前编辑器不支持无损恢复。' }
      const procedures = componentsFor(row.procedureList, 'procedure')
      const materials = componentsFor(row.materialList, 'material')
      const measures = componentsFor(row.measureList, 'measure')
      if (!procedures || !materials || !measures) return { state: 'blocked', reason: '套餐组成身份/材料层级存在歧义，当前订单只允许只读查看。' }
      selectionIndex += 1
      packages.push({
        selectionId: `order-${order.id}-selection-${selectionIndex}`,
        kind: 'package', catalogId: id, label, quantity: count,
        ...(text(row.unit) ? { unit: text(row.unit) } : {}),
        configuration: { procedures, materials: materials as never, measures },
      })
    }
    groups.push({ ...group, projPackages: packages, procedures: selections.procedure as never, materials: selections.material as never, measures: selections.measure as never })
  }
  if (groups.length === 0) return { state: 'blocked', reason: '订单没有可恢复的维修部位组。' }
  const draft: QuotationDraft = { workOrderId: order.serviceAppointmentId, workflowNodeId, draftVersion: 1, groups }
  return { state: 'ready', draft }
}

export function quotationOrderEditBlockers(order: QuotationOrderRead): readonly string[] {
  const blockers: string[] = []
  if (order.type !== 1) blockers.push('仅支持编辑官方 type=1 订单。')
  if (order.state !== 1) blockers.push('订单状态缺失或不是有效状态，不能安全执行替换编辑。')
  if (order.processState !== 0) blockers.push('订单进展状态缺失或已进入施工，不能安全执行替换编辑。')
  if (order.discount !== 1) blockers.push('折扣信息缺失或包含非中性折扣。')
  const exts = record(order.replaceSnapshot.exts)
  if ((order.coupons ?? text(exts?.coupons) ?? '').trim()
    || Number(exts?.couponsVal ?? 0) !== 0
    || Boolean(text(exts?.couponsName))) blockers.push('订单包含优惠券或优惠券金额。')
  if ((order.preferentialAmount ?? Number(order.replaceSnapshot.preferentialAmount ?? 0)) !== 0
    || Number(order.bjProducts.preferentialAmount ?? 0) !== 0) blockers.push('订单包含优惠金额。')
  if (Number(order.replaceSnapshot.otherAmount ?? 0) !== 0) blockers.push('订单包含当前编辑器不支持的其他金额。')
  if (text(order.replaceSnapshot.contractId)) blockers.push('订单已关联合同，不支持报价替换编辑。')
  if (Number(order.replaceSnapshot.paidAmount ?? 0) > 0
    || Number(order.replaceSnapshot.payState ?? 0) !== 0
    || (Array.isArray(order.replaceSnapshot.payIds) && order.replaceSnapshot.payIds.length > 0)
    || order.replaceSnapshot.isSettle === '1') blockers.push('订单已有支付或结算记录，不支持报价替换编辑。')
  const rawProducts = text(order.replaceSnapshot.productIds)
  if (rawProducts && rawProducts !== '[]') blockers.push('订单包含当前报价编辑器不能无损保留的产品快照。')
  if (Array.isArray(order.replaceSnapshot.productsDetail) && order.replaceSnapshot.productsDetail.length > 0) blockers.push('订单包含当前报价编辑器不能无损保留的产品详情快照。')
  if (Array.isArray(order.replaceSnapshot.materialDetail) && order.replaceSnapshot.materialDetail.length > 0) blockers.push('订单包含当前报价编辑器不能无损保留的材料详情快照。')
  const orderList = Array.isArray(order.bjProducts.orderList) ? order.bjProducts.orderList : []
  const addItems = rows(order.bjProducts.addItems)
  const deleteItems = rows(order.bjProducts.deleteItems)
  if (!addItems || !deleteItems) blockers.push('订单增减项结构不完整。')
  else if (addItems.length > 0 || deleteItems.length > 0) blockers.push('订单包含当前编辑器不能无损保留的增减项。')
  for (const rawGroup of orderList) {
    const group = record(rawGroup)
    for (const kind of ['materials', 'projPackages'] as const) {
      const entries = rows(group?.[kind]) ?? []
      for (const item of entries) {
        const material = record(item.material)
        const exts = record(item.exts)
        if (text(material?.spuid) || text(item.spuid) || text(material?.spuId) || text(item.spuId) || Array.isArray(item.skus)) blockers.push('订单包含未支持的 SPU/SKU 材料。')
        if (exts?.pricingMethod === '1') blockers.push('订单包含未支持的 SKU 套餐。')
      }
    }
  }
  return [...new Set(blockers)]
}
