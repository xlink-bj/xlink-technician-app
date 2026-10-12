import { quotationPackageLayerKey } from './package-configuration'
import {
  parseQuotationQuantity,
  quotationSelectionsFor,
  type QuotationDraft,
  type QuotationGroup,
  type QuotationLineKind,
  type QuotationPackageConfiguration,
} from './model'

export type QuotationValidationField =
  | 'repairParts'
  | 'partDescription'
  | 'maintainAreaNum'
  | 'composition'
  | 'configuration'
  | 'quantity'

export interface QuotationValidationIssue {
  readonly code: string
  readonly field: QuotationValidationField
  readonly message: string
  readonly groupId?: string
  readonly selectionId?: string
}

export interface QuotationValidationResult {
  readonly state: 'ready' | 'blocked'
  readonly issues: readonly QuotationValidationIssue[]
}

function validConfiguration(configuration: QuotationPackageConfiguration | undefined): boolean {
  if (!configuration) return false
  const components = [
    ...configuration.procedures,
    ...configuration.materials,
    ...configuration.measures,
  ]
  for (const component of components) {
    if (!component.catalogId.trim() || !component.label.trim()) return false
    if (!component.providerComponentId?.trim() && !component.providerReferenceId?.trim()) return false
  }
  const layers = new Set<string>()
  for (const material of configuration.materials) {
    if ((typeof material.layer !== 'number' && typeof material.layer !== 'string')
      || (typeof material.layer === 'string' && !material.layer.trim())) return false
    const key = quotationPackageLayerKey(material.layer)
    if (layers.has(key)) return false
    layers.add(key)
  }
  return true
}

function addIssue(
  issues: QuotationValidationIssue[],
  issue: Omit<QuotationValidationIssue, 'message'> & { readonly message: string },
): void {
  issues.push(issue)
}

function validateGroup(group: QuotationGroup, issues: QuotationValidationIssue[]): void {
  if (group.repairParts.length === 0 || group.repairParts.some((part) => !part.trim())) {
    addIssue(issues, {
      code: 'group.repair_parts_required', field: 'repairParts', groupId: group.groupId,
      message: '请选择完整的维修部位路径。',
    })
  }
  if (!group.partDescription.trim()) {
    addIssue(issues, {
      code: 'group.description_required', field: 'partDescription', groupId: group.groupId,
      message: '请填写维修部位描述。',
    })
  }
  if (!parseQuotationQuantity(group.maintainAreaNum).valid) {
    addIssue(issues, {
      code: 'group.maintain_area_invalid', field: 'maintainAreaNum', groupId: group.groupId,
      message: '请输入大于 0 的工程量。',
    })
  }

  for (const kind of ['package', 'procedure', 'material', 'measure'] as const satisfies readonly QuotationLineKind[]) {
    for (const selection of quotationSelectionsFor(group, kind)) {
      if (selection.kind !== kind) {
        addIssue(issues, {
          code: 'selection.kind_mismatch', field: 'composition', groupId: group.groupId,
          selectionId: selection.selectionId, message: '目录项目类型与分组不一致。',
        })
      }
      if (!Number.isFinite(selection.quantity) || selection.quantity <= 0) {
        addIssue(issues, {
          code: 'selection.quantity_invalid', field: 'quantity', groupId: group.groupId,
          selectionId: selection.selectionId, message: '每项数量都必须大于 0。',
        })
      }
      if (kind === 'package' && !validConfiguration(selection.configuration)) {
        addIssue(issues, {
          code: 'package.configuration_incomplete', field: 'configuration', groupId: group.groupId,
          selectionId: selection.selectionId, message: '套餐配置不完整，请重新核对套餐及每个材料层级。',
        })
      }
    }
  }

  // Existing Order price/encoder cannot yet map a verified SKU choice
  // to an official material line. Local proof must not become submit-ready.
  for (const material of group.materials) {
    if (material.skuChoices?.length) {
      addIssue(issues, {
        code: 'material.sku_local_only', field: 'composition', groupId: group.groupId,
        selectionId: material.selectionId,
        message: '材料 SKU 数量仅保存在本机，尚未核验订单价格与提交字段，不能提交正式报价。',
      })
    }
  }

  const packages = group.projPackages
  const hasConfiguredPackage = packages.some((selection) => validConfiguration(selection.configuration))
  if (!hasConfiguredPackage) {
    if (group.procedures.length === 0 || group.materials.length === 0) {
      addIssue(issues, {
        code: 'group.direct_composition_incomplete', field: 'composition', groupId: group.groupId,
        message: '未配置套餐时，每个维修部位组至少需要一项工序和一项材料；机措不能替代。',
      })
    }
  }
  if (packages.length + group.procedures.length + group.materials.length + group.measures.length === 0) {
    addIssue(issues, {
      code: 'group.composition_empty', field: 'composition', groupId: group.groupId,
      message: '请至少添加一项套餐、工序、材料或机措。',
    })
  }
}

export function validateQuotationDraft(draft: QuotationDraft): QuotationValidationResult {
  const issues: QuotationValidationIssue[] = []
  if (!draft.workOrderId.trim() || !draft.workflowNodeId.trim()) {
    issues.push({ code: 'draft.identity_invalid', field: 'composition', message: '报价草稿身份无效。' })
  }
  if (draft.groups.length === 0) {
    issues.push({ code: 'draft.groups_required', field: 'composition', message: '请先添加维修部位组。' })
  }
  for (const group of draft.groups) validateGroup(group, issues)
  return { state: issues.length === 0 ? 'ready' : 'blocked', issues }
}
