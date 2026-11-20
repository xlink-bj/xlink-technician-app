import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDevMockUxSessionPort } from '@adapters/auth/dev-mock-ux-session'

const fixture = 'mock-work-order-002'
const acceptance = { kind: 'acceptance', recordId: 'mock-g06-acceptance-04009' } as const

function launch(search = '') {
  vi.stubGlobal('window', { location: { search } })
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_PLATFORM', 'mp-weixin')
  vi.stubEnv('VITE_XLINK_API_BASE_URL', 'https://example.invalid')
  vi.stubEnv('VITE_XLINK_AUTH_API_BASE_URL', '')
  vi.stubEnv('VITE_XLINK_AUTH_TENANT', 'synthetic-qa-tenant')
  vi.stubEnv('VITE_XLINK_AUTH_METHOD', 'phone')
  vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'false')
  vi.stubEnv('VITE_XLINK_G06_G07_ARCHIVES', 'true')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  launch()
})

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('G06/G07 DEV fixture read authority', () => {
  it('keeps both work-order fixture families closed outside the explicit H5 Mock profile', async () => {
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    const technician = createDevMockUxSessionPort().getCurrentSession()
    const archive = await import('@app/dev-service-result-archives')
    const material = await import('@app/dev-material-fulfillment-read')
    const workflow = await import('@app/dev-material-fulfillment-workflow')
    expect(archive.readServiceArchiveMock(fixture, technician, null, false)).toEqual([])
    expect(material.isMaterialFulfillmentMockAvailable(fixture, technician)).toBe(false)
    await expect(material.materialFulfillmentMock.read(fixture, 'initial')).rejects.toThrow('scope denied')
    expect(workflow.isDevMaterialWorkflowActor(technician)).toBe(false)
  })

  it('binds the exact order, archive kind, saved record and current synthetic role', async () => {
    const reader = await import('@app/dev-service-result-archives')
    const technician = createDevMockUxSessionPort().getCurrentSession()
    const { readServiceArchiveMock: read } = reader
    expect(read(fixture, technician, null, false).map(card => card.record?.id)).toEqual([
      acceptance.recordId, 'mock-g07-warranty-04009',
    ])
    expect(read(fixture, technician, acceptance, false)[0]).toMatchObject({ kind: 'acceptance', state: 'present', record: { id: acceptance.recordId } })
    expect(read(fixture, technician, { ...acceptance, kind: 'warranty' }, false)[0]).toMatchObject({ kind: 'warranty', state: 'denied' })
    expect(read('other-work-order', technician, acceptance, true)).toEqual([])
    expect(read(fixture, { ...technician!, roleVersion: 'stale' }, acceptance, true)).toEqual([])
    expect(read(fixture, null, acceptance, true)).toEqual([])

    launch('?archiveRole=observer')
    const observer = reader.serviceArchiveMockObserver()!
    expect(observer.user.id).toBe(technician!.user.id)
    expect(observer.currentRole?.id).not.toBe(technician!.currentRole?.id)
    expect(read(fixture, observer, null, false).map(card => [card.state, card.record])).toEqual([
      ['denied', undefined], ['denied', undefined],
    ])
    expect(read(fixture, observer, acceptance, true)[0]).toMatchObject({ state: 'denied' })
    const hash = `#${reader.serviceArchiveMockRoute(fixture, acceptance.kind, acceptance.recordId)}`
    expect(reader.serviceArchiveMockRequestForHash(hash, fixture)).toEqual(acceptance)
    expect(reader.serviceArchiveMockRequestForHash(`${hash}&id=other-work-order`, fixture)).toBeNull()
    expect(reader.serviceArchiveMockRequestForHash(hash, 'other-work-order')).toBeNull()
  })

  it('reads an explicit empty separately from a first transient failure, with retry bound to the original record', async () => {
    const { readServiceArchiveMock: read } = await import('@app/dev-service-result-archives')
    const technician = createDevMockUxSessionPort().getCurrentSession()
    launch('?archiveScenario=empty')
    expect(read(fixture, technician, acceptance, false)[0]).toMatchObject({ state: 'empty', text: '暂无正式验收结果' })
    launch('?archiveScenario=transient')
    expect(read(fixture, technician, acceptance, false)[0]).toMatchObject({ state: 'failed', text: '正式验收结果读取失败' })
    expect(read(fixture, technician, acceptance, true)[0]).toMatchObject({ state: 'present', record: { id: acceptance.recordId } })
    expect(read(fixture, technician, { ...acceptance, recordId: 'other-record' }, true)[0]).toMatchObject({ state: 'denied' })
  })

  it.each([
    ['DEV', false],
    ['VITE_XLINK_ENVIRONMENT', 'prod'],
    ['VITE_XLINK_ENVIRONMENT', 'staging'],
    ['VITE_XLINK_API_BASE_URL', 'https://xlink.fsgo365.cn'],
    ['VITE_XLINK_API_BASE_URL', 'https://non-isolated.example.invalid'],
    ['VITE_XLINK_AUTH_API_BASE_URL', 'https://xlink.fsgo365.cn'],
    ['VITE_XLINK_ENABLE_REAL_WRITES', 'true'],
    ['VITE_XLINK_G06_G07_ARCHIVES', 'false'],
    ['VITE_XLINK_H5_MOCK_E2E', 'false'],
    ['VITE_XLINK_MOCK', 'false'],
  ] as const)('fails closed with incompatible %s=%s', async (key, value) => {
    vi.stubEnv(key, value)
    launch('?archiveRole=observer')
    const reader = await import('@app/dev-service-result-archives')
    expect(reader.serviceArchiveMockObserver()).toBeUndefined()
    expect(reader.serviceArchiveMockRequest({ read: reader.serviceArchiveMockView, archive: 'acceptance', record: acceptance.recordId })).toBeNull()
    expect(reader.readServiceArchiveMock(fixture, createDevMockUxSessionPort().getCurrentSession(), acceptance, true)).toEqual([])
  })
})
