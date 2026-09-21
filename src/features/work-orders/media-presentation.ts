export interface MediaPresentationField {
  readonly presentation?: {
    readonly max?: number
  }
}

/**
 * Return only a verified media maximum. In particular, zero is a real
 * contract value and must not be collapsed into "not provided".
 */
export function verifiedMediaMaxFor(field: MediaPresentationField): number | undefined {
  const max = field.presentation?.max
  return typeof max === 'number' && Number.isFinite(max) && max >= 0 ? max : undefined
}
