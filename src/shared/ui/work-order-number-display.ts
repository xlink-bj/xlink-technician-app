/** Pure display formatting: equal business values render equally in every data source. */
export function workOrderNumberDisplay(
  displayNumber: string | undefined,
  _syntheticFixture?: boolean,
  _developerReview?: boolean,
): string {
  if (!displayNumber) return ''
  const match = /^MOCK-(\d+)$/i.exec(displayNumber.trim())
  if (match) return `#${match[1]}`
  const fixtureId = /^mock-work-order-(\d+)/i.exec(displayNumber.trim())
  if (fixtureId) return `#${fixtureId[1]}`
  return `#${displayNumber.replace(/^#/, '')}`
}
