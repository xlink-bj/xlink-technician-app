/** Browser-only safety boundary for the explicitly allowlisted local fixtures. */
type Receipt = { version: 1; revision: number; status: 'ready' | 'uncertain' | 'completed' }
const blocked = () => Error('操作已锁定或安全存储不可用，禁止重复提交')
export function createLocalFixtureMutationLock(key: string, legacyKey?: string) {
  let observed: string | null | undefined
  let failed = false
  function read(): string | null {
    if (failed) throw blocked()
    try {
      // Legacy in-tab locks are never discarded, including unknown/corrupt values.
      if (legacyKey && sessionStorage.getItem(legacyKey) !== null) throw blocked()
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        const r = JSON.parse(raw) as Receipt
        if (!r || r.version !== 1 || !Number.isSafeInteger(r.revision) || r.revision < 1
          || !['ready', 'uncertain', 'completed'].includes(r.status)) throw blocked()
      }
      return raw
    } catch { failed = true; throw blocked() }
  }
  function status(raw: string | null) { return raw === null ? 'ready' : (JSON.parse(raw) as Receipt).status }
  try { observed = read() } catch { /* Remain fail-closed without blocking read-only rendering. */ }
  return {
    get locked() { try { return status(read()) !== 'ready' } catch { return true } },
    get completed() { try { return status(read()) === 'completed' } catch { return false } },
    async load<T>(action: () => Promise<T>): Promise<T> {
      let before: string | null | undefined
      try { before = read() } catch { /* Read-only access remains available. */ }
      const result = await action()
      try {
        observed = before !== undefined && read() === before ? before : undefined
      } catch { /* A read never clears an uncertain receipt. */ }
      return result
    },
    async run<T>(action: (mark: (status: 'uncertain' | 'ready' | 'completed') => void) => Promise<T>): Promise<T> {
      if (typeof navigator === 'undefined' || !navigator.locks?.request) throw blocked()
      // No queue: a competing click must not silently become a later second command.
      return navigator.locks.request(key, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) throw blocked()
        let current = read()
        if (observed === undefined || current !== observed || status(current) !== 'ready') throw blocked()
        let revision = current === null ? 0 : (JSON.parse(current) as Receipt).revision
        let dispatched = false
        return action(next => {
          try {
            if (read() !== current || (next === 'uncertain' ? dispatched : !dispatched)) throw blocked()
            if (next === 'uncertain') {
              if (revision >= Number.MAX_SAFE_INTEGER) throw blocked()
              revision++; dispatched = true
            }
            const raw = JSON.stringify({ version: 1, revision, status: next } satisfies Receipt)
            localStorage.setItem(key, raw)
            if (localStorage.getItem(key) !== raw) throw blocked()
            current = raw
            observed = raw
          } catch { failed = true; throw blocked() }
        })
      })
    },
  }
}
