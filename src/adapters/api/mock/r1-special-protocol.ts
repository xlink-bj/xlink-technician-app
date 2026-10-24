import type { ApiCommandRequest } from '../technician-api-commands'
import { mockCommandState } from './command-state'
import { isDevMockJourneyEnabled } from './journey'
import { restoreMockR1SpecialState, updateMockR1SpecialState } from './r1-special-state'
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
    || ![1, -1].includes(data.state as number)) return denied()
  const idPrefix = `mock-special-form-data-${kind}-`
  const previousId = data._id
  const previous = typeof previousId === 'string' && previousId.startsWith(idPrefix)
    ? object(mockCommandState().formData.get(previousId)) : null
  if (previousId !== undefined && (!previous || previous.state !== 1
    || previous.sid !== target.sid || previous.nodeId !== target.node
    || previous.workflowId !== target.run || data.extId !== mockSyntheticDynamicFormDefinitionId
    || data.formDefId !== mockSyntheticDynamicFormDefinitionId
    || !same(data.exts, previous.exts))) return denied()
  if (!previous && data.state !== 1) return denied()
  const fields = Object.entries(data).filter(([key]) =>
    !['_id', 'sid', 'smodule', 'nodeId', 'workflowId', 'state',
      'extId', 'formDefId', 'exts'].includes(key))
  if (!previous && (data.extId !== undefined || data.exts !== undefined
    || data.formDefId !== undefined)) return denied()
  if ((!previous && !fields.length) || fields.length > 50 || fields.some(([key, value]) =>
    !key.trim() || key.length > 120 || !(
      (typeof value === 'string' && value.length <= 4000)
      || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean'))) return denied()
  let sequence = 1
  while (mockCommandState().formData.has(`${idPrefix}${sequence}`)) sequence += 1
  const id = previous ? previousId as string : `${idPrefix}${sequence}`
  const saved = {
    ...(previous ?? {}),
    _id: id, extId: mockSyntheticDynamicFormDefinitionId,
    formDefId: mockSyntheticDynamicFormDefinitionId,
    sid: target.sid, smodule: 'serviceAppointment', nodeId: target.node,
    workflowId: target.run, state: data.state,
    exts: { ...(object(previous?.exts) ?? {}), ...Object.fromEntries(fields) },
  }
  if (!updateMockR1SpecialState((draft) => {
    if (draft[kind].state !== 0 || (previous
      ? !same(draft.rows[id], previous) : draft.rows[id] !== undefined)) return false
    draft.rows[id] = saved
    return true
  })) return denied()
  return { data: { _id: id } }
}

function updateFormsExts(request: ApiCommandRequest): unknown {
  const node = activeNode('forms')
  const previous = object(node?.exts)
  const proposed = object(request.jsonBody)
  const oldRows = previous?.formList
  const newRows = proposed?.formList
  if (!node || !previous || !proposed || !Array.isArray(oldRows)
    || !Array.isArray(newRows) || newRows.length < oldRows.length
    || newRows.length > oldRows.length + 1 || newRows.length > 100) return denied()
  // Full-fidelity EXTS: preserve unknown top-level metadata and all untouched
  // rows. One append, one summary edit, or one soft-delete per command.
  const oldMeta = Object.fromEntries(Object.entries(previous).filter(([key]) => key !== 'formList'))
  const newMeta = Object.fromEntries(Object.entries(proposed).filter(([key]) => key !== 'formList'))
  if (!same(oldMeta, newMeta) || newRows.some((item) => !object(item)
    || typeof object(item)?._id !== 'string')
    || new Set(newRows.map((item) => object(item)?._id)).size !== newRows.length) return denied()
  if (newRows.length === oldRows.length + 1) {
    const appended = object(newRows[newRows.length - 1])
    const saved = appended && typeof appended._id === 'string'
      ? object(mockCommandState().formData.get(appended._id)) : null
    if (!same(newRows.slice(0, -1), oldRows) || !appended || !saved
      || saved.sid !== targets.forms.sid || saved.nodeId !== targets.forms.node
      || saved.state !== 1 || appended.state !== 1
      || appended.formDefId !== mockSyntheticDynamicFormDefinitionId) return denied()
  } else {
    const changed = oldRows.map((item, index) => same(item, newRows[index]) ? -1 : index)
      .filter((index) => index !== -1)
    if (changed.length !== 1) return denied()
    const oldRow = object(oldRows[changed[0]])
    const newRow = object(newRows[changed[0]])
    if (!oldRow || !newRow || oldRow._id !== newRow._id || oldRow.state === -1) return denied()
    const oldOther = Object.fromEntries(Object.entries(oldRow).filter(([key]) => !['state', 'formTitle'].includes(key)))
    const newOther = Object.fromEntries(Object.entries(newRow).filter(([key]) => !['state', 'formTitle'].includes(key)))
    if (!same(oldOther, newOther) || ![1, -1].includes(newRow.state as number)
      || (newRow.state === -1 && newRow.formTitle !== oldRow.formTitle)
      || (newRow.state === 1 && newRow.formTitle === oldRow.formTitle)
      || (newRow.formTitle !== undefined && (typeof newRow.formTitle !== 'string'
        || newRow.formTitle.length > 120))) return denied()
  }
  if (!updateMockR1SpecialState((draft) => {
    if (draft.forms.state !== 0 || !same(draft.forms.exts, previous)) return false
    draft.forms.exts = JSON.parse(JSON.stringify(proposed)) as Record<string, unknown>
    return true
  })) return denied()
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
    const activeRecords = Array.isArray(rows) ? rows.filter((row) =>
      object(row)?.state === 1 && typeof object(row)?._id === 'string') : []
    const hasAppended = Array.isArray(rows) && rows.some((row) => {
      const id = object(row)?._id
      const saved = typeof id === 'string' ? object(mockCommandState().formData.get(id)) : null
      return object(row)?.state === 1 && saved?.sid === target.sid
        && saved.nodeId === target.node && saved.state === 1
    })
    // R1 distinguishes Process(saved FormData ID) with two blank slots from
    // Process('complate') for a pre-existing forms list with a definition slot.
    const afterSave = requestData.nodeFormDefId === '' && requestData.nodeFormDataId === ''
      && hasAppended
    const finalize = requestData.nodeFormDefId === mockSyntheticDynamicFormDefinitionId
      && requestData.nodeFormDataId === '' && activeRecords.length > 0
    if (!afterSave && !finalize) return denied()
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
  if (!updateMockR1SpecialState((draft) => {
    if (draft[kind].state !== 0) return false
    draft[kind].state = 10
    return true
  })) return denied()
  return { success: true, data: {} }
}

function removeSpecialRepeat(request: ApiCommandRequest): unknown {
  const formDataId = request.body?.formDataId
  if (typeof formDataId !== 'string' || !formDataId.startsWith('mock-special-form-data-repeat-')) return denied()
  const row = object(mockCommandState().formData.get(formDataId))
  if (!activeNode('repeat') || !row || row.sid !== targets.repeat.sid
    || row.nodeId !== targets.repeat.node || row.workflowId !== targets.repeat.run
    || row.state !== 1) return denied()
  if (!updateMockR1SpecialState((draft) => {
    const existing = draft.rows[formDataId]
    if (draft.repeat.state !== 0 || !same(existing, row)) return false
    draft.rows[formDataId] = { ...existing, state: -1 }
    return true
  })) return denied()
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
  if (!restoreMockR1SpecialState()) return denied()
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
  if (request.path === `biz/extForm/remove/${mockSyntheticDynamicFormDefinitionId}`) {
    if (request.jsonBody !== undefined || request.body?.formDataId === undefined) return denied()
    return removeSpecialRepeat(request)
  }
  if (request.path === 'workflow/process' && request.body) {
    const sid = request.body.sid
    return sid === targets.forms.sid ? completeSpecial('forms', request.body)
      : sid === targets.repeat.sid ? completeSpecial('repeat', request.body) : denied()
  }
  return null
}
