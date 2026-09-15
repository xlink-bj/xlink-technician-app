import { describe, expect, it } from 'vitest'

import {
  capabilityMetadata,
  createCapabilityResult,
  createOperationError,
  operationStateForError,
} from '@shared/types'
import {
  isCompatibilityEntryActive,
  parseEnvironmentConfig,
  validateCompatibilityEntry,
} from '@shared/config'
import type { CompatibilityEntry } from '@shared/config'

describe('G3-B operation and capability contracts', () => {
  it('classifies only network errors as retryable operations', () => {
    const retryable = createOperationError('network_retryable', 'temporary failure')
    const terminal = createOperationError('validation', 'invalid input')

    expect(retryable.retryable).toBe(true)
    expect(operationStateForError(retryable)).toBe('failed_retryable')
    expect(terminal.retryable).toBe(false)
    expect(operationStateForError(terminal)).toBe('failed_terminal')
  })

  it('keeps permanent denial actionable through settings instead of retry', () => {
    expect(capabilityMetadata('denied_permanently_or_settings')).toEqual({
      canRetry: false,
      canOpenSettings: true,
    })
    expect(createCapabilityResult('location', 'unsupported_platform').canRetry).toBe(false)
  })
})

describe('G3-B environment contract', () => {
  it('accepts a non-secret target configuration', () => {
    const result = parseEnvironmentConfig({
      environment: 'test',
      platform: 'mp-weixin',
      apiBaseUrl: 'https://example.invalid',
      flags: { foundationOnly: true },
    })

    expect(result.ok).toBe(true)
  })

  it('validates the API URL without a browser URL constructor', () => {
    const originalUrl = globalThis.URL
    Object.defineProperty(globalThis, 'URL', { configurable: true, value: undefined })

    try {
      const result = parseEnvironmentConfig({
        environment: 'test',
        platform: 'mp-weixin',
        apiBaseUrl: 'https://example.invalid/fsgo/wm/',
        flags: {},
      })

      expect(result.ok).toBe(true)
    } finally {
      Object.defineProperty(globalThis, 'URL', { configurable: true, value: originalUrl })
    }
  })

  it('rejects unsupported targets and secret defaults', () => {
    const result = parseEnvironmentConfig({
      environment: 'prod',
      platform: 'h5',
      apiBaseUrl: 'not-a-url',
      token: 'never-committed',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          'platform is invalid',
          'apiBaseUrl must be a valid URL',
          'secret field is not allowed: token',
        ]),
      )
    }
  })
})

describe('G3-B compatibility registry contract', () => {
  const sanitizedEntry: CompatibilityEntry = {
    semanticName: 'sanitized-workflow-rule',
    purpose: 'test-only compatibility example',
    scope: 'workflow',
    provenance: { source: 'sanitized-fixture', evidenceRef: 'fixture-001' },
    ownerGate: 'G4 workflow verification',
    confidence: 'medium',
    activation: { approved: false, condition: 'explicit reviewed activation' },
    safeFallback: 'inactive',
    reviewRemovalCondition: 'remove after verified contract replacement',
    wireReference: 'sanitized-wire-reference',
  }

  it('defaults a valid but unapproved entry to inactive', () => {
    expect(validateCompatibilityEntry(sanitizedEntry)).toEqual([])
    expect(isCompatibilityEntryActive(sanitizedEntry)).toBe(false)
  })

  it('requires complete provenance and activation metadata', () => {
    expect(validateCompatibilityEntry({ wireReference: 'alone' })).not.toEqual([])
  })

  it('requires explicit approval in addition to a wire reference', () => {
    const activated = {
      ...sanitizedEntry,
      activation: { approved: true, condition: 'approved sanitized fixture' },
    }

    expect(isCompatibilityEntryActive(activated)).toBe(true)
  })
})
