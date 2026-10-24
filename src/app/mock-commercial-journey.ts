import { isDevMockJourneyEnabled, mockJourneyStage, mockJourneyWorkOrderId } from '@adapters/api/mock/journey'
import {
  clearCommercialReviewStorage, readCommercialReviewStorage, writeCommercialReviewStorage,
} from '@adapters/api/mock/commercial-review-storage'

/**
 * DEV Mock review ledger, deliberately independent of R1 Workflow/Order/Contract.
 * The sample quotation and the independent official Order/Contract fixtures
 * NEVER become a real commercial transaction by recording these checkpoints.
 */
export type MockCommercialCheckpoint = 'quotation_preview' | 'sku_review' | 'order_contract_review'
export const mockCommercialCheckpoints: readonly MockCommercialCheckpoint[] = [
  'quotation_preview', 'sku_review', 'order_contract_review',
]
export interface MockCommercialScope {
  readonly workOrderId: string
  readonly userId?: string
  readonly roleId?: string
}
export interface MockCommercialProgress {
  readonly confirmed: readonly MockCommercialCheckpoint[]
  readonly paused: boolean
  readonly complete: boolean
}
interface PersistedProgress {
  readonly version: 1
  readonly workOrderId: string
  readonly userId: string
  readonly roleId: string
  readonly confirmed: readonly MockCommercialCheckpoint[]
  readonly paused: boolean
}
const empty: MockCommercialProgress = { confirmed: [], paused: false, complete: false }

export function canReviewMockCommercial(scope: MockCommercialScope): boolean {
  return isDevMockJourneyEnabled()
    && mockJourneyStage() === 'quotation'
    && scope.workOrderId === mockJourneyWorkOrderId
    && scope.userId === 'synthetic-user'
    && scope.roleId === 'synthetic-role'
}

function validStored(raw: unknown, scope: MockCommercialScope): raw is PersistedProgress {
  if (!raw || typeof raw !== 'object') return false
  const value = raw as Partial<PersistedProgress>
  return value.version === 1 && value.workOrderId === scope.workOrderId
    && value.userId === scope.userId && value.roleId === scope.roleId
    && typeof value.paused === 'boolean' && Array.isArray(value.confirmed)
    && value.confirmed.length <= mockCommercialCheckpoints.length
    && value.confirmed.every((step, index) => step === mockCommercialCheckpoints[index])
}

function stored(scope: MockCommercialScope): PersistedProgress | null {
  if (!canReviewMockCommercial(scope)) return null
  const raw = readCommercialReviewStorage()
  return validStored(raw, scope) ? raw : null
}

export function readMockCommercialProgress(scope: MockCommercialScope): MockCommercialProgress {
  const current = stored(scope)
  if (!current) return empty
  return {
    confirmed: current.confirmed,
    paused: current.paused,
    complete: current.confirmed.length === mockCommercialCheckpoints.length,
  }
}

function persist(scope: MockCommercialScope, state: Pick<PersistedProgress, 'confirmed' | 'paused'>): boolean {
  if (!canReviewMockCommercial(scope)) return false
  if (!writeCommercialReviewStorage({
    version: 1, workOrderId: scope.workOrderId, userId: scope.userId!, roleId: scope.roleId!,
    confirmed: [...state.confirmed], paused: state.paused,
  } satisfies PersistedProgress)) return false
  const saved = stored(scope)
  return saved !== null && saved.paused === state.paused
    && JSON.stringify(saved.confirmed) === JSON.stringify(state.confirmed)
}

/** Only the next checkpoint can advance; arbitrary or repeated writes fail closed. */
export function confirmMockCommercialCheckpoint(scope: MockCommercialScope, step: MockCommercialCheckpoint): boolean {
  if (!canReviewMockCommercial(scope)) return false
  const current = readMockCommercialProgress(scope)
  if (current.paused || mockCommercialCheckpoints[current.confirmed.length] !== step) return false
  return persist(scope, { confirmed: [...current.confirmed, step], paused: false })
}

/** Pause retains accepted local checkpoints. It is not an R1 cancellation command. */
export function pauseMockCommercialReview(scope: MockCommercialScope): boolean {
  if (!canReviewMockCommercial(scope)) return false
  const current = readMockCommercialProgress(scope)
  if (current.paused || current.complete) return false
  return persist(scope, { confirmed: current.confirmed, paused: true })
}

export function resumeMockCommercialReview(scope: MockCommercialScope): boolean {
  if (!canReviewMockCommercial(scope)) return false
  const current = readMockCommercialProgress(scope)
  if (!current.paused) return false
  return persist(scope, { confirmed: current.confirmed, paused: false })
}

/** Undo the last local review acknowledgement only; no Order or Workflow undo. */
export function revokeLastMockCommercialCheckpoint(scope: MockCommercialScope): boolean {
  if (!canReviewMockCommercial(scope)) return false
  const current = readMockCommercialProgress(scope)
  if (current.paused || !current.confirmed.length) return false
  return persist(scope, { confirmed: current.confirmed.slice(0, -1), paused: false })
}

/** Separate from the R1 WorkOrder and stage reset; never accesses backend. */
export function resetMockCommercialReview(): boolean {
  if (!isDevMockJourneyEnabled()) return false
  return clearCommercialReviewStorage()
}
