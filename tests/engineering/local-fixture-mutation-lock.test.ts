import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalFixtureMutationLock as gate } from '@app/local-fixture-mutation-lock'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'
let browser: ReturnType<typeof installLocalFixtureBrowser>
beforeEach(() => { browser = installLocalFixtureBrowser() })
afterEach(() => vi.unstubAllGlobals())
const save = (g: ReturnType<typeof gate>) => g.run(async mark => { mark('uncertain'); mark('ready') })
describe('local fixture origin-shared durable mutation gate', () => {
  it('persists uncertainty before dispatch and survives controller and module recreation, loads and separate tabs', async () => {
    const g = gate('test'), command = vi.fn(() => { throw Error('lost ACK') })
    await expect(g.run(async mark => { mark('uncertain'); expect(browser.data.get('test')).toContain('uncertain'); command() })).rejects.toThrow()
    vi.resetModules()
    const fresh = (await import('@app/local-fixture-mutation-lock')).createLocalFixtureMutationLock('test')
    browser.legacy.clear()
    await fresh.load(async () => [])
    await expect(save(fresh)).rejects.toThrow(); expect(fresh.locked).toBe(true); expect(command).toHaveBeenCalledTimes(1)
  })
  it('does not queue concurrent callbacks, retains versions and rejects stale sequential replays', async () => {
    const a = gate('test'), b = gate('test')
    let release!: () => void
    const pending = a.run(async mark => { mark('uncertain'); await new Promise<void>(r => { release = r }); mark('ready') })
    await expect(save(b)).rejects.toThrow(); release(); await pending
    await expect(save(b)).rejects.toThrow(); expect(browser.data.get('test')).toContain('ready')
    await b.load(async () => []); await save(b)
    expect(JSON.parse(browser.data.get('test')!).revision).toBe(2)
    expect(browser.request.mock.calls[0]![1]).toEqual({ mode: 'exclusive', ifAvailable: true })
  })
  it('does not bind a new version to stale records returned during another mutation', async () => {
    const a = gate('test'), b = gate('test')
    await b.load(async () => { await save(a); return ['stale'] })
    await expect(save(b)).rejects.toThrow()
  })
  it('invalidates the same controller when its pending load spans its own save', async () => {
    const a = gate('test')
    await a.load(async () => { await save(a); return ['stale'] })
    await expect(save(a)).rejects.toThrow()
    await a.load(async () => []); await save(a)
  })
  it('rejects exhausted revision before any write or dispatch', async () => {
    const receipt = JSON.stringify({ version: 1, revision: Number.MAX_SAFE_INTEGER, status: 'ready' })
    browser.data.set('test', receipt)
    const command = vi.fn()
    await expect(gate('test').run(async mark => { mark('uncertain'); command() })).rejects.toThrow()
    expect(browser.local.setItem).not.toHaveBeenCalled()
    expect(command).not.toHaveBeenCalled()
    expect(browser.data.get('test')).toBe(receipt)
  })
  it('completion survives recreation and never unlocks on load', async () => {
    await gate('test').run(async mark => { mark('uncertain'); mark('completed') })
    const next = gate('test'); await next.load(async () => [])
    await expect(save(next)).rejects.toThrow(); expect(next.locked).toBe(true)
  })
  it.each([
    ['ready', 'throw'], ['ready', 'drop'], ['completed', 'throw'], ['completed', 'drop'],
  ] as const)('retains uncertain across instances when terminal %s write fails by %s', async (terminal, fault) => {
    const current = gate('test'), command = vi.fn()
    await expect(current.run(async mark => {
      mark('uncertain'); command()
      browser.local.setItem.mockImplementationOnce(() => { if (fault === 'throw') throw Error('quota') })
      mark(terminal)
    })).rejects.toThrow()
    expect(JSON.parse(browser.data.get('test')!).status).toBe('uncertain')
    const fresh = gate('test')
    for (const g of [current, fresh]) {
      await g.load(async () => [])
      expect(g.locked).toBe(true)
      await expect(g.run(async mark => { mark('uncertain'); command() })).rejects.toThrow()
    }
    expect(command).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['ready', true], ['ready', false], ['completed', true], ['completed', false],
  ] as const)('keeps current instance closed on %s verification read failure, persisted=%s', async (terminal, persisted) => {
    const current = gate('test'), command = vi.fn()
    await expect(current.run(async mark => {
      mark('uncertain'); command()
      browser.local.setItem.mockImplementationOnce((key, raw) => {
        if (persisted) browser.data.set(key, raw)
        browser.local.getItem.mockImplementationOnce(() => { throw Error('verification unavailable') })
      })
      mark(terminal)
    })).rejects.toThrow()
    // The caller cannot infer persistence from the thrown verification read.
    // This controlled storage fixture distinguishes both possible outcomes.
    expect(JSON.parse(browser.data.get('test')!).status).toBe(persisted ? terminal : 'uncertain')
    await current.load(async () => [])
    expect(current.locked).toBe(true)
    await expect(current.run(async mark => { mark('uncertain'); command() })).rejects.toThrow()
    expect(command).toHaveBeenCalledTimes(1)
    const fresh = gate('test')
    await fresh.load(async () => [])
    if (persisted && terminal === 'ready') {
      // The business result was already verified before ready was written.
      // A new instance can read that confirmed receipt, unlike the failed instance.
      expect(fresh.locked).toBe(false)
      await fresh.run(async mark => { mark('uncertain'); command(); mark('ready') })
      expect(command).toHaveBeenCalledTimes(2)
    } else {
      expect(fresh.locked).toBe(true)
      await expect(fresh.run(async mark => { mark('uncertain'); command() })).rejects.toThrow()
      expect(command).toHaveBeenCalledTimes(1)
    }
  })
  it.each(['uncertain', 'completed', 'broken'])('blocks legacy v3 %s without deleting it', async value => {
    browser.legacy.set('old', value); const g = gate('test', 'old')
    await expect(save(g)).rejects.toThrow(); expect(g.locked).toBe(true); expect(browser.legacy.get('old')).toBe(value)
  })
  it.each(['bad-json', '{}', '{"version":1,"revision":1,"status":"other"}'])('fails closed on malformed receipt %s', async value => {
    browser.data.set('test', value); await expect(save(gate('test'))).rejects.toThrow()
  })
  it.each(['absent', 'read-throw', 'write-throw', 'write-dropped', 'verify-throw'])('never dispatches with unsafe storage: %s', async fault => {
    const g = gate('test'), command = vi.fn()
    if(fault==='absent') vi.stubGlobal('localStorage', undefined)
    if(fault==='read-throw') browser.local.getItem.mockImplementation(() => { throw Error('denied') })
    if(fault==='write-throw') browser.local.setItem.mockImplementation(() => { throw Error('quota') })
    if(fault==='write-dropped') browser.local.setItem.mockImplementation(() => {})
    if(fault==='verify-throw') browser.local.setItem.mockImplementation(() => { browser.local.getItem.mockImplementation(() => { throw Error('verify') }) })
    await expect(g.run(async mark => { mark('uncertain'); command() })).rejects.toThrow()
    expect(command).not.toHaveBeenCalled(); expect(g.locked).toBe(true)
  })
  it.each(['absent', 'rejected'])('never dispatches without Web Locks: %s', async fault => {
    const command = vi.fn()
    if(fault==='absent') vi.stubGlobal('navigator', {})
    else browser.request.mockRejectedValue(Error('denied'))
    await expect(gate('test').run(async mark => { mark('uncertain'); command() })).rejects.toThrow()
    expect(command).not.toHaveBeenCalled()
  })
})
