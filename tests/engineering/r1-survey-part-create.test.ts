import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import { workflowNode } from '@adapters/api/read-models/workflow'
import { normalizeR1RepeatValues, projectR1RepeatFields, updateR1FormDraftValue } from '@features/work-orders/r1-repeat-form'
import { createR1RepeatActions, type R1RepeatScope } from '@app/r1-repeat-actions'
import { createNormalRepeatActionProvider } from '@app/r1-repeat-authorization'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import type { SessionSnapshot } from '@shared/ports'
import type { ApiCommandRequest } from '@adapters/api/technician-api-commands'
import { asOpaqueId } from '@shared/types'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

const providerTransport = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@adapters/api/uni-api-command-transport', () => ({ createUniApiCommandTransport: () => providerTransport }))

const definitionId = '7971040108398070730'
const scope: R1RepeatScope = { tenantId: 'tenant', userId: 'user', roleId: 'role', workOrderId: 'work', workflowRunId: 'run', runtimeNodeId: 'node', formDefinitionId: definitionId }
const tree = [
  { value: '3', label: 'Synthetic window', children: [{ value: '31', label: 'Edge', children: [{ value: '311', label: 'Inner', children: [] }] }] },
  { value: '1', label: 'Other', children: [{ value: '11', label: 'Leaf', children: [] }] },
]
const values = () => ({ part: ['3', '31', '311'], length: '2.345', width: '3', planeArea: 7.04, memo: 'synthetic' })
function snapshot(): R1NodeFormsSnapshot {
  const rows = ['part', 'length', 'width', 'planeArea', 'memo'].map(name => ({
    _id: name, extId: definitionId, colName: 'survey', name, nameDisp: name, state: 1,
    type: name === 'part' ? 'cascade' : name === 'memo' ? 'textarea' : 'digit',
    required: name !== 'memo', readOnly: 0, preset: 1, multiple: false,
    frontEndConfig: '{}', showType: '1', showList: ['2', '4'],
    ...(name === 'part' ? { valueOption: 'parts' } : {}),
  }))
  const definition = formDefinition({ data: rows }, asOpaqueId<'FormDefinitionId'>(definitionId))
  return { workOrderId: 'work', node: workflowNode({
    _id: 'node', workflowId: 'run', state: 0, handlerIds: ['role'],
    nodeDef: { nodeType: 'repeat', formDefId: definitionId, formFieldIdsFill: rows.map(r => r._id), formFieldIdsReadOnly: [] },
  }), definition: { ...definition, fields: definition.fields!.map(f => f.valueKey === 'part' ? { ...f, options: structuredClone(tree) } : f) },
  fillableFieldIds: rows.map(r => r._id), records: [] }
}
const session = { sessionRef: 'synthetic', user: { id: 'user' }, currentRole: { id: 'role' } } as unknown as SessionSnapshot
function harness() {
  const initial = snapshot()
  let current = structuredClone(initial)
  const commands = { execute: vi.fn(async (request: ApiCommandRequest) => {
    const body = JSON.parse(String(request.body?.dataStr))
    current = { ...current, records: [{ id: asOpaqueId<'FormDataId'>('saved'), definitionId: current.definition.id,
      workflowRunId: asOpaqueId<'WorkflowRunId'>('run'), values: Object.fromEntries(Object.keys(values()).map(k => [k, structuredClone(body[k])])) }] }
    return { success: true, status: 1, data: { _id: 'saved' } }
  }) }
  const read = vi.fn(async () => current)
  const original = vi.fn(() => ({ part: current.records[0]?.values?.part } as Record<string, unknown>))
  const input = { initialSnapshot: initial, readOriginal: original, env: { DEV: true, VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_AUTH_TENANT: 'tenant',
    VITE_XLINK_API_BASE_URL: 'http://127.0.0.1:5189/xlink/wm', VITE_XLINK_MOCK: 'false', VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true' },
    origin: 'http://127.0.0.1:5189', getSession: () => session, hasExactGrant: () => true, readLatest: read, transport: commands }
  const env = { ...input.env, VITE_XLINK_R1_REPEAT_ACTIONS: 'true',
    VITE_XLINK_R1_REPEAT_GRANT: JSON.stringify({ version: 1, scope, fieldIds: initial.fillableFieldIds,
      expiresAt: '2099-01-01T00:00:00Z', operations: ['create', 'complete'] }) }
  const provider = () => {
    let lease = initial
    providerTransport.execute.mockImplementation(commands.execute)
    return createNormalRepeatActionProvider({ env, origin: input.origin, auth: { getCurrentSession: () => session },
      reader: { enabled: () => true, isCurrent: value => value === lease, clear: () => {},
        currentFormOriginal: () => original(),
        async load() { lease = await read(); return lease } } }).forSnapshot(initial)!
  }
  return { initial, commands, read, original, actions: createR1RepeatActions(input), current: () => current,
    replace: (s: R1NodeFormsSnapshot) => { current = s }, input, env, provider }
}
beforeEach(() => { installLocalFixtureBrowser(); providerTransport.execute.mockReset() })
afterEach(() => vi.unstubAllGlobals())

describe('restricted canonical Survey part create', () => {
  it('projects the existing Cascade control and preserves a complete ordered string path', () => {
    const s = snapshot()
    expect(projectR1RepeatFields(s, {}).find(f => f.valueKey === 'part')?.supported).toBe(true)
    expect(normalizeR1RepeatValues(s, values())).toEqual({ ...values(), length: 2.345, width: 3 })
  })
  it.each([[], ['3'], ['3', '31'], [3, '31', '311'], ['3', '11'], ['1', '31', '311'], ['3', '31', 'unknown'], ['3', '31', '311', '311'], ['311', '31', '3'], ['3', ' 31', '311'], Array(21).fill('3'), '3,31,311'])('rejects incomplete or forged part %j', part => {
    expect(() => normalizeR1RepeatValues(snapshot(), { ...values(), part })).toThrow()
  })
  it.each(['noncanonical', 'multiple', 'readonly', 'conditional', 'wrongtype', 'unknownfield'])('keeps unsupported %s configurations closed', kind => {
    let s = snapshot()
    if (kind === 'noncanonical') s = { ...s, definition: { ...s.definition, id: asOpaqueId<'FormDefinitionId'>('other') } }
    s = { ...s, definition: { ...s.definition, fields: s.definition.fields!.map(f => {
      if (kind === 'multiple' && f.valueKey === 'part') return { ...f, multiple: true }
      if (kind === 'readonly' && f.valueKey === 'planeArea') return { ...f, readOnly: true }
      if (kind === 'conditional' && f.valueKey === 'length') return { ...f, visibility: { kind: 'equals' as const, path: 'part', value: 'unknown' } }
      if (kind === 'wrongtype' && f.valueKey === 'planeArea') return { ...f, type: 'text' }
      return f
    }) } }
    if (kind === 'unknownfield') s = { ...s, definition: { ...s.definition, fields: [...s.definition.fields!, { ...s.definition.fields![1]!, fieldId: 'unknown', valueKey: 'unknown' }] } }
    expect(() => normalizeR1RepeatValues(s, { ...values() })).toThrow()
  })
  it('uses actual length/width draft events for area, rejects an unauthorized target, and does not calculate on part selection', () => {
    const s = snapshot()
    let draft = updateR1FormDraftValue(s, {}, 'part', ['3', '31', '311'])
    expect(draft.planeArea).toBeUndefined()
    draft = updateR1FormDraftValue(s, draft, 'length', '2.345')
    expect(draft.planeArea).toBe('')
    draft = updateR1FormDraftValue(s, draft, 'width', '3')
    expect(draft.planeArea).toBe(7.04)
    expect(updateR1FormDraftValue(s, draft, 'width', '0').planeArea).toBe(0)
    expect(updateR1FormDraftValue(s, draft, 'width', 0).planeArea).toBe(0)
    expect(updateR1FormDraftValue(s, { ...draft, part: ['1', '11'] }, 'width', '4').planeArea).toBe(7.04)
    const source = snapshot()
    const readonly = { ...source, definition: { ...source.definition, fields: source.definition.fields!.map(f => f.valueKey === 'planeArea' ? { ...f, readOnly: true } : f) } }
    expect(() => updateR1FormDraftValue(readonly, draft, 'width', '4')).toThrow()
  })
  it('sends one JSON array and accepts a freshly allocated identical persisted part array', async () => {
    const h = harness()
    const saved = await h.actions.saveOnly(scope, values())
    expect(saved.records[0]?.values?.part).toEqual(['3', '31', '311'])
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
    expect(h.commands.execute.mock.calls[0]![0].path).toBe('biz/extForm/upsert/' + definitionId)
    expect(JSON.parse(String(h.commands.execute.mock.calls[0]![0].body?.dataStr))).toMatchObject({ part: ['3', '31', '311'], planeArea: 7.04 })
  })
  it('copies the caller path before awaiting the first fresh read', async () => {
    const h = harness(), draft = values()
    let release!: () => void
    h.read.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve }); return h.current() })
    const pending = h.actions.saveOnly(scope, draft)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    draft.part.splice(0, 3, '1', '11')
    release()
    await pending
    expect(JSON.parse(String(h.commands.execute.mock.calls[0]![0].body?.dataStr)).part).toEqual(['3', '31', '311'])
  })
  it('rejects fresh provider drift before dispatch', async () => {
    const h = harness(), source = snapshot()
    const drift = { ...source, definition: { ...source.definition, fields: source.definition.fields!.map(f => f.valueKey === 'part' ? { ...f, valueOption: 'changed' } : f) } }
    h.replace(drift)
    await expect(h.actions.saveOnly(scope, values())).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
  it('locks a contradictory post-ACK array without replay', async () => {
    const h = harness()
    const original = h.commands.execute.getMockImplementation()!
    h.commands.execute.mockImplementation(async req => {
      const ack = await original(req)
      const current = h.current()
      h.replace({ ...current, records: current.records.map(record => ({ ...record, values: { ...record.values, part: ['1', '11'] } })) })
      return ack
    })
    await expect(h.actions.saveOnly(scope, values())).rejects.toThrow()
    expect(h.actions.locked(scope)).toBe(true)
    await expect(h.actions.saveOnly(scope, values())).rejects.toThrow()
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
  })
  it.each(['root', 'exts'])('locks a conflicting %s part slot even if the effective projection matches', async slot => {
    const h = harness()
    h.original.mockImplementation(() => slot === 'root'
      ? { part: ['1', '11'], exts: { part: ['3', '31', '311'] } }
      : { part: ['3', '31', '311'], exts: { part: ['1', '11'] } })
    await expect(h.actions.saveOnly(scope, values())).rejects.toThrow()
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
    expect(h.actions.locked(scope)).toBe(true)
  })
  it.each(['readonly', 'conditions', 'fillable', 'options'])('rejects fresh %s drift with zero writes', async kind => {
    const h = harness(), before = snapshot()
    const drift = { ...before, fillableFieldIds: kind === 'fillable' ? before.fillableFieldIds!.slice(1) : before.fillableFieldIds,
      definition: { ...before.definition, fields: before.definition.fields!.map(f => {
        if (kind === 'readonly' && f.valueKey === 'planeArea') return { ...f, readOnly: true }
        if (kind === 'conditions' && f.valueKey === 'length') return { ...f, visibility: { kind: 'equals' as const, path: 'part', value: '3' } }
        if (kind === 'options' && f.valueKey === 'part') return { ...f, options: [{ value: '3', label: 'changed', children: tree[0]!.children }] }
        return f
      }) } }
    h.replace(drift)
    await expect(h.actions.saveOnly(scope, values())).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })

  it('does not let removal or renaming of part disable the initial schema seal', async () => {
    const h = harness()
    h.replace({ ...h.initial, definition: { ...h.initial.definition, fields: h.initial.definition.fields!.map(f => f.valueKey === 'part'
      ? { ...f, valueKey: 'alternatePart', type: 'text', valueOption: undefined, options: undefined } : f) } })
    const { part, ...draft } = values()
    await expect(h.actions.saveOnly(scope, { ...draft, alternatePart: 'changed' })).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
  it.each(['before', 'during-read'])('rejects a v1 closure replaced with an edit-only grant %s saving', async when => {
    const h = harness(), actions = h.provider()
    const revoke = () => {
      const grant = JSON.parse(h.env.VITE_XLINK_R1_REPEAT_GRANT)
      h.env.VITE_XLINK_R1_REPEAT_GRANT = JSON.stringify({ ...grant, version: 2, operations: ['edit'], recordIds: ['saved'] })
    }
    if (when === 'before') revoke()
    else h.read.mockImplementationOnce(async () => { revoke(); return h.current() })
    await expect(actions.saveOnly(values())).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
  it('rejects a changed field authorization and does not lend a v2 grant to completion', async () => {
    const h = harness(), actions = h.provider()
    const grant = JSON.parse(h.env.VITE_XLINK_R1_REPEAT_GRANT)
    h.env.VITE_XLINK_R1_REPEAT_GRANT = JSON.stringify({ ...grant, fieldIds: ['new', ...grant.fieldIds.slice(1)] })
    await expect(actions.saveOnly(values())).rejects.toThrow()
    h.env.VITE_XLINK_R1_REPEAT_GRANT = JSON.stringify({ ...grant, version: 2, operations: ['edit'], recordIds: ['saved'] })
    await expect(actions.complete()).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
  it('keeps a semantically identical v1 grant valid when scope keys and field IDs are reordered', async () => {
    const h = harness(), actions = h.provider()
    const grant = JSON.parse(h.env.VITE_XLINK_R1_REPEAT_GRANT)
    h.env.VITE_XLINK_R1_REPEAT_GRANT = JSON.stringify({ ...grant,
      scope: Object.fromEntries(Object.entries(grant.scope).reverse()), fieldIds: [...grant.fieldIds].reverse() })
    await actions.saveOnly(values())
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
  })

})
