/** Optional, synthetic R1-shaped read fixtures for the R2 category projection.
 * Status strings 104 / 105 / 202 are pinned by work-order-category.ts. Customer,
 * order, workflow and node identities are fabricated, never production records.
 * No unobserved FormDef, handler, lifecycle or command permission is invented.
 */
export function isCategoryMockFixtureEnabled(): boolean {
  return import.meta.env.DEV === true
    && import.meta.env.VITE_XLINK_ENVIRONMENT === 'dev'
    && import.meta.env.VITE_XLINK_R1_CATEGORY_FIXTURES === 'true'
}

const samples = [
  { status: '104', name: '周先生', address: '青园一号院', task: '联系客户' },
  { status: '105', name: '钱女士', address: '青园二号院', task: '预约上门' },
  { status: '202', name: '郑先生', address: '青园三号院', task: '现场服务' },
] as const

const fixtures = samples.map(sample => {
  const id = `mock-work-order-category-${sample.status}`
  const workflowId = `mock-workflow-category-${sample.status}`
  const node = { _id: `mock-workflow-node-category-${sample.status}`,
    workflowId, nodeDef: { name: sample.task } }
  const appointment = { _id: id, orderNum: `CAT${sample.status}`,
    name: sample.name, address: sample.address, status: sample.status,
    workflowRunId: workflowId }
  return { node, appointment, workflowId }
})

/** The normal router applies filtering/paging AFTER adding these rows. */
export function withCategoryMockRows(response: unknown, sanode: boolean): unknown {
  if (!isCategoryMockFixtureEnabled() || !response || typeof response !== 'object'
    || Array.isArray(response)) return response
  const envelope = response as Record<string, unknown>
  if (!Array.isArray(envelope.data)) return response
  const extra = fixtures.map(({ node, appointment }) => sanode
    ? { ...node, data: { ...appointment } } : { ...appointment })
  const data = [...envelope.data, ...extra]
  return { ...envelope, data, total: data.length }
}

/** null is an unsupported synthetic detail, never permission for a live read. */
export function categoryMockDetail(id: string): unknown | null {
  if (!isCategoryMockFixtureEnabled()) return null
  const fixture = fixtures.find(row => row.appointment._id === id)
  if (!fixture) return null
  return { data: { serviceAppointment: { ...fixture.appointment },
    workflow: { _id: fixture.workflowId }, workflowNode: [{ ...fixture.node }] } }
}
