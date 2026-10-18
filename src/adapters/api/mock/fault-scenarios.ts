/**
 * EQ05B deterministic fault/latency policies for explicitly owned Mock reads.
 * Never changes Production or unrecognized paths. Faults do NOT delegate to
 * network or mutate shared command state; a test opts in per request.
 */
export type MockFaultKind = 'retryable' | 'terminal'

export interface MockReadFaultScenario {
  readonly fault?: MockFaultKind
  readonly latencyMs?: number
}

export function mockFaultWireResponse(kind: MockFaultKind): Readonly<{
  success: false
  code: 'RETRYABLE' | 'TERMINAL'
  message: string
}> {
  return Object.freeze({
    success: false,
    code: kind === 'retryable' ? 'RETRYABLE' : 'TERMINAL',
    message: 'synthetic ' + kind + ' read failure',
  })
}

export function validatedMockLatency(input: number | undefined, fallbackMs = 300): number {
  const value = input ?? fallbackMs
  // A typo must not cause an unbounded test hang or accidental rapid retry.
  if (!Number.isSafeInteger(value) || value < 0 || value > 5000) {
    throw new RangeError('Synthetic Mock latency must be an integer between 0 and 5000 ms')
  }
  return value
}
