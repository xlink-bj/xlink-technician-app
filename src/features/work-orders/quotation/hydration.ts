import type {
  QuotationCatalogContext,
  QuotationCatalogReadPort,
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

function catalogRead(
  port: QuotationCatalogReadPort,
  kind: QuotationLineKind,
  context: QuotationCatalogContext,
): Promise<OperationSnapshot<CatalogPage>> {
  switch (kind) {
    case 'package': return port.listPackages(context)
    case 'procedure': return port.listProcedures(context)
    case 'material': return port.listMaterials(context)
    case 'measure': return port.listMeasures(context)
  }
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
      const result = await catalogRead(port, kind, context)
      if (failedRead(result)) {
        listIssues.push({ code: 'catalog.read_failed', message: `无法核对当前${kindLabel(kind)}目录，请检查网络后重试。` })
        return
      }
      pages.set(kind, result.data as CatalogPage)
    } catch {
      listIssues.push({ code: 'catalog.read_failed', message: `无法核对当前${kindLabel(kind)}目录，请检查网络后重试。` })
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
          selections.push({ kind, selection: selection as QuotationSelection<'material'>, item: item as QuotationMaterialRead })
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
