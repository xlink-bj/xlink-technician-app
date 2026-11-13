interface FixtureRequest {
  method(): string
  url(): string
  postData(): string | null
}

const informationBody = Object.freeze({
  colName: 'serviceAppointment', 'is:state|integer#and': '1',
  sortField: 'order', sortOrder: 'asc', page: '1', size: '200',
})

/** Recognize only the new optional read in unrelated Survey fixtures.
 * Returning false leaves the fixture's existing unexpected-request rejection
 * intact. Inspect raw form entries so duplicate parameters cannot disappear
 * through Object.fromEntries. No real HTTP or production data is involved. */
export function isWorkOrderInformationRead(request: FixtureRequest, origin: string): boolean {
  if (request.method() !== 'POST') return false
  const url = new URL(request.url())
  if (url.origin !== origin || url.pathname !== '/xlink/wm/biz/extField/query'
    || url.search || url.hash || url.username || url.password) return false
  const params = new URLSearchParams(request.postData() ?? '')
  const entries = Array.from(params.entries())
  return entries.length === Object.keys(informationBody).length
    && Object.entries(informationBody).every(([key, value]) => {
      const matches = params.getAll(key)
      return matches.length === 1 && matches[0] === value
    })
}
