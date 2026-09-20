import type { MediaPostUploadProcessorPort } from '@shared/ports'
import { createOperationError, type OperationSnapshot, type UploadedMediaRef } from '@shared/types'

/**
 * Real uploadAddLogo execution is intentionally disabled until the R1
 * GCJ-02 caller versus Backend WGS84 expectation is resolved by evidence.
 * Keeping this as a port implementation makes the safety gate explicit and
 * prevents a future caller from accidentally sending a guessed coordinate.
 */
export class DisabledRealMediaPostUploadProcessor implements MediaPostUploadProcessorPort {
  async process(_input: {
    readonly source: UploadedMediaRef
    readonly evidence?: import('@shared/types').MediaEvidenceContext
  }): Promise<OperationSnapshot<UploadedMediaRef>> {
    return {
      state: 'failed_terminal',
      error: createOperationError(
        'unsupported_capability',
        'Real remote watermark processing is disabled while the coordinate contract is unresolved',
        { code: 'coordinate_contract_conflict' },
      ),
    }
  }
}

export function createDisabledRealMediaPostUploadProcessor(): MediaPostUploadProcessorPort {
  return new DisabledRealMediaPostUploadProcessor()
}
