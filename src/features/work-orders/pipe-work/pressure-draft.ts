export const pipePressureJobId = 'mock-pipe-pressure-job-002'
export const pressureDraftContentIdentity = `pipe-pressure-draft-v1:${pipePressureJobId}`

export type PipePressureScope = { readonly workOrderId: string; readonly taskId: string }
export type PipePressureFields = {
  readonly start: string
  readonly end: string
  readonly minutes: string
}
export type PipePressureDraft = {
  readonly schema: 1
  readonly workOrderId: string
  readonly taskId: string
  readonly jobId: typeof pipePressureJobId
  readonly method: 'manual'
  readonly unit: 'MPa'
  readonly fields: PipePressureFields
}

export const emptyPressureFields: PipePressureFields = { start: '', end: '', minutes: '' }

export function isPressureDraftInput(field: keyof PipePressureFields, value: unknown): value is string {
  if (typeof value !== 'string') return false
  return field === 'minutes' ? /^\d{0,6}$/.test(value) : value.length <= 8 && /^\d*(?:\.\d*)?$/.test(value)
}

export function createPressureDraft(scope: PipePressureScope, fields: PipePressureFields): PipePressureDraft {
  return {
    schema: 1,
    workOrderId: scope.workOrderId,
    taskId: scope.taskId,
    jobId: pipePressureJobId,
    method: 'manual',
    unit: 'MPa',
    fields: { start: fields.start, end: fields.end, minutes: fields.minutes },
  }
}

export function parsePressureDraft(value: unknown, scope: PipePressureScope): PipePressureDraft | null {
  const row = value as Partial<PipePressureDraft> | null
  const fields = row?.fields
  if (!row || row.schema !== 1 || row.workOrderId !== scope.workOrderId || row.taskId !== scope.taskId
    || row.jobId !== pipePressureJobId || row.method !== 'manual' || row.unit !== 'MPa' || !fields
    || !isPressureDraftInput('start', fields.start) || !isPressureDraftInput('end', fields.end)
    || !isPressureDraftInput('minutes', fields.minutes)) return null
  return createPressureDraft(scope, fields)
}

export function samePressureFields(left: PipePressureFields, right: PipePressureFields): boolean {
  return left.start === right.start && left.end === right.end && left.minutes === right.minutes
}
