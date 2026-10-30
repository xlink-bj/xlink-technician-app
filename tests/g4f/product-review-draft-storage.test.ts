import { describe, expect, it } from 'vitest'
import { createProductReviewDraftStorage, type BrowserReviewStorage } from '../../tools/review/quotation-demo/product-draft-storage'

function memoryBrowser() {
  const map = new Map<string, string>()
  const browser: BrowserReviewStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) },
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  }
  return { browser, map }
}

describe('G4-F commercial product preview draft isolation', () => {
  it('round-trips after new adapter construction and keeps a unique physical namespace', async () => {
    const { browser, map } = memoryBrowser()
    const record = { version: 1, schemaVersion: 3, quotationDraft: { groups: [] } }
    const first = createProductReviewDraftStorage(() => browser)
    expect((await first.write({ namespace: 'draft', key: 'quotation/synthetic-user/018' }, record)).state).toBe('succeeded')
    expect([...map.keys()]).toEqual(['g4f-product-review:v1:draft:quotation/synthetic-user/018'])
    const second = createProductReviewDraftStorage(() => browser)
    expect(await second.read({ namespace: 'draft', key: 'quotation/synthetic-user/018' }))
      .toMatchObject({ state: 'succeeded', data: record })
    expect(await second.read({ namespace: 'draft', key: 'quotation/other-user/018' }))
      .toMatchObject({ state: 'succeeded', data: null })
    expect(await second.listKeys({ namespace: 'draft', prefix: 'quotation/synthetic-user' }))
      .toMatchObject({ state: 'succeeded', data: ['quotation/synthetic-user/018'] })
  })
  it('preserves corrupted values and refuses any session/cache storage', async () => {
    const { browser, map } = memoryBrowser()
    map.set('g4f-product-review:v1:draft:broken', '{bad-json')
    const storage = createProductReviewDraftStorage(() => browser)
    expect(await storage.read({ namespace: 'draft', key: 'broken' }))
      .toMatchObject({ state: 'succeeded', data: '{bad-json' })
    expect((await storage.write({ namespace: 'session', key: 'secret' }, { secret: true })).state).toBe('failed_terminal')
    expect((await storage.listKeys({ namespace: 'cache' })).state).toBe('failed_terminal')
    expect(map.size).toBe(1)
  })
  it('fails closed when browser storage is unavailable', async () => {
    const storage = createProductReviewDraftStorage(() => null)
    expect((await storage.read({ namespace: 'draft', key: 'quotation' })).state).toBe('failed_terminal')
    expect((await storage.write({ namespace: 'draft', key: 'quotation' }, {})).state).toBe('failed_terminal')
  })
})
