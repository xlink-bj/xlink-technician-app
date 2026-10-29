/**
 * Exact R1 HTTP readback for an isolated, explicitly authorized Beta pilot.
 * No default App registration, no broad listing, no local raw-payload storage.
 * A separate role/work-order/node reader must still verify current scope.
 */
import type { ApiReadTransport } from './technician-api'
import { isProductionReadOnlyRuntime, isProductionReadOnlyTarget } from '@shared/config'
import type {
  R1PilotRawReadbackPort, R1PilotReadbackReceipt, R1PilotReadbackScope,
} from '@shared/ports/r1-pilot-readback'

type RecordValue = Readonly<Record<string, unknown>>
const asRecord = (value: unknown): RecordValue | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue : null
const identifier = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

function envelope(raw: unknown): RecordValue | null {
  const outer = asRecord(raw)
  if (!outer || outer.success === false || asRecord(outer.data)?.success === false
    || (outer.success !== undefined && outer.success !== true)) return null
  return outer
}

/** Only a single exact-ID result is acceptable. A 2-row request exposes a
 * duplicate/ambiguous response without enumerating unrelated data.
 */
function exactFormData(raw: unknown, scope: R1PilotReadbackScope, id: string): RecordValue | null {
  const outer = envelope(raw)
  if (!outer) return null
  const data = asRecord(outer.data)
  const items = Array.isArray(outer.data) ? outer.data
    : Array.isArray(data?.items) ? data!.items
      : Array.isArray(outer.items) ? outer.items : null
  if (!items || items.length !== 1) return null
  const total = outer.total ?? outer.dataCount ?? outer.totalCount
  if (total !== undefined && total !== 1) return null
  const record = asRecord(items[0])
  if (!record || record._id !== id
    || (record.id !== undefined && record.id !== id)
    || (record.dataId !== undefined && record.dataId !== id)
    || record.sid !== scope.workOrderId
    || record.nodeId !== scope.runtimeNodeId
    || record.smodule !== 'serviceAppointment'
    || (record.formDefId !== undefined && record.formDefId !== scope.formDefinitionId)
    || (scope.sourceNodeType === 'repeat' && record.workflowId !== scope.workflowRunId)
    || (record.workflowId !== undefined && record.workflowId !== scope.workflowRunId)) return null
  return record
}

function exactFormsExts(raw: unknown, scope: R1PilotReadbackScope): RecordValue | null {
  const outer = envelope(raw)
  if (!outer) return null
  const payload = asRecord(outer.data) ?? outer
  const order = asRecord(payload.serviceAppointment) ?? asRecord(payload.workOrder)
    ?? asRecord(payload.entity) ?? payload
  const orderId = identifier(order._id) ?? identifier(order.id)
  if (orderId !== scope.workOrderId || !Array.isArray(payload.workflowNode)) return null
  const candidates = payload.workflowNode.filter(row => {
    const node = asRecord(row)
    return node && (node._id === scope.runtimeNodeId || node.id === scope.runtimeNodeId)
  })
  if (candidates.length !== 1) return null
  const node = asRecord(candidates[0])!
  if ((node._id !== undefined && node._id !== scope.runtimeNodeId)
    || (node.id !== undefined && node.id !== scope.runtimeNodeId)
    || (node.workflowId !== undefined && node.workflowId !== scope.workflowRunId)
    || (node.formDefId !== undefined && node.formDefId !== scope.formDefinitionId)
    || !asRecord(node.exts)) return null
  const exts = asRecord(node.exts)!
  if (!Array.isArray(exts.formList) || exts.formList.length > 50) return null
  return exts
}

function exactRepeatList(raw: unknown, scope: R1PilotReadbackScope): {
  readonly complete: true
  readonly workflowRunId: string
  readonly savedIds: readonly string[]
} | null {
  const outer = envelope(raw)
  if (!outer) return null
  const data = asRecord(outer.data)
  const items = Array.isArray(data?.items) ? data!.items
    : Array.isArray(outer.items) ? outer.items : null
  const total = outer.total ?? outer.totalCount ?? outer.dataCount
  if (!items || items.length > 20 || total !== items.length) return null
  const savedIds: string[] = []
  for (const value of items) {
    const row = asRecord(value)
    const id = row ? identifier(row._id) ?? identifier(row.id) : null
    if (!row || !id || savedIds.includes(id)
      || (row.id !== undefined && row.id !== id)
      || row.workflowId !== scope.workflowRunId
      || (row.formDefId !== undefined && row.formDefId !== scope.formDefinitionId)
      || row.state === -1) return null
    savedIds.push(id)
  }
  return { complete: true, workflowRunId: scope.workflowRunId!, savedIds }
}

export interface R1PilotRawReadbackOptions {
  readonly transport: ApiReadTransport
  readonly environment: string
  readonly apiBaseUrl: string
  /** Rechecks the exact actor, role, listed WorkOrder and explicit grant. */
  readonly mayReadScope: (scope: R1PilotReadbackScope) => boolean
}

export function createR1PilotAuthoritativeReadback(options: R1PilotRawReadbackOptions):
  R1PilotRawReadbackPort {
  const permitted = (scope: R1PilotReadbackScope): boolean => Boolean(
    scope.workflowRunId && options.mayReadScope(scope)
    && !isProductionReadOnlyRuntime()
    && !isProductionReadOnlyTarget(options.environment, options.apiBaseUrl),
  )
  const getOne = async (scope: R1PilotReadbackScope, id: string): Promise<RecordValue | null> => {
    if (!permitted(scope) || !id || id.startsWith('local-')) return null
    const raw = await options.transport.execute({
      method: 'POST', path: `biz/extForm/query/${encodeURIComponent(scope.formDefinitionId)}`,
      body: { sortField: 'createTime', sortOrder: 'desc',
        'is:_id|string#and': id, page: 1, rows: 2 },
    })
    return permitted(scope) ? exactFormData(raw, scope, id) : null
  }
  return {
    async readMutation(scope, receipt: R1PilotReadbackReceipt) {
      if (!permitted(scope) || receipt.workOrderId !== scope.workOrderId
        || receipt.runtimeNodeId !== scope.runtimeNodeId
        || receipt.formDefinitionId !== scope.formDefinitionId
        || receipt.workflowRunId !== scope.workflowRunId
        || receipt.sourceNodeType !== scope.sourceNodeType) return null
      const target = receipt.savedFormDataIds[0] ?? receipt.targetFormDataId
      if (!target) return null
      const record = await getOne(scope, target)
      if (!permitted(scope)) return null
      if (scope.sourceNodeType === 'forms') {
        if (!record) return null
        const raw = await options.transport.execute({
          method: 'POST',
          path: `basic/serviceAppointment/queryById/${encodeURIComponent(scope.workOrderId)}`,
          // Never add R1's type=query authorization bypass.
          body: {},
        })
        const exts = permitted(scope) ? exactFormsExts(raw, scope) : null
        if (!exts || !record) return null
        return {
          workOrderId: scope.workOrderId, runtimeNodeId: scope.runtimeNodeId,
          formDefinitionId: scope.formDefinitionId, workflowRunId: scope.workflowRunId,
          sourceNodeType: 'forms', formData: record, formsExts: exts,
        }
      }
      const raw = await options.transport.execute({
        method: 'POST', path: `biz/extForm/query/${encodeURIComponent(scope.formDefinitionId)}`,
        body: { sortField: 'createTime', sortOrder: 'desc',
          'is:workflowId|string#and': scope.workflowRunId!, 'ne:state|integer#and': -1,
          page: 1, rows: 20 },
      })
      const repeatList = permitted(scope) ? exactRepeatList(raw, scope) : null
      if (!repeatList) return null
      return {
        workOrderId: scope.workOrderId, runtimeNodeId: scope.runtimeNodeId,
        formDefinitionId: scope.formDefinitionId, workflowRunId: scope.workflowRunId,
        sourceNodeType: 'repeat', ...(record ? { formData: record } : {}), repeatList,
      }
    },
    async readProcessedRecords(scope, ids) {
      if (!permitted(scope) || ids.length < 1 || ids.length > 50
        || new Set(ids).size !== ids.length) return null
      const records: RecordValue[] = []
      // Sequential bounded exact reads: no enumeration or fan-out burst.
      for (const id of ids) {
        const record = await getOne(scope, id)
        if (!record) return null
        records.push(record)
      }
      return permitted(scope) ? records : null
    },
  }
}
