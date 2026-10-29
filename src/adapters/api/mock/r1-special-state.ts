import { mockCommandState, type MockCommandState } from './command-state'
import { isDevMockJourneyEnabled } from './journey'
import {
  mockR1FormData, mockR1FormsWorkOrderId, mockR1RepeatWorkOrderId,
  mockSyntheticDynamicFormDefinitionId,
} from './fixtures'

/** DEV-only synthetic server snapshot. No Production/Beta transport consumes it. */
const storageKey = 'xlink.dev.mock.r1-special.020-021.v1'
const prefix = 'mock-special-form-data-'
const nodes = {
  forms: 'mock-workflow-node-020-forms',
  repeat: 'mock-workflow-node-021-repeat',
} as const
const runs = { forms: 'mock-workflow-run-020', repeat: 'mock-workflow-run-021' } as const
const orders = { forms: mockR1FormsWorkOrderId, repeat: mockR1RepeatWorkOrderId } as const
type Kind = keyof typeof nodes

export interface R1SpecialSnapshot {
  version: 1
  forms: { state: 0 | 10; exts: Record<string, unknown> }
  repeat: { state: 0 | 10 }
  rows: Record<string, Record<string, unknown>>
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function node(state: MockCommandState, kind: Kind): Record<string, unknown> | null {
  const detail = record(record(state.detailResponses.get(orders[kind]))?.data)
  if (!detail || !Array.isArray(detail.workflowNode)) return null
  return detail.workflowNode.map(record).find((item) => item?._id === nodes[kind]) ?? null
}

function snapshot(state: MockCommandState): R1SpecialSnapshot | null {
  const forms = node(state, 'forms')
  const repeat = node(state, 'repeat')
  if (!forms || !repeat || !record(forms.exts)) return null
  return clone({ version: 1,
    forms: { state: forms.state, exts: forms.exts }, repeat: { state: repeat.state },
    rows: Object.fromEntries([...state.formData.entries()].filter(([id]) => id.startsWith(prefix))),
  }) as R1SpecialSnapshot
}

function validSnapshot(raw: unknown): raw is R1SpecialSnapshot {
  const value = record(raw)
  const forms = record(value?.forms)
  const repeat = record(value?.repeat)
  const exts = record(forms?.exts)
  const rows = record(value?.rows)
  const list = exts?.formList
  if (value?.version !== 1 || ![0, 10].includes(forms?.state as number)
    || ![0, 10].includes(repeat?.state as number) || !rows
    || !Array.isArray(list) || list.length < 2 || list.length > 100
    || record(list[0])?._id !== mockR1FormData.formsFirst
    || record(list[1])?._id !== mockR1FormData.formsSecond
    || Object.keys(rows).length > 100) return false
  const ids = list.map((value) => record(value)?._id)
  if (ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) return false
  for (const [id, rawRow] of Object.entries(rows)) {
    const row = record(rawRow)
    const kind: Kind | null = id.startsWith(`${prefix}forms-`) ? 'forms'
      : id.startsWith(`${prefix}repeat-`) ? 'repeat' : null
    if (!kind || !/^mock-special-form-data-(forms|repeat)-[1-9][0-9]*$/.test(id)
      || !row || row._id !== id || row.sid !== orders[kind]
      || row.nodeId !== nodes[kind] || row.workflowId !== runs[kind]
      || row.extId !== mockSyntheticDynamicFormDefinitionId
      || row.formDefId !== mockSyntheticDynamicFormDefinitionId
      || ![1, -1].includes(row.state as number) || !record(row.exts)) return false
  }
  return ids.slice(2).every((id) => {
    const row = record(list.find((item) => record(item)?._id === id))
    return typeof id === 'string' && id.startsWith(`${prefix}forms-`)
      && record(rows[id])?.sid === orders.forms && [1, -1].includes(row?.state as number)
  })
}

function apply(state: MockCommandState, value: R1SpecialSnapshot): void {
  const forms = node(state, 'forms')!
  const repeat = node(state, 'repeat')!
  forms.state = value.forms.state
  forms.exts = clone(value.forms.exts)
  repeat.state = value.repeat.state
  for (const id of state.formData.keys()) if (id.startsWith(prefix)) state.formData.delete(id)
  for (const [id, row] of Object.entries(value.rows)) state.formData.set(id, clone(row))
}

let restored = new WeakMap<MockCommandState, boolean>()

/** Called by BOTH read and command routers, including after H5 process reload. */
export function restoreMockR1SpecialState(): boolean {
  if (!isDevMockJourneyEnabled()) return false
  const state = mockCommandState()
  const known = restored.get(state)
  if (known !== undefined) return known
  let ok = false
  try {
    const stored: unknown = uni.getStorageSync(storageKey)
    if (stored === undefined || stored === null || stored === '') ok = true
    else if (typeof stored === 'string' && stored.length <= 200000) {
      const candidate: unknown = JSON.parse(stored)
      if (validSnapshot(candidate)) { apply(state, candidate); ok = true }
    }
  } catch { /* Corrupt or inaccessible storage must not permit a new write. */ }
  restored.set(state, ok)
  return ok
}

/** Copy-on-write: an unacknowledged or failed storage commit never changes
 * the in-memory response. Subsequent reads observe the committed snapshot. */
export function updateMockR1SpecialState(
  change: (draft: R1SpecialSnapshot) => boolean,
): boolean {
  if (!restoreMockR1SpecialState()) return false
  const state = mockCommandState()
  const draft = snapshot(state)
  if (!draft || !change(draft) || !validSnapshot(draft)) return false
  const serialized = JSON.stringify(draft)
  if (serialized.length > 200000) return false
  try {
    uni.setStorageSync(storageKey, serialized)
    if (uni.getStorageSync(storageKey) !== serialized) {
      restored.set(state, false)
      return false
    }
  } catch {
    // The storage write may have succeeded and only its ACK/readback failed.
    // Poison this runtime until a new instance reloads authoritative state;
    // never retry an ambiguous non-idempotent FormData/EXTS/Process command.
    restored.set(state, false)
    return false
  }
  apply(state, draft)
  return true
}

/** Tests can reset the complete synthetic server without affecting R1 state. */
export function resetMockR1SpecialState(): void {
  try { uni.removeStorageSync(storageKey) } catch { /* No storage in test-only imports. */ }
  restored = new WeakMap()
}
