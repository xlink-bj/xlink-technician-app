export type CompatibilityScope = 'api' | 'form' | 'platform' | 'tenant' | 'workflow'
export type CompatibilityConfidence = 'low' | 'medium' | 'high'
export type CompatibilityWireReference = string | number

export interface CompatibilityProvenance {
  readonly source: string
  readonly evidenceRef: string
}

export interface CompatibilityActivation {
  readonly approved: boolean
  readonly condition: string
}

export interface CompatibilityEntry {
  readonly semanticName: string
  readonly purpose: string
  readonly scope: CompatibilityScope
  readonly provenance: CompatibilityProvenance
  readonly ownerGate: string
  readonly confidence: CompatibilityConfidence
  readonly activation: CompatibilityActivation
  readonly safeFallback: string
  readonly reviewRemovalCondition: string
  readonly wireReference?: CompatibilityWireReference
}

export type CompatibilityRegistry = Readonly<Record<string, CompatibilityEntry>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateCompatibilityEntry(input: unknown): readonly string[] {
  if (!isRecord(input)) return ['entry must be an object']

  const issues: string[] = []
  const requiredStrings = [
    'semanticName',
    'purpose',
    'ownerGate',
    'safeFallback',
    'reviewRemovalCondition',
  ]

  for (const key of requiredStrings) {
    if (!isNonEmptyString(input[key])) issues.push(`${key} is required`)
  }

  if (!['api', 'form', 'platform', 'tenant', 'workflow'].includes(String(input.scope))) {
    issues.push('scope is invalid')
  }
  if (!['low', 'medium', 'high'].includes(String(input.confidence))) {
    issues.push('confidence is invalid')
  }

  if (!isRecord(input.provenance)) {
    issues.push('provenance is required')
  } else {
    if (!isNonEmptyString(input.provenance.source)) issues.push('provenance.source is required')
    if (!isNonEmptyString(input.provenance.evidenceRef)) {
      issues.push('provenance.evidenceRef is required')
    }
  }

  if (!isRecord(input.activation)) {
    issues.push('activation is required')
  } else {
    if (typeof input.activation.approved !== 'boolean') {
      issues.push('activation.approved is required')
    }
    if (!isNonEmptyString(input.activation.condition)) {
      issues.push('activation.condition is required')
    }
  }

  return issues
}

export function isCompatibilityEntryActive(entry: CompatibilityEntry): boolean {
  return validateCompatibilityEntry(entry).length === 0 && entry.activation.approved
}

export function getActiveCompatibilityEntry(
  registry: CompatibilityRegistry,
  semanticName: string,
): CompatibilityEntry | undefined {
  const entry = registry[semanticName]
  return entry && isCompatibilityEntryActive(entry) ? entry : undefined
}
