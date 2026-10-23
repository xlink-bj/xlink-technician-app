import type { CompatibilityEntry } from '@shared/config'
import type { FormFieldVisibility, FormFieldVisibilityPath } from '@shared/ports'
import type { LocalMediaRef, MediaValueRef } from '@shared/types'

export type FormCapability =
  | 'SUPPORTED_GENERIC'
  | 'CONDITIONAL_CAPABILITY'
  | 'PRESENTATION_ONLY'
  | 'UNSUPPORTED'

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
  | 'gap'

export interface FormOption {
  readonly value: string
  readonly label: string
  readonly children?: readonly FormOption[]
}

export type VisibilityPath = FormFieldVisibilityPath

export type VisibilityExpression = FormFieldVisibility

/** Backend showList projection used by the mobile detail Action surface. */
export type FormRuntimeSurface = 'mobile_detail'

export interface FormFieldSchema {
  /** Stable field-row identity used for runtime/UI addressing. */
  readonly fieldId: string
  /** FormData business key; duplicate field rows may share this key. */
  readonly valueKey: string
  readonly type: string
  readonly required?: boolean
  readonly readOnly?: boolean
  readonly order?: number
  readonly state?: number | string
  readonly fixed?: string | number | boolean
  readonly operationType?: string | number
  readonly presentation?: Readonly<Record<string, string | number | boolean>>
  readonly showList?: readonly (string | number)[]
  readonly mobileDetailHidden?: boolean
  readonly presentationOnly?: boolean
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
  readonly surface?: FormRuntimeSurface
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
  | MediaValueRef
  | readonly (string | number | boolean | LocalMediaRef | MediaValueRef)[]

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
      readonly fieldId?: string
      readonly valueKey?: string
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
