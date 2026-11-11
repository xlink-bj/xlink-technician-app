import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalFormsActionProvider } from '@app/r1-forms-authorization'
import type { MediaUploadQueuePort } from '@shared/ports'
import { asOpaqueId, createCapabilityResult, type MediaUploadTask } from '@shared/types'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

const command = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@adapters/api/uni-api-command-transport', () => ({ createUniApiCommandTransport: () => command }))
const origin = 'http://127.0.0.1:5189'
const scope = { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: 'e' }
const uploaded = { url: 'https://synthetic.invalid/one.png', key: 'objects/one.png', fileName: 'one.png', extension: 'png', mimeType: 'image/png', source: 'file' as const, uploadState: 'uploaded' as const }
const expectedFile = { url: uploaded.url, name: uploaded.key, extname: uploaded.extension }

function fixture() {
  let session: any = { sessionRef: 'synthetic-file-route', user: { id: 'u' }, currentRole: { id: 'r' }, capabilityNames: [] }, listed = false
  const ext: any = { _id: 'e', tenantId: 't', state: 1, type: '0', colName: 'syntheticNormalFile' }
  const fields: any[] = [
    { _id: 'photo', tenantId: 't', extId: 'e', state: 1, name: 'photo', type: 'file', required: 1, readOnly: 0, preset: 0, colName: ext.colName },
    { _id: 'note', tenantId: 't', extId: 'e', state: 1, name: 'note', type: 'text', required: 0, readOnly: 0, preset: 0, colName: ext.colName },
  ]
  const node: any = { _id: 'n', tenantId: 't', workflowId: 'w', workflowFormDataId: 's', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: ['r'],
    exts: { formList: [], unknownAudit: { preserve: [0, false, 'opaque'] } },
    nodeDef: { nodeType: 'forms', formDefId: 'e', viewableRoleIds: ['r'], formFieldIdsFill: ['photo', 'note'], formFieldIdsReadOnly: [] } }
  const record: any = {}
  const reads: any[] = [], writes: string[] = [], payloads: any[] = []
  let onWrite: ((path: string) => void) | undefined, readback = '', created = false
  const transport = { execute: vi.fn(async (request: any) => {
    reads.push(structuredClone(request))
    if (request.path === 'basic/serviceAppointment/queryById/s') return structuredClone({ success: true, status: 1, data: {
      serviceAppointment: { _id: 's', tenantId: 't', state: 1, workflowId: 'w' }, workflow: { _id: 'w', tenantId: 't', formDataId: 's', state: 0 }, workflowNode: [node],
    } })
    if (request.path === 'biz/ext/queryById.do') return structuredClone(ext)
    if (request.path === 'biz/extField/query') return { data: structuredClone(fields), total: fields.length, page: Number(request.body.page), size: 50 }
    if (request.path === 'biz/extForm/query/e') {
      const exactId = request.body['is:_id|string#and']
      if ((exactId !== undefined && exactId !== 'server-new') || (exactId === undefined && node.nodeDef.nodeType !== 'repeat')) throw Error('Unexpected file record read scope')
      expect(request.body).toMatchObject({ 'is:sid|string#and': 's', 'is:nodeId|string#and': 'n', 'is:workflowId|string#and': 'w' })
      if (!created) return { data: [], total: 0, page: 1, size: Number(request.body.rows) }
      const row = structuredClone(record)
      const files = row.exts?.photo ?? row.photo
      if (readback === 'missing') return { data: [], total: 0, page: 1, size: Number(request.body.rows) }
      if (readback === 'url') files[0].url = 'https://synthetic.invalid/other.png'
      if (readback === 'name') files[0].name = 'other.png'
      if (readback === 'extname') files[0].extname = 'txt'
      if (readback === 'root-EXTS') row.photo = [{ ...expectedFile, name: 'different hidden root slot' }]
      return { data: [row], total: 1, page: 1, size: Number(request.body.rows) }
    }
    throw Error(`Unknown synthetic read: ${request.path}`)
  }) }
  const env: any = { DEV: true, VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_MOCK: 'false',
    VITE_XLINK_API_BASE_URL: `${origin}/xlink/wm`, VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true',
    VITE_XLINK_R1_FORMS_ACTIONS: 'true', VITE_XLINK_AUTH_TENANT: 't', VITE_XLINK_R1_FORMS_GRANT: JSON.stringify({ version: 2, scope, expiresAt: '2099-01-01T00:00:00Z', fieldIds: ['photo', 'note'], operations: ['create'], recordIds: [] }) }
  const auth = { getCurrentSession: () => session }
  const reader = createNormalNodeFormsReader({ auth, tenantId: 't', origin, env, transport,
    read: { listWorkOrders: async () => { listed = true; return { state: 'succeeded', data: { items: [{ id: 's' }], totalCount: 1, page: 1, pageSize: 20 } } as never },
      isWorkOrderListedForCurrentSession: () => listed, getDynamicCodeOptions: async () => { throw Error('No provider expected') } } })
  const tasks = new Map<string, MediaUploadTask>()
  const queue = {
    listForAction: vi.fn(async () => ({ state: 'succeeded', data: structuredClone([...tasks.values()]) })),
    enqueue: vi.fn(async (input: any) => {
      const task: MediaUploadTask = { schemaVersion: 1, taskId: asOpaqueId<'MediaUploadTaskId'>('synthetic-owned-task'), scope: { ...input.scope, localAssetId: input.media.ref },
        state: 'queued', attempts: 0, createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z', evidence: input.evidence }
      tasks.set(String(task.taskId), task); return { state: 'succeeded', data: structuredClone(task) }
    }),
    process: vi.fn(async (id: string) => {
      const task: MediaUploadTask = { ...tasks.get(id)!, state: 'uploaded', attempts: 1, uploadedRef: uploaded }
      tasks.set(id, task); return { state: 'succeeded', data: structuredClone(task) }
    }),
    retry: vi.fn(async () => { throw Error('No automatic retry expected') }),
    discard: vi.fn(async (id: string) => { tasks.delete(id); return { state: 'succeeded', data: undefined } }),
    finalizeAfterSave: vi.fn(async (id: string) => { tasks.delete(id); return { state: 'succeeded', data: undefined } }),
  }
  const picker = { pick: vi.fn(async () => createCapabilityResult('media_file_picker', 'granted', [{ ref: asOpaqueId<'LocalMediaRef'>('local-one'), mimeType: 'image/png', source: 'file' as const, localPath: 'synthetic/local-one.png', size: 10 }])) }
  const provider = () => createNormalFormsActionProvider({ reader, auth, env, origin, media: { picker, queue: queue as unknown as MediaUploadQueuePort } })
  command.execute.mockImplementation(async (request: any) => {
    writes.push(request.path); payloads.push(structuredClone(request))
    if (request.path === 'biz/extForm/upsert/e') {
      const body = JSON.parse(String(request.body.dataStr))
      Object.keys(record).forEach(key => delete record[key])
      Object.assign(record, body, { _id: 'server-new', tenantId: 't' })
      created = true
      onWrite?.(request.path)
      return { success: true, status: 1, data: { _id: 'server-new' } }
    }
    if (request.path === 'workflowNode/updateExts/n') { node.exts = structuredClone(request.jsonBody); onWrite?.(request.path); return { success: true, status: 1 } }
    throw Error(`Unknown synthetic write: ${request.path}`)
  })
  return { ext, fields, node, record, reads, writes, payloads, env, reader, provider, queue, picker,
    onWrite: (callback: (path: string) => void) => { onWrite = callback }, setReadback: (kind: string) => { readback = kind },
    role: () => { session = { ...session, currentRole: { id: 'other' } } }, logout: () => { session = null } }
}
async function prepared(setup?: (h: ReturnType<typeof fixture>) => void) {
  const h = fixture(); setup?.(h)
  const snapshot = await h.reader.load('s', 'n')
  return { ...h, snapshot, action: h.provider().forSnapshot(snapshot) }
}
async function picked(h: Awaited<ReturnType<typeof prepared>>) {
  expect(h.action?.fileMedia).toBeDefined()
  const files = await h.action!.fileMedia!.pick('photo', {})
  expect(files).toEqual([expectedFile])
  return { photo: files!, note: 'checked' }
}
beforeEach(() => { installLocalFixtureBrowser(); command.execute.mockReset() })
afterEach(() => vi.unstubAllGlobals())

describe('normal file route: actual reader/provider/controller with synthetic transport', () => {
  it('creates once from owned upload and exact server-ID readback across new HTTP object identities without Process', async () => {
    const h = await prepared(), oldExts = structuredClone(h.node.exts)
    expect(h.snapshot.records).toEqual([])
    expect(h.reads.filter(r => r.path === 'biz/extForm/query/e')).toEqual([])
    const proof = h.reader.currentNormalFileRoute!(h.snapshot)!
    expect(h.reader.isCurrentNormalFileRoute!(h.snapshot, proof)).toBe(true)
    const draft = await picked(h), after = await h.action!.saveOnly(draft)
    expect(after.records[0]?.id).toBe('server-new')
    expect(after.records[0]?.values?.photo).toEqual(draft.photo)
    expect(after.records[0]?.values?.photo).not.toBe(draft.photo)
    expect(h.node.exts.unknownAudit).toEqual(oldExts.unknownAudit)
    expect(h.node.exts.formList).toHaveLength(1)
    expect(h.writes).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
    expect(h.queue.process).toHaveBeenCalledTimes(1)
    expect(h.queue.finalizeAfterSave).toHaveBeenCalledTimes(1)
    expect(h.node.state).toBe(0)
    expect(h.provider().forSnapshot(after)).toBeNull()
    expect(h.action!.canEdit!('server-new')).toBe(false)
    expect(h.action!.canComplete!()).toBe(false)
    expect(h.action!.canSaveAndComplete!()).toBe(false)
  })
  it('retains a complete deleted-row and unknown EXTS history while creating the first active record', async () => {
    const h = await prepared(h => h.node.exts.formList.push({ _id: 'deleted', formDefId: 'e', state: -1, unknownRow: { retain: [0, false] } }))
    const before = structuredClone(h.node.exts), draft = await picked(h)
    await h.action!.saveOnly(draft)
    expect(h.node.exts.formList[0]).toEqual(before.formList[0])
    expect(h.node.exts.unknownAudit).toEqual(before.unknownAudit)
  })
  it('does not turn first file create authorization into append, edit or Process capabilities', async () => {
    const h = await prepared(), draft = await picked(h)
    await expect(h.action!.saveAndComplete!(draft)).rejects.toThrow()
    await expect(h.action!.complete()).rejects.toThrow()
    expect(h.writes).toEqual([])
    await h.action!.saveOnly(draft)
    await expect(h.action!.saveOnly(draft)).rejects.toThrow()
    await expect(h.action!.saveOnly(draft, 'server-new')).rejects.toThrow()
    await expect(h.action!.complete()).rejects.toThrow()
    expect(h.writes).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
    expect(h.queue.process).toHaveBeenCalledTimes(1)
  })
  it.each(['typed', 'numeric0', 'survey', 'inspectionAppointment', 'serviceAppointment', 'missing-colName'])('does not acquire file writes for an unproved route: %s', async kind => {
    const h = await prepared(h => {
      if (kind === 'typed') h.ext.type = '1'
      if (kind === 'numeric0') h.ext.type = 0
      if (['survey', 'inspectionAppointment', 'serviceAppointment'].includes(kind)) { h.ext.colName = kind; h.fields.forEach(f => { f.colName = kind }) }
      if (kind === 'missing-colName') delete h.fields[0].colName
    })
    expect(h.action).toBeNull(); expect(h.writes).toEqual([]); expect(h.queue.enqueue).not.toHaveBeenCalled()
  })
  it('rejects copied route evidence despite identical public fields', async () => {
    const h = await prepared(), issue = h.reader.currentNormalFileRoute!.bind(h.reader)
    h.reader.currentNormalFileRoute = snapshot => { const proof = issue(snapshot); return proof ? { ...proof } : null }
    expect(h.provider().forSnapshot(h.snapshot)).toBeNull()
    expect(await h.action!.fileMedia!.pick('photo', {})).toBeNull()
    await expect(h.action!.saveOnly({ photo: [expectedFile] })).rejects.toThrow()
    expect(h.picker.pick).not.toHaveBeenCalled(); expect(h.queue.enqueue).not.toHaveBeenCalled()
    expect(h.writes).toEqual([])
  })
  it.each(['actor', 'readonly', 'condition'])('does not pick or queue a file without current actor/field authority: %s', async kind => {
    const h = await prepared(h => {
      if (kind === 'readonly') h.fields[0].readOnly = 1
      if (kind === 'condition') h.fields[0].frontEndConfig = { showField: 'unprovedController', showValue: 'yes' }
    })
    if (kind === 'actor') h.role()
    if (h.action?.fileMedia) expect(await h.action.fileMedia.pick('photo', {})).toBeNull()
    expect(h.picker.pick).not.toHaveBeenCalled(); expect(h.queue.enqueue).not.toHaveBeenCalled(); expect(h.writes).toEqual([])
  })
  it.each([{ photo: [expectedFile] }, { photo: ['https://synthetic.invalid/forged.png'] }])('does not write arbitrary draft files without private owned queue receipts: %j', async ({ photo }) => {
    const h = await prepared()
    await expect(h.action!.saveOnly({ photo })).rejects.toThrow()
    expect(h.writes).toEqual([])
  })
  it.each(['type', 'numeric0', 'colName', 'metadata', 'source', 'readonly', 'tenant', 'actor', 'grant'])('refuses pre-dispatch fresh %s drift with no FormData writes', async kind => {
    const h = await prepared(), draft = await picked(h)
    drift(h, kind)
    await expect(h.action!.saveOnly(draft)).rejects.toThrow()
    expect(h.writes).toEqual([])
  })
  it.each(['type', 'colName', 'metadata', 'source', 'readonly', 'actor', 'grant'])('locks after upsert and refuses EXTS after fresh %s drift', async kind => {
    const h = await prepared(), draft = await picked(h)
    h.onWrite(path => { if (path.startsWith('biz/extForm/upsert')) drift(h, kind) })
    await expect(h.action!.saveOnly(draft)).rejects.toThrow()
    expect(h.writes).toEqual(['biz/extForm/upsert/e'])
    expect(h.action!.locked()).toBe(true)
    await expect(h.action!.saveOnly(draft)).rejects.toThrow()
    expect(h.writes).toHaveLength(1)
    expect(h.queue.finalizeAfterSave).not.toHaveBeenCalled()
  })
  it.each(['missing', 'url', 'name', 'extname', 'root-EXTS'])('keeps uncertain on exact file readback %s and never replays the write', async kind => {
    const h = await prepared(), draft = await picked(h)
    h.setReadback(kind)
    await expect(h.action!.saveOnly(draft)).rejects.toThrow()
    expect(h.writes).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
    expect(h.action!.locked()).toBe(true)
    await expect(h.action!.saveOnly(draft)).rejects.toThrow()
    expect(h.writes).toHaveLength(2)
    expect(h.queue.finalizeAfterSave).not.toHaveBeenCalled()
  })
})

function drift(h: ReturnType<typeof fixture>, kind: string) {
  if (kind === 'type') h.ext.type = '1'
  if (kind === 'numeric0') h.ext.type = 0
  if (kind === 'colName') { h.ext.colName = 'other'; h.fields.forEach(f => { f.colName = 'other' }) }
  if (kind === 'metadata') h.fields[0].required = 0
  if (kind === 'source') h.node.nodeDef.nodeType = 'repeat'
  if (kind === 'readonly') h.fields[0].readOnly = 1
  if (kind === 'tenant') h.ext.tenantId = 'other'
  if (kind === 'actor') h.role()
  if (kind === 'grant') h.env.VITE_XLINK_R1_FORMS_GRANT = '{}'
}
describe('normal image raw source policy, not lossy presentation metadata',()=>{
 it.each([{fileType:'video'},{fileType:['image']},{fileType:'image'},{fileType:null},'not-json'])('does not issue file capability for explicit or unknown fileType/config %#',async config=>{
  const h=await prepared(x=>{x.fields[0].frontEndConfig=config})
  expect(h.reader.currentNormalFileRoute?.(h.snapshot)).toBeNull();expect(h.action).toBeNull();expect(h.queue.enqueue).not.toHaveBeenCalled();expect(command.execute).not.toHaveBeenCalled()
 })
 it('stops EXTS after upsert when ignored raw fileType changes while mapped fields remain equal',async()=>{
  const h=await prepared(),values=await picked(h)
  h.onWrite(path=>{if(path==='biz/extForm/upsert/e')h.fields[0].frontEndConfig={fileType:'video'}})
  await expect(h.action!.saveOnly(values)).rejects.toThrow();expect(h.writes).toEqual(['biz/extForm/upsert/e']);expect(h.action!.locked()).toBe(true)
 })
})
