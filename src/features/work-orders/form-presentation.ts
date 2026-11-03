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

/** A visual preset supplied by the host. It never changes R1 field identity,
 * permissions, value codecs, option providers or Workflow behavior. */
export type FormPresentationMode = 'standard' | 'task'
export type FieldPresentationKind = 'field' | 'part' | 'measure' | 'media'
export interface PresentableField {
  readonly type: string
  readonly options?: readonly { readonly children?: readonly unknown[] }[]
}

/** Only field type + VERIFIED option structure choose a control. Do not
 * match formPurpose, valueKey or a translated display label here. "part" is
 * a legacy visual class for a hierarchical cascade, not a domain decision. */
export function fieldPresentationKind(field: PresentableField, mode: FormPresentationMode): FieldPresentationKind {
  if (mode !== 'task') return 'field'
  if (field.type === 'cascade' && field.options?.some(option => Boolean(option.children?.length))) return 'part'
  if (field.type === 'digit' || field.type === 'number') return 'measure'
  if (field.type === 'image' || field.type === 'file') return 'media'
  return 'field'
}

export function usesCascadeSheet(field: PresentableField, mode: FormPresentationMode): boolean {
  return fieldPresentationKind(field, mode) === 'part'
}
