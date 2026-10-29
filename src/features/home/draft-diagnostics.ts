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

function sessionScope(session: SessionSnapshot): string {
  return JSON.stringify([
    String(session.sessionRef), String(session.user.id),
    session.currentRole ? String(session.currentRole.id) : null, session.roleVersion ?? null,
  ])
}

function invalidSession<T>(): OperationSnapshot<T> {
  return { state: 'failed_terminal', error: createOperationError('session_invalid', '账号或角色已变化，草稿信息不可继续使用。') }
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
    return Boolean(configured?.getSession()?.currentRole?.id
      && configured.isDeveloperModeAvailable() && configured.getMockMode() === 'data')
  })
  const cleanupAvailable = computed(() => {
    dependencyVersion.value
    const configured = dependencies
    return Boolean(configured?.getSession()?.currentRole?.id
      && configured.isDeveloperModeAvailable() && configured.getMockMode() !== 'off')
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
    const session = configured?.getSession()
    const userId = session?.user.id
    const roleId = session?.currentRole?.id
    if (!configured || !userId || !roleId || !configured.isDeveloperModeAvailable()) {
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
      const requestedScope = sessionScope(session!)
      const result = await configured.repository.listForUser(userId, roleId)
      const active = configured.getSession()
      if (!active || sessionScope(active) !== requestedScope) return invalidSession()
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
    const session = configured?.getSession()
    const userId = session?.user.id
    const roleId = session?.currentRole?.id
    if (!configured || !userId || !roleId || !seedAvailable.value) return failure('Mock 草稿仅在非生产 Mock 数据模式可生成')
    const requestedScope = sessionScope(session!)

    for (const seed of configured.mockDraftSeeds) {
      const active = configured.getSession()
      if (!active || sessionScope(active) !== requestedScope) return invalidSession()
      const identity = actionDraftIdentityFor({
        userId,
        workOrderId: seed.workOrderId,
        workflowNodeId: seed.workflowNodeId,
        actionIntent: seed.actionIntent,
        contentKind: seed.contentKind,
        contentIdentity: asOpaqueId<'FormDefinitionId'>(seed.contentIdentity),
      }, roleId)
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
      const afterWrite = configured.getSession()
      if (!afterWrite || sessionScope(afterWrite) !== requestedScope) return invalidSession()
    }
    return refresh()
  }

  async function clearMockDrafts(): Promise<OperationSnapshot<readonly LocalDraftDiagnosticEntry[]>> {
    const configured = dependencies
    const session = configured?.getSession()
    const userId = session?.user.id
    const roleId = session?.currentRole?.id
    if (!configured || !userId || !roleId || !cleanupAvailable.value) return failure('Mock 草稿仅在非生产 Mock 模式可清除')
    const requestedScope = sessionScope(session!)

    for (const seed of configured.mockDraftSeeds) {
      const active = configured.getSession()
      if (!active || sessionScope(active) !== requestedScope) return invalidSession()
      const identity = actionDraftIdentityFor({
        userId,
        workOrderId: seed.workOrderId,
        workflowNodeId: seed.workflowNodeId,
        actionIntent: seed.actionIntent,
        contentKind: seed.contentKind,
        contentIdentity: asOpaqueId<'FormDefinitionId'>(seed.contentIdentity),
      }, roleId)
      const result = await configured.repository.remove(identity)
      if (result.state !== 'succeeded') {
        error.value = result.error ?? createOperationError('server_terminal', 'Mock 草稿清除失败')
        return { state: result.state, ...(result.error ? { error: result.error } : {}) }
      }
      const afterRemove = configured.getSession()
      if (!afterRemove || sessionScope(afterRemove) !== requestedScope) return invalidSession()
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
