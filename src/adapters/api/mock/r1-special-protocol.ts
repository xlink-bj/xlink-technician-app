import type { ApiCommandRequest } from '../technician-api-commands'
import { mockCommandState } from './command-state'
import { isDevMockJourneyEnabled } from './journey'
import {
  mockR1FormsWorkOrderId, mockR1RepeatWorkOrderId,
  mockSyntheticDynamicFormDefinitionId,
} from './fixtures'

type Kind = 'forms' | 'repeat'
const targets = {
  forms: { sid: mockR1FormsWorkOrderId, node: 'mock-workflow-node-020-forms', run: 'mock-workflow-run-020' },
  repeat: { sid: mockR1RepeatWorkOrderId, node: 'mock-workflow-node-021-repeat', run: 'mock-workflow-run-021' },
} as const

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function activeNode(kind: Kind): Record<string, unknown> | null {
  const target = targets[kind]
  const detail = object(object(mockCommandState().detailResponses.get(target.sid))?.data)
  const nodes = detail?.workflowNode
  if (!Array.isArray(nodes)) return null
  const node = nodes.map(object).find((candidate) => candidate?._id === target.node)
  const definition = object(node?.nodeDef)
  return node?.state === 0 && definition?.nodeType === kind
    && definition.formDefId === mockSyntheticDynamicFormDefinitionId ? node : null
}

function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b) }
function denied(): unknown { return { success: false, code: 'TERMINAL', message: 'Synthetic special R1 command rejected' } }

function saveSpecialForm(kind: Kind, serialized: unknown): unknown {
  const target = targets[kind]
  if (!activeNode(kind) || typeof serialized !== 'string' || serialized.length > 200000) return denied()
  let data: Record<string, unknown> | null = null
  try { data = object(JSON.parse(serialized)) } catch { return denied() }
  if (!data || data.sid !== target.sid || data.smodule !== 'serviceAppointment'
    || data.nodeId !== target.node || data.workflowId !== target.run
    || data._id !== undefined || data.state !== 1) return denied()
  const fields = Object.entries(data).filter(([key]) =>
    !['_id', 'sid', 'smodule', 'nodeId', 'workflowId', 'state'].includes(key))
  if (!fields.length || fields.length > 50 || fields.some(([key, value]) =>
    !key.trim() || key.length > 120 || !(
      (typeof value === 'string' && value.length <= 4000)
      || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean'))) return denied()
  const idPrefix = `mock-special-form-data-${kind}-`
  let sequence = 1
  while (mockCommandState().formData.has(`${idPrefix}${sequence}`)) sequence += 1
  const id = `${idPrefix}${sequence}`
  mockCommandState().formData.set(id, {
    _id: id, extId: mockSyntheticDynamicFormDefinitionId,
    formDefId: mockSyntheticDynamicFormDefinitionId,
    sid: target.sid, smodule: 'serviceAppointment', nodeId: target.node,
    workflowId: target.run, state: 1, exts: Object.fromEntries(fields),
  })
  return { data: { _id: id } }
}

function updateFormsExts(request: ApiCommandRequest): unknown {
  const node = activeNode('forms')
  const previous = object(node?.exts)
  const proposed = object(request.jsonBody)
  const oldRows = previous?.formList
  const newRows = proposed?.formList
  if (!node || !previous || !proposed || !Array.isArray(oldRows)
    || !Array.isArray(newRows) || newRows.length !== oldRows.length + 1
    || newRows.length > 100) return denied()
  // The source-backed planner must preserve every unknown EXTS attribute and
  // old form-list row. This first admitted Mock slice permits only append;
  // update and soft-delete are separate unfinished A actions.
  const oldMeta = Object.fromEntries(Object.entries(previous).filter(([key]) => key !== 'formList'))
  const newMeta = Object.fromEntries(Object.entries(proposed).filter(([key]) => key !== 'formList'))
  if (!same(oldMeta, newMeta) || !same(newRows.slice(0, -1), oldRows)) return denied()
  const appended = object(newRows[newRows.length - 1])
  const saved = appended && typeof appended._id === 'string'
    ? object(mockCommandState().formData.get(appended._id)) : null
  if (!appended || !saved || saved.sid !== targets.forms.sid
    || saved.nodeId !== targets.forms.node || saved.state !== 1
    || appended.state !== 1 || appended.formDefId !== mockSyntheticDynamicFormDefinitionId
    || newRows.some((item) => !object(item) || typeof object(item)?._id !== 'string')
    || new Set(newRows.map((item) => object(item)?._id)).size !== newRows.length) return denied()
  node.exts = JSON.parse(JSON.stringify(proposed)) as unknown
  return { success: true, data: {} }
}

function completeSpecial(kind: Kind, requestData: Readonly<Record<string, unknown>>): unknown {
  const target = targets[kind]
  const node = activeNode(kind)
  if (!node || requestData.sid !== target.sid || requestData.workflowNodeId !== target.node
    || requestData.smodule !== 'serviceAppointment') return denied()
  if (kind === 'forms') {
    const exts = object(node.exts)
    const rows = exts?.formList
    const hasAppended = Array.isArray(rows) && rows.some((row) => {
      const id = object(row)?._id
      const saved = typeof id === 'string' ? object(mockCommandState().formData.get(id)) : null
      return saved?.sid === target.sid && saved.nodeId === target.node && saved.state === 1
    })
    if (!hasAppended || requestData.nodeFormDefId !== '' || requestData.nodeFormDataId !== '') return denied()
  } else {
    if (requestData.nodeFormDefId !== mockSyntheticDynamicFormDefinitionId
      || typeof requestData.nodeFormDataId !== 'string') return denied()
    const ids = requestData.nodeFormDataId.split(',')
    if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length || ids.some((id) => {
      const saved = object(mockCommandState().formData.get(id))
      return saved?.sid !== target.sid || saved.nodeId !== target.node
        || saved.workflowId !== target.run || saved.state !== 1
    })) return denied()
  }
  node.state = 10
  return { success: true, data: {} }
}

/** Strict, testable R1 special-form Mock gateway. Ordinary form-urlencoded
 * adapters cannot enter this JSON-body-only surface. No real HTTP fallback. */
export async function tryMockR1SpecialCommand(
  request: ApiCommandRequest,
  actor: { readonly userId: string; readonly roleId: string },
  authorizationCurrent: () => boolean,
): Promise<unknown | null> {
  if (!isDevMockJourneyEnabled() || request.r1Special !== true || request.method !== 'POST') return null
  if (actor.userId !== 'synthetic-user' || actor.roleId !== 'synthetic-role'
    || !authorizationCurrent()) return denied()
  if (request.path === `biz/extForm/upsert/${mockSyntheticDynamicFormDefinitionId}`) {
    const data = object(request.body)
    let scope: string | null = null
    try { scope = String(object(JSON.parse(String(data?.dataStr)))?.sid ?? '') } catch { return denied() }
    return scope === targets.forms.sid ? saveSpecialForm('forms', data?.dataStr)
      : scope === targets.repeat.sid ? saveSpecialForm('repeat', data?.dataStr) : denied()
  }
  if (request.path === `workflowNode/updateExts/${targets.forms.node}`) {
    if (request.body !== undefined || !request.jsonBody) return denied()
    return updateFormsExts(request)
  }
  if (request.path === 'workflow/process' && request.body) {
    const sid = request.body.sid
    return sid === targets.forms.sid ? completeSpecial('forms', request.body)
      : sid === targets.repeat.sid ? completeSpecial('repeat', request.body) : denied()
  }
  return null
}
