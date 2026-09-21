import type { FormFieldRead } from '@shared/ports'

const multilineTokens = new Set([
  'textarea',
  'memo',
  'note',
  'notes',
  'remarks',
  'description',
])

/**
 * Presentation-only mapping for fields whose content is naturally multiline.
 * Runtime validation and wire semantics remain owned by the form contract.
 */
export function isMultilineField(
  field: Pick<FormFieldRead, 'type' | 'valueKey'>,
): boolean {
  return multilineTokens.has(field.type.toLowerCase()) || multilineTokens.has(field.valueKey.toLowerCase())
}
