import {
  actionDraftIdentityMatches,
  type ActionDraftIdentity,
  type ActionDraftRecord,
} from '@runtimes/action'

import { quotationPackageLayerKey } from './package-configuration'
import {
  type QuotationDraft,
  type QuotationGroup,
  type QuotationLineKind,
  type QuotationSelection,
} from './model'

const QUOTATION_DRAFT_SCHEMA_VERSION = 4

export interface QuotationDraftRecordValues extends Readonly<Record<string, unknown>> {
  readonly schemaVersion: 4
  readonly quotationDraft: QuotationDraft
}

export type QuotationDraftDecodeResult =
  | { readonly state: 'valid'; readonly draft: QuotationDraft }
  | { readonly state: 'legacy_requires_action'; readonly reason: string }
  | { readonly state: 'invalid'; readonly reason: string }

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index])
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validConfiguredComponent(value: unknown, material: boolean): boolean {
  const component = record(value)
  if (!component) return false
  const expectedKeys = [
    ...(Object.prototype.hasOwnProperty.call(component, 'providerComponentId') ? ['providerComponentId'] : []),
    ...(Object.prototype.hasOwnProperty.call(component, 'providerReferenceId') ? ['providerReferenceId'] : []),
    'catalogId',
    'label',
    ...(Object.prototype.hasOwnProperty.call(component, 'unit') ? ['unit'] : []),
    ...(material ? ['layer'] : []),
  ]
  const hasProviderIdentity = nonEmptyString(component.providerComponentId)
    || nonEmptyString(component.providerReferenceId)
  const optionalProviderIdentitiesAreValid = (component.providerComponentId === undefined
    || nonEmptyString(component.providerComponentId))
    && (component.providerReferenceId === undefined || nonEmptyString(component.providerReferenceId))
  const layerIsValid = !material
    || (typeof component.layer === 'string' && component.layer.trim().length > 0)
    || (typeof component.layer === 'number' && Number.isFinite(component.layer))
  return exactKeys(component, expectedKeys)
    && hasProviderIdentity
    && optionalProviderIdentitiesAreValid
    && nonEmptyString(component.catalogId)
    && nonEmptyString(component.label)
    && (component.unit === undefined || nonEmptyString(component.unit))
    && layerIsValid
}

function validPackageConfiguration(value: unknown): boolean {
  const configuration = record(value)
  if (!(Boolean(configuration)
    && exactKeys(configuration!, ['procedures', 'materials', 'measures'])
    && Array.isArray(configuration!.procedures)
    && configuration!.procedures.every((component) => validConfiguredComponent(component, false))
    && Array.isArray(configuration!.materials)
    && configuration!.materials.every((component) => validConfiguredComponent(component, true))
    && Array.isArray(configuration!.measures)
    && configuration!.measures.every((component) => validConfiguredComponent(component, false)))) return false
  const materialLayers = (configuration!.materials as Array<Record<string, unknown>>)
    .map((component) => quotationPackageLayerKey(component.layer as string | number))
  return new Set(materialLayers).size === materialLayers.length
}

function validSkuChoices(value: unknown, total: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return false
  const ids = new Set<string>()
  const choices = new Set<string>()
  let sum = 0
  for (const entry of value) {
    const row = record(entry)
    const attrs = record(row?.attributes)
    if (!row || !exactKeys(row, ['skuId', 'quantity', 'attributes'])
      || !nonEmptyString(row.skuId) || ids.has(row.skuId)
      || !Number.isSafeInteger(row.quantity) || (row.quantity as number) < 1
      || (row.quantity as number) > 9999 || !attrs || Object.keys(attrs).length === 0
      || Object.keys(attrs).length > 30
      || Object.entries(attrs).some(([k, v]) => !k.trim()
        || ['__proto__', 'constructor', 'prototype'].includes(k)
        || !nonEmptyString(v))) return false
    ids.add(row.skuId)
    const attrKey = JSON.stringify(Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b)))
    if (choices.has(attrKey)) return false
    choices.add(attrKey)
    sum += row.quantity as number
  }
  return Number.isSafeInteger(sum) && sum <= 99999 && sum === total
}

function validSelection(
  value: unknown,
  expectedKind: QuotationLineKind,
  schemaVersion: 2 | 3 | 4,
): value is QuotationSelection {
  const selection = record(value)
  if (!selection) return false
  const expectedKeys = [
    'selectionId',
    'kind',
    'catalogId',
    'label',
    'quantity',
    ...(Object.prototype.hasOwnProperty.call(selection, 'unit') ? ['unit'] : []),
    ...(schemaVersion >= 3 && expectedKind === 'package' && Object.prototype.hasOwnProperty.call(selection, 'configuration')
      ? ['configuration']
      : []),
    ...(schemaVersion === 4 && expectedKind === 'material' && Object.prototype.hasOwnProperty.call(selection, 'skuChoices')
      ? ['skuChoices']
      : []),
  ]
  return exactKeys(selection, expectedKeys)
    && selection.kind === expectedKind
    && nonEmptyString(selection.selectionId)
    && nonEmptyString(selection.catalogId)
    && nonEmptyString(selection.label)
    && (selection.unit === undefined || nonEmptyString(selection.unit))
    && typeof selection.quantity === 'number'
    && Number.isFinite(selection.quantity)
    && selection.quantity > 0
    && (schemaVersion === 2 || expectedKind !== 'package'
      || !Object.prototype.hasOwnProperty.call(selection, 'configuration')
      || validPackageConfiguration(selection.configuration))
    && (schemaVersion !== 4 || expectedKind !== 'material'
      || !Object.prototype.hasOwnProperty.call(selection, 'skuChoices')
      || validSkuChoices(selection.skuChoices, selection.quantity))
}

function validSelectionList(value: unknown, kind: QuotationLineKind, schemaVersion: 2 | 3 | 4): value is readonly QuotationSelection[] {
  return Array.isArray(value) && value.every((selection) => validSelection(selection, kind, schemaVersion))
}

function validGroup(value: unknown, schemaVersion: 2 | 3 | 4): value is QuotationGroup {
  const group = record(value)
  if (!group) return false
  const expectedKeys = [
    'groupId',
    'repairParts',
    'partDescription',
    'maintainAreaNum',
    'projPackages',
    'procedures',
    'materials',
    'measures',
  ]
  return exactKeys(group, expectedKeys)
    && nonEmptyString(group.groupId)
    && Array.isArray(group.repairParts)
    && group.repairParts.every(nonEmptyString)
    && typeof group.partDescription === 'string'
    && typeof group.maintainAreaNum === 'string'
    && validSelectionList(group.projPackages, 'package', schemaVersion)
    && validSelectionList(group.procedures, 'procedure', schemaVersion)
    && validSelectionList(group.materials, 'material', schemaVersion)
    && validSelectionList(group.measures, 'measure', schemaVersion)
}

export function quotationDraftRecordFor(
  identity: ActionDraftIdentity,
  draft: QuotationDraft,
  updatedAt: string,
): ActionDraftRecord<QuotationDraftRecordValues> {
  return {
    version: 1,
    identity,
    values: { schemaVersion: QUOTATION_DRAFT_SCHEMA_VERSION, quotationDraft: draft },
    updatedAt,
    status: 'unfinished',
  }
}

export function decodeQuotationDraftRecord(
  value: unknown,
  expectedIdentity: ActionDraftIdentity,
): QuotationDraftDecodeResult {
  const stored = record(value)
  const identity = record(stored?.identity)
  const values = record(stored?.values)
  if (
    !stored ||
    stored.version !== 1 ||
    !identity ||
    !actionDraftIdentityMatches(identity as unknown as ActionDraftIdentity, expectedIdentity) ||
    expectedIdentity.actionIntent !== 'place_order' ||
    expectedIdentity.contentKind !== 'quotation' ||
    typeof stored.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(stored.updatedAt)) ||
    stored.status !== 'unfinished' ||
    !values ||
    !exactKeys(values, ['schemaVersion', 'quotationDraft'])
  ) return { state: 'invalid', reason: '本地报价草稿格式无效，未覆盖原记录。' }

  const draftValue = record(values.quotationDraft)
  if (!draftValue) return { state: 'invalid', reason: '本地报价草稿内容无效，未覆盖原记录。' }

  if (
    values.schemaVersion === 1 &&
    nonEmptyString(draftValue.workOrderId) &&
    nonEmptyString(draftValue.workflowNodeId) &&
    String(expectedIdentity.workOrderId) === draftValue.workOrderId &&
    String(expectedIdentity.workflowNodeId) === draftValue.workflowNodeId &&
    Array.isArray(draftValue.lines)
  ) {
    return {
      state: 'legacy_requires_action',
      reason: '检测到旧版平铺报价草稿。原记录已保留，未自动迁移或覆盖；新分组模型不会猜测旧明细的维修部位与工程量归属。',
    }
  }

  if (
    (values.schemaVersion !== 2 && values.schemaVersion !== 3 && values.schemaVersion !== QUOTATION_DRAFT_SCHEMA_VERSION) ||
    !exactKeys(draftValue, ['workOrderId', 'workflowNodeId', 'draftVersion', 'groups']) ||
    !nonEmptyString(draftValue.workOrderId) ||
    !nonEmptyString(draftValue.workflowNodeId) ||
    String(expectedIdentity.workOrderId) !== draftValue.workOrderId ||
    String(expectedIdentity.workflowNodeId) !== draftValue.workflowNodeId ||
    typeof draftValue.draftVersion !== 'number' ||
    !Number.isSafeInteger(draftValue.draftVersion) ||
    draftValue.draftVersion < 1 ||
    !Array.isArray(draftValue.groups) ||
    !draftValue.groups.every((group) => validGroup(group, values.schemaVersion as 2 | 3 | 4))
  ) return { state: 'invalid', reason: '新版报价分组草稿内容无效，未覆盖原记录。' }

  const groups = draftValue.groups as QuotationGroup[]
  const groupIds = new Set(groups.map((group) => group.groupId))
  const duplicateConfiguredPackage = Number(values.schemaVersion) >= 3 && groups.some((group) => {
    const configuredIds = group.projPackages
      .filter((selection) => selection.configuration)
      .map((selection) => selection.catalogId)
    return new Set(configuredIds).size !== configuredIds.length
  })
  const selectionIds = groups.flatMap((group) => [
    ...group.projPackages,
    ...group.procedures,
    ...group.materials,
    ...group.measures,
  ]).map((selection) => selection.selectionId)
  if (groupIds.size !== groups.length || new Set(selectionIds).size !== selectionIds.length || duplicateConfiguredPackage) {
    return { state: 'invalid', reason: '报价分组草稿存在重复身份，未覆盖原记录。' }
  }

  return {
    state: 'valid',
    draft: {
      workOrderId: draftValue.workOrderId,
      workflowNodeId: draftValue.workflowNodeId,
      draftVersion: draftValue.draftVersion,
      groups: groups.map((group) => ({
        groupId: group.groupId,
        repairParts: [...group.repairParts],
        partDescription: group.partDescription,
        maintainAreaNum: group.maintainAreaNum,
        projPackages: group.projPackages.map((selection) => ({
          ...selection,
          ...(selection.configuration ? {
            configuration: {
              procedures: selection.configuration.procedures.map((component) => ({ ...component })),
              materials: selection.configuration.materials.map((component) => ({ ...component })),
              measures: selection.configuration.measures.map((component) => ({ ...component })),
            },
          } : {}),
        })),
        procedures: group.procedures.map((selection) => ({ ...selection })),
        materials: group.materials.map((selection) => ({ ...selection,
          ...(selection.skuChoices ? { skuChoices: selection.skuChoices.map(choice => ({
            ...choice, attributes: { ...choice.attributes },
          })) } : {}),
        })),
        measures: group.measures.map((selection) => ({ ...selection })),
      })),
    },
  }
}
