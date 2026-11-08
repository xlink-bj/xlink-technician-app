import type {
  QuotationCatalogContext,
  QuotationCatalogReadPort,
  QuotationMaterialSkuVariantRead,
  QuotationPackageDetailRead,
  QuotationPackageMaterialRead,
  QuotationPackageProcedureRead,
  QuotationPackageMeasureRead,
  QuotationPackageRead,
  QuotationProcedureRead,
  QuotationMaterialRead,
  QuotationMeasureRead,
  ReadPage,
} from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'
import {
  matchMaterialSkuSelectionPreview,
  projectMaterialSkuSelectionPreview,
} from './material-sku-selection-preview'

import {
  quotationSelectionsFor,
  type QuotationDraft,
  type QuotationGroup,
  type QuotationLineKind,
  type QuotationPackageSelection,
  type QuotationSelection,
} from './model'

export interface QuotationHydrationIssue {
  readonly code: string
  readonly message: string
  readonly groupId?: string
  readonly selectionId?: string
}

export type HydratedQuotationSelection =
  | {
      readonly kind: 'package'
      readonly selection: QuotationPackageSelection
      readonly item: QuotationPackageRead
      readonly detail: QuotationPackageDetailRead
      readonly procedures: readonly QuotationPackageProcedureRead[]
      readonly materials: readonly QuotationPackageMaterialRead[]
      readonly measures: readonly QuotationPackageMeasureRead[]
    }
  | {
      readonly kind: 'procedure'
      readonly selection: QuotationSelection<'procedure'>
      readonly item: QuotationProcedureRead
    }
  | {
      readonly kind: 'material'
      readonly selection: QuotationSelection<'material'>
      readonly item: QuotationMaterialRead
      /** Exact R1 SKU rows re-read for this selected SPU, including unit price inputs. */
      readonly skuVariants?: readonly QuotationMaterialSkuVariantRead[]
    }
  | {
      readonly kind: 'measure'
      readonly selection: QuotationSelection<'measure'>
      readonly item: QuotationMeasureRead
    }

export interface HydratedQuotationGroup {
  readonly group: QuotationGroup
  readonly selections: readonly HydratedQuotationSelection[]
}

export interface HydratedQuotationDraft {
  readonly workOrderId: string
  readonly workflowNodeId: string
  readonly draftVersion: number
  readonly groups: readonly HydratedQuotationGroup[]
}

export type QuotationHydrationResult =
  | { readonly state: 'succeeded'; readonly data: HydratedQuotationDraft }
  | { readonly state: 'blocked'; readonly issues: readonly QuotationHydrationIssue[] }

type CatalogPage = ReadPage<
  | QuotationPackageRead
  | QuotationProcedureRead
  | QuotationMaterialRead
  | QuotationMeasureRead
>
class CatalogKindMismatch extends Error {}

function catalogRead(
  port: QuotationCatalogReadPort,
  kind: QuotationLineKind,
  context: QuotationCatalogContext,
  page?: number,
): Promise<OperationSnapshot<CatalogPage>> {
  switch (kind) {
    case 'package': return page === undefined ? port.listPackages(context) : port.listPackages(context, page)
    case 'procedure': return page === undefined ? port.listProcedures(context) : port.listProcedures(context, page)
    case 'material': return page === undefined ? port.listMaterials(context) : port.listMaterials(context, page)
    case 'measure': return page === undefined ? port.listMeasures(context) : port.listMeasures(context, page)
  }
}

/** Re-read the complete bounded provider, not just the browser's first page or
 * its cached prices. Keep the existing R1 20-row / 50-page read window. */
async function completeCatalogRead(
  port: QuotationCatalogReadPort,
  kind: QuotationLineKind,
  context: QuotationCatalogContext,
): Promise<CatalogPage> {
  const items: CatalogPage['items'][number][] = []
  const ids = new Set<string>()
  let total: number | undefined
  for (let page = 1; page <= 50; page++) {
    const result = await catalogRead(port, kind, context, page === 1 ? undefined : page)
    if (failedRead(result) || !result.data) throw new Error('Catalog page unavailable')
    const data = result.data
    if ((data.page !== undefined && data.page !== page)
      || (data.pageSize !== undefined && data.pageSize !== 20)
      || !Array.isArray(data.items) || data.items.length > 20
      || (total !== undefined && data.totalCount !== total)
      || (data.totalCount !== undefined && (!Number.isSafeInteger(data.totalCount)
        || data.totalCount < 0 || data.totalCount > 1000))) throw new Error('Catalog page inconsistent')
    total = data.totalCount
    for (const item of data.items) {
      if (item.kind !== kind) throw new CatalogKindMismatch()
      if (typeof item.id !== 'string' || !item.id.trim()
        || item.id !== item.id.trim() || ids.has(item.id)) throw new Error('Catalog identity inconsistent')
      ids.add(item.id)
      items.push(item)
    }
    if (total !== undefined) {
      if (items.length > total) throw new Error('Catalog exceeds declared total')
      if (items.length === total) return { items, totalCount: total }
      if (!data.items.length) throw new Error('Catalog page missing')
    } else if (data.items.length < 20) {
      return { items }
    }
  }
  throw new Error('Catalog completeness exceeds bounded read window')
}

function uniqueProviderItem<T extends { readonly id: string; readonly kind: string }>(
  items: readonly { readonly id: string; readonly kind: string }[],
  id: string,
  kind: string,
): T | null {
  const matches = items.filter((item) => item.id === id)
  if (matches.length !== 1 || matches[0].kind !== kind) return null
  return matches[0] as T
}

function failedRead(result: OperationSnapshot<unknown>): boolean {
  return result.state !== 'succeeded' || result.data === undefined
}

function componentRowMatches(
  component: { readonly providerComponentId?: string; readonly providerReferenceId?: string; readonly catalogId: string; readonly layer?: string | number },
  row: { readonly id?: string; readonly referenceId?: string; readonly item: { readonly id: string } | null; readonly layer?: string | number },
): boolean {
  if (!row.item || row.item.id !== component.catalogId) return false
  const hasProviderIdentity = Boolean(component.providerComponentId || component.providerReferenceId)
  if (!hasProviderIdentity) return false
  if (component.providerComponentId !== undefined && row.id !== component.providerComponentId) return false
  if (component.providerReferenceId !== undefined && row.referenceId !== component.providerReferenceId) return false
  if ('layer' in component && row.layer !== component.layer) return false
  return true
}

function selectPackageRows<T extends { readonly item: { readonly id: string } | null }>(
  components: readonly { readonly providerComponentId?: string; readonly providerReferenceId?: string; readonly catalogId: string; readonly layer?: string | number }[],
  rows: readonly T[],
): readonly T[] | null {
  const selected: T[] = []
  for (const component of components) {
    const matches = rows.filter((row) => componentRowMatches(component, row as never))
    if (matches.length !== 1) return null
    selected.push(matches[0])
  }
  return selected
}

function issue(code: string, message: string, groupId: string, selectionId: string): QuotationHydrationIssue {
  return { code, message, groupId, selectionId }
}

async function readSelectedMaterialSkus(input: {
  readonly context: QuotationCatalogContext
  readonly port: QuotationCatalogReadPort
  readonly item: QuotationMaterialRead
  readonly selection: QuotationSelection<'material'>
}): Promise<{ readonly variants?: readonly QuotationMaterialSkuVariantRead[]; readonly error?: string }> {
  const choices = input.selection.skuChoices ?? []
  const hasSaleAttributes = Object.keys(input.item.saleOptionCandidates ?? {}).length > 0
  if (choices.length === 0) {
    return hasSaleAttributes ? { error: '该材料需要先选择已核对的 SKU 规格。' } : {}
  }
  if (!input.port.listMaterialSalesFields || !input.port.listMaterialSkuVariants) {
    return { error: '当前环境没有可用的 SKU 价格与规格核验能力。' }
  }

  let salesFields
  try { salesFields = await input.port.listMaterialSalesFields(input.context) }
  catch { return { error: '材料销售规格暂时无法核验。' } }
  if (salesFields.state !== 'succeeded' || !salesFields.data) {
    return { error: '材料销售规格暂时无法核验。' }
  }
  const fieldNames = salesFields.data.items
    .filter(field => Boolean(input.item.saleOptionCandidates?.[field.name]?.length))
    .map(field => field.name)
  if (!fieldNames.length) return { error: '材料没有完整的销售规格定义。' }

  let skuRows
  try {
    skuRows = await input.port.listMaterialSkuVariants(input.context, 'direct_material',
      [input.item.id], fieldNames)
  } catch { return { error: '材料 SKU 暂时无法核验。' } }
  if (skuRows.state !== 'succeeded' || !skuRows.data) {
    return { error: '材料 SKU 暂时无法核验。' }
  }

  const preview = projectMaterialSkuSelectionPreview(input.item, salesFields.data.items, skuRows.data.items)
  if (preview.state !== 'ready'
    || preview.fields.length !== fieldNames.length
    || preview.fields.some(field => !fieldNames.includes(field.name))) {
    return { error: preview.state === 'blocked' ? preview.message : '材料销售规格定义不完整。' }
  }
  const ids = new Set<string>()
  let totalQuantity = 0
  for (const choice of choices) {
    if (!choice.skuId || ids.has(choice.skuId) || !Number.isSafeInteger(choice.quantity) || choice.quantity <= 0) {
      return { error: 'SKU 身份或数量无效。' }
    }
    ids.add(choice.skuId)
    totalQuantity += choice.quantity
    const matched = matchMaterialSkuSelectionPreview(preview, choice.attributes)
    if (matched.state !== 'matched' || matched.skuId !== choice.skuId) {
      return { error: 'SKU 与当前材料规格不匹配或匹配不唯一。' }
    }
    const variant = preview.variants.find(row => row.id === choice.skuId)
    if (!variant || typeof variant.price !== 'number' || !Number.isFinite(variant.price)
      || variant.price <= 0) {
      return { error: '已选 SKU 的 R1 单价缺失或无效，不能生成报价。' }
    }
  }
  if (totalQuantity !== input.selection.quantity) {
    return { error: '材料数量与各 SKU 数量合计不一致。' }
  }
  return { variants: preview.variants }
}

export async function hydrateQuotationDraft(input: {
  readonly draft: QuotationDraft
  readonly context: QuotationCatalogContext | null | undefined
  readonly port: QuotationCatalogReadPort | null | undefined
}): Promise<QuotationHydrationResult> {
  const { draft, context, port } = input
  if (!port) return { state: 'blocked', issues: [{ code: 'catalog.port_missing', message: '目录只读服务不可用，不能核对当前报价数据。' }] }
  if (!context || !context.serviceType.trim()) {
    return { state: 'blocked', issues: [{ code: 'catalog.context_missing', message: '缺少当前工单的目录适用范围，不能核对报价数据。' }] }
  }

  const kinds = new Set<QuotationLineKind>()
  for (const group of draft.groups) {
    for (const kind of ['package', 'procedure', 'material', 'measure'] as const) {
      if (quotationSelectionsFor(group, kind).length > 0) kinds.add(kind)
    }
  }

  const pages = new Map<QuotationLineKind, CatalogPage>()
  const listIssues: QuotationHydrationIssue[] = []
  await Promise.all([...kinds].map(async (kind) => {
    try {
      pages.set(kind, await completeCatalogRead(port, kind, context))
    } catch (error) {
      listIssues.push(error instanceof CatalogKindMismatch
        ? { code: 'catalog.kind_mismatch', message: '目录项目类型与当前类别不一致，请重新核对。' }
        : { code: 'catalog.read_failed', message: `无法完整核对当前${kindLabel(kind)}目录，请检查网络后重试。` })
    }
  }))
  if (listIssues.length > 0) return { state: 'blocked', issues: listIssues }

  const issues: QuotationHydrationIssue[] = []
  const hydratedGroups: HydratedQuotationGroup[] = []
  for (const group of draft.groups) {
    const selections: HydratedQuotationSelection[] = []
    for (const kind of ['package', 'procedure', 'material', 'measure'] as const) {
      for (const selection of quotationSelectionsFor(group, kind)) {
        const page = pages.get(kind)
        const item = page ? uniqueProviderItem(page.items, selection.catalogId, kind) : null
        if (!item) {
          const otherKindMatch = [...pages.values()].some((otherPage) =>
            otherPage.items.some((candidate) => candidate.id === selection.catalogId && candidate.kind !== kind),
          )
          issues.push(issue(
            otherKindMatch ? 'catalog.kind_mismatch' : 'catalog.identity_missing',
            otherKindMatch ? '所选目录身份的类型已变化，草稿未替换。' : `所选${kindLabel(kind)}已不在当前目录中，草稿未替换。`,
            group.groupId,
            selection.selectionId,
          ))
          continue
        }

        if (kind === 'package') {
          const packageSelection = selection as QuotationPackageSelection
          if (!packageSelection.configuration) {
            issues.push(issue('package.configuration_missing', '套餐尚未完成配置，不能核对报价。', group.groupId, selection.selectionId))
            continue
          }
          let detailResult: OperationSnapshot<QuotationPackageDetailRead>
          try {
            detailResult = await port.getPackageDetail(packageSelection.catalogId)
          } catch {
            issues.push(issue('package.detail_read_failed', '无法读取当前套餐详情，请检查网络后重试。', group.groupId, selection.selectionId))
            continue
          }
          if (failedRead(detailResult)) {
            issues.push(issue('package.detail_read_failed', '无法读取当前套餐详情，请检查网络后重试。', group.groupId, selection.selectionId))
            continue
          }
          const detail = detailResult.data!
          if (detail.package.kind !== 'package' || detail.package.id !== packageSelection.catalogId || detail.package.id !== item.id) {
            issues.push(issue('package.detail_identity_mismatch', '套餐详情身份与本地草稿不匹配，未替换任何套餐。', group.groupId, selection.selectionId))
            continue
          }
          const procedures = selectPackageRows(packageSelection.configuration.procedures, detail.procedures)
          const materials = selectPackageRows(packageSelection.configuration.materials, detail.materials)
          const measures = selectPackageRows(packageSelection.configuration.measures, detail.measures)
          if (!procedures || !materials || !measures) {
            issues.push(issue('package.component_identity_missing', '套餐组成或已选材料层级已变化，请重新核对配置。', group.groupId, selection.selectionId))
            continue
          }
          selections.push({ kind: 'package', selection: packageSelection, item: item as QuotationPackageRead, detail, procedures, materials, measures })
        } else if (kind === 'procedure') {
          selections.push({ kind, selection: selection as QuotationSelection<'procedure'>, item: item as QuotationProcedureRead })
        } else if (kind === 'material') {
          const materialSelection = selection as QuotationSelection<'material'>
          const materialItem = item as QuotationMaterialRead
          const selectedSkus = await readSelectedMaterialSkus({
            context, port, item: materialItem, selection: materialSelection,
          })
          if (selectedSkus.error) {
            issues.push(issue('material.sku_identity_or_price_unverified', selectedSkus.error,
              group.groupId, selection.selectionId))
            continue
          }
          selections.push({ kind, selection: materialSelection, item: materialItem,
            ...(selectedSkus.variants ? { skuVariants: selectedSkus.variants } : {}) })
        } else {
          selections.push({ kind, selection: selection as QuotationSelection<'measure'>, item: item as QuotationMeasureRead })
        }
      }
    }
    hydratedGroups.push({ group, selections })
  }
  return issues.length > 0
    ? { state: 'blocked', issues }
    : {
        state: 'succeeded',
        data: {
          workOrderId: draft.workOrderId,
          workflowNodeId: draft.workflowNodeId,
          draftVersion: draft.draftVersion,
          groups: hydratedGroups,
        },
      }
}

function kindLabel(kind: QuotationLineKind): string {
  return ({ package: '套餐', procedure: '工序', material: '材料', measure: '机措' })[kind]
}
