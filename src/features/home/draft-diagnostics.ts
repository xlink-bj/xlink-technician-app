import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { actionWorkspaceRouteFor } from '@features/work-orders/action-workspace'
import {
  actionDraftIdentityFor,
  type ActionDraftRegistryEntry,
  type ActionDraftRepository,
} from '@runtimes/action'
import type { AppointmentFieldValue, SessionSnapshot } from '@shared/ports'
import { asOpaqueId, createOperationError, type OperationSnapshot, type WorkOrderId, type WorkflowNodeRuntimeId } from '@shared/types'

export interface LocalDraftSeed {
  readonly key: string
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly actionIntent: 'set_appointment'
  readonly contentKind: 'dynamic_form'
  readonly contentIdentity: string
  readonly values: Readonly<Record<string, AppointmentFieldValue>>
}

export interface LocalDraftDiagnosticEntry extends ActionDraftRegistryEntry {
  readonly openRoute?: string
}

export interface LocalDraftDiagnosticsDependencies {
  readonly repository: ActionDraftRepository
  readonly getSession: () => SessionSnapshot | null
  readonly isDeveloperModeAvailable: () => boolean
  readonly getMockMode: () => 'off' | 'data' | 'empty'
  readonly mockDraftSeeds: readonly LocalDraftSeed[]
  readonly now?: () => string
}

function failure<T>(message: string): OperationSnapshot<T> {
  return {
    state: 'failed_terminal',
    error: createOperationError('unsupported_capability', message),
  }
}

function openRouteFor(entry: ActionDraftRegistryEntry): string | undefined {
  if (entry.identity.actionIntent !== 'set_appointment' || entry.identity.contentKind !== 'dynamic_form') return undefined
  return actionWorkspaceRouteFor(
    entry.identity.workOrderId,
    entry.identity.workflowNodeId,
    entry.identity.actionIntent,
  )
}

function diagnosticEntryFor(entry: ActionDraftRegistryEntry): LocalDraftDiagnosticEntry {
  const route = openRouteFor(entry)
  return route ? { ...entry, openRoute: route } : entry
}

export const useLocalDraftDiagnosticsStore = defineStore('localDraftDiagnostics', () => {
  const loading = ref(false)
  const entries = ref<readonly LocalDraftDiagnosticEntry[]>([])
  const invalidTotal = ref(0)
  const error = ref<ReturnType<typeof createOperationError> | null>(null)
  const dependencyVersion = ref(0)
  let dependencies: LocalDraftDiagnosticsDependencies | null = null
  let refreshRequestId = 0

  const unfinishedTotal = computed(() => entries.value.filter((entry) => entry.status === 'unfinished').length)
  const seedAvailable = computed(() => {
    dependencyVersion.value
    const configured = dependencies
    return Boolean(configured?.isDeveloperModeAvailable() && configured.getMockMode() === 'data')
  })
  const cleanupAvailable = computed(() => {
    dependencyVersion.value
    const configured = dependencies
    return Boolean(configured?.isDeveloperModeAvailable() && configured.getMockMode() !== 'off')
  })

  function configure(next: LocalDraftDiagnosticsDependencies): void {
    dependencies = next
    refreshRequestId += 1
    dependencyVersion.value += 1
  }

  async function refresh(): Promise<OperationSnapshot<readonly LocalDraftDiagnosticEntry[]>> {
    const configured = dependencies
    const requestId = ++refreshRequestId
    dependencyVersion.value += 1
    const userId = configured?.getSession()?.user.id
    if (!configured || !userId || !configured.isDeveloperModeAvailable()) {
      entries.value = []
      invalidTotal.value = 0
      error.value = null
      return { state: 'succeeded', data: [] }
    }

    loading.value = true
    entries.value = []
    invalidTotal.value = 0
    error.value = null
    try {
      const result = await configured.repository.listForUser(userId)
      if (requestId !== refreshRequestId) return result.state === 'succeeded' && result.data
        ? { state: 'succeeded', data: result.data.entries.map(diagnosticEntryFor) }
        : { state: result.state, ...(result.error ? { error: result.error } : {}) }
      if (result.state !== 'succeeded' || !result.data) {
        error.value = result.error ?? createOperationError('server_terminal', 'Local draft diagnostics are unavailable')
        return { state: result.state, ...(result.error ? { error: result.error } : {}) }
      }
      entries.value = result.data.entries.map(diagnosticEntryFor)
      invalidTotal.value = result.data.invalidRecordCount
      error.value = null
      return { state: 'succeeded', data: entries.value }
    } finally {
      if (requestId === refreshRequestId) loading.value = false
    }
  }

  async function seedMockDrafts(): Promise<OperationSnapshot<readonly LocalDraftDiagnosticEntry[]>> {
    const configured = dependencies
    const userId = configured?.getSession()?.user.id
    if (!configured || !userId || !seedAvailable.value) return failure('Mock 草稿仅在非生产 Mock 数据模式可生成')

    for (const seed of configured.mockDraftSeeds) {
      const identity = actionDraftIdentityFor({
        userId,
        workOrderId: seed.workOrderId,
        workflowNodeId: seed.workflowNodeId,
        actionIntent: seed.actionIntent,
        contentKind: seed.contentKind,
        contentIdentity: asOpaqueId<'FormDefinitionId'>(seed.contentIdentity),
      })
      const result = await configured.repository.write({
        version: 1,
        identity,
        values: seed.values,
        updatedAt: configured.now?.() ?? new Date().toISOString(),
        status: 'unfinished',
      })
      if (result.state !== 'succeeded') {
        error.value = result.error ?? createOperationError('server_terminal', 'Mock 草稿生成失败')
        return { state: result.state, ...(result.error ? { error: result.error } : {}) }
      }
    }
    return refresh()
  }

  async function clearMockDrafts(): Promise<OperationSnapshot<readonly LocalDraftDiagnosticEntry[]>> {
    const configured = dependencies
    const userId = configured?.getSession()?.user.id
    if (!configured || !userId || !cleanupAvailable.value) return failure('Mock 草稿仅在非生产 Mock 模式可清除')

    for (const seed of configured.mockDraftSeeds) {
      const identity = actionDraftIdentityFor({
        userId,
        workOrderId: seed.workOrderId,
        workflowNodeId: seed.workflowNodeId,
        actionIntent: seed.actionIntent,
        contentKind: seed.contentKind,
        contentIdentity: asOpaqueId<'FormDefinitionId'>(seed.contentIdentity),
      })
      const result = await configured.repository.remove(identity)
      if (result.state !== 'succeeded') {
        error.value = result.error ?? createOperationError('server_terminal', 'Mock 草稿清除失败')
        return { state: result.state, ...(result.error ? { error: result.error } : {}) }
      }
    }
    return refresh()
  }

  return {
    loading,
    entries,
    invalidTotal,
    unfinishedTotal,
    seedAvailable,
    cleanupAvailable,
    error,
    configure,
    refresh,
    seedMockDrafts,
    clearMockDrafts,
  }
})
