import { describe, expect, it } from 'vitest'

import { createAuthSessionAdapter } from '@adapters/auth/auth-session-adapter'
import {
  createUniAuthBackendDriver,
  type UniRequestExecutor,
} from '@adapters/auth/uni-auth-backend'
import { createSemanticStorageAdapter } from '@adapters/storage/storage-adapter'
import {
  createUniStorageDriver,
  type UniStorageApi,
} from '@adapters/storage/uni-storage-driver'
import type { StorageKey } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

class FakeUniStorage implements UniStorageApi {
  readonly values = new Map<string, string>()

  setStorage(options: UniNamespace.SetStorageOptions): void {
    this.values.set(options.key, String(options.data))
    options.success?.({})
  }

  getStorage(options: UniNamespace.GetStorageOptions<string>): void {
    const value = this.values.get(options.key)
    if (value === undefined) {
      options.fail?.({ errMsg: 'not found' })
      return
    }
    options.success?.({ data: value })
  }

  removeStorage(options: UniNamespace.RemoveStorageOptions): void {
    this.values.delete(options.key)
    options.success?.({})
  }
}

const sessionKey: StorageKey = { namespace: 'session', key: 'current' }

describe('G4-A uni infrastructure boundaries', () => {
  it('maps uni key/value storage to semantic namespaced storage', async () => {
    const driver = new FakeUniStorage()
    const storage = createSemanticStorageAdapter(createUniStorageDriver(driver))

    expect(await storage.read(sessionKey)).toEqual({ state: 'succeeded', data: null })
    expect(await storage.write(sessionKey, { sessionRef: 'sanitized-session-token' })).toEqual({
      state: 'succeeded',
    })
    expect(driver.values.get('session:current')).toBe('{"sessionRef":"sanitized-session-token"}')
    expect(await storage.read(sessionKey)).toEqual({
      state: 'succeeded',
      data: { sessionRef: 'sanitized-session-token' },
    })
    expect(await storage.remove(sessionKey)).toEqual({ state: 'succeeded' })
  })

  it('form-encodes accepted auth wire fields and returns only normalized session data', async () => {
    const storageDriver = new FakeUniStorage()
    const storage = createSemanticStorageAdapter(createUniStorageDriver(storageDriver))
    const requests: UniNamespace.RequestOptions[] = []
    const request: UniRequestExecutor = (options) => {
      requests.push(options)
      options.success?.({
        data: {
          data: {
            token: 'sanitized-session-token',
            user: { id: 'sanitized-user-id', displayName: 'Sanitized Technician' },
            role: { id: 'sanitized-role-id', name: 'Technician' },
            functionList: ['work-order.read'],
          },
        },
        statusCode: 200,
        header: {},
        cookies: [],
      })
    }
    const backend = createUniAuthBackendDriver({
      apiBaseUrl: 'https://beta.example.invalid/api/',
      request,
    })
    const auth = createAuthSessionAdapter(backend, storage, {
      tenant: 'sanitized-tenant',
      phoneLoginMethod: 'sanitized-phone-login-method',
    })

    const result = await auth.startSession({
      phoneNumber: 'test-phone',
      verificationCode: 'test-code',
    })

    expect(result.state).toBe('succeeded')
    expect(result.data).toEqual({
      sessionRef: 'sanitized-session-token',
      user: { id: 'sanitized-user-id', displayName: 'Sanitized Technician' },
      currentRole: { id: 'sanitized-role-id', name: 'Technician' },
      capabilityNames: ['work-order.read'],
    })
    expect(requests[0]).toMatchObject({
      url: 'https://beta.example.invalid/api/index/phoneLogin.do',
      method: 'POST',
      header: { 'Content-Type': 'application/x-www-form-urlencoded' },
      dataType: 'json',
      responseType: 'text',
    })
    expect(String(requests[0].data)).toContain('method=sanitized-phone-login-method')
    expect(String(requests[0].data)).toContain('phone=test-phone')
    expect(String(requests[0].data)).toContain('code=test-code')
    expect(String(requests[0].data)).toContain('tenantId=sanitized-tenant')
    expect(String(requests[0].data)).not.toContain('tenant=sanitized-tenant')

    const persisted = storageDriver.values.get('session:current') ?? ''
    expect(persisted).not.toContain('test-phone')
    expect(persisted).not.toContain('test-code')
    expect(persisted).not.toContain('sanitized-tenant')
    expect(persisted).not.toContain('sanitized-phone-login-method')
    expect(persisted).toContain('sanitized-session-token')

    await auth.endSession()
    expect(requests).toHaveLength(1)
    expect(storageDriver.values.has('session:current')).toBe(false)
  })

  it('forwards the R1 universal verification code as a normal login credential', async () => {
    const request: UniRequestExecutor = (options) => {
      expect(String(options.data)).toContain('code=999999')
      expect(String(options.data)).toContain('tenantId=sanitized-tenant')
      options.success?.({
        data: {
          data: {
            token: 'sanitized-session-token',
            user: { id: 'sanitized-user-id' },
          },
        },
        statusCode: 200,
        header: {},
        cookies: [],
      })
    }
    const auth = createAuthSessionAdapter(
      createUniAuthBackendDriver({ apiBaseUrl: 'https://beta.example.invalid', request }),
      createSemanticStorageAdapter(createUniStorageDriver(new FakeUniStorage())),
      { tenant: 'sanitized-tenant', phoneLoginMethod: '1' },
    )

    const result = await auth.startSession({
      phoneNumber: 'test-phone',
      verificationCode: '999999',
    })

    expect(result.state).toBe('succeeded')
  })

  it('accepts the R1 text response mode when the successful JSON arrives as text', async () => {
    const auth = createAuthSessionAdapter(
      createUniAuthBackendDriver({
        apiBaseUrl: 'https://beta.example.invalid',
        request: (options) => {
          options.success?.({
            data: JSON.stringify({
              success: true,
              status: 1,
              data: {
                token: 'sanitized-session-token',
                user: { _id: 'sanitized-user-id' },
                currentRole: { _id: 'sanitized-role-id', name: 'Technician' },
              },
            }),
            statusCode: 200,
            header: {},
            cookies: [],
          })
        },
      }),
      createSemanticStorageAdapter(createUniStorageDriver(new FakeUniStorage())),
      { tenant: 'sanitized-tenant', phoneLoginMethod: '1' },
    )

    const result = await auth.startSession({
      phoneNumber: 'test-phone',
      verificationCode: '999999',
    })

    expect(result.state).toBe('succeeded')
    expect(result.data?.sessionRef).toBe('sanitized-session-token')
    expect(result.data?.user.id).toBe('sanitized-user-id')
  })

  it('maps network failure to retryable and HTTP failure to terminal auth errors', async () => {
    const makeAuth = (request: UniRequestExecutor) =>
      createAuthSessionAdapter(
        createUniAuthBackendDriver({ apiBaseUrl: 'https://beta.example.invalid', request }),
        createSemanticStorageAdapter(createUniStorageDriver(new FakeUniStorage())),
        { tenant: 'sanitized-tenant', phoneLoginMethod: 'sanitized-phone-login-method' },
      )

    const retryable = await makeAuth((options) => {
      options.fail?.({ errMsg: 'network unavailable' })
    }).startSession({ phoneNumber: 'test-phone', verificationCode: 'test-code' })
    expect(retryable.state).toBe('failed_retryable')
    expect(retryable.error?.category).toBe('network_retryable')

    const terminal = await makeAuth((options) => {
      options.success?.({ data: {}, statusCode: 401, header: {}, cookies: [] })
    }).startSession({ phoneNumber: 'test-phone', verificationCode: 'test-code' })
    expect(terminal.state).toBe('failed_terminal')
    expect(terminal.error?.category).toBe('server_terminal')
  })

  it('keeps remote logout unimplemented while local session clearing remains available', async () => {
    const backend = createUniAuthBackendDriver({
      apiBaseUrl: 'https://beta.example.invalid',
      request: () => undefined,
    })
    const result = await backend.logout(asOpaqueId<'SessionRef'>('sanitized-session-token'))
    expect(result).toEqual({ remoteLogout: 'not_configured' })
  })
})
