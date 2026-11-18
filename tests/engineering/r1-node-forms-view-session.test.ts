import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { openR1NodeFormsViewSession } from '@features/work-orders/r1-node-forms-view-session'
import { appointmentFixture } from '../support/normal-appointment-experience-fixture'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

beforeEach(installLocalFixtureBrowser)
afterEach(() => vi.unstubAllGlobals())

it('hands off the shared reader, including across Vue proxies, and revokes only the owner on release', async () => {
  const fixture = appointmentFixture()
  const first = openR1NodeFormsViewSession(fixture.reader)
  const original = (await first.load('s', 'n'))!
  const identity = first.retainReadIdentity(original)!
  expect(fixture.reader.isCurrent(original)).toBe(true)
  expect(fixture.provider().forSnapshot(original)?.canEdit?.('a')).toBe(true)

  const next = openR1NodeFormsViewSession(reactive(fixture.reader))
  expect(first.isCurrent(original)).toBe(false)
  expect(fixture.reader.isCurrent(original)).toBe(false)
  expect(identity.isSameActor()).toBe(false)

  const current = (await next.load('s', 'n'))!
  const readCount = fixture.transport.execute.mock.calls.length
  first.clear()
  first.release()
  expect(await first.load('s', 'n')).toBeNull()
  expect(fixture.transport.execute).toHaveBeenCalledTimes(readCount)
  expect(first.currentFormOriginal(current, 'a')).toBeNull()
  expect(first.retainReadIdentity(current)).toBeNull()
  expect(next.isCurrent(current)).toBe(true)

  next.release()
  expect(fixture.reader.isCurrent(current)).toBe(false)
  expect(await next.load('s', 'n')).toBeNull()
})

it.each(['response', 'rejection'])('discards a late %s and preserves the new owner', async outcome => {
  const fixture = appointmentFixture()
  await fixture.load()
  const first = openR1NodeFormsViewSession(fixture.reader)
  const execute = fixture.transport.execute.getMockImplementation()!
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  fixture.transport.execute.mockImplementationOnce(async request => {
    const response = await execute(request)
    await pending
    if (outcome === 'rejection') throw new Error('late synthetic transport failure')
    return response
  })

  const oldRead = first.load('s', 'n')
  const next = openR1NodeFormsViewSession(fixture.reader)
  try {
    const current = (await next.load('s', 'n'))!
    release()
    expect(await oldRead).toBeNull()
    expect(next.isCurrent(current)).toBe(true)
    expect(next.isCurrent({ ...current })).toBe(false)
  } finally {
    release()
    first.release()
    next.release()
  }
})

it('keeps read errors visible to the current view and defers actor revocation to the reader', async () => {
  const fixture = appointmentFixture()
  const session = openR1NodeFormsViewSession(fixture.reader)
  fixture.transport.execute.mockRejectedValueOnce(new Error('synthetic read failure'))
  await expect(session.load('s', 'n')).rejects.toThrow('synthetic read failure')

  const original = (await session.load('s', 'n'))!
  const identity = session.retainReadIdentity(original)!
  expect(identity.isSameActor()).toBe(true)
  fixture.changeSession()
  expect(session.isCurrent(original)).toBe(false)
  expect(session.currentFormOriginal(original, 'a')).toBeNull()
  expect(identity.isSameActor()).toBe(false)

  const fresh = (await session.load('s', 'n'))!
  expect(session.isCurrent(fresh)).toBe(true)
  session.clear()
  expect(fixture.reader.isCurrent(fresh)).toBe(false)
  expect(await session.load('s', 'n')).not.toBeNull()
  session.release()
})
