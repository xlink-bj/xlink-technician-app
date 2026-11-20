import { actionDraftStorageKey, type ActionDraftIdentity, type ActionDraftRepository } from '@runtimes/action'

export type LocalRead<T> =
  | { state: 'ready'; record: T | null }
  | { state: 'failed' }
  | { state: 'blocked' }

export type LocalWrite<T> =
  | { state: 'saved'; record: T }
  | { state: 'conflict'; record: T }
  | { state: 'failed' | 'unknown' | 'blocked' }

export function createPipeLocalRecord<T extends Readonly<Record<string, unknown>>>(input: {
  repository: ActionDraftRepository
  identity: ActionDraftIdentity
  stillCurrent: () => boolean
  parse: (value: unknown) => T | null
  withLock: <R>(key: string, work: () => Promise<R>) => Promise<R | null>
}) {
  let saving = false

  async function read(): Promise<LocalRead<T>> {
    if (!input.stillCurrent()) return { state: 'blocked' }
    const result = await input.repository.read<{ pipeWork: unknown }>(input.identity)
    if (!input.stillCurrent()) return { state: 'blocked' }
    if (result.state !== 'succeeded') return { state: 'failed' }
    if (!result.data) return { state: 'ready', record: null }
    const parsed = input.parse(result.data.values.pipeWork)
    return parsed && result.data.status === 'unfinished'
      ? { state: 'ready', record: parsed }
      : { state: 'failed' }
  }

  async function writeExclusive(record: T, expected: T | null): Promise<LocalWrite<T>> {
    const before = await read()
    if (before.state !== 'ready') return before
    if (JSON.stringify(before.record) !== JSON.stringify(expected)) {
      return before.record ? { state: 'conflict', record: before.record } : { state: 'failed' }
    }

    // A failed callback can arrive after a local write has been applied.
    const written = await input.repository.write({
      version: 1,
      identity: input.identity,
      values: { pipeWork: record },
      updatedAt: new Date().toISOString(),
      status: 'unfinished',
    }, {
      stillCurrent: input.stillCurrent,
      ...(expected === null ? { onlyIfAbsent: true } : {}),
    })
    if (!input.stillCurrent()) return { state: 'blocked' }
    if (written.state !== 'succeeded') return { state: 'unknown' }
    const after = await read()
    if (after.state === 'blocked') return after
    if (after.state !== 'ready' || JSON.stringify(after.record) !== JSON.stringify(record)) {
      return { state: 'unknown' }
    }
    return { state: 'saved', record }
  }

  async function write(record: T, expected: T | null): Promise<LocalWrite<T>> {
    if (saving || !input.stillCurrent() || !input.parse(record)) return { state: 'blocked' }
    saving = true
    try {
      return await input.withLock(actionDraftStorageKey(input.identity), () => writeExclusive(record, expected))
        ?? { state: 'failed' }
    } finally {
      saving = false
    }
  }
  return { read, write }
}
