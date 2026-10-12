import type {
  QuotationPackageDetailRead,
  QuotationPackageMaterialRead,
  QuotationPackageRead,
} from '@shared/ports'
import { createOperationError, type OperationSnapshot } from '@shared/types'

import { parseQuotationQuantity, type QuotationGroup, type QuotationPackageConfiguration } from './model'

export interface QuotationPackageMaterialChoice {
  readonly layer: string | number
  readonly componentId?: string
  readonly referenceId?: string
}

export interface ConfiguredQuotationPackageCandidate {
  readonly configuration: QuotationPackageConfiguration
  readonly quantity: number
}

function rejected(message: string): OperationSnapshot<ConfiguredQuotationPackageCandidate> {
  return {
    state: 'failed_terminal',
    error: createOperationError('validation', message),
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * R1 placeOrders.vue:6524-6536 groups Package material alternatives using
 * Number(exts.layer). A provider string "1" and number 1 are ONE repair
 * layer for selection, while each chosen row retains its original raw layer.
 *
 * Legacy non-numeric DEV fixtures retain separate textual keys. They are
 * not asserted to be R1 numeric repair layers.
 */
export function quotationPackageLayerKey(layer: string | number | undefined): string {
  if (layer === undefined || (typeof layer === 'string' && !layer.trim())) return 'missing-layer'
  const numeric = Number(layer)
  if (Number.isFinite(numeric)) return `number:${numeric}`
  return `${typeof layer}:${String(layer)}`
}

/** R1 sorts package materials numerically before assigning alternatives to a layer. */
export function compareQuotationPackageLayerKeys(a: string, b: string): number {
  if (!a.startsWith('number:') || !b.startsWith('number:')) return 0
  return Number(a.slice('number:'.length)) - Number(b.slice('number:'.length))
}

function validLayer(value: unknown): value is string | number {
  return (typeof value === 'string' && value.trim().length > 0)
    || (typeof value === 'number' && Number.isFinite(value))
}

function validProviderIdentity(id: unknown, referenceId: unknown): boolean {
  return nonEmpty(id) || nonEmpty(referenceId)
}

export function quotationPackageMaterialMatchesChoice(
  row: QuotationPackageMaterialRead,
  choice: QuotationPackageMaterialChoice,
): boolean {
  if (!validProviderIdentity(choice.componentId, choice.referenceId)) return false
  if (choice.componentId !== undefined && row.id !== choice.componentId) return false
  if (choice.referenceId !== undefined && row.referenceId !== choice.referenceId) return false
  return quotationPackageLayerKey(row.layer) === quotationPackageLayerKey(choice.layer)
}

function configuredComponent(
  row: { readonly id?: string; readonly referenceId?: string; readonly unit?: string },
  item: { readonly id: string; readonly name: string; readonly unit?: string } | null,
): OperationSnapshot<{
  readonly providerComponentId?: string
  readonly providerReferenceId?: string
  readonly catalogId: string
  readonly label: string
  readonly unit?: string
}> {
  if (!validProviderIdentity(row.id, row.referenceId)) {
    return { state: 'failed_terminal', error: createOperationError('validation', '套餐组成缺少可验证的组件身份。') }
  }
  if (!item || !nonEmpty(item.id) || !nonEmpty(item.name)) {
    return { state: 'failed_terminal', error: createOperationError('validation', '套餐组成引用暂不可解析，无法配置。') }
  }
  if (nonEmpty(row.referenceId) && row.referenceId !== item.id) {
    return { state: 'failed_terminal', error: createOperationError('validation', '套餐组成身份与引用不匹配，无法配置。') }
  }
  return {
    state: 'succeeded',
    data: {
      ...(nonEmpty(row.id) ? { providerComponentId: row.id } : {}),
      ...(nonEmpty(row.referenceId) ? { providerReferenceId: row.referenceId } : {}),
      catalogId: item.id,
      label: item.name,
      ...((nonEmpty(row.unit) ? row.unit : nonEmpty(item.unit) ? item.unit : undefined)
        ? { unit: nonEmpty(row.unit) ? row.unit : item.unit }
        : {}),
    },
  }
}

/**
 * Validates and projects only the provider-backed, non-commercial Package
 * configuration required by the local grouped draft.
 */
export function configuredQuotationPackageCandidateFor(
  group: QuotationGroup | undefined,
  packageRow: QuotationPackageRead,
  detail: QuotationPackageDetailRead,
  choices: readonly QuotationPackageMaterialChoice[],
): OperationSnapshot<ConfiguredQuotationPackageCandidate> {
  if (!group || group.repairParts.length === 0) return rejected('请先选择有效的维修部位组并设置维修部位路径。')
  if (!nonEmpty(packageRow.id) || !nonEmpty(packageRow.name) || packageRow.kind !== 'package') {
    return rejected('套餐目录身份无效，无法配置。')
  }
  if (detail.package.kind !== 'package' || detail.package.id !== packageRow.id) {
    return rejected('套餐详情与所选目录项不匹配，未保存配置。')
  }
  if (detail.procedures.some((row) => !configuredComponent(row, row.item).data)) {
    const invalid = detail.procedures.find((row) => !configuredComponent(row, row.item).data)
    return rejected(invalid?.item ? '套餐工序缺少可验证的组件身份。' : '套餐工序引用暂不可解析，无法配置。')
  }
  if (detail.measures.some((row) => !configuredComponent(row, row.item).data)) {
    const invalid = detail.measures.find((row) => !configuredComponent(row, row.item).data)
    return rejected(invalid?.item ? '套餐机措缺少可验证的组件身份。' : '套餐机措引用暂不可解析，无法配置。')
  }
  if (detail.materials.some((row) => !validLayer(row.layer))) {
    return rejected('套餐材料层级信息不完整，无法配置。')
  }

  const layers = new Map<string, { readonly value: string | number; readonly rows: QuotationPackageMaterialRead[] }>()
  for (const row of detail.materials) {
    const layer = row.layer!
    const key = quotationPackageLayerKey(layer)
    const existing = layers.get(key)
    if (existing) existing.rows.push(row)
    else layers.set(key, { value: layer, rows: [row] })
  }

  if (choices.length !== layers.size) return rejected('请为每个套餐材料层级选择且只选择一项材料。')
  const selectedMaterials: QuotationPackageConfiguration['materials'][number][] = []
  for (const [key, layer] of [...layers].sort(([a], [b]) => compareQuotationPackageLayerKeys(a, b))) {
    const layerChoices = choices.filter((choice) => quotationPackageLayerKey(choice.layer) === key)
    if (layerChoices.length !== 1) return rejected('请为每个套餐材料层级选择且只选择一项材料。')
    const choice = layerChoices[0]
    const matches = layer.rows.filter((row) => quotationPackageMaterialMatchesChoice(row, choice))
    if (matches.length !== 1) return rejected('所选套餐材料身份无效或不唯一，未保存配置。')
    const selected = matches[0]
    const material = configuredComponent(selected, selected.item)
    if (material.state !== 'succeeded' || !material.data) {
      return rejected(material.error?.message ?? '所选套餐材料引用暂不可解析，无法配置。')
    }
    // Preserve the selected provider row's typed source value; R1's numeric
    // grouping is a UI selection equivalence, not a SKU identity rewrite.
    selectedMaterials.push({ ...material.data, layer: selected.layer! })
  }
  if (choices.some((choice) => !layers.has(quotationPackageLayerKey(choice.layer)))) {
    return rejected('所选材料包含当前套餐详情中不存在的层级。')
  }

  const procedures = detail.procedures.map((row) => configuredComponent(row, row.item))
  const measures = detail.measures.map((row) => configuredComponent(row, row.item))
  if (procedures.some((row) => row.state !== 'succeeded' || !row.data)
    || measures.some((row) => row.state !== 'succeeded' || !row.data)) {
    return rejected('套餐组成引用暂不可解析，无法配置。')
  }

  const maintainAreaQuantity = parseQuotationQuantity(group.maintainAreaNum)
  return {
    state: 'succeeded',
    data: {
      configuration: {
        procedures: procedures.map((row) => row.data!),
        materials: selectedMaterials,
        measures: measures.map((row) => row.data!),
      },
      quantity: maintainAreaQuantity.valid ? maintainAreaQuantity.value : 1,
    },
  }
}

export function quotationPackageMaterialChoiceFor(
  row: QuotationPackageMaterialRead,
): QuotationPackageMaterialChoice | null {
  if (!validLayer(row.layer) || !validProviderIdentity(row.id, row.referenceId)) return null
  return {
    layer: row.layer,
    ...(nonEmpty(row.id) ? { componentId: row.id } : {}),
    ...(nonEmpty(row.referenceId) ? { referenceId: row.referenceId } : {}),
  }
}

export function quotationPackageMaterialChoiceToken(choice: QuotationPackageMaterialChoice): string {
  return JSON.stringify([typeof choice.layer, choice.layer, choice.componentId ?? null, choice.referenceId ?? null])
}
