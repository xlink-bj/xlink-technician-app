/**
 * Source-backed R1 quotation preflight evidence for synthetic/local review only.
 *
 * This deliberately does not authorize submission, calculate a price, infer
 * work-order-specific ExtFields, or build an Order.exts payload.
 */
import type { QuotationEngineResult } from './engine'
import type { QuotationDraft } from './model'
import type {
  OrderExtFieldEffectivePlan,
  OrderExtFieldPlanRow,
} from './order-extfield-effective-plan'
import { validateQuotationDraft, type QuotationValidationIssue } from './validation'

export type ReviewGateState = 'synthetic_pass' | 'needs_input' | 'unverified'
export type ReviewFieldPhase = 'selection_entry' | 'final_requiredness'
export interface ReviewFieldDiagnostic {
  readonly phase: ReviewFieldPhase
  readonly code: 'schema_unverified' | 'stage_mismatch' | 'rule_unresolved'
    | 'required_value_missing' | 'value_shape_unverified' | 'control_unverified'
  readonly rowId?: string
}
export interface ReviewFieldGate {
  readonly state: ReviewGateState
  readonly requiredCount: number
  readonly diagnostics: readonly ReviewFieldDiagnostic[]
}
export interface LocalQuotationPreflight {
  readonly execution: 'PURE_LOCAL_REVIEW_ONLY'
  readonly composition: {
    readonly state: 'synthetic_pass' | 'needs_input'
    readonly issues: readonly QuotationValidationIssue[]
  }
  /** R1 onSelectionOpen(): visibility matters; dispensable does not. */
  readonly selectionEntry: ReviewFieldGate
  /** R1 placeOrder(): requiredness matters; visibility does not. */
  readonly finalRequiredness: ReviewFieldGate
  readonly pricing: 'local_engine_evaluated' | 'unverified'
  /** Never grant a business command from this report. */
  readonly officialSubmission: 'not_authorized'
}

/** A candidate only when the caller explicitly supplies a complete synthetic fixture. */
export interface LocalQuotationPreflightInput {
  readonly draft: QuotationDraft
  readonly extFieldPlan?: OrderExtFieldEffectivePlan | null
  readonly extFieldValues?: Readonly<Record<string, unknown>>
  readonly schemaEvidence: 'complete_synthetic_fixture' | 'unverified'
  readonly engineResult?: QuotationEngineResult | null
}

function own(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function r1ValuePresence(value: unknown): 'present' | 'missing' | 'unverified' {
  // R1's mandatory check accepts numeric zero, but not false, null or [].
  if (value === undefined || value === null || value === false || value === '') return 'missing'
  if (typeof value === 'number') return Number.isFinite(value) ? 'present' : 'unverified'
  if (typeof value === 'string') return value.trim() ? 'present' : 'missing'
  if (value === true) return 'present'
  if (Array.isArray(value)) return value.length ? 'unverified' : 'missing'
  return 'unverified'
}

function valueShapeSupported(row: OrderExtFieldPlanRow): boolean {
  // Format/option validation of special R1 types is still unknown.
  return row.specialControl === undefined
    && row.provider.blocksRuntimeUse === false
    && (row.controlType === 'text' || row.controlType === 'textarea'
      || row.controlType === 'number' || row.controlType === 'digit')
}

function issue(
  phase: ReviewFieldPhase,
  code: ReviewFieldDiagnostic['code'],
  rowId?: string,
): ReviewFieldDiagnostic {
  return { phase, code, ...(rowId ? { rowId } : {}) }
}

function evaluateFieldGate(
  phase: ReviewFieldPhase,
  plan: OrderExtFieldEffectivePlan | null | undefined,
  schemaEvidence: LocalQuotationPreflightInput['schemaEvidence'],
  values: Readonly<Record<string, unknown>>,
): ReviewFieldGate {
  const diagnostics: ReviewFieldDiagnostic[] = []
  let requiredCount = 0
  if (!plan || schemaEvidence !== 'complete_synthetic_fixture') {
    return { state: 'unverified', requiredCount, diagnostics: [issue(phase, 'schema_unverified')] }
  }
  if (plan.stage !== 'placeOrder') {
    return { state: 'unverified', requiredCount, diagnostics: [issue(phase, 'stage_mismatch')] }
  }

  for (const row of plan.rows) {
    const state = phase === 'selection_entry'
      ? row.disposition === 'blocked' ? 'blocked'
        : row.disposition === 'filtered' ? 'not_applicable'
          : row.requiredness === 'required' ? 'required'
            : row.requiredness === 'optional' || row.requiredness === 'not_applicable'
              ? 'not_applicable' : 'blocked'
      : row.finalSubmit.state
    if (state === 'not_applicable' || state === 'optional') continue
    if (state === 'blocked') {
      diagnostics.push(issue(phase, 'rule_unresolved', row.rowId))
      continue
    }
    requiredCount += 1
    const key = row.valueKey
    if (!key || !own(values, key)) {
      diagnostics.push(issue(phase, 'required_value_missing', row.rowId))
      continue
    }
    const presence = r1ValuePresence(values[key])
    if (presence === 'missing') {
      diagnostics.push(issue(phase, 'required_value_missing', row.rowId))
      continue
    }
    if (presence === 'unverified') {
      diagnostics.push(issue(phase, 'value_shape_unverified', row.rowId))
      continue
    }
    if (!valueShapeSupported(row)) {
      diagnostics.push(issue(phase, 'control_unverified', row.rowId))
    }
  }
  const needsInput = diagnostics.some((d) => d.code === 'required_value_missing')
  return {
    state: needsInput ? 'needs_input' : diagnostics.length ? 'unverified' : 'synthetic_pass',
    requiredCount,
    diagnostics,
  }
}

export function evaluateLocalQuotationPreflight(input: LocalQuotationPreflightInput): LocalQuotationPreflight {
  const validated = validateQuotationDraft(input.draft)
  const values = input.extFieldValues ?? {}
  const pricingVerified = input.engineResult?.state === 'ready'
    && input.engineResult.draftVersion === input.draft.draftVersion
    && input.engineResult.pricing !== undefined
    && input.engineResult.payload !== undefined
  return {
    execution: 'PURE_LOCAL_REVIEW_ONLY',
    composition: {
      state: validated.state === 'ready' ? 'synthetic_pass' : 'needs_input',
      issues: validated.issues,
    },
    selectionEntry: evaluateFieldGate('selection_entry', input.extFieldPlan, input.schemaEvidence, values),
    finalRequiredness: evaluateFieldGate('final_requiredness', input.extFieldPlan, input.schemaEvidence, values),
    pricing: pricingVerified ? 'local_engine_evaluated' : 'unverified',
    officialSubmission: 'not_authorized',
  }
}
