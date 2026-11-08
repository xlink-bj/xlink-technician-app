/** Known R1 extForm query subset. This is a synthetic query projection, not
 * evidence of tenant ACL or support for arbitrary backend filters/providers. */
export function queryMockR1FormRows(
  candidates: readonly unknown[], request: Readonly<Record<string, unknown>>,
): unknown {
  const filters = {
    'is:_id|string#and': '_id', 'is:workflowId|string#and': 'workflowId',
    'is:sid|string#and': 'sid', 'is:nodeId|string#and': 'nodeId',
  } as const
  const allowed = new Set([...Object.keys(filters), 'ne:state|integer#and',
    'sortField', 'sortOrder', 'page', 'rows'])
  const denied = () => ({ success: false, code: 'TERMINAL', message: 'Unsupported synthetic FormData query' })
  const page = request.page ?? 1, size = request.rows ?? 20
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(size)
    || (page as number) < 1 || (page as number) > 10000 || (size as number) < 1 || (size as number) > 200
    || Object.keys(request).some(key => !allowed.has(key))
    || (request.sortField !== undefined && request.sortField !== 'createTime')
    || (request.sortOrder !== undefined && !['asc', 'desc'].includes(String(request.sortOrder)))
    || (request['ne:state|integer#and'] !== undefined && request['ne:state|integer#and'] !== -1)
    || Object.keys(filters).some(key => request[key] !== undefined && (
      typeof request[key] !== 'string' || !(request[key] as string).trim()
      || request[key] !== (request[key] as string).trim()))) return denied()
  const object = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value))
  let rows = candidates.filter(object).filter(row =>
    Object.entries(filters).every(([filter, field]) => request[filter] === undefined || row[field] === request[filter])
    && (request['ne:state|integer#and'] === undefined || row.state !== -1))
  if (request.sortField === 'createTime') {
    // Only sort timestamps actually retained in the synthetic raw records.
    // Missing historical timestamps remain unknown; stable ties keep source order.
    const timestamp = (value: unknown): string | number | undefined =>
      typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? value : undefined
    rows = [...rows].sort((a, b) => {
      const x = timestamp(a.createTime), y = timestamp(b.createTime)
      if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1
      const result = x < y ? -1 : x > y ? 1 : 0
      return request.sortOrder === 'desc' ? -result : result
    })
  }
  const total = rows.length, start = ((page as number) - 1) * (size as number)
  // Detach the JSON wire now, before tryMockRead's simulated latency. A later
  // state mutation must not alter the response already selected for this read.
  const data: unknown[] = JSON.parse(JSON.stringify(rows.slice(start, start + (size as number))))
  return { data, page, rows: size, size, total, pages: Math.ceil(total / (size as number)), dataCount: data.length }
}
