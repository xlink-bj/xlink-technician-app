/** Appointment-only replacement provenance. Never persisted in editable drafts.
 * API strings are retained as read, not reconstructed as BSON Dates. No CAS claim.
 */
export const appointmentBusinessKeys = ['need', 'reasons1', 'otherReason', 'datetime', 'note', 'modifyReason'] as const
const business = new Set<string>(appointmentBusinessKeys)
const retained = new Set(['orgId', 'orgName', 'belongTo', 'createDateTime', 'createUserName'])
const rebuilt = new Set(['tenantId', 'createTime', 'createUser', 'updateTime', 'updateDateTime', 'updateUser', 'updateUserName'])
const envelope = new Set(['_id', 'id', 'dataId', 'extId', 'formDefId', 'definitionId', 'workflowRunId', 'runId', 'workflowId', 'sid', 'smodule', 'nodeId', 'state'])
export interface AppointmentReplacementContext {
  readonly definitionId: string
  readonly dataId: string
  readonly workflowRunId?: string
  readonly workOrderId?: string
  readonly workflowNodeId?: string
  readonly metadata: Readonly<Record<string, string>>
  readonly blockers: readonly string[]
}
const issued = new WeakSet<object>()
/** Called only after the read mapper has checked record/definition identities.
 * Inspect before lossy FormFieldValue mapping, including nested/unknown values.
 */
export function appointmentReplacementContextFromRead(
  raw: Readonly<Record<string, unknown>>,
  identity: { readonly definitionId: string; readonly dataId: string; readonly workflowRunId?: string },
): AppointmentReplacementContext {
  const metadata: Record<string, string> = {}
  const blockers: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (retained.has(key)) {
      if (typeof value === 'string') metadata[key] = value
      else blockers.push(key)
    } else if (key === 'exts') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) { blockers.push(key); continue }
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (!business.has(nestedKey) || (nestedValue !== null && typeof nestedValue !== 'string' && typeof nestedValue !== 'number' && typeof nestedValue !== 'boolean')) blockers.push(`exts.${nestedKey}`)
        if (Object.prototype.hasOwnProperty.call(raw, nestedKey) && raw[nestedKey] !== nestedValue) blockers.push(`duplicate.${nestedKey}`)
      }
    } else if (business.has(key)) {
      if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') blockers.push(key)
    } else if (!rebuilt.has(key) && !envelope.has(key)) blockers.push(key)
  }
  for (const key of ['sid', 'nodeId']) {
    const value = raw[key]
    if (value !== undefined && (typeof value !== 'string' || !value || value !== value.trim())) blockers.push(key)
  }
  if (raw.smodule !== undefined && raw.smodule !== 'serviceAppointment') blockers.push('smodule')
  if (raw.state !== undefined && raw.state !== 1) blockers.push('state')
  const context: AppointmentReplacementContext = Object.freeze({
    ...identity,
    ...(typeof raw.sid === 'string' ? { workOrderId: raw.sid } : {}),
    ...(typeof raw.nodeId === 'string' ? { workflowNodeId: raw.nodeId } : {}),
    metadata: Object.freeze(metadata), blockers: Object.freeze(blockers),
  })
  issued.add(context)
  return context
}
export function appointmentReplacementProblem(input: {
  readonly definitionId?: string; readonly dataId?: string; readonly workflowRunId?: string
  readonly workOrderId?: string; readonly workflowNodeId?: string
  readonly appointmentReplacement?: AppointmentReplacementContext
}, command = false): string | undefined {
  const context = input.appointmentReplacement
  if (!input.dataId) return context ? 'Appointment replacement context does not belong to a new record' : undefined
  if (!context || !issued.has(context)) return 'Reopen the appointment to read its replacement context before saving'
  if (context.dataId !== input.dataId || context.definitionId !== input.definitionId) return 'Appointment replacement record identity mismatch'
  if (input.workflowRunId !== undefined && context.workflowRunId !== input.workflowRunId) return 'Appointment replacement workflow identity mismatch'
  if (command && (!context.workOrderId || !context.workflowNodeId || !context.workflowRunId)) return 'Appointment replacement is missing trusted command scope'
  if (command && ((context.workOrderId !== undefined && context.workOrderId !== input.workOrderId)
    || (context.workflowNodeId !== undefined && context.workflowNodeId !== input.workflowNodeId)
    || (context.workflowRunId !== undefined && context.workflowRunId !== input.workflowRunId))) return 'Appointment replacement command scope mismatch'
  if (context.blockers.length) return `Appointment replacement cannot preserve: ${context.blockers.join(', ')}`
  return undefined
}
export function appointmentNullBusinessKey(values: Readonly<Record<string, unknown>>): string | undefined {
  return appointmentBusinessKeys.find(key => Object.prototype.hasOwnProperty.call(values, key) && values[key] === null)
}
