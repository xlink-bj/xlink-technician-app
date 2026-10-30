import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const feature = readFileSync('src/features/work-orders/quotation/MockCommercialFlowLinks.vue', 'utf8')
const page = readFileSync('src/pages/dev/qa-console.vue', 'utf8')

describe('C2-A — DEV Mock commercial review dependency direction', () => {
  it('keeps app implementation imports out of the feature component', () => {
    expect(feature).not.toMatch(/from\s+['"]@app\//)
    expect(feature).toContain("import type { MockCommercialReviewPort } from './mock-commercial-review-port'")
    expect(feature).toContain('props.review.canReview(scope.value)')
    expect(feature).toContain("props.review.confirmCheckpoint(scope.value, 'quotation_preview')")
  })

  it('composes the same fail-closed DEV Mock capabilities at the QA page boundary', () => {
    expect(page).toContain(':review="mockCommercialReview"')
    expect(page).toContain('const mockCommercialReview: MockCommercialReviewPort = {')
    expect(page).toContain("mockJourneyContext(scope.workOrderId)?.stage === 'quotation'")
    expect(page).toContain('&& canReadMaterialSkuMock(scope)')
    for (const name of [
      'materialSkuReviewUrl', 'signingMockReviewUrl', 'readMockCommercialProgress',
      'confirmMockCommercialCheckpoint', 'pauseMockCommercialReview',
      'resumeMockCommercialReview', 'revokeLastMockCommercialCheckpoint',
    ]) {
      expect(page).toContain(name)
    }
  })
})
