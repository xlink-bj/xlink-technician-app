import fs from 'node:fs'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { asOpaqueId } from '@shared/types'

const sessionRef = asOpaqueId<'SessionRef'>('synthetic-platform-session')

function capture() {
  return vi.fn((options: UniNamespace.RequestOptions) => {
    options.success?.({ statusCode: 200, data: { success: true, data: [] }, header: {}, cookies: [] })
  })
}

describe('platform-specific API session headers', () => {
  afterEach(() => vi.unstubAllEnvs())

  for (const platform of ['h5', 'mp-weixin', 'app', 'app-plus']) {
    it(`${platform}: preserves read/command encoding without changing browser credential policy`, async () => {
      vi.stubEnv('UNI_PLATFORM', platform)
      vi.stubEnv('VITE_XLINK_MOCK', 'false')
      vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
      vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
      const request = capture()
      const options = { apiBaseUrl: 'https://synthetic.invalid/wm', getSessionRef: () => sessionRef, request }
      await createUniApiReadTransport(options).execute({ method: 'GET', path: 'code/query', query: { page: '1' } })
      await createUniApiReadTransport(options).execute({ method: 'POST', path: 'code/query', body: { name: 'a & b' } })
      await createUniApiCommandTransport(options).execute({ method: 'POST', path: 'basic/order/upsert', body: { _id: 'synthetic-order' } })
      const requests = request.mock.calls.map(([value]) => value)
      expect(requests).toHaveLength(3)
      for (const item of requests) {
        if (platform === 'h5') expect(item.header).not.toHaveProperty('Cookie')
        else expect(item.header).toHaveProperty('Cookie', `JSESSIONID=${sessionRef}`)
        // Omit only a forbidden header. Do not widen cross-origin credentials,
        // set a cookie manually, or move the session into URL/body.
        expect(item).not.toHaveProperty('withCredentials')
        expect(item.url).not.toContain(sessionRef)
        expect(String(item.data)).not.toContain(sessionRef)
      }
      expect(requests[0]?.header).not.toHaveProperty('Content-Type')
      expect(requests[1]).toMatchObject({ data: 'name=a%20%26%20b', header: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      expect(requests[2]).toMatchObject({ data: '_id=synthetic-order', header: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    })
  }

  it('keeps JSON command encoding on H5 and the special-write fence closed', async () => {
    vi.stubEnv('UNI_PLATFORM', 'h5')
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    vi.stubEnv('VITE_XLINK_ENABLE_R1_SPECIAL_WRITES', 'false')
    const request = capture()
    const transport = createUniApiCommandTransport({ apiBaseUrl: 'https://synthetic.invalid/wm', getSessionRef: () => sessionRef, request })
    const input = { method: 'POST' as const, path: 'workflowNode/updateExts/synthetic-node', r1Special: true as const, jsonBody: { formList: [{ _id: 'synthetic-form', state: 1 }] } }
    await expect(transport.execute(input)).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
    vi.stubEnv('VITE_XLINK_ENABLE_R1_SPECIAL_WRITES', 'true')
    await transport.execute(input)
    expect(request.mock.calls[0]?.[0]).toMatchObject({ data: JSON.stringify(input.jsonBody), header: { 'Content-Type': 'application/json' } })
    expect(request.mock.calls[0]?.[0].header).not.toHaveProperty('Cookie')
  })

  for (const platform of ['h5', 'mp-weixin']) {
    it(`${platform}: uses Uni's platform define without a Vite UNI_PLATFORM exposure`, () => {
      // The pinned Uni compiler defines process.env.UNI_PLATFORM; real H5
      // does not put UNI_PLATFORM in import.meta.env. vi.stubEnv alone masks
      // that difference, so exercise the actual helper under those inputs.
      const source = fs.readFileSync('src/adapters/common/uni-api-session-header.ts', 'utf8')
        .replaceAll('process.env.UNI_PLATFORM', JSON.stringify(platform))
        .replaceAll('import.meta.env', '({})')
      const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText
      const module = { exports: {} as { uniApiSessionHeader: (session: typeof sessionRef) => Record<string, string> } }
      new Function('module', 'exports', js)(module, module.exports)
      expect(module.exports.uniApiSessionHeader(sessionRef)).toEqual(platform === 'h5'
        ? {} : { Cookie: `JSESSIONID=${sessionRef}` })
    })
  }

  it('still requires an authenticated session for H5 reads and commands', async () => {
    vi.stubEnv('UNI_PLATFORM', 'h5')
    const request = capture()
    const options = { apiBaseUrl: 'https://synthetic.invalid/wm', getSessionRef: () => null, request }
    await expect(createUniApiReadTransport(options).execute({ method: 'GET', path: 'code/query' })).rejects.toMatchObject({ category: 'session_invalid' })
    await expect(createUniApiCommandTransport(options).execute({ method: 'POST', path: 'basic/order/upsert' })).rejects.toMatchObject({ category: 'session_invalid' })
    expect(request).not.toHaveBeenCalled()
  })
})
