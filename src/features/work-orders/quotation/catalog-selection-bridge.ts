/**
 * A single, injected quotation catalog bridge. All catalog provenance, current
 * Action authorization, group identity and package-detail gates stay intact.
 * No price authority, R1 writes, or Pinia lifecycle is introduced here.
 */
import { createOperationError, type ErrorCategory, type OperationSnapshot } from '@shared/types'
import type { ActionDescriptor, ActionBusinessResult } from '@runtimes/action'
import type {
  QuotationCatalogItemRead,
  QuotationPackageRead,
  QuotationPackageDetailRead,
} from '@shared/ports'
import { isDirectQuotationCatalogKind, type QuotationLineKind } from './model'
import type { QuotationPackageMaterialChoice } from './package-configuration'
import type { useQuotationCatalogBrowserStore } from './catalog-browser-store'
import type { useQuotationCompositionStore } from './composition-store'

export interface QuotationCatalogBridgeState {
  readonly loadState: string
  readonly descriptor: ActionDescriptor | null
  readonly businessResult: ActionBusinessResult
}
export interface QuotationCatalogBridgeDependencies {
  readonly getWorkspaceState: () => QuotationCatalogBridgeState
  readonly quotationCatalogBrowser: ReturnType<typeof useQuotationCatalogBrowserStore>
  readonly quotationComposition: ReturnType<typeof useQuotationCompositionStore>
}

function failure<T>(category: ErrorCategory, message: string): OperationSnapshot<T> {
  return { state: 'failed_terminal', error: createOperationError(category, message) }
}

export function createQuotationCatalogSelectionBridge({
  getWorkspaceState, quotationCatalogBrowser, quotationComposition,
}: QuotationCatalogBridgeDependencies) {
  function addQuotationCatalogSelection(
    groupId: string,
    kind: QuotationLineKind,
    catalogId: string,
  ): OperationSnapshot<void> {
    const currentDescriptor = getWorkspaceState().descriptor
    if (
      getWorkspaceState().loadState !== 'succeeded'
      || currentDescriptor?.actionIntent !== 'place_order'
      || currentDescriptor.contentKind !== 'quotation'
      || currentDescriptor.execution !== 'enabled'
      || getWorkspaceState().businessResult === 'succeeded'
    ) return failure('unsupported_capability', '当前报价工作区不可编辑')
    if (!isDirectQuotationCatalogKind(kind)) return failure('unsupported_capability', '该目录类型不能直接加入草稿')

    const source: QuotationCatalogItemRead | null = quotationCatalogBrowser.selectedCatalogItemFor(kind, catalogId)
    if (!source) return failure('validation', '该目录项不属于当前已读取的目录结果')
    return quotationComposition.addCatalogReadItem(groupId, source)
  }

  function resolveQuotationPackageConfigurationInput(
    groupId: string,
    packageId: string,
  ): OperationSnapshot<{ readonly packageRow: QuotationPackageRead; readonly detail: QuotationPackageDetailRead }> {
    const currentDescriptor = getWorkspaceState().descriptor
    if (
      getWorkspaceState().loadState !== 'succeeded'
      || currentDescriptor?.actionIntent !== 'place_order'
      || currentDescriptor.contentKind !== 'quotation'
      || currentDescriptor.execution !== 'enabled'
      || getWorkspaceState().businessResult === 'succeeded'
    ) return failure('unsupported_capability', '当前报价工作区不可配置套餐')
    if (!quotationComposition.isGroupEditable(groupId)) {
      return failure('validation', '目标维修部位组不存在或当前不可编辑')
    }
    const packageRow = quotationCatalogBrowser.packageCandidateFor(packageId)
    if (!packageRow) return failure('validation', '套餐不属于当前已成功读取的目录结果')
    const detail = quotationCatalogBrowser.successfulPackageDetailFor(packageId)
    if (!detail) return failure('validation', '请先读取并核对当前套餐详情')
    return { state: 'succeeded', data: { packageRow, detail } }
  }

  function validateQuotationPackageConfiguration(
    groupId: string,
    packageId: string,
    materialChoices: readonly QuotationPackageMaterialChoice[],
  ): OperationSnapshot<void> {
    const source = resolveQuotationPackageConfigurationInput(groupId, packageId)
    if (source.state !== 'succeeded' || !source.data) {
      return { state: source.state, ...(source.error ? { error: source.error } : {}) }
    }
    return quotationComposition.validatePackageReadItem(
      groupId,
      source.data.packageRow,
      source.data.detail,
      materialChoices,
    )
  }

  function configureQuotationPackageSelection(
    groupId: string,
    packageId: string,
    materialChoices: readonly QuotationPackageMaterialChoice[],
  ): OperationSnapshot<void> {
    const source = resolveQuotationPackageConfigurationInput(groupId, packageId)
    if (source.state !== 'succeeded' || !source.data) {
      return { state: source.state, ...(source.error ? { error: source.error } : {}) }
    }
    return quotationComposition.configurePackageReadItem(
      groupId,
      source.data.packageRow,
      source.data.detail,
      materialChoices,
    )
  }


  return {
    addQuotationCatalogSelection,
    validateQuotationPackageConfiguration,
    configureQuotationPackageSelection,
  }
}
