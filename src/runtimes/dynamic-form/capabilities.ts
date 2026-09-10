import type {
  FormCapabilityDecision,
  FormFieldSchema,
  OptionProviderDecision,
} from './types'

const supportedTypes = new Set([
  'text',
  'textarea',
  'phone',
  'IDNumber',
  'number',
  'digit',
  'date',
  'time',
  'datetime',
  'select',
  'bizSelect',
  'cascade',
  'radio',
  'checkbox',
  'switch',
  'rate',
  'file',
  'image',
  'area',
])

const optionTypes = new Set(['select', 'bizSelect', 'cascade', 'radio', 'checkbox'])
const codeBackedTypes = new Set(['select', 'bizSelect', 'radio', 'checkbox'])

export function classifyFieldType(type: string): FormCapabilityDecision {
  if (!supportedTypes.has(type)) {
    return { capability: 'UNSUPPORTED', reason: `unsupported field type: ${type}` }
  }
  if (type === 'area') return { capability: 'CONDITIONAL_CAPABILITY', reason: 'named declarative rule required' }
  return { capability: 'SUPPORTED_GENERIC' }
}

export function selectOptionProvider(field: FormFieldSchema): OptionProviderDecision {
  if (field.key === 'workType') {
    return { state: 'provider', provider: { kind: 'workTypes' } }
  }
  if (field.type === 'cascade' && field.valueOption) {
    return {
      state: 'provider',
      provider: { kind: 'cascade', valueOption: field.valueOption },
    }
  }
  if (codeBackedTypes.has(field.type) && field.valueOption) {
    return {
      state: 'provider',
      provider: { kind: 'code', valueOption: field.valueOption },
    }
  }
  if (field.inlineOptions) {
    return { state: 'provider', provider: { kind: 'inline' } }
  }
  if (optionTypes.has(field.type)) {
    return { state: 'unsupported', reason: 'required option provider is unavailable' }
  }
  return { state: 'not_required' }
}
