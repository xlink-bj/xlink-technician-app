import inspectionContractSnapshot from '../../../../contracts/beta/inspection/current.json'

type SnapshotField = (typeof inspectionContractSnapshot.fields)[number]
type SnapshotProvider = (typeof inspectionContractSnapshot.providers)[number]

function rawField(field: SnapshotField): Record<string, unknown> {
  const visibility = field.visibility
  return {
    _id: field.identity,
    name: field.key,
    nameDisp: field.label,
    type: field.type,
    required: field.required ? '1' : '0',
    readOnly: field.readOnly ? '1' : '0',
    multiple: field.multiple,
    order: field.order,
    state: field.state,
    ...(field.valueOption ? { valueOption: field.valueOption } : {}),
    ...(visibility?.showType ? { showType: visibility.showType } : {}),
    ...(visibility?.showField ? { showField: visibility.showField } : {}),
    ...(visibility?.showFieldPreset !== undefined ? { showFieldPreset: visibility.showFieldPreset } : {}),
    ...(visibility?.showValue !== undefined ? { exts: { showValue: visibility.showValue } } : {}),
    ...(field.frontEndConfig ? { frontEndConfig: JSON.stringify(field.frontEndConfig) } : {}),
  }
}

function provider(id: string): SnapshotProvider | undefined {
  return inspectionContractSnapshot.providers.find((item) => item.id === id)
}

export const mockObservedInspectionFormDefinitionId = inspectionContractSnapshot.form.id

/**
 * The committed sanitized Beta contract is the only maintained Inspection
 * schema. This raw response is generated mechanically for the Mock router.
 */
export const mockObservedInspectionFormDefinitionResponse = {
  data: inspectionContractSnapshot.fields.map(rawField),
  page: 1,
  rows: inspectionContractSnapshot.fields.length,
  total: inspectionContractSnapshot.fields.length,
} as const

export const mockInspectionPartsCascadeResponse = [
  {
    type: 'parts',
    children: (provider('parts')?.options ?? []).map((option) => ({
      value: option.value,
      name: option.label,
    })),
  },
] as const

export const mockQualifiedCodeOptionsResponse = [
  {
    eleid: 'qualified',
    options: Object.fromEntries((provider('qualified')?.options ?? []).map((option) => [option.value, option.label])),
  },
] as const

export { inspectionContractSnapshot }
