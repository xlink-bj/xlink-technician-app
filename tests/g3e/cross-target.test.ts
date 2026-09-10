import { describe, expect, it } from 'vitest'

import { createTechnicianApiReadAdapter, type ApiReadTransport } from '@adapters/api/technician-api'
import { AuthSessionAdapter, type AuthBackendDriver, type AuthWireConfig } from '@adapters/auth/auth-session-adapter'
import {
  createSemanticStorageAdapter,
  type KeyValueStorageDriver,
} from '@adapters/storage/storage-adapter'
import { createUploadAdapter } from '@adapters/upload/upload-adapter'
import { createUnsupportedPlatformAdapters } from '@adapters/platform/platform-adapters'
import { parseEnvironmentConfig, targetPlatforms } from '@shared/config'
import { asOpaqueId } from '@shared/types'
import { createMainWorkflowContext, evaluateFieldState } from '@runtimes/index'

function createFoundationComposition() {
  const storageDriver: KeyValueStorageDriver = {
    get: async () => null,
    set: async () => undefined,
    remove: async () => undefined,
  }
  const storage = createSemanticStorageAdapter(storageDriver)
  const apiTransport: ApiReadTransport = {
    execute: async () => ({ data: [] }),
  }
  const authBackend: AuthBackendDriver = {
    login: async () => ({}),
    restore: async () => ({ valid: false }),
    logout: async () => ({ success: true }),
  }
  const wireConfig: AuthWireConfig = {
    tenant: 'sanitized-tenant',
    phoneLoginMethod: 'sanitized-phone-login-method',
  }

  return {
    api: createTechnicianApiReadAdapter(apiTransport),
    auth: new AuthSessionAdapter(authBackend, storage, wireConfig),
    storage,
    upload: createUploadAdapter(
      { issueToken: async () => ({ token: 'sanitized-upload-token' }) },
      { upload: async () => ({ url: 'https://uploads.example.invalid/sanitized-object' }) },
    ),
    platform: createUnsupportedPlatformAdapters(),
    workflow: createMainWorkflowContext({
      definitionId: asOpaqueId<'WorkflowDefinitionId'>('workflow-definition-001'),
      runId: asOpaqueId<'WorkflowRunId'>('workflow-run-001'),
    }),
    form: evaluateFieldState({ key: 'notes', type: 'text' }),
  }
}

describe('G3-E cross-target foundation contracts', () => {
  it('accepts only the first-class V1 targets', () => {
    expect(targetPlatforms).toEqual(['mp-weixin', 'android', 'ios'])

    for (const platform of targetPlatforms) {
      const result = parseEnvironmentConfig({
        environment: 'test',
        platform,
        apiBaseUrl: 'https://example.invalid',
        flags: { foundationOnly: true },
      })
      expect(result.ok).toBe(true)
    }

    expect(
      parseEnvironmentConfig({
        environment: 'test',
        platform: 'h5',
        apiBaseUrl: 'https://example.invalid',
        flags: {},
      }).ok,
    ).toBe(false)
  })

  it('composes shared contracts, adapters, and pure runtimes without platform drivers', async () => {
    const composition = createFoundationComposition()

    expect(composition.api).toBeDefined()
    expect(composition.auth).toBeDefined()
    expect(composition.storage).toBeDefined()
    expect(composition.upload).toBeDefined()
    expect(composition.workflow.kind).toBe('main')
    expect(composition.form.capability).toBe('SUPPORTED_GENERIC')
    expect(await composition.platform.scan.scan()).toMatchObject({
      capability: 'scan',
      state: 'unsupported_platform',
    })
  })
})
