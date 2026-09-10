import { describe, expect, it, vi } from 'vitest'

import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'
import {
  createTechnicianApiReadAdapter,
  TechnicianApiReadAdapter,
} from '@adapters/api/technician-api'
import {
  AuthSessionAdapter,
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
        items: [{ id: 'work-order-001', title: 'Sanitized work order' }],
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
    expect(detail.data).toEqual({ id: 'work-order-001', workflowRunId: 'workflow-run-001' })
    expect(transport.requests[1].body).toEqual({ type: 'query' })

    const nodes = await api.getWorkflowNodes(asOpaqueId<'WorkflowRunId'>('workflow-run-001'))
    expect(nodes.data).toEqual([
      {
        id: 'workflow-node-001',
        definitionId: 'workflow-definition-001',
        runId: 'workflow-run-001',
        parentNodeId: 'workflow-node-parent',
      },
    ])
    expect(nodes.data?.[0]).not.toHaveProperty('nodeStateCode')

    const options = await api.getCodeOptions({ parentValue: 'parent-option' })
    expect(options.data?.items).toEqual([{ value: 'option-a', label: 'Sanitized option' }])
    expect(transport.requests[3].body).toEqual({ parentId: 'parent-option' })
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

  it('keeps phone credentials ephemeral and maps invalid sessions explicitly', async () => {
    const driver = new InMemoryStorageDriver()
    const storage = createSemanticStorageAdapter(driver)
    const backend: AuthBackendDriver = {
      login: vi.fn(async (request) => {
        expect(request).toEqual({
          path: 'index/phoneLogin.do',
          body: { method: '1', phone: 'test-phone', code: 'test-code' },
        })
        return rawAuthResponse
      }),
      restore: vi.fn(async () => ({ valid: false })),
      logout: vi.fn(async () => ({ success: true })),
    }
    const auth = new AuthSessionAdapter(backend, storage)
    const input: AuthStartRequest = {
      phoneNumber: 'test-phone',
      verificationCode: 'test-code',
    }

    const started = await auth.startSession(input)
    expect(started.state).toBe('succeeded')
    expect(started.data?.sessionRef).toBe('sanitized-session-token')
    const persisted = driver.values.get('session:current') ?? ''
    expect(persisted).not.toContain('test-code')
    expect(persisted).not.toContain('verificationCode')
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
