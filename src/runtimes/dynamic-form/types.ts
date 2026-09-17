import type { CompatibilityEntry } from '@shared/config'
import type { FormFieldVisibility, FormFieldVisibilityPath } from '@shared/ports'
import type { LocalMediaRef } from '@shared/types'

export type FormCapability = 'SUPPORTED_GENERIC' | 'CONDITIONAL_CAPABILITY' | 'UNSUPPORTED'

export type NormalizedFieldType =
  | 'text'
  | 'textarea'
  | 'phone'
  | 'IDNumber'
  | 'number'
  | 'digit'
  | 'date'
  | 'time'
  | 'datetime'
  | 'select'
  | 'bizSelect'
  | 'cascade'
  | 'radio'
  | 'checkbox'
  | 'switch'
  | 'rate'
  | 'file'
  | 'image'
  | 'area'

export interface FormOption {
  readonly value: string
  readonly label: string
  readonly children?: readonly FormOption[]
}

export type VisibilityPath = FormFieldVisibilityPath

export type VisibilityExpression = FormFieldVisibility

export interface FormFieldSchema {
  readonly key: string
  readonly type: string
  readonly required?: boolean
  readonly readOnly?: boolean
  readonly multiple?: boolean
  readonly visibility?: VisibilityExpression
  readonly valueOption?: string
  readonly inlineOptions?: readonly FormOption[]
  readonly unsupportedReason?: string
}

export interface FormCapabilityDecision {
  readonly capability: FormCapability
  readonly reason?: string
}

export type OptionProviderKind = 'workTypes' | 'cascade' | 'code' | 'inline'

export interface OptionProviderDescriptor {
  readonly kind: OptionProviderKind
  readonly valueOption?: string
}

export interface OptionProviderDecision {
  readonly state: 'provider' | 'not_required' | 'unsupported'
  readonly provider?: OptionProviderDescriptor
  readonly reason?: string
}

export interface VisibilityEvaluation {
  readonly state: 'visible' | 'hidden' | 'unsupported'
  readonly visible: boolean
  readonly reason?: string
}

export interface FieldStateContext {
  readonly workflowReadOnly?: boolean
  readonly fixedFormReadOnly?: boolean
  readonly runtimeReadOnly?: boolean
  readonly fixedRequired?: boolean
  readonly runtimeRequired?: boolean
  readonly values?: Readonly<Record<string, unknown>>
}

export interface EffectiveFieldState {
  readonly capability: FormCapability
  readonly visible: boolean
  readonly readOnly: boolean
  readonly required: boolean
  readonly optionProvider: OptionProviderDecision
  readonly reason?: string
}

export type NormalizedFieldValue =
  | string
  | number
  | boolean
  | null
  | LocalMediaRef
  | readonly (string | number | boolean | LocalMediaRef)[]

export type NormalizationResult =
  | { readonly ok: true; readonly value: NormalizedFieldValue }
  | { readonly ok: false; readonly reason: 'invalid_value' | 'unsupported_field_type'; readonly message: string }

export interface FormSubmission {
  readonly values: Readonly<Record<string, NormalizedFieldValue>>
}

export type SubmissionResult =
  | { readonly ok: true; readonly value: FormSubmission }
  | {
      readonly ok: false
      readonly reason: 'unsupported_capability' | 'validation'
      readonly fieldKey?: string
      readonly message: string
    }

export interface AreaMeasurementRule {
  readonly entry: CompatibilityEntry
  readonly lengthField: string
  readonly widthField: string
  readonly areaField: string
}

export type AreaRuleResult =
  | { readonly applied: false; readonly values: Readonly<Record<string, unknown>> }
  | { readonly applied: true; readonly values: Readonly<Record<string, unknown>> }
