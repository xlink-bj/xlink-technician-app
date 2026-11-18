import { shallowRef, toRaw } from 'vue'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from './r1-node-forms-read'

const readerOwners = new WeakMap<R1NodeFormsReader, ReturnType<typeof shallowRef<object | null>>>()

/** Only one view owns a shared reader at a time. The reader still issues the
 * exact snapshots and proofs consumed by the action and draft providers. */
export function openR1NodeFormsViewSession(source: R1NodeFormsReader) {
  const reader = toRaw(source)
  const owner = readerOwners.get(reader) ?? shallowRef<object | null>(null)
  readerOwners.set(reader, owner)

  const previous = owner.value
  const session = {}
  owner.value = session
  if (previous) reader.clear()

  const ownsReader = () => owner.value === session
  const isCurrent = (snapshot: R1NodeFormsSnapshot) => ownsReader() && reader.isCurrent(snapshot)

  return {
    enabled: () => reader.enabled(),
    isCurrent,
    currentFormOriginal: (snapshot: R1NodeFormsSnapshot, recordId: string) =>
      isCurrent(snapshot) ? reader.currentFormOriginal?.(snapshot, recordId) ?? null : null,
    retainReadIdentity: (snapshot: R1NodeFormsSnapshot) =>
      isCurrent(snapshot) ? reader.retainReadIdentity?.(snapshot) ?? null : null,
    async load(workOrderId: string, runtimeNodeId: string): Promise<R1NodeFormsSnapshot | null> {
      if (!ownsReader()) return null
      try {
        const snapshot = await reader.load(workOrderId, runtimeNodeId)
        return ownsReader() ? snapshot : null
      } catch (error) {
        if (!ownsReader()) return null
        throw error
      }
    },
    clear() {
      if (ownsReader()) reader.clear()
    },
    release() {
      if (!ownsReader()) return
      reader.clear()
      owner.value = null
    },
  }
}
