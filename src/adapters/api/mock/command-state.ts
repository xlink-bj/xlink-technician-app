/**
 * EQ05: explicit instance boundary for mutable synthetic command fixtures.
 * Baselines are NEVER modified: each fresh/reset instance deep-clones the
 * list, every detail response, and starts with an empty FormData repository.
 *
 * The app router owns one instance for historical compatibility; tests and
 * future scenario harnesses can construct independent instances.
 */
import { mockSanodeListResponse, mockWorkOrderDetailResponses } from './fixtures'

export interface MockCommandState {
  listResponse: unknown
  detailResponses: Map<string, unknown>
  formData: Map<string, unknown>
}

export interface MockCommandSeeds {
  readonly listResponse: unknown
  readonly detailResponses: Readonly<Record<string, unknown>>
}

const defaultSeeds: MockCommandSeeds = {
  listResponse: mockSanodeListResponse,
  detailResponses: mockWorkOrderDetailResponses,
}

function cloneWire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createIsolatedMockCommandStateStore(
  seeds: MockCommandSeeds = defaultSeeds,
) {
  // Snapshot caller-provided seeds at construction: later external mutation
  // of the seed record must not leak into independent fixtures.
  const baseline = {
    listResponse: cloneWire(seeds.listResponse),
    detailResponses: Object.fromEntries(
      Object.entries(seeds.detailResponses).map(([id, raw]) => [id, cloneWire(raw)]),
    ),
  }
  let state: MockCommandState | null = null

  function current(): MockCommandState {
    if (!state) {
      state = {
        listResponse: cloneWire(baseline.listResponse),
        detailResponses: new Map(
          Object.entries(baseline.detailResponses).map(([id, raw]) => [id, cloneWire(raw)]),
        ),
        formData: new Map(),
      }
    }
    return state
  }

  function reset(): void {
    state = null
  }

  return { current, reset }
}

const appMockCommandState = createIsolatedMockCommandStateStore()
export function mockCommandState(): MockCommandState {
  return appMockCommandState.current()
}
export function resetMockCommandState(): void {
  appMockCommandState.reset()
}
