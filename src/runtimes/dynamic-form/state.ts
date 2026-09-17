import { classifyFieldType, selectOptionProvider } from './capabilities'
import { evaluateVisibility } from './visibility'
import type { EffectiveFieldState, FieldStateContext, FormFieldSchema } from './types'

export function evaluateFieldState(
  field: FormFieldSchema,
  context: FieldStateContext = {},
): EffectiveFieldState {
  if (field.unsupportedReason) {
    return {
      capability: 'UNSUPPORTED',
      visible: false,
      readOnly: true,
      required: false,
      optionProvider: { state: 'unsupported', reason: field.unsupportedReason },
      reason: field.unsupportedReason,
    }
  }
  const capability = classifyFieldType(field.type)
  const optionProvider = selectOptionProvider(field)
  if (capability.capability === 'UNSUPPORTED') {
    return {
      capability: capability.capability,
      visible: false,
      readOnly: true,
      required: false,
      optionProvider,
      reason: capability.reason,
    }
  }
  if (optionProvider.state === 'unsupported') {
    return {
      capability: 'UNSUPPORTED',
      visible: false,
      readOnly: true,
      required: false,
      optionProvider,
      reason: optionProvider.reason,
    }
  }

  const visibility = evaluateVisibility(field.visibility, context.values ?? {})
  if (visibility.state === 'unsupported') {
    return {
      capability: 'UNSUPPORTED',
      visible: false,
      readOnly: true,
      required: false,
      optionProvider,
      reason: visibility.reason,
    }
  }

  const readOnly = Boolean(
    context.workflowReadOnly || context.fixedFormReadOnly || field.readOnly || context.runtimeReadOnly,
  )
  const requiredSource = context.fixedRequired ?? context.runtimeRequired ?? field.required ?? false
  return {
    capability: capability.capability,
    visible: visibility.visible,
    readOnly,
    required: visibility.visible && !readOnly && requiredSource,
    optionProvider,
  }
}
