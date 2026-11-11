import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalRepeatActionProvider, parseR1RepeatGrant } from '@app/r1-repeat-authorization'
import { projectR1RecordReadFields } from '@features/work-orders/r1-record-read-fields'
import { normalizeR1RepeatValues, projectR1RepeatFields } from '@features/work-orders/r1-repeat-form'
import { normalizeR1FormsEditValues } from '@features/work-orders/r1-forms-edit-values'
import { actionFormSchemaFor } from '@features/work-orders/action-form-schema'
import { normalizeFieldValue, normalizeSubmission } from '@runtimes/dynamic-form'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

// Entirely synthetic configuration: these keys/options are not captured production data.
const origin = 'http://127.0.0.1:5189'
const scope = { tenantId: 'synthetic-tenant', userId: 'synthetic-user', roleId: 'synthetic-role', workOrderId: 'synthetic-work', workflowRunId: 'synthetic-run', runtimeNodeId: 'synthetic-node', formDefinitionId: 'synthetic-definition' }
const key = 'configuredChoices'
const tree = [{ value: 'north', label: '合成北区', children: [{ value: 'leaf', label: '合成叶子', children: [] }] }, { value: 'south', label: '合成南区', children: [{ value: 'other', label: '合成其他', children: [] }] }]
type Kind = 'checkbox' | 'select' | 'cascade'
function harness(type: Kind, preset = 0, existing = true) {
  let session: any = { sessionRef: 'synthetic-array-session', user: { id: scope.userId }, currentRole: { id: scope.roleId }, capabilityNames: [] }
  const field: any = { _id: 'synthetic-field', tenantId: scope.tenantId, extId: scope.formDefinitionId, colName: 'syntheticArrayContract', name: key, nameDisp: '合成数组字段', type, state: 1, required: '0', readOnly: 0, operationType: '1', multiple: type !== 'cascade', preset, showList: ['4'], showType: '1', frontEndConfig: '{}', valueOption: type === 'cascade' ? 'SYN_TREE' : 'SYN_CODES' }
  const fields: any[] = [field]
  const value = type === 'cascade' ? ['north', 'leaf'] : ['b', 'a']
  const record: any = { _id: 'synthetic-record', tenantId: scope.tenantId, sid: scope.workOrderId, nodeId: scope.runtimeNodeId, workflowId: scope.workflowRunId, state: 1, unknownRoot: { retained: 'synthetic' }, exts: { unknownExtension: 'synthetic' } }
  if (preset) record[key] = value; else record.exts[key] = value
  const node: any = { _id: scope.runtimeNodeId, tenantId: scope.tenantId, workflowId: scope.workflowRunId, workflowFormDataId: scope.workOrderId, workflowFormColName: 'serviceAppointment', state: 0, handlerIds: [scope.roleId], nodeDef: { nodeType: 'repeat', formDefId: scope.formDefinitionId, formFieldIdsFill: [field._id], formFieldIdsReadOnly: [] } }
  let fault = '', hook: ((path: string) => Promise<void>) | undefined
  const calls: any[] = []
  const transport = { execute: vi.fn(async (request: any) => {
    calls.push(structuredClone(request)); await hook?.(request.path)
    if (request.path === 'basic/serviceAppointment/queryById/' + scope.workOrderId) return { success: true, status: 1, data: { serviceAppointment: { _id: scope.workOrderId, tenantId: scope.tenantId, workflowId: scope.workflowRunId, state: 1 }, workflow: { _id: scope.workflowRunId, tenantId: scope.tenantId, formDataId: scope.workOrderId, state: 0 }, workflowNode: [node] } }
    if (request.path === 'biz/ext/queryById.do') return { _id: scope.formDefinitionId, tenantId: scope.tenantId, state: 1, type: '0', colName: field.colName }
    if (request.path === 'biz/extField/query') return { data: structuredClone(fields), total: fields.length, page: 1, size: 50 }
    if (request.path === 'i/code/selectCode.do') return [{ codeId: fault === 'provider' ? 'WRONG' : 'SYN_CODES', eleid: 'SYN_CODES', ...(fault === 'tenant' ? { tenantId: 'other' } : {}), options: { a: '合成甲', b: '合成乙' } }]
    if (request.path === 'i/code/selectMultistageCode.do') return [{ type: fault === 'provider' ? 'WRONG' : 'SYN_TREE', tenantId: fault === 'tenant' ? 'other' : scope.tenantId, children: tree.map(x => ({ value: x.value, name: x.label, children: x.children.map(y => ({ value: y.value, name: y.label, children: [] })) })) }]
    if (request.path === 'biz/extForm/query/' + scope.formDefinitionId) return { data: existing ? [structuredClone(record)] : [], total: existing ? 1 : 0, page: 1, size: request.body.rows, dataCount: existing ? 1 : 0 }
    throw Error('No command/upload/unknown endpoint is permitted in this synthetic read transport')
  }) }
  const env: any = { DEV: true, VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_AUTH_TENANT: scope.tenantId, VITE_XLINK_API_BASE_URL: origin + '/xlink/wm', VITE_XLINK_MOCK: 'false', VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false' }
  const auth = { getCurrentSession: () => session }
  const reader = createNormalNodeFormsReader({ auth, read: { listWorkOrders: vi.fn(), isWorkOrderListedForCurrentSession: () => true, getDynamicCodeOptions: vi.fn() } as any, tenantId: scope.tenantId, env, origin, transport })
  const request = vi.fn(); vi.stubGlobal('uni', { request })
  const writerEnv = { ...env, VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true', VITE_XLINK_R1_REPEAT_ACTIONS: 'true', VITE_XLINK_R1_REPEAT_GRANT: JSON.stringify({ version: 1, scope, fieldIds: [field._id], operations: ['create', 'complete'], expiresAt: '2040-01-01T00:00:00Z' }) }
  const provider = createNormalRepeatActionProvider({ auth, reader, env: writerEnv, origin })
  const zeroCommands = () => { expect(request).not.toHaveBeenCalled(); expect(calls.filter(x => /upsert|updateExts|process|upload|upToken/i.test(x.path))).toEqual([]) }
  return { reader, provider, writerEnv, field, fields, record, node, calls, request, zeroCommands, value, fault: (v: string) => { fault = v }, hook: (v: typeof hook) => { hook = v }, role: () => { session = { ...session, currentRole: { id: 'other-role' } } } }
}
type Harness = ReturnType<typeof harness>
type Snapshot = Awaited<ReturnType<Harness['reader']['load']>>
type Actions = NonNullable<ReturnType<Harness['provider']['forSnapshot']>>
const arraySchemaError = '字段、选项或规则尚未核实，不能保存。'
function grantedCreateActions(h: Harness, snapshot: Snapshot): Actions {
  expect(parseR1RepeatGrant(h.writerEnv.VITE_XLINK_R1_REPEAT_GRANT)).toMatchObject({
    version: 1, scope, fieldIds: [h.field._id], operations: ['create', 'complete'],
  })
  expect(snapshot.node).toMatchObject({ id: scope.runtimeNodeId, runId: scope.workflowRunId,
    sourceNodeType: 'repeat', nodeTypeEvidence: 'runtime_node_def', lifecycle: 'active',
    handlers: [{ kind: 'unclassified', value: scope.roleId }], formFieldIdsReadOnly: [] })
  expect(snapshot.fillableFieldIds).toEqual([h.field._id]); expect(snapshot.records).toEqual([])
  const actions = h.provider.forSnapshot(snapshot); expect(actions).not.toBeNull()
  return actions!
}
async function rejectsAtArraySchema(h: Harness, actions: Actions, value: unknown): Promise<void> {
  // Pass-through spy: the real reader must finish a fresh read before schema denial.
  const load = vi.spyOn(h.reader, 'load'), firstCall = h.calls.length
  try {
    await expect(actions.saveOnly({ [key]: value } as Parameters<Actions['saveOnly']>[0]))
      .rejects.toThrowError(new Error(arraySchemaError))
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(scope.workOrderId, scope.runtimeNodeId)
    expect(load.mock.results[0]!.type).toBe('return')
    const fresh = await load.mock.results[0]!.value as Snapshot
    expect(h.reader.isCurrent(fresh)).toBe(true); expect(fresh.records).toEqual([])
    expect(fresh.node).toMatchObject({ lifecycle: 'active', nodeTypeEvidence: 'runtime_node_def',
      handlers: [{ kind: 'unclassified', value: scope.roleId }] })
    const mapped = fresh.definition.fields?.[0]
    expect(mapped).toMatchObject({ fieldId: h.field._id, type: h.field.type })
    // form.ts:229/290 emits multiple only when true; exact false is raw evidence.
    if (h.field.multiple === true) expect(mapped).toHaveProperty('multiple', true)
    else { expect(h.field.multiple).toBe(false); expect(mapped).not.toHaveProperty('multiple') }
    const paths = h.calls.slice(firstCall).map(call => call.path)
    expect(paths).toContain('biz/extField/query')
    expect(paths).toContain(h.field.type === 'cascade' ? 'i/code/selectMultistageCode.do' : 'i/code/selectCode.do')
    expect(paths).toContain('biz/extForm/query/' + scope.formDefinitionId)
    h.zeroCommands()
  } finally { load.mockRestore() }
}
beforeEach(() => installLocalFixtureBrowser())
afterEach(() => vi.unstubAllGlobals())

describe('normal source-bound array read, distinct from Stage2C Mock transactions', () => {
  it.each<Kind>(['checkbox', 'select', 'cascade'])('reads %s through its actual provider and retains private exact slots', async type => {
    for (const preset of [0, 1]) {
      const h = harness(type, preset), s = await h.reader.load(scope.workOrderId, scope.runtimeNodeId)
      expect(s.records[0]!.values?.[key]).toEqual(h.value)
      const raw = h.reader.currentFormOriginal!(s, 'synthetic-record')!
      expect(raw).toEqual(h.record); expect(raw.unknownRoot).toEqual({ retained: 'synthetic' })
      expect(projectR1RecordReadFields(s.definition, s.records[0]!)[0]!.text).toBe(type === 'cascade' ? '合成北区 / 合成叶子' : '合成乙 / 合成甲')
      const providerCall = h.calls.find(x => x.path.startsWith('i/code/'))
      expect(providerCall).toMatchObject(type === 'cascade' ? { path: 'i/code/selectMultistageCode.do', body: { types: 'SYN_TREE', tenantId: scope.tenantId } } : { path: 'i/code/selectCode.do', body: { jsonPara: '[{"codeId":"SYN_CODES","eleid":"SYN_CODES"}]', tenantId: scope.tenantId } })
      h.zeroCommands()
    }
  })
  it.each<Kind>(['checkbox', 'select', 'cascade'])('keeps %s root/EXTS conflict visible in original, not as a write proof', async type => {
    const h = harness(type); h.record[key] = ['wrong-root']; const s = await h.reader.load(scope.workOrderId, scope.runtimeNodeId)
    expect(s.records[0]!.values?.[key]).toEqual(h.value)
    const raw = h.reader.currentFormOriginal!(s, 'synthetic-record')!
    expect(raw[key]).toEqual(['wrong-root']); expect((raw.exts as any)[key]).toEqual(h.value)
    // Direct edit-schema helper only, not a forms edit-provider transaction.
    expect(() => normalizeR1FormsEditValues(s, raw, { [key]: h.value }))
      .toThrowError(new Error('编辑字段、原文或规则尚未核实，不能保存。')); h.zeroCommands()
  })
  it.each([undefined, null, []])('preserves distinct absence/null/empty in read projection: %s', async value => {
    const h = harness('checkbox'); if (value === undefined) delete h.record.exts[key]; else h.record.exts[key] = value
    const s = await h.reader.load(scope.workOrderId, scope.runtimeNodeId)
    expect(projectR1RecordReadFields(s.definition, s.records[0]!)[0]!.text).toBe(value === undefined ? '未保存' : '空值')
    expect(Object.hasOwn(h.reader.currentFormOriginal!(s, 'synthetic-record')!.exts as object, key)).toBe(value !== undefined); h.zeroCommands()
  })
  it('characterizes multiple Select scalar read display without accepting its shape', async () => {
    const h = harness('select'); h.record.exts[key] = 'a'
    const s = await h.reader.load(scope.workOrderId, scope.runtimeNodeId), field = s.definition.fields![0]!
    expect(field).toMatchObject({ type: 'select', multiple: true })
    expect(s.records[0]!.values?.[key]).toBe('a')
    expect((h.reader.currentFormOriginal!(s, 'synthetic-record')!.exts as any)[key]).toBe('a')
    expect(normalizeFieldValue(field.type, 'a', field.options, field.multiple).ok).toBe(false)
    // Known read-shape mismatch at the pinned baseline, not desired acceptance.
    // Change this expectation when the separately reviewed product fix lands.
    expect(projectR1RecordReadFields(s.definition, s.records[0]!)[0]!.text).toBe('合成甲')
    h.zeroCommands()
  })
  it.each<Kind>(['checkbox', 'select', 'cascade'])('reaches schema rejection for %s save under an explicit create grant', async type => {
    const h = harness(type, 0, false), s = await h.reader.load(scope.workOrderId, scope.runtimeNodeId)
    expect(projectR1RepeatFields(s, { [key]: h.value })[0]).toMatchObject({ fieldId: h.field._id, supported: false })
    const actions = grantedCreateActions(h, s)
    await rejectsAtArraySchema(h, actions, h.value)
    expect(() => normalizeR1RepeatValues(s, { [key]: h.value })).toThrowError(new Error(arraySchemaError)); h.zeroCommands()
  })
  it.each<Kind>(['checkbox', 'select', 'cascade'])('blocks malformed/duplicate/oversized %s drafts at the earlier array schema', async type => {
    const h = harness(type, 0, false), s = await h.reader.load(scope.workOrderId, scope.runtimeNodeId)
    const actions = grantedCreateActions(h, s)
    // These cases do not prove separate shape, uniqueness or length validators.
    for (const value of ['a', ['a', 'a'], [null], [['a']], Array(31).fill('a')]) {
      await rejectsAtArraySchema(h, actions, value)
    }
  })
  it('retains unknown metadata rows rather than filtering them into a grant', async () => {
    const h = harness('checkbox', 0, false)
    h.fields.push({ ...h.field, _id: 'synthetic-unknown-row', name: 'unknownValue', type: 'UNKNOWN', valueOption: '' })
    const s = await h.reader.load(scope.workOrderId, scope.runtimeNodeId)
    expect(s.definition.fields).toHaveLength(2); expect(h.provider.forSnapshot(s)).toBeNull(); h.zeroCommands()
  })
  it('keeps multiple Cascade representation outside the normal writer', async () => {
    const h = harness('cascade', 0, false); h.field.multiple = true
    const s = await h.reader.load(scope.workOrderId, scope.runtimeNodeId)
    expect(projectR1RepeatFields(s, {})[0]!.supported).toBe(false)
    await rejectsAtArraySchema(h, grantedCreateActions(h, s), ['north', 'leaf'])
  })
  it.each(['provider', 'tenant'])('rejects Code %s mismatch before record projection', async fault => {
    const h = harness('select'); h.fault(fault)
    await expect(h.reader.load(scope.workOrderId, scope.runtimeNodeId)).rejects.toThrow(); h.zeroCommands()
  })
  it.each(['provider', 'tenant'])('rejects %s mismatch and revokes previous normal read', async fault => {
    const h = harness('cascade'), old = await h.reader.load(scope.workOrderId, scope.runtimeNodeId); h.fault(fault)
    await expect(h.reader.load(scope.workOrderId, scope.runtimeNodeId)).rejects.toThrow(); expect(h.reader.isCurrent(old)).toBe(false); h.zeroCommands()
  })
  it('rejects a provider response arriving after a role switch', async () => {
    const h = harness('checkbox'); let release!: () => void, arrived!: () => void
    const gate = new Promise<void>(r => { release = r }), ready = new Promise<void>(r => { arrived = r })
    h.hook(async path => { if (path === 'i/code/selectCode.do') { arrived(); await gate } })
    const pending = h.reader.load(scope.workOrderId, scope.runtimeNodeId); await ready; h.role(); release()
    await expect(pending).rejects.toThrow(); h.zeroCommands()
  })
  it.each(['metadata', 'clear'])('old %s lease cannot acquire actions after a new read', async change => {
    const h = harness('select', 0, false), old = await h.reader.load(scope.workOrderId, scope.runtimeNodeId)
    if (change === 'clear') h.reader.clear(); else { h.field.multiple = false; await h.reader.load(scope.workOrderId, scope.runtimeNodeId) }
    expect(h.reader.isCurrent(old)).toBe(false); expect(h.provider.forSnapshot(old)).toBeNull(); h.zeroCommands()
  })
  it.each(['readonly', 'hidden', 'unknown-condition'])('keeps already unsupported arrays unavailable with %s metadata', async mode => {
    const h = harness('checkbox', 0, false)
    if (mode === 'readonly') h.node.nodeDef.formFieldIdsReadOnly = [h.field._id]
    if (mode === 'hidden') h.field.showList = ['5']
    if (mode === 'unknown-condition') { h.field.showType = '3'; h.field.showField = 'unverified-controller'; h.field.showValue = 'yes' }
    const s = await h.reader.load(scope.workOrderId, scope.runtimeNodeId)
    // Projection only: no save/complete call or independent write-guard claim.
    const projected = projectR1RepeatFields(s, { [key]: h.value })
    expect(projected).toHaveLength(1); expect(projected[0]!.supported).toBe(false)
    if (mode === 'readonly') expect(projected[0]!.readOnly).toBe(true)
    if (mode === 'hidden') expect(projected[0]!.visible).toBe(false)
    if (mode === 'hidden') expect(projectR1RecordReadFields(s.definition, { id: 'display-only', definitionId: s.definition.id, values: { [key]: h.value } } as any)).toEqual([])
    h.zeroCommands()
  })
})

describe('lower runtime capability is not normal writer integration', () => {
  it.each<Kind>(['checkbox', 'select', 'cascade'])('keeps optional %s absence/null/empty omitted and required missing rejected', type => {
    const f = { fieldId: 'synthetic-runtime-field', valueKey: key, type, label: '合成', required: false, readOnly: false, multiple: type === 'select', options: type === 'cascade' ? tree : [{ value: 'a', label: '合成甲' }] }
    for (const value of [undefined, null, []]) {
      const values = value === undefined ? {} : { [key]: value }
      expect(normalizeSubmission({ fields: [actionFormSchemaFor(f)], values })).toMatchObject({ ok: true, value: { values: {} } })
      expect(normalizeSubmission({ fields: [actionFormSchemaFor({ ...f, required: true })], values }).ok).toBe(false)
    }
  })
  it('rejects a sibling-mixed Cascade path but does not establish leaf completeness', () => {
    expect(normalizeFieldValue('cascade', ['north', 'other'], tree).ok).toBe(false)
    expect(normalizeFieldValue('cascade', ['north', 'leaf'], tree)).toMatchObject({ ok: true, value: ['north', 'leaf'] })
    // Current topology validation allows prefixes. A universal terminal-leaf
    // requirement is not established here; no normal save permission follows.
    expect(normalizeFieldValue('cascade', ['north'], tree).ok).toBe(true)
  })
})


it('does not manufacture Checkbox or multiple Select evidence from the retained 59-row structure', () => {
  const structure = JSON.parse(readFileSync('contracts/synthetic/r1-current-formdef-59-structure.json', 'utf8'))
  const rows = structure.rows.map((r: any) => r.wire)
  expect(structure.syntheticOnly).toBe(true); expect(rows).toHaveLength(59)
  expect(rows.filter((r: any) => r.type === 'checkbox')).toHaveLength(0)
  expect(rows.filter((r: any) => r.type === 'select' && r.multiple === true)).toHaveLength(0)
  expect(rows.filter((r: any) => r.type === 'cascade')).toHaveLength(1)
})
