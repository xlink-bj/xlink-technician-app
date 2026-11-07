import { afterEach, describe, expect, it, vi } from 'vitest'
import { formDataUpsertCommand } from '@adapters/api/action-command-wires'
import { TechnicianApiCommandAdapter, type ApiCommandRequest } from '@adapters/api/technician-api-commands'
import { createRoleScopedTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import {
  mockCommandScenarioIds, mockSurveyFormDefinitionId,
  resetBusinessMockCache, resetMockCommandState, setBusinessMockMode,
} from '@adapters/api/mock'
import type { SaveDynamicFormInput, TechnicianApiReadPort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const existingId = asOpaqueId<'FormDataId'>('synthetic-existing-survey')
const input: SaveDynamicFormInput = {
  workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-survey-work'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-survey-node'),
  workflowRunId: asOpaqueId<'WorkflowRunId'>('synthetic-survey-run'),
  definitionId: asOpaqueId<'FormDefinitionId'>('synthetic-survey-definition'),
  purpose: 'survey',
  values: { squareMeter: 18.75, memo: 'Synthetic scalar draft' },
}

function harness() {
  const events: string[] = []
  const execute = vi.fn(async (_request: ApiCommandRequest) => {
    events.push('transport')
    return { success: true, data: { _id: existingId } }
  })
  const beforeFormDispatch = vi.fn(async () => {
    events.push('checkpoint')
    return { state: 'succeeded' as const }
  })
  const afterFormSaved = vi.fn(async () => {
    events.push('saved')
    return { state: 'succeeded' as const }
  })
  const read = { getFormDefinition: vi.fn(), getFormData: vi.fn() }
  const make = () => new TechnicianApiCommandAdapter({ execute }, read as unknown as TechnicianApiReadPort)
  return { make, execute, read, events, mutation: { beforeFormDispatch, afterFormSaved } }
}

async function expectRefused(candidate: SaveDynamicFormInput) {
  const h = harness()
  expect(() => formDataUpsertCommand(candidate)).toThrow(/Survey/)
  // A restarted adapter cannot consume a new dispatch budget for the same
  // rejected intent: neither a reservation nor a request was ever made.
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(await h.make().saveDynamicForm({ ...candidate, mutation: h.mutation }))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'server_terminal' } })
  }
  expect(h.events).toEqual([])
  expect(h.mutation.beforeFormDispatch).not.toHaveBeenCalled()
  expect(h.mutation.afterFormSaved).not.toHaveBeenCalled()
  expect(h.execute).not.toHaveBeenCalled()
  expect(h.read.getFormDefinition).not.toHaveBeenCalled()
  expect(h.read.getFormData).not.toHaveBeenCalled()
}

describe('R1 typed Survey replacement guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetBusinessMockCache()
    resetMockCommandState()
  })

  it('refuses an existing Survey ID in the real encoder before creating a replacement wire', () => {
    expect(() => formDataUpsertCommand({ ...input, formDataId: existingId })).toThrow(/Survey.*replacement/i)
  })

  it('refuses an existing ID hidden in values before adapter checkpoint and transport', async () => {
    const h = harness()
    const result = await h.make().saveDynamicForm({ ...input, values: { ...input.values, _id: existingId }, mutation: h.mutation })
    expect.soft(result).toMatchObject({ state: 'failed_terminal' })
    expect.soft(h.mutation.beforeFormDispatch).not.toHaveBeenCalled()
    expect.soft(h.mutation.afterFormSaved).not.toHaveBeenCalled()
    expect(h.execute).not.toHaveBeenCalled()
  })

  it.each([
    ['existing ID', existingId], ['null', null], ['empty', ''], ['whitespace', ' '],
    ['explicit undefined', undefined], ['zero', 0], ['false', false],
  ])('refuses any supplied formDataId, including runtime %s', async (_label, formDataId) => {
    await expectRefused({ ...input, formDataId } as SaveDynamicFormInput)
  })

  it.each([
    ['visible scalar subset', { memo: 'changed' }],
    ['all visible fields', { part: ['1', '130'], squareMeter: 18.75, memo: 'changed' }],
    ['pretend CAS', { squareMeter: 18.75, memo: 'changed', _version: 17 }],
    ['API snapshot including dates, inherited and extension values', {
      _id: existingId, sid: input.workOrderId, workflowId: input.workflowRunId,
      nodeId: input.workflowNodeId, state: 1, tenantId: 'synthetic-tenant',
      createTime: '2026-11-07 10:00:00', updateTime: '2026-11-07 11:00:00',
      createUser: 'synthetic-user', orgId: 'synthetic-org', customerName: 'Synthetic customer',
      part: ['1', '130'], squareMeter: 18.75, memo: 'changed', _version: 17,
      exts: { images1: [{ url: 'https://media.invalid/synthetic', hiddenMetadata: 'not projected' }], hiddenReadOnlyValue: 'not editable' },
    }],
  ])('does not claim preservation or CAS for an existing Survey: %s', async (_label, values) => {
    // These deliberately include raw API shapes that do not belong to editable
    // FormFieldValue. Copying them does not recover original BSON milliseconds.
    const snapshot = structuredClone(values)
    await expectRefused({ ...input, formDataId: existingId, values } as unknown as SaveDynamicFormInput)
    expect(values).toEqual(snapshot)
  })

  it.each([
    '_id', 'id', 'dataId', 'formDataId', 'extId', 'formDefId', 'definitionId',
    'sid', 'smodule', 'nodeId', 'workflowId', 'workflowNodeId', 'workflowRunId', 'runId',
    'tenantId', 'userId', 'roleId', 'state', 'externalSid',
    'createTime', 'createDateTime', 'createUser', 'createUserName',
    'updateTime', 'updateDateTime', 'updateUser', 'updateUserName',
    'orgId', 'orgName', 'optId', 'optName', 'belongTo', 'etags', 'isSettle',
    '_version', 'version', 'revision', '_class',
    'exts', 'dataStr', 'raw', 'rawData', 'rawBody', 'body', 'jsonBody',
    '__proto__', 'prototype', 'constructor', 'toJSON',
  ])('rejects reserved values.%s before null filtering or serialization can conceal its presence', async key => {
    for (const value of [existingId, null, undefined, '', 0, false]) {
      await expectRefused({ ...input, values: { memo: 'create', [key]: value } } as SaveDynamicFormInput)
    }
  })

  it('does not let a forged synthetic sid in values exempt a real-scoped replacement', async () => {
    await expectRefused({ ...input, formDataId: existingId, values: { memo: 'changed', sid: mockCommandScenarioIds.surveySuccess } })
    await expectRefused({ ...input, values: { memo: 'changed', sid: mockCommandScenarioIds.surveySuccess } })
  })

  it.each([
    ['self-deleting values._id', (): Record<string, unknown> => {
      const values: Record<string, unknown> = { memo: 'replacement' }
      Object.defineProperty(values, '_id', { enumerable: true, configurable: true, get() {
        delete values._id
        return existingId
      } })
      return { ...input, values }
    }],
    ['self-deleting top-level formDataId', (): Record<string, unknown> => {
      const candidate: Record<string, unknown> = { ...input }
      let reads = 0
      Object.defineProperty(candidate, 'formDataId', { enumerable: true, configurable: true, get() {
        if (++reads === 2) delete candidate.formDataId
        return existingId
      } })
      return candidate
    }],
    ['self-deleting toJSON replacing the final body', (): Record<string, unknown> => {
      const values: Record<string, unknown> = { memo: 'replacement' }
      values.toJSON = () => {
        delete values.toJSON
        return { _id: existingId, sid: input.workOrderId, memo: 'replacement' }
      }
      return { ...input, values }
    }],
    ['non-reserved getter hiding existing Survey classification', (): Record<string, unknown> => {
      const candidate: Record<string, unknown> = { ...input, formDataId: existingId }
      candidate.values = { get memo() { candidate.purpose = undefined; return 'replacement' } }
      return candidate
    }],
    ['non-reserved getter adding a top-level ID', (): Record<string, unknown> => {
      const candidate: Record<string, unknown> = { ...input }
      candidate.values = { get memo() { candidate.formDataId = existingId; return 'replacement' } }
      return candidate
    }],
    ['non-reserved getter adding an ID and hiding purpose', (): Record<string, unknown> => {
      const candidate: Record<string, unknown> = { ...input }
      candidate.values = { get memo() {
        candidate.formDataId = existingId
        candidate.purpose = undefined
        return 'replacement'
      } }
      return candidate
    }],
    ['non-reserved getter mutating new-create purpose', (): Record<string, unknown> => {
      const candidate: Record<string, unknown> = { ...input }
      candidate.values = { get memo() { candidate.purpose = undefined; return 'create' } }
      return candidate
    }],
    ['scope getter adding an ID after initial value-key capture', (): Record<string, unknown> => {
      const values: Record<string, unknown> = { memo: 'replacement' }
      return { ...input, values, get workOrderId() { values._id = existingId; return input.workOrderId } }
    }],
    ['scope getter adding audit metadata after initial value-key capture', (): Record<string, unknown> => {
      const values: Record<string, unknown> = { memo: 'create' }
      return { ...input, values, get workflowNodeId() { values.createUser = 'spoofed'; return input.workflowNodeId } }
    }],
    ['scope object changing its serialized identity', (): Record<string, unknown> => ({
      ...input, workOrderId: { toJSON: () => 'different-real-scope' },
    })],
  ] as const)('refuses malformed runtime objects without adapter dispatch: %s', async (_label, makeCandidate) => {
    // Fresh objects per invocation: deliberately hostile getters mutate their
    // source while encoding. This is a boundary test, not a real UI exploit.
    expect(() => formDataUpsertCommand(makeCandidate() as unknown as SaveDynamicFormInput)).toThrow(/Survey/)
    const h = harness()
    const candidate = makeCandidate() as unknown as SaveDynamicFormInput
    Object.defineProperty(candidate, 'mutation', { value: h.mutation })
    expect(await h.make().saveDynamicForm(candidate)).toMatchObject({ state: 'failed_terminal', error: { category: 'server_terminal' } })
    expect(h.events).toEqual([])
    expect(h.mutation.beforeFormDispatch).not.toHaveBeenCalled()
    expect(h.mutation.afterFormSaved).not.toHaveBeenCalled()
    expect(h.execute).not.toHaveBeenCalled()
  })

  it('retains the bounded new scalar Survey wire, zero, empty text and false values', async () => {
    // Serializer behavior only. Normal repeat separately normalizes false text
    // to "false" and refuses a boolean decimal; no new field type is introduced.
    for (const memo of ['', false]) {
      const h = harness()
      const candidate = { ...input, values: { squareMeter: 0, memo }, mutation: h.mutation }
      const request = formDataUpsertCommand(candidate)
      expect(JSON.parse(String(request.body?.dataStr))).toEqual({
        squareMeter: 0, memo, sid: input.workOrderId, smodule: 'serviceAppointment',
        nodeId: input.workflowNodeId, workflowId: input.workflowRunId, state: 1,
      })
      expect(await h.make().saveDynamicForm(candidate)).toMatchObject({ state: 'succeeded', data: existingId })
      expect(h.events).toEqual(['checkpoint', 'transport', 'saved'])
      expect(h.execute).toHaveBeenCalledTimes(1)
      expect(h.execute).toHaveBeenCalledWith(request)
      expect(h.mutation.afterFormSaved).toHaveBeenCalledTimes(1)
      expect(h.mutation.afterFormSaved).toHaveBeenCalledWith(existingId)
    }
  })

  it('still refuses special source nodes before checkpoint or transport', async () => {
    for (const sourceNodeType of ['forms', 'repeat', 'subflow']) {
      const h = harness()
      expect(await h.make().saveDynamicForm({ ...input, sourceNodeType, mutation: h.mutation }))
        .toMatchObject({ state: 'failed_terminal', error: { category: 'unsupported_capability' } })
      expect(h.events).toEqual([])
    }
  })

  it('does not impose Survey replacement policy on unclassified dynamic forms', async () => {
    const h = harness()
    expect(await h.make().saveDynamicForm({ ...input, purpose: undefined, formDataId: existingId, mutation: h.mutation }))
      .toMatchObject({ state: 'succeeded', data: existingId })
    expect(JSON.parse(String(h.execute.mock.calls[0]![0].body?.dataStr))._id).toBe(existingId)
  })

  it('preserves actual synthetic Mock create/edit/readback without claiming typed R1 preservation', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_MOCK', '')
    resetBusinessMockCache()
    resetMockCommandState()
    setBusinessMockMode('data')
    const request = vi.fn(() => { throw Error('Mock must not use network') })
    const userId = asOpaqueId<'UserId'>('synthetic-guard-user')
    const roleId = asOpaqueId<'RoleId'>('synthetic-guard-role')
    const getSessionRef = () => asOpaqueId<'SessionRef'>('synthetic-guard-session')
    const read = createRoleScopedTechnicianApiReadAdapter(createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid', getSessionRef, request, mockLatencyMs: 0,
      getMockActor: () => ({ userId, roleId }),
    }), () => roleId, { cascadeTenantId: 'synthetic-tenant', codeTenantId: 'synthetic-tenant' })
    const adapter = new TechnicianApiCommandAdapter(createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid', getSessionRef, request,
    }), read)
    const detail = await read.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.surveySuccess))
    expect(detail.state).toBe('succeeded')
    const node = detail.data!.workflowNodes![0]!
    const candidate: SaveDynamicFormInput = {
      workOrderId: detail.data!.id, workflowNodeId: node.id,
      workflowRunId: detail.data!.workflowRunId, definitionId: node.formDefinitionId!,
      purpose: 'survey', values: { memo: 'first Mock save' }, mutation: harness().mutation,
    }
    const created = await adapter.saveDynamicForm(candidate)
    expect(created.state).toBe('succeeded')
    expect(created.data).toBeTruthy()
    const edited = await adapter.saveDynamicForm({ ...candidate, formDataId: created.data!, values: { memo: 'changed Mock value' } })
    expect(edited).toMatchObject({ state: 'succeeded', data: created.data })
    expect(await adapter.readDynamicForm({ definitionId: candidate.definitionId, formDataId: created.data!, expectedWorkflowRunId: candidate.workflowRunId }))
      .toMatchObject({ state: 'succeeded', data: { dataId: created.data, values: { memo: 'changed Mock value' } } })
    expect(request).not.toHaveBeenCalled()
  })

  it('never falls through to network for a synthetic replacement with Mock off and real writes enabled', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    vi.stubEnv('VITE_XLINK_MOCK', 'false')
    resetBusinessMockCache()
    setBusinessMockMode('off')
    const request = vi.fn(() => { throw Error('Synthetic scope must never use network') })
    const adapter = new TechnicianApiCommandAdapter(createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid', getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'), request,
    }), {} as TechnicianApiReadPort)
    // Exercise both existing ownership rules, without inventing new prefixes:
    // known synthetic definition OR known synthetic work order.
    for (const override of [
      { definitionId: asOpaqueId<'FormDefinitionId'>(mockSurveyFormDefinitionId) },
      { workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.surveySuccess) },
    ]) {
      expect(await adapter.saveDynamicForm({ ...input, ...override, formDataId: existingId, mutation: harness().mutation }))
        .toMatchObject({ state: 'failed_terminal' })
    }
    expect(request).not.toHaveBeenCalled()
  })
})
