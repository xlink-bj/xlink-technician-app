/** H5 coordinates tabs through Web Locks; native targets serialize in-process. */
const queues = new Map<string, Promise<unknown>>()
export async function withScopedDraftLock<T>(key: string, work: () => Promise<T>): Promise<T | null> {
  const previous = queues.get(key) ?? Promise.resolve()
  const task = previous.catch(() => undefined).then(async () => {
    const target = import.meta.env.UNI_PLATFORM
    const browser = target === 'h5' || (target !== 'mp-weixin' && target !== 'app' && target !== 'app-plus' && typeof window !== 'undefined')
    if (browser) {
      if (typeof navigator === 'undefined' || !navigator.locks) return null
      return navigator.locks.request(key, { mode: 'exclusive' }, work)
    }
    return work()
  })
  queues.set(key, task)
  try { return await task } catch { return null }
  finally { if (queues.get(key) === task) queues.delete(key) }
}
