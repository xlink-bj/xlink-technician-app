import type { MediaPostUploadProcessorPort } from '@shared/ports'
import { createOperationError, type OperationSnapshot, type UploadedMediaRef } from '@shared/types'

/**
 * Deterministic development processor. It models a final remote artifact
 * without claiming that the backend watermark endpoint was executed.
 */
export class MockMediaPostUploadProcessor implements MediaPostUploadProcessorPort {
  async process(input: {
    readonly source: UploadedMediaRef
    readonly evidence?: import('@shared/types').MediaEvidenceContext
  }): Promise<OperationSnapshot<UploadedMediaRef>> {
    if (input.evidence?.postUploadPolicy === 'remote_location_watermark' && !input.evidence.location) {
      return {
        state: 'failed_terminal',
        error: createOperationError('authorization_denied', 'Location evidence is required before mock watermark processing', { code: 'location_required' }),
      }
    }
    const identity = input.source.key ?? input.source.url
    const syntheticKey = `mock-watermarked/${encodeURIComponent(identity)}`
    return {
      state: 'succeeded',
      data: {
        ...input.source,
        url: `https://mock-watermarked.invalid/${syntheticKey}`,
        // R1 keeps the original upload key as the form object's name while
        // the URL points to the newly generated watermarked object.
        ...(input.source.key ? { key: input.source.key } : {}),
      },
    }
  }
}

export function createMockMediaPostUploadProcessor(): MediaPostUploadProcessorPort {
  return new MockMediaPostUploadProcessor()
}
