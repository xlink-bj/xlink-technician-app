import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { createUniUploadPort } from '@adapters/upload/uni-upload-port'
import { createUploadAdapter, RetryableUploadError } from '@adapters/upload/upload-adapter'
import type { LocalMedia, OperationSnapshot, UploadedMediaRef } from '@shared/types'
import { rawUploadResponse, rawUploadToken } from '../g3c/fixtures'

const media: LocalMedia = {
  ref: 'synthetic-photo' as LocalMedia['ref'],
  localPath: '/synthetic/not-read.jpg',
  name: 'photo.jpg',
  mimeType: 'image/jpeg',
  source: 'library',
}
const opaqueToken = 'synthetic:opaque:upload-token'
const issuedKey = 'issued-A.jpg'
const signedUrl = 'https://media.example.invalid/issued-A.jpg?e=123&token=synthetic-signature'
type ProviderOptions = Parameters<NonNullable<Parameters<typeof createUniUploadPort>[1]>>[0]

function terminal(result: OperationSnapshot<UploadedMediaRef>): void {
  assert.equal(result.state, 'failed_terminal')
  assert.equal(result.error?.category, 'server_terminal')
  assert.equal(result.data, undefined)
  assert.equal(JSON.stringify(result).includes(opaqueToken), false)
}

async function bridge(body: unknown, token: unknown = { token: opaqueToken, key: issuedKey }, statusCode = 200) {
  const requests: unknown[] = []
  const uploads: ProviderOptions[] = []
  const port = createUniUploadPort({
    execute: async (request) => { requests.push(request); return token },
  }, (options) => { uploads.push(options); options.success({ statusCode, data: body }) })
  return { result: await port.upload(media), requests, uploads }
}

describe('upload object identity contract (synthetic transport only)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_API_BASE_URL', 'https://api.example.invalid')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    vi.stubEnv('VITE_XLINK_MOCK', 'false')
    vi.stubEnv('VITE_XLINK_MEDIA_DOWNLOAD_BASE_URL', 'https://media.example.invalid/')
    resetBusinessMockCache()
    setBusinessMockMode('off')
  })
  afterEach(() => { resetBusinessMockCache(); vi.unstubAllEnvs() })

  it('carries the issued key and unchanged opaque token into provider multipart', async () => {
    const { result, uploads, requests } = await bridge(JSON.stringify({ key: issuedKey, hash: 'synthetic-hash' }))
    assert.equal(uploads.length, 1)
    assert.deepEqual(uploads[0].formData, { token: opaqueToken, key: issuedKey })
    assert.equal(uploads[0].name, 'file')
    assert.equal(uploads[0].filePath, media.localPath)
    assert.deepEqual(requests, [{ method: 'POST', path: 'back/super/file/upToken.do', body: { fileName: 'photo.jpg' } }])
    assert.equal(result.state, 'succeeded')
    assert.equal(result.data?.key, issuedKey)
    assert.equal(result.data?.url, 'https://media.example.invalid/issued-A.jpg')
    assert.equal(result.data?.uploadState, 'uploaded')
    assert.equal(JSON.stringify(result).includes(opaqueToken), false)
    assert.equal(JSON.stringify(result).includes(media.localPath!), false)
  })

  for (const provider of [{ key: 'provider-B' }, { key: 'provider-B', url: 'https://media.example.invalid/provider-B' }]) {
    it('rejects a conflicting provider key even with a provider URL: ' + JSON.stringify(provider), async () => {
      terminal((await bridge(provider)).result)
    })
  }

  for (const [label, body] of [
    ['malformed JSON', 'not-json'], ['empty JSON', '{}'], ['null JSON', 'null'],
    ['array JSON', '[]'], ['scalar JSON', '"text"'], ['absent body', undefined],
    ['missing key', { hash: 'synthetic-hash' }], ['URL without key', { url: signedUrl }],
    ['blank key', { key: ' \t ' }], ['numeric key', { key: 42 }], ['null key', { key: null }],
    ['error body', { error: 'synthetic provider error' }],
    ['error with identity', { error: 'synthetic provider error', key: issuedKey, url: signedUrl }],
    ['conflicting aliases', { key: issuedKey, objectKey: 'provider-B' }],
    ['malformed alias', { key: issuedKey, fileKey: 42 }],
  ] as const) {
    it('rejects HTTP 200 ' + label + ' rather than falling back to token metadata', async () => {
      terminal((await bridge(body)).result)
    })
  }

  for (const key of ['', '  ', 42, null]) {
    it('rejects malformed issued key before provider call: ' + JSON.stringify(key), async () => {
      const { result, uploads } = await bridge({ key: issuedKey, url: signedUrl }, { token: opaqueToken, key })
      terminal(result)
      assert.equal(uploads.length, 0)
    })
  }

  it('rejects conflicting issued aliases before provider call', async () => {
    const { result, uploads } = await bridge({ key: issuedKey, url: signedUrl }, { token: opaqueToken, key: issuedKey, objectKey: 'B' })
    terminal(result)
    assert.equal(uploads.length, 0)
  })

  it('supports corroborating legacy aliases without changing the key', async () => {
    const { result, uploads } = await bridge({ fileKey: issuedKey, objectKey: issuedKey }, { token: opaqueToken, fileKey: issuedKey })
    assert.equal(result.state, 'succeeded')
    assert.equal(result.data?.key, issuedKey)
    assert.equal(uploads[0].formData?.key, issuedKey)
  })

  it('keeps a provider URL when the provider confirms the issued key', async () => {
    const { result } = await bridge({ key: issuedKey, url: signedUrl })
    assert.equal(result.state, 'succeeded')
    assert.equal(result.data?.url, signedUrl)
  })

  it('preserves an issued signed download URL instead of overwriting it with the configured base', async () => {
    const { result } = await bridge({ key: issuedKey }, { token: opaqueToken, key: issuedKey, downloadUrl: signedUrl })
    assert.equal(result.state, 'succeeded')
    assert.equal(result.data?.url, signedUrl)
  })

  it('does not reuse or rewrite an issued signed URL for a different key', async () => {
    terminal((await bridge({ key: 'provider-B' }, { token: opaqueToken, key: issuedKey, downloadUrl: signedUrl })).result)
  })

  it('fails without a download URL even when the provider key matches', async () => {
    vi.stubEnv('VITE_XLINK_MEDIA_DOWNLOAD_BASE_URL', '')
    terminal((await bridge({ key: issuedKey })).result)
  })

  it('does not use a keyless token URL as proof of provider identity', async () => {
    terminal((await bridge({ key: issuedKey }, { token: opaqueToken, downloadUrl: signedUrl })).result)
  })

  it('preserves the legacy token-only driver with complete provider key and URL', async () => {
    const { result, uploads } = await bridge(rawUploadResponse, rawUploadToken)
    assert.equal(result.state, 'succeeded')
    assert.equal(result.data?.url, rawUploadResponse.url)
    assert.equal(result.data?.key, rawUploadResponse.key)
    assert.deepEqual(uploads[0].formData, { token: rawUploadToken.token })
  })

  it('keeps Mock upload local with the existing token-only fixture', async () => {
    setBusinessMockMode('data')
    const { result, uploads, requests } = await bridge(undefined, rawUploadToken)
    assert.equal(result.state, 'succeeded')
    assert.equal(uploads.length, 0)
    assert.equal(requests.length, 1)
    assert.equal(result.data?.key, 'mock-upload/synthetic-photo')
  })

  it('propagates an explicitly retryable transport failure', async () => {
    const port = createUploadAdapter({ issueToken: async () => rawUploadToken }, {
      upload: async () => { throw new RetryableUploadError('synthetic retry') },
    })
    const result = await port.upload(media)
    assert.equal(result.state, 'failed_retryable')
    assert.equal(result.error?.category, 'network_retryable')
  })

  for (const status of [400, 500]) {
    it('rejects provider HTTP ' + status, async () => {
      terminal((await bridge({ key: issuedKey }, undefined, status)).result)
    })
  }

  for (const event of ['fail', 'throw'] as const) {
    it('returns failure on provider ' + event, async () => {
      const port = createUniUploadPort({ execute: async () => ({ token: opaqueToken, key: issuedKey }) }, (options) => {
        if (event === 'throw') throw new Error('synthetic transport failure')
        options.fail(new Error('synthetic transport failure'))
      })
      terminal(await port.upload(media))
    })
  }

  for (const [label, environment, api, enabled] of [
    ['default closed', 'dev', 'https://api.example.invalid', undefined],
    ['writes disabled', 'dev', 'https://api.example.invalid', 'false'],
    ['Production', 'prod', 'https://api.example.invalid', 'true'],
    ['Production host in dev', 'dev', 'https://xlink.fsgo365.cn', 'true'],
  ] as const) {
    it('does not request token or provider when ' + label, async () => {
      vi.stubEnv('VITE_XLINK_ENVIRONMENT', environment)
      vi.stubEnv('VITE_XLINK_API_BASE_URL', api)
      vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', enabled)
      const { result, uploads, requests } = await bridge({ key: issuedKey })
      assert.equal(result.state, 'failed_terminal')
      assert.equal(result.error?.category, 'unsupported_capability')
      assert.equal(uploads.length, 0)
      assert.equal(requests.length, 0)
    })
  }
})
