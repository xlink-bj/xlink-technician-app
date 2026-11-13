import { createSelectedRoleVisibilityContext } from '@shared/form/selected-role-visibility'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNormalFormsActionProvider, parseR1FormsGrant } from '@app/r1-forms-authorization'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

const transport = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@adapters/api/uni-api-command-transport', () => ({ createUniApiCommandTransport: () => transport }))
const scope = { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: 'e' }
const origin = 'http://127.0.0.1:5189'
const grant = { version: 2, scope, expiresAt: '2099-01-01T00:00:00Z', fieldIds: ['area'], operations: ['create', 'append', 'edit', 'save_finish', 'complete'], recordIds: ['a', 'b'] }

function fixture(nodeTitle?: string, identityType?: 'phone' | 'IDNumber', roleMode?: 'include' | 'exclude' | 'missing-context') {
  let session = { sessionRef: 'synthetic', user: { id: 'u' }, currentRole: { id: 'r' } }
  let exts: any = { formList: [{ _id: 'a', formDefId: 'e', state: 1, unknownRow: { keep: ['a'] } }, { _id: 'deleted', formDefId: 'e', state: -1, unknownDeleted: true }, { _id: 'b', formDefId: 'e', state: 1 }], unknownNode: { keep: [1, 'yes'] } }
  const raw = (id: string, area: number) => ({ _id: id, tenantId: 't', sid: 's', nodeId: 'n', workflowId: 'w', formDefId: 'e', smodule: 'serviceAppointment', state: 1, area, exts: { area, retainedNested: { keep: true } }, retainedTop: ['keep'] })
  const rows = new Map<string, any>([['a', raw('a', 2)], ['b', raw('b', 4)]])
  const originals = new WeakMap<R1NodeFormsSnapshot, Map<string, any>>()
  let current: R1NodeFormsSnapshot | null = null
  let failure = '', onRead: ((count: number) => void) | undefined, reads = 0
  let ack: any = null, transition = true
  const env: Record<string, any> = { DEV: true, VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_AUTH_TENANT: 't', VITE_XLINK_API_BASE_URL: `${origin}/xlink/wm`, VITE_XLINK_MOCK: 'false', VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true', VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_R1_FORMS_ACTIONS: 'true', VITE_XLINK_R1_FORMS_GRANT: JSON.stringify(grant) }
  function snapshot(): R1NodeFormsSnapshot {
    const active = exts.formList.filter((slot: any) => slot.state !== -1).map((slot: any) => rows.get(slot._id)).filter(Boolean)
    const s = { workOrderId: 's', node: { id: 'n', runId: 'w', formDefinitionId: 'e', sourceNodeType: 'forms', nodeTypeEvidence: 'runtime_node_def', lifecycle: 'active', handlers: [{ kind: 'user', userId: 'u' }], visibility: { evidenceState: 'verified', viewableRoleIds: ['r'] }, formFieldIdsReadOnly: [] }, definition: { id: 'e', fields: [{ fieldId: 'area', valueKey: 'area', type: identityType ?? 'digit', label: 'Area', required: true, readOnly: false }] }, fillableFieldIds: ['area'], records: active.map((r: any) => ({ id: r._id, definitionId: 'e', workflowRunId: 'w', values: { area: r.exts?.area ?? r.area } })) } as unknown as R1NodeFormsSnapshot
    if (roleMode) Object.assign(s.definition.fields![0]!, {
      visibility: { kind: 'role', mode: roleMode === 'exclude' ? 'exclude' : 'include', roleIds: roleMode === 'exclude' ? ['excluded'] : ['r'] },
      ...(roleMode === 'missing-context' ? {} : { roleVisibilityContext: createSelectedRoleVisibilityContext(() => ({ sessionKey: session.sessionRef, roleId: session.currentRole.id })) }),
    })
    if (nodeTitle !== undefined) Object.assign(s.node, { displayName: nodeTitle })
    originals.set(s, new Map(active.map((r: any) => [r._id, structuredClone(r)])))
    return s
  }
  current = snapshot()
  const base = current
  const reader = {
    enabled: () => true, isCurrent: (s: R1NodeFormsSnapshot) => current === s, clear: () => { current = null },
    currentFormsExts: (s: R1NodeFormsSnapshot) => s === current ? structuredClone(exts) : null,
    currentFormOriginal: (s: R1NodeFormsSnapshot, id: string) => s === current ? originals.get(s)?.get(id) ?? null : null,
    load: vi.fn(async () => {
      current = null; reads++; onRead?.(reads)
      if (failure === 'preflight') throw Error('synthetic read failed')
      current = snapshot()
      return current
    }),
    confirmFormsCompletion: vi.fn(async () => {
      if (!transition) throw Error('synthetic transition not proven')
      current = null
      return { transitionVerified: true as const }
    }),
  }
  transport.execute.mockImplementation(async (request: any) => {
    if (request.path === 'biz/extForm/upsert/e') {
      if (failure === 'upsert') throw Error('synthetic unknown ACK')
      const body = JSON.parse(request.body.dataStr), id = body._id ?? 'created'
      // A full replacement, deliberately NO Mock merging of old business data.
      rows.set(id, { ...body, _id: id })
      return ack ?? { success: true, status: 1, data: { _id: id } }
    }
    if (request.path === 'workflowNode/updateExts/n') {
      if (failure === 'exts') throw Error('synthetic EXTS outcome unknown')
      exts = structuredClone(request.jsonBody)
      return { success: true, status: 1 }
    }
    if (request.path === 'workflow/process') return { success: true, status: 1 }
    throw Error(`Unknown intercepted command: ${request.path}`)
  })
  const provider = () => createNormalFormsActionProvider({ env, origin, reader, auth: { getCurrentSession: () => session as never } })
  return { base, reader, env, rows, provider, snapshot, get current() { return current }, get exts() { return exts },
    setAck: (value: unknown) => { ack = value }, setFault: (value: string) => { failure = value },
    onRead: (fn: (count: number) => void) => { onRead = fn }, setTransition: (value: boolean) => { transition = value },
    changeUser: () => { session = { ...session, user: { id: 'foreign' } } },
    setGrant: (patch: Record<string, unknown>) => { env.VITE_XLINK_R1_FORMS_GRANT = JSON.stringify({ ...grant, ...patch }) },
  }
}
const paths = () => transport.execute.mock.calls.map(([request]) => request.path)
function fillReferences(h: ReturnType<typeof fixture>, total: number, deleted = 1) {
  const slots = h.exts.formList as Record<string, unknown>[]
  while (slots.length < total) {
    const id = `capacity-${slots.length}`
    slots.push({ _id: id, formDefId: 'e', state: 1, unknownCapacityMetadata: { preserve: id } })
    h.rows.set(id, { ...structuredClone(h.rows.get('a')), _id: id })
  }
  for (const [index, slot] of slots.entries()) {
    slot.state = index >= total - deleted ? -1 : 1
    const id = String(slot._id)
    if (!h.rows.has(id)) h.rows.set(id, { ...structuredClone(h.rows.get('a')), _id: id })
  }
}
beforeEach(() => { installLocalFixtureBrowser(); transport.execute.mockReset() })
afterEach(() => vi.unstubAllGlobals())

describe('normal forms v2 existing-record actions with synthetic transport', () => {
  it('appends the fiftieth total reference while preserving the deleted reference and all metadata', async () => {
    const h = fixture(); fillReferences(h, 49)
    const before = structuredClone(h.exts), action = h.provider().forSnapshot(h.base)!
    const saved = await action.saveOnly({ area: 7 })
    expect(h.exts.formList).toHaveLength(50)
    expect(h.exts.formList.slice(0, 49)).toEqual(before.formList)
    expect(h.exts.formList.filter((slot: any) => slot.state === -1)).toHaveLength(1)
    expect(saved.records).toHaveLength(49)
    expect(paths()).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
    expect(action.locked()).toBe(false)
  })
  it.each([0, 1, 48, 50])('rejects a fifty-first reference before any write including %i deleted references', async deleted => {
    const h = fixture(); fillReferences(h, 50, deleted)
    const before = structuredClone(h.exts), action = h.provider().forSnapshot(h.base)!
    await expect(action.saveOnly({ area: 7 })).rejects.toThrow()
    expect(transport.execute).not.toHaveBeenCalled()
    expect(h.exts).toEqual(before)
    expect(action.locked()).toBe(false)
  })
  it('edits an existing ID at fifty total references without consuming a new slot', async () => {
    const h = fixture(); fillReferences(h, 50)
    const before = structuredClone(h.exts), action = h.provider().forSnapshot(h.base)!
    await action.saveOnly({ area: 7 }, 'a')
    expect(h.exts.formList).toEqual(before.formList)
    expect(h.exts.formList).toHaveLength(50)
    expect(h.rows.get('a').area).toBe(7)
    expect(paths()).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
  })
  it.each(['same', 'conflicting', 'missing'] as const)('preserves original edit titles and source slot metadata rather than node defaults: %s', async mode => {
    const h = fixture('node default must not overwrite'), source = h.exts.formList.find((slot: any) => slot._id === 'a')
    source.formTitle = 'historical slot title'
    if (mode !== 'missing') h.rows.get('a').formTitle = mode === 'same' ? source.formTitle : 'independent raw title'
    const beforeSlot = structuredClone(source), beforeRaw = structuredClone(h.rows.get('a'))
    await h.provider().forSnapshot(h.base)!.saveOnly({ area: 7 }, 'a')
    expect(h.exts.formList.find((slot: any) => slot._id === 'a')).toEqual(beforeSlot)
    const wire = JSON.parse(transport.execute.mock.calls[0][0].body.dataStr)
    if (mode === 'missing') expect(wire).not.toHaveProperty('formTitle')
    else expect(wire.formTitle).toBe(beforeRaw.formTitle)
    expect(h.rows.get('a').formTitle).toBe(beforeRaw.formTitle)
  })
  it('does not invent an edit list title when the source slot has no title', async () => {
    const h = fixture(); h.rows.get('a').formTitle = 'raw only title'
    const slot = structuredClone(h.exts.formList.find((row: any) => row._id === 'a'))
    await h.provider().forSnapshot(h.base)!.saveOnly({ area: 7 }, 'a')
    expect(h.exts.formList.find((row: any) => row._id === 'a')).toEqual(slot)
    expect(h.rows.get('a').formTitle).toBe('raw only title')
  })
  it.each([undefined, 'node-provided default'])('uses a default title only for a new appended slot: %s', async nodeTitle => {
    const h = fixture(nodeTitle)
    await h.provider().forSnapshot(h.base)!.saveOnly({ area: 7 })
    expect(h.exts.formList.find((row: any) => row._id === 'created').formTitle).toBe(nodeTitle ?? '现场记录')
  })
  it('parses explicit v2 operation and record allowlists without enabling malformed grants', () => {
    expect(parseR1FormsGrant(JSON.stringify(grant))).toMatchObject({ version: 2, recordIds: ['a', 'b'] })
    for (const patch of [{ recordIds: [] }, { recordIds: ['a', 'a'] }, { operations: ['unknown'] }, { operations: ['edit'], recordIds: ['a,b'] }]) {
      expect(parseR1FormsGrant(JSON.stringify({ ...grant, ...patch }))).toBeNull()
    }
  })
  it('appends among multiple active and deleted slots, preserving full unknown EXTS without Process', async () => {
    const h = fixture(), before = structuredClone(h.exts), action = h.provider().forSnapshot(h.base)!
    expect(action.canCreate?.()).toBe(true)
    const after = await action.saveOnly({ area: 8 })
    expect(after.records.map(r => r.id)).toEqual(['a', 'b', 'created'])
    expect(h.exts.formList.slice(0, 3)).toEqual(before.formList)
    expect(h.exts.unknownNode).toEqual(before.unknownNode)
    expect(paths()).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
    expect(h.reader.confirmFormsCompletion).not.toHaveBeenCalled()
    expect(action.locked()).toBe(false)
  })
  it('edits the exact reread original and updates top-level and exts values without Mock merging', async () => {
    const h = fixture(), before = structuredClone(h.rows.get('a')), beforeExts = structuredClone(h.exts), action = h.provider().forSnapshot(h.base)!
    expect(action.initialValues?.('a')).toEqual({ area: 2 })
    const after = await action.saveOnly({ area: '9.5' }, 'a')
    const payload = JSON.parse(transport.execute.mock.calls[0][0].body.dataStr)
    expect(payload).toMatchObject({ _id: 'a', area: 9.5, exts: { area: 9.5, retainedNested: before.exts.retainedNested }, retainedTop: before.retainedTop })
    expect(after.records.find(r => r.id === 'a')?.values?.area).toBe(9.5)
    expect(h.exts.formList).toHaveLength(3)
    expect(h.exts.formList[0].unknownRow).toEqual(beforeExts.formList[0].unknownRow)
    expect(h.exts.formList.slice(1)).toEqual(beforeExts.formList.slice(1))
    expect(paths()).not.toContain('workflow/process')
  })
  it.each(['unknown', 'deleted', 'b'])('rejects an ungranted, missing or deleted edit ID %s before dispatch', async id => {
    const h = fixture(); h.setGrant({ recordIds: ['a'] })
    const action = h.provider().forSnapshot(h.base)!
    expect(action.canEdit?.(id)).toBe(false)
    await expect(action.saveOnly({ area: 7 }, id)).rejects.toThrow()
    expect(transport.execute).not.toHaveBeenCalled()
  })
  it('does not acquire any provider without explicit local action authorization', () => {
    const h = fixture(); delete h.env.VITE_XLINK_R1_FORMS_GRANT
    expect(h.provider().forSnapshot(h.base)).toBeNull()
    expect(transport.execute).not.toHaveBeenCalled()
  })
  it.each([{ _id: 'a', nodeId: 'foreign' }, { _id: 'other' }, { _id: 'a', id: 'other' }, { _id: 'a', tenantId: 'foreign' }])('rejects conflicting edit ACK before EXTS %j', async data => {
    const h = fixture(); h.setAck({ success: true, status: 1, data })
    const action = h.provider().forSnapshot(h.base)!
    await expect(action.saveOnly({ area: 7 }, 'a')).rejects.toThrow()
    expect(paths()).toEqual(['biz/extForm/upsert/e'])
    expect(action.locked()).toBe(true)
  })
  it('separates explicit save-and-finish slots from standalone completion slots', async () => {
    const h = fixture(), action = h.provider().forSnapshot(h.base)!
    await expect(action.saveAndComplete?.({ area: 7 }, 'a')).resolves.toEqual({ acknowledged: true, transitionVerified: true })
    expect(paths()).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n', 'workflow/process'])
    expect(transport.execute.mock.calls[2][0].body).toMatchObject({ nodeFormDefId: '', nodeFormDataId: '', workflowNodeId: 'n', sid: 's' })
    expect(h.reader.confirmFormsCompletion).toHaveBeenCalledTimes(1)
    expect(action.locked()).toBe(true)
  })
  it('standalone completion sends definition but no individual FormData slot and verifies transition', async () => {
    const h = fixture(), action = h.provider().forSnapshot(h.base)!
    await expect(action.complete()).resolves.toEqual({ acknowledged: true, transitionVerified: true })
    expect(paths()).toEqual(['workflow/process'])
    expect(transport.execute.mock.calls[0][0].body).toMatchObject({ nodeFormDefId: 'e', nodeFormDataId: '' })
    expect(h.reader.confirmFormsCompletion).toHaveBeenCalledTimes(1)
    expect(action.locked()).toBe(true)
  })
  it('Process ACK alone cannot unlock without independently verified node transition', async () => {
    const h = fixture(); h.setTransition(false)
    const action = h.provider().forSnapshot(h.base)!
    await expect(action.complete()).rejects.toThrow()
    expect(action.locked()).toBe(true)
    await expect(h.provider().forSnapshot(h.current!)!.complete()).rejects.toThrow()
    expect(paths()).toEqual(['workflow/process'])
  })
  it.each(['upsert', 'exts'])('preserves durable unknown-result lock across explicit reread and provider recreation: %s', async fault => {
    const h = fixture(); h.setFault(fault)
    const action = h.provider().forSnapshot(h.base)!
    await expect(action.saveOnly({ area: 7 }, 'a')).rejects.toThrow()
    const count = transport.execute.mock.calls.length
    h.setFault(''); const fresh = await h.reader.load(), renewed = h.provider().forSnapshot(fresh)!
    expect(renewed.locked()).toBe(true)
    await expect(renewed.saveOnly({ area: 7 }, 'a')).rejects.toThrow()
    expect(transport.execute).toHaveBeenCalledTimes(count)
  })
  it('revokes a failed preflight lease; explicit reread grants a new action without consuming a write', async () => {
    const h = fixture(), action = h.provider().forSnapshot(h.base)!, draft = { area: 7 }
    h.setFault('preflight')
    await expect(action.saveOnly(draft, 'a')).rejects.toThrow()
    expect(action.locked()).toBe(true)
    await expect(action.saveOnly(draft, 'a')).rejects.toThrow()
    expect(transport.execute).not.toHaveBeenCalled()
    h.setFault(''); const fresh = await h.reader.load(), renewed = h.provider().forSnapshot(fresh)!
    await renewed.saveOnly(draft, 'a')
    expect(draft).toEqual({ area: 7 }); expect(paths()).toHaveLength(2)
  })
  it.each(['operation', 'record', 'actor'])('rechecks second-step %s permission and never dispatches EXTS after revocation', async kind => {
    const h = fixture(), action = h.provider().forSnapshot(h.base)!
    h.onRead(count => { if (count === 2) {
      if (kind === 'operation') h.setGrant({ operations: ['append'] })
      if (kind === 'record') h.setGrant({ recordIds: ['b'] })
      if (kind === 'actor') h.changeUser()
    } })
    await expect(action.saveOnly({ area: 7 }, 'a')).rejects.toThrow()
    expect(paths()).toEqual(['biz/extForm/upsert/e']); expect(action.locked()).toBe(true)
  })
  it.each(['missing', 'inconsistent'])('requires exact saved-ID readback after EXTS ACK: %s', async kind => {
    const h = fixture(), action = h.provider().forSnapshot(h.base)!
    h.onRead(count => { if (count === 3) {
      if (kind === 'missing') h.rows.delete('a')
      else h.rows.get('a').exts.area = 999
    } })
    await expect(action.saveOnly({ area: 7 }, 'a')).rejects.toThrow()
    expect(paths()).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
    expect(h.reader.confirmFormsCompletion).not.toHaveBeenCalled()
    expect(action.locked()).toBe(true)
  })
  it.each([{ area: '' }, { area: 'invalid' }, { area: 7, unknown: true }])('rejects invalid edit fields before first dispatch: %j', async draft => {
    const h = fixture(), action = h.provider().forSnapshot(h.base)!
    expect(action.validateDraft?.(draft, 'a')).toBe(false)
    await expect(action.saveOnly(draft, 'a')).rejects.toThrow()
    expect(transport.execute).not.toHaveBeenCalled()
  })
  it('rejects raw record ownership contradiction before applying contextual wire identities', async () => {
    const h = fixture(); h.rows.get('a').nodeId = 'foreign'
    const action = h.provider().forSnapshot(h.base)!
    await expect(action.saveOnly({ area: 7 }, 'a')).rejects.toThrow()
    expect(transport.execute).not.toHaveBeenCalled()
  })
  it('does not queue a double click behind a pending edit or replay it after ACK', async () => {
    const h = fixture(), action = h.provider().forSnapshot(h.base)!, implementation = transport.execute.getMockImplementation()!
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    transport.execute.mockImplementationOnce(async request => { await held; return implementation(request) })
    const first = action.saveOnly({ area: 7 }, 'a')
    await vi.waitFor(() => expect(transport.execute).toHaveBeenCalledTimes(1))
    await expect(action.saveOnly({ area: 8 }, 'a')).rejects.toThrow()
    release(); await first
    expect(paths()).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
    expect(h.rows.get('a').area).toBe(7)
  })
  it.each([['phone', '123'], ['IDNumber', 'bad-id']] as const)('rejects invalid %s before save-and-complete dispatch', async (type, invalid) => {
    const h = fixture(undefined, type), a = h.provider().forSnapshot(h.base)!
    await expect(a.saveAndComplete!({ area: invalid }, 'a')).rejects.toThrow('格式不符合要求')
    expect(paths()).toEqual([])
    expect(h.reader.confirmFormsCompletion).not.toHaveBeenCalled()
  })
  it.each([['phone', '123'], ['IDNumber', 'bad-id']] as const)('retains %s ordinary existing save-only semantics', async (type, invalid) => {
    const h = fixture(undefined, type), a = h.provider().forSnapshot(h.base)!
    await a.saveOnly({ area: invalid }, 'a')
    expect(paths()).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
    expect(h.rows.get('a').area).toBe(invalid)
    expect(h.reader.confirmFormsCompletion).not.toHaveBeenCalled()
  })
  it.each([['phone', '13800000000'], ['IDNumber', '99000019900101001X']] as const)('submits verified %s without rewriting the string', async (type, valid) => {
    const h = fixture(undefined, type), a = h.provider().forSnapshot(h.base)!
    await a.saveAndComplete!({ area: valid }, 'a')
    expect(paths()).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n', 'workflow/process'])
    expect(h.rows.get('a').area).toBe(valid)
    expect(h.reader.confirmFormsCompletion).toHaveBeenCalledTimes(1)
  })

  it.each([['phone', '123'], ['IDNumber', 'bad-id']] as const)('role-visible %s still rejects explicit submission before all commands', async (type, invalid) => {
    for (const mode of ['include', 'exclude'] as const) {
      const h = fixture(undefined, type, mode), action = h.provider().forSnapshot(h.base)!
      expect(action).toBeTruthy()
      await expect(action.saveAndComplete!({ area: invalid }, 'a')).rejects.toThrow('格式不符合要求')
      expect(paths()).toEqual([])
      expect(h.reader.confirmFormsCompletion).not.toHaveBeenCalled()
    }
  })
  it.each(['phone', 'IDNumber'] as const)('missing role context cannot format-bypass %s explicit submission', async type => {
    const h = fixture(undefined, type, 'missing-context'), action = h.provider().forSnapshot(h.base)!
    await expect(action.saveAndComplete!({ area: 'invalid' }, 'a')).rejects.toThrow()
    expect(paths()).toEqual([])
    expect(h.reader.confirmFormsCompletion).not.toHaveBeenCalled()
  })

})
