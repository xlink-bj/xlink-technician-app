/** A presentation-only rewrite of DEV synthetic identifiers, never backend IDs. */
export function workOrderNumberDisplay(
  displayNumber: string | undefined,
  syntheticFixture: boolean,
  developerReview: boolean,
): string {
  if (!displayNumber) return ''
  if (syntheticFixture && !developerReview) {
    const match = /^MOCK-(\d+)$/i.exec(displayNumber.trim())
    if (match) return `#${match[1]}`
    const fixtureId = /^mock-work-order-(\d+)/i.exec(displayNumber.trim())
    if (fixtureId) return `#${fixtureId[1]}`
  }
  return `#${displayNumber.replace(/^#/, '')}`
}
