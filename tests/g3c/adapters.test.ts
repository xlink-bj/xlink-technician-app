import { describe, expect, it, vi } from 'vitest'

import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'
import {
  createTechnicianApiReadAdapter,
  TechnicianApiReadAdapter,
} from '@adapters/api/technician-api'
import {
  AuthSessionAdapter,
  type AuthWireConfig,
  type AuthBackendDriver,
} from '@adapters/auth/auth-session-adapter'
import {
  createPlatformAdapters,
  createUnsupportedPlatformAdapters,
} from '@adapters/platform/platform-adapters'
import {
  createSemanticStorageAdapter,
  type KeyValueStorageDriver,
} from '@adapters/storage/storage-adapter'
import {
  createUploadAdapter,
  RetryableUploadError,
} from '@adapters/upload/upload-adapter'
import type { AuthStartRequest, StorageKey } from '@shared/ports'
import type { LocalMedia } from '@shared/types'
import { asOpaqueId } from '@shared/types'

import {
  rawAuthResponse,
  rawCodeOptionsPage,
  rawFormDataPage,
  rawUploadResponse,
  rawUploadToken,
  rawWorkOrderDetail,
  rawWorkOrderPage,
  rawWorkflowNodes,
} from './fixtures'

class FixtureApiTransport implements ApiReadTransport {
  readonly requests: ApiReadRequest[] = []

  constructor(private readonly responses: Record<string, unknown>) {}

  async execute(request: ApiReadRequest): Promise<unknown> {
    this.requests.push(request)
    return this.responses[request.path] ?? this.responses.default
  }
}

class InMemoryStorageDriver implements KeyValueStorageDriver {
  readonly values = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value)
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key)
  }

  async listKeys(): Promise<readonly string[]> {
    return [...this.values.keys()]
  }
}

const key = (namespace: StorageKey['namespace'], value: string): StorageKey => ({
  namespace,
  key: value,
})

describe('G3-C API adapter foundation', () => {
  it('maps raw pages to normalized models and keeps backend query details internal', async () => {
    const transport = new FixtureApiTransport({
      'basic/serviceAppointment/query': rawWorkOrderPage,
      'basic/serviceAppointment/queryById/work-order-001': rawWorkOrderDetail,
      'workflow/queryNode/workflow-run-001': rawWorkflowNodes,
      'code/query': rawCodeOptionsPage,
    })
    const api = createTechnicianApiReadAdapter(transport)

    const list = await api.listWorkOrders({ page: 1, pageSize: 20 })
    expect(list).toEqual({
      state: 'succeeded',
      data: {
        items: [
          {
            id: 'work-order-001',
            displayNumber: 'DEMO-SA-001',
            customerName: 'Sanitized customer',
            serviceAddress: 'Sanitized service address',
          },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
      },
    })
    expect(list.data?.items[0]).not.toHaveProperty('stateCode')
    expect(transport.requests[0]).toEqual({
      method: 'POST',
      path: 'basic/serviceAppointment/query',
      body: { page: 1, rows: 20 },
    })

    const detail = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('work-order-001'))
    expect(detail.data).toEqual({
      id: 'work-order-001',
      workflowRunId: 'workflow-run-001',
      displayNumber: 'DEMO-SA-001',
      customerName: 'Sanitized customer',
      serviceAddress: 'Sanitized service address',
    })
    expect(transport.requests[1].body).toEqual({ type: 'query' })

    const nodes = await api.getWorkflowNodes(asOpaqueId<'WorkflowRunId'>('workflow-run-001'))
    expect(nodes.data).toEqual([
      {
        id: 'workflow-node-001',
        definitionId: 'workflow-definition-001',
        runId: 'workflow-run-001',
        parentNodeId: 'workflow-node-parent',
        category: 'unsupported',
        lifecycle: 'unknown',
        visibility: { evidenceState: 'missing' },
      },
    ])
    expect(nodes.data?.[0]).not.toHaveProperty('nodeStateCode')

    const options = await api.getCodeOptions({ parentValue: 'parent-option' })
    expect(options.data?.items).toEqual([{ value: 'option-a', label: 'Sanitized option' }])
    expect(transport.requests.find((request) => request.path === 'code/query')?.body).toEqual({
      parentId: 'parent-option',
    })
  })

  it('maps the R1 batch dynamic code provider without exposing its wire envelope', async () => {
    const transport = new FixtureApiTransport({
      'i/code/selectCode.do': [{
        eleid: 'qualified',
        options: { '0': '不合格', '1': '合格' },
      }],
    })
    const api = createTechnicianApiReadAdapter(transport, {
      codeTenantId: 'sanitized-tenant',
    })

    const result = await api.getDynamicCodeOptions!({ valueOption: 'qualified' })

    expect(result).toEqual({
      state: 'succeeded',
      data: {
        items: [
          { value: '0', label: '不合格' },
          { value: '1', label: '合格' },
        ],
      },
    })
    expect(transport.requests[0]).toEqual({
      method: 'POST',
      path: 'i/code/selectCode.do',
      body: {
        jsonPara: JSON.stringify([{ codeId: 'qualified', eleid: 'qualified' }]),
        tenantId: 'sanitized-tenant',
      },
    })
    expect(JSON.stringify(result)).not.toContain('eleid')
    expect(JSON.stringify(result)).not.toContain('options')
  })

  it('retains cascade hierarchy while normalizing R1 code nodes', async () => {
    const transport = new FixtureApiTransport({
      'i/code/selectMultistageCode.do': [{
        type: 'parts',
        children: [{
          value: 'roof',
          name: '屋面',
          children: [{ value: 'roof-inner', name: '女儿墙' }],
        }],
      }],
    })
    const api = createTechnicianApiReadAdapter(transport, {
      cascadeTenantId: 'sanitized-tenant',
    })

    const result = await api.getCascadeCodeOptions({ codeType: 'parts' })

    expect(result.data?.items).toEqual([{
      value: 'roof',
      label: '屋面',
      children: [{ value: 'roof-inner', label: '女儿墙' }],
    }])
  })

  it('maps a verified district code and omits missing or unmapped district codes', async () => {
    const transport = new FixtureApiTransport({
      'basic/serviceAppointment/query': {
        data: [
          {
            id: 'work-order-mapped',
            orderNum: 'DEMO-SA-MAPPED',
            district: 110105,
            address: 'Sanitized mapped address',
          },
          {
            id: 'work-order-missing',
            orderNum: 'DEMO-SA-MISSING',
            address: 'Sanitized missing district address',
          },
          {
            id: 'work-order-unmapped',
            orderNum: 'DEMO-SA-UNMAPPED',
            district: 999999,
            address: 'Sanitized unmapped district address',
          },
        ],
        page: 1,
        rows: 20,
        total: 3,
      },
    })
    const api = createTechnicianApiReadAdapter(transport)

    const result = await api.listWorkOrders({ page: 1, pageSize: 20 })

    expect(result.data?.items).toEqual([
      {
        id: 'work-order-mapped',
        displayNumber: 'DEMO-SA-MAPPED',
        serviceDistrict: '朝阳区',
        serviceAddress: 'Sanitized mapped address',
      },
      {
        id: 'work-order-missing',
        displayNumber: 'DEMO-SA-MISSING',
        serviceAddress: 'Sanitized missing district address',
      },
      {
        id: 'work-order-unmapped',
        displayNumber: 'DEMO-SA-UNMAPPED',
        serviceAddress: 'Sanitized unmapped district address',
      },
    ])
  })

  it('maps searchText to adapter-owned backend search keys and resets no shared query shape', async () => {
    const transport = new FixtureApiTransport({ default: rawWorkOrderPage })
    const api = createTechnicianApiReadAdapter(transport)

    await api.listWorkOrders({ page: 1, pageSize: 20, searchText: '  sanitized  ' })

    expect(transport.requests[0].body).toEqual({
      page: 1,
      rows: 20,
      'regex:title|string#or': 'sanitized',
      'regex:name|string#or': 'sanitized',
      'regex:phone|string#or': 'sanitized',
      'regex:address|string#or': 'sanitized',
      'regex:describe|string#or': 'sanitized',
      'regex:orderNum|string#or': 'sanitized',
    })
  })

  it('maps form reads and makes malformed backend data terminal', async () => {
    const transport = new FixtureApiTransport({
      'biz/extForm/query/form-definition-001': rawFormDataPage,
      'biz/extForm/findByIdWithWorkflow': rawFormDataPage.data[0],
      'biz/extField/query': { entity: { id: 'form-definition-001' } },
    })
    const api = new TechnicianApiReadAdapter(transport)

    const definition = await api.getFormDefinition(
      asOpaqueId<'FormDefinitionId'>('form-definition-001'),
    )
    expect(definition.data).toEqual({ id: 'form-definition-001' })

    const data = await api.getFormData({
      definitionId: asOpaqueId<'FormDefinitionId'>('form-definition-001'),
    })
    expect(data.data?.items).toEqual([
      {
        id: 'form-data-001',
        definitionId: 'form-definition-001',
        workflowRunId: 'workflow-run-001',
      },
    ])

    const malformed = new TechnicianApiReadAdapter(
      new FixtureApiTransport({ default: { data: [{ title: 'missing id' }] } }),
    )
    const result = await malformed.listWorkOrders({ page: 1, pageSize: 20 })
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('server_terminal')
  })

  it('keeps the requested form definition identity when extField returns field rows', async () => {
    const requestedId = asOpaqueId<'FormDefinitionId'>('appointment-definition')
    const transport = new FixtureApiTransport({
      'biz/extField/query': {
        data: [
          {
            _id: 'field-row-001',
            extId: 'appointment-definition',
            name: 'datetime',
            nameDisp: '预约时间',
            type: 'datetime',
          },
        ],
      },
    })
    const api = createTechnicianApiReadAdapter(transport)

    const result = await api.getFormDefinition(requestedId)

    expect(result.data?.id).toBe(requestedId)
    expect(result.data?.id).not.toBe('field-row-001')
  })

  it('routes only an explicit Survey Ext identity and leaves generic forms unclassified', async () => {
    const surveyId = asOpaqueId<'FormDefinitionId'>('survey-definition')
    const surveyTransport = new FixtureApiTransport({
      'biz/extField/query': {
        data: [{
          _id: 'survey-row-001',
          colName: 'survey',
          purpose: 'not-a-form-purpose',
          name: 'surveyField',
          nameDisp: '勘查字段',
          type: 'text',
        }],
      },
    })
    const survey = await createTechnicianApiReadAdapter(surveyTransport).getFormDefinition(surveyId)
    expect(survey.data?.purpose).toBe('survey')

    const genericId = asOpaqueId<'FormDefinitionId'>('generic-definition')
    const genericTransport = new FixtureApiTransport({
      'biz/extField/query': {
        data: [{
          _id: 'generic-row-001',
          purpose: 'survey',
          name: 'genericField',
          nameDisp: '通用字段',
          type: 'text',
        }],
      },
    })
    const generic = await createTechnicianApiReadAdapter(genericTransport).getFormDefinition(genericId)
    expect(generic.data).not.toHaveProperty('purpose')
  })

  it('fails closed when field rows carry contradictory form identities', async () => {
    const requestedId = asOpaqueId<'FormDefinitionId'>('mixed-definition')
    const transport = new FixtureApiTransport({
      'biz/extField/query': {
        data: [
          { _id: 'survey-row', colName: 'survey', name: 'first', nameDisp: '第一行', type: 'text' },
          { _id: 'appointment-row', colName: 'appointment', name: 'second', nameDisp: '第二行', type: 'text' },
        ],
      },
    })

    const result = await createTechnicianApiReadAdapter(transport).getFormDefinition(requestedId)

    expect(result.data).not.toHaveProperty('purpose')
  })

  it('retains inline option hierarchy and fails closed on malformed option rows', async () => {
    const requestedId = asOpaqueId<'FormDefinitionId'>('generic-definition')
    const transport = new FixtureApiTransport({
      'biz/extField/query': {
        data: [
          {
            _id: 'cascade-row',
            name: 'location',
            nameDisp: '位置',
            type: 'cascade',
            showList: ['3', '4'],
            options: [{ value: 'roof', name: '屋面', children: [{ value: 'inner', name: '女儿墙' }] }],
          },
          {
            _id: 'malformed-row',
            name: 'broken',
            nameDisp: '异常选项',
            type: 'select',
            options: [{ value: 'missing-label' }],
          },
        ],
      },
    })
    const result = await createTechnicianApiReadAdapter(transport).getFormDefinition(requestedId)
    expect(result.data?.fields?.[0]?.options).toEqual([{
      value: 'roof',
      label: '屋面',
      children: [{ value: 'inner', label: '女儿墙' }],
    }])
    expect(result.data?.fields?.[0]?.showList).toEqual(['3', '4'])
    expect(result.data?.fields?.[1]).toMatchObject({
      fieldId: 'malformed-row',
      unsupportedReason: 'Field option metadata is malformed',
    })
  })

  it('preserves distinct field-row identities when Survey value keys repeat', async () => {
    const requestedId = asOpaqueId<'FormDefinitionId'>('survey-definition')
    const transport = new FixtureApiTransport({
      'biz/extField/query': {
        data: [
          {
            _id: 'survey-row-length-001',
            name: 'length',
            nameDisp: '长度（结构）',
            type: 'digit',
          },
          {
            _id: 'survey-row-length-002',
            name: 'length',
            nameDisp: '长度（局部）',
            type: 'digit',
          },
        ],
      },
    })
    const api = createTechnicianApiReadAdapter(transport)

    const result = await api.getFormDefinition(requestedId)

    expect(result.data?.id).toBe(requestedId)
    expect(result.data?.fields?.map((field) => ({ fieldId: field.fieldId, valueKey: field.valueKey }))).toEqual([
      { fieldId: 'survey-row-length-001', valueKey: 'length' },
      { fieldId: 'survey-row-length-002', valueKey: 'length' },
    ])
  })

  it('normalizes observed conditional metadata from record.exts and preserves multi-value shape', async () => {
    const requestedId = asOpaqueId<'FormDefinitionId'>('observed-inspection-definition')
    const transport = new FixtureApiTransport({
      'biz/extField/query': {
        data: [
          {
            _id: 'field-row-part',
            extId: requestedId,
            name: 'part',
            nameDisp: '部位',
            type: 'cascade',
            required: '1',
            multiple: false,
            valueOption: 'parts',
            showType: '1',
          },
          {
            _id: 'field-row-content',
            extId: requestedId,
            name: 'inspectionContent',
            nameDisp: '巡检内容',
            type: 'select',
            multiple: true,
            showType: '1',
          },
          {
            _id: 'field-row-length',
            extId: requestedId,
            name: 'length',
            nameDisp: '长',
            type: 'digit',
            required: '1',
            showType: '3',
            showField: 'part',
            showFieldPreset: 1,
            showValue: '',
            exts: { showValue: ['1', '2'] },
          },
        ],
      },
    })
    const api = createTechnicianApiReadAdapter(transport)

    const result = await api.getFormDefinition(requestedId)

    expect(result.data?.fields).toEqual([
      {
        fieldId: 'field-row-part',
        valueKey: 'part',
        label: '部位',
        type: 'cascade',
        required: true,
        readOnly: false,
        valueOption: 'parts',
      },
      {
        fieldId: 'field-row-content',
        valueKey: 'inspectionContent',
        label: '巡检内容',
        type: 'select',
        required: false,
        readOnly: false,
        multiple: true,
      },
      {
        fieldId: 'field-row-length',
        valueKey: 'length',
        label: '长',
        type: 'digit',
        required: true,
        readOnly: false,
        visibility: { kind: 'oneOf', path: 'part', values: ['1', '2'] },
      },
    ])
  })

  it('uses the exact R1 form-data filter and sort request shape', async () => {
    const transport = new FixtureApiTransport({
      'biz/extForm/query/appointment-definition': rawFormDataPage,
    })
    const api = createTechnicianApiReadAdapter(transport)
    const definitionId = asOpaqueId<'FormDefinitionId'>('appointment-definition')
    const dataId = asOpaqueId<'FormDataId'>('form-data-001')

    await api.getFormData({ definitionId, dataId })

    expect(transport.requests[0]).toEqual({
      method: 'POST',
      path: 'biz/extForm/query/appointment-definition',
      body: {
        sortField: 'createTime',
        sortOrder: 'desc',
        'is:_id|string#and': dataId,
      },
    })
  })
})

describe('G3-C storage and auth adapter foundations', () => {
  it('normalizes namespace keys and treats missing values safely', async () => {
    const driver = new InMemoryStorageDriver()
    const storage = createSemanticStorageAdapter(driver)

    expect(await storage.read(key('cache', 'missing'))).toEqual({ state: 'succeeded', data: null })
    expect(await storage.write(key('draft', 'inspection'), { field: 'value' })).toEqual({
      state: 'succeeded',
    })
    expect(driver.values.has('draft:inspection')).toBe(true)
    expect(await storage.read<{ field: string }>(key('draft', 'inspection'))).toEqual({
      state: 'succeeded',
      data: { field: 'value' },
    })
    expect(await storage.remove(key('draft', 'inspection'))).toEqual({ state: 'succeeded' })
    expect(driver.values.has('draft:inspection')).toBe(false)
  })

  it('enumerates only the requested semantic namespace and prefix', async () => {
    const driver = new InMemoryStorageDriver()
    const storage = createSemanticStorageAdapter(driver)
    await storage.write(key('draft', 'action-workspace:1:user-a:one'), { draft: 1 })
    await storage.write(key('draft', 'action-workspace:1:user-a:two'), { draft: 2 })
    await storage.write(key('draft', 'action-workspace:1:user-b:three'), { draft: 3 })
    await storage.write(key('session', 'action-workspace:1:user-a:session'), { session: true })

    expect(await storage.listKeys({ namespace: 'draft', prefix: 'action-workspace:1:user-a:' })).toEqual({
      state: 'succeeded',
      data: ['action-workspace:1:user-a:one', 'action-workspace:1:user-a:two'],
    })
  })

  it('keeps phone credentials ephemeral and maps invalid sessions explicitly', async () => {
    const driver = new InMemoryStorageDriver()
    const storage = createSemanticStorageAdapter(driver)
    const wireConfig: AuthWireConfig = {
      tenant: 'sanitized-tenant',
      phoneLoginMethod: 'sanitized-phone-login-method',
    }
    const backend: AuthBackendDriver = {
      login: vi.fn(async (request) => {
        expect(request).toEqual({
          path: 'index/phoneLogin.do',
          body: {
            method: 'sanitized-phone-login-method',
            phone: 'test-phone',
            code: 'test-code',
            tenant: 'sanitized-tenant',
          },
        })
        return rawAuthResponse
      }),
      restore: vi.fn(async () => ({ valid: false })),
      logout: vi.fn(async () => ({ success: true })),
    }
    const auth = new AuthSessionAdapter(backend, storage, wireConfig)
    const input: AuthStartRequest = {
      phoneNumber: 'test-phone',
      verificationCode: 'test-code',
    }

    const started = await auth.startSession(input)
    expect(started.state).toBe('succeeded')
    expect(started.data?.sessionRef).toBe('sanitized-session-token')
    const persisted = driver.values.get('session:current') ?? ''
    expect(persisted).not.toContain('test-phone')
    expect(persisted).not.toContain('test-code')
    expect(persisted).not.toContain('verificationCode')
    expect(persisted).not.toContain('sanitized-tenant')
    expect(persisted).not.toContain('sanitized-phone-login-method')
    expect(persisted).toContain('sanitized-session-token')

    const restored = await auth.restoreSession()
    expect(restored.state).toBe('failed_terminal')
    expect(restored.error?.category).toBe('session_invalid')
    expect(driver.values.has('session:current')).toBe(false)
  })
})

describe('G3-C upload adapter foundation', () => {
  const media: LocalMedia = {
    ref: asOpaqueId<'LocalMediaRef'>('local-media-001'),
    mimeType: 'image/jpeg',
    source: 'camera',
  }

  it('maps token/upload drivers to UploadedMediaRef without persisting local paths', async () => {
    const tokenDriver = { issueToken: vi.fn(async () => rawUploadToken) }
    const uploadDriver = {
      upload: vi.fn(async (input: { readonly media: LocalMedia; readonly token: string }) => {
        expect(input.token).toBe('sanitized-upload-token')
        expect(input.media.ref).toBe('local-media-001')
        return { ...rawUploadResponse, localPath: '/private/native/path' }
      }),
    }
    const upload = createUploadAdapter(tokenDriver, uploadDriver)

    const result = await upload.upload(media)
    expect(result).toEqual({
      state: 'succeeded',
      data: {
        url: 'https://uploads.example.invalid/sanitized-object',
        key: 'sanitized/object',
        mimeType: 'image/jpeg',
        source: 'camera',
        uploadState: 'uploaded',
      },
    })
    expect(result.data).not.toHaveProperty('localPath')
  })

  it('maps retryable upload transport failures to the accepted operation state', async () => {
    const upload = createUploadAdapter(
      { issueToken: vi.fn(async () => rawUploadToken) },
      { upload: vi.fn(async () => { throw new RetryableUploadError() }) },
    )

    const result = await upload.upload(media)
    expect(result.state).toBe('failed_retryable')
    expect(result.error?.category).toBe('network_retryable')
  })
})

describe('G3-C platform adapter foundation', () => {
  it('maps driver outcomes and strips raw platform object details', async () => {
    const adapters = createPlatformAdapters({
      location: {
        capture: vi.fn(async () => ({
          state: 'granted',
          value: {
            latitude: 39.9,
            longitude: 116.4,
            coordinateSystem: 'gcj02',
            capturedAt: '2026-01-01T00:00:00Z',
            nativeHandle: { platform: 'test-only' },
          },
        })),
      },
      mediaFilePicker: {
        pick: vi.fn(async () => ({
          state: 'granted',
          value: [{
            ref: 'local-media-002',
            mimeType: 'image/jpeg',
            source: 'library',
            path: '/private/native/path',
          }],
        })),
      },
      scan: { scan: vi.fn(async () => ({ state: 'denied', reason: 'user denied' })) },
    })

    const location = await adapters.location.captureCurrentLocation()
    expect(location.state).toBe('granted')
    expect(location.value).toEqual({
      latitude: 39.9,
      longitude: 116.4,
      coordinateSystem: 'gcj02',
      capturedAt: '2026-01-01T00:00:00Z',
    })
    expect(location.value).not.toHaveProperty('nativeHandle')

    const picked = await adapters.mediaFilePicker.pick()
    expect(picked.value?.[0]).not.toHaveProperty('path')
    expect(picked.value?.[0].ref).toBe('local-media-002')

    const scan = await adapters.scan.scan()
    expect(scan.state).toBe('denied')
    expect(scan.canRetry).toBe(true)
  })

  it('returns explicit unsupported_platform for unavailable conditional capabilities', async () => {
    const adapters = createUnsupportedPlatformAdapters()

    expect((await adapters.calendar.addEvent({
      title: 'test',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-01T01:00:00Z',
    })).state).toBe('unsupported_platform')
    expect((await adapters.phone.dial({
      contactRef: asOpaqueId<'CustomerContactId'>('contact-001'),
      normalizedPhone: 'test-phone',
    })).state).toBe('unsupported_platform')
  })
})
