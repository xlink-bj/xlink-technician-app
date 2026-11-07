import { vi } from 'vitest'
export function installLocalFixtureBrowser() {
  const data = new Map<string, string>(), legacy = new Map<string, string>(), held = new Set<string>()
  const storage = (map: Map<string, string>) => ({ getItem: vi.fn((key: string) => map.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { map.set(key, value) }) })
  const local = storage(data), session = storage(legacy)
  const request = vi.fn(async (name: string, options: unknown, callback: (lock: unknown) => Promise<unknown>) => {
    if (held.has(name)) return callback(null)
    held.add(name)
    try { return await callback({ name }) } finally { held.delete(name) }
  })
  vi.stubGlobal('localStorage', local)
  vi.stubGlobal('sessionStorage', session)
  vi.stubGlobal('navigator', { locks: { request } })
  return { data, legacy, local, session, request }
}
