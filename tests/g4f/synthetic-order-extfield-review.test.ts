import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageKey, StorageListQuery, StoragePort } from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'

import {
  createSyntheticOrderExtFieldDraftSession,
  createSyntheticOrderExtFieldPlan,
  syntheticFinalSubmitRows,
  syntheticOrderExtFieldStorageKey,
  syntheticOrderExtFieldRows,
  validateSyntheticCatalogEntry,
} from '@features/work-orders/quotation/synthetic-extfield-review'
import type { SyntheticOrderExtFieldIdentity } from '@features/work-orders/quotation/synthetic-extfield-review'

const identity: SyntheticOrderExtFieldIdentity = {
  userId: 'synthetic-user-A',
  workOrderId: 'synthetic-work-order-A',
  workflowNodeId: 'synthetic-node-A',
  actionIntent: 'place_order',
  scenario: 'dynamic-fields',
  fixtureVersion: 'order-extfield-fixture-v1',
}

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function memoryStorage(initial: ReadonlyMap<string, unknown> = new Map()) {
  const values = new Map(initial)
  const storage: StoragePort = {
    read: async <T>(key: StorageKey) => succeeded((values.get(`${key.namespace}:${key.key}`) as T | undefined) ?? null),
    write: async <T>(key: StorageKey, value: T) => {
      values.set(`${key.namespace}:${key.key}`, value)
      return succeeded(undefined)
    },
    remove: async (key) => {
      values.delete(`${key.namespace}:${key.key}`)
      return succeeded(undefined)
    },
    listKeys: async ({ namespace, prefix }: StorageListQuery) => succeeded(
      [...values.keys()]
        .filter((key) => key.startsWith(`${namespace}:`))
        .map((key) => key.slice(namespace.length + 1))
        .filter((key) => prefix === undefined || key.startsWith(prefix)),
    ),
  }
  return { storage, values }
}

describe('synthetic Order ExtField review integration', () => {
  beforeEach(() => vi.useRealTimers())

  it('uses the accepted mapper for conditional visibility and shared value keys without losing hidden values', () => {
    const values = { demoMode: '是', demoConditionalRequired: '屋面基层需检查', demoSharedExplanation: '共享说明' }
    const yesPlan = createSyntheticOrderExtFieldPlan(values)
    expect(yesPlan.execution).toBe('PURE_SOURCE_PLAN_ONLY')
    expect(yesPlan.rows.find((row) => row.rowId === 'demo-conditional-required-row')?.disposition).toBe('eligible')
    expect(yesPlan.fields.some((field) => field.fieldId === 'demo-shared-visible-yes-row')).toBe(true)
    expect(yesPlan.fields.some((field) => field.fieldId === 'demo-shared-visible-no-row')).toBe(false)

    const noPlan = createSyntheticOrderExtFieldPlan({ ...values, demoMode: '否' })
    expect(noPlan.fields.some((field) => field.fieldId === 'demo-conditional-required-row')).toBe(false)
    expect(noPlan.fields.some((field) => field.fieldId === 'demo-shared-visible-no-row')).toBe(true)
    expect(values.demoConditionalRequired).toBe('屋面基层需检查')
    expect(values.demoSharedExplanation).toBe('共享说明')
  })

  it('keeps selection-entry requiredness distinct from final-submit dispensability and hidden requiredness', () => {
    const defaults = { demoMode: '是', demoWaiverMode: '豁免' }
    const plan = createSyntheticOrderExtFieldPlan(defaults)
    const missingConditional = validateSyntheticCatalogEntry(plan, defaults)
    expect(missingConditional).toMatchObject({ ok: false, fieldId: 'demo-conditional-required-row' })

    const withConditional = { ...defaults, demoConditionalRequired: '有效的合成内容' }
    expect(validateSyntheticCatalogEntry(createSyntheticOrderExtFieldPlan(withConditional), withConditional))
      .toMatchObject({ ok: false, fieldId: 'demo-waived-required-row' })

    const complete = { ...withConditional, demoWaivedRequired: '进入目录前仍需填写' }
    expect(validateSyntheticCatalogEntry(createSyntheticOrderExtFieldPlan(complete), complete).ok).toBe(true)
    const finalRows = syntheticFinalSubmitRows(createSyntheticOrderExtFieldPlan(complete), complete)
    expect(finalRows.find((row) => row.rowId === 'demo-waived-required-row')).toMatchObject({ state: 'optional' })

    const hiddenPlan = createSyntheticOrderExtFieldPlan({ demoMode: '否', demoWaiverMode: '' })
    expect(hiddenPlan.fields.some((field) => field.fieldId === 'demo-conditional-required-row')).toBe(false)
    expect(hiddenPlan.diagnostics.finalSubmitRequiredRowIds).toContain('demo-conditional-required-row')
    expect(syntheticFinalSubmitRows(hiddenPlan, { demoMode: '否' }).find((row) => row.rowId === 'demo-conditional-required-row'))
      .toMatchObject({ state: 'missing' })
  })

  it('keeps stage, service and person applicability separate and does not manufacture controls or providers', () => {
    const current = createSyntheticOrderExtFieldPlan({ demoMode: '是' })
    expect(current.rows.find((row) => row.rowId === 'demo-stage-filtered-row')?.reason).toBe('different_action_stage')
    expect(current.rows.find((row) => row.rowId === 'demo-service-filtered-row')?.reason).toBe('service_type_not_applicable')
    for (const rowId of [
      'demo-area-blocked-row', 'demo-button-blocked-row', 'demo-provider-select-blocked-row', 'demo-provider-cascade-blocked-row',
    ]) {
      const row = current.rows.find((candidate) => candidate.rowId === rowId)
      expect(row?.disposition).toBe('blocked')
      expect(row).not.toHaveProperty('schema')
    }

    const submit = createSyntheticOrderExtFieldPlan({ demoMode: '是' }, 'submitOrder')
    expect(submit.rows.find((row) => row.rowId === 'demo-person-filtered-row')?.reason).toBe('person_type_not_applicable')
    expect(submit.rows.find((row) => row.rowId === 'demo-media-blocked-row')).toMatchObject({ disposition: 'blocked', requiredness: 'required' })
    expect(current.fields.some((field) => field.valueKey === 'demoRequiredImage')).toBe(false)
    expect(syntheticOrderExtFieldRows.some((row) => row.valueKey === 'serviceGoods' || row.valueKey === 'surveyDrawing')).toBe(false)
  })

  it('keeps preview drafts separately scoped by user, work order, node, intent, scenario and fixture version', async () => {
    const { storage, values } = memoryStorage()
    const first = createSyntheticOrderExtFieldDraftSession(storage, identity, { debounceMs: 1, now: () => '2026-10-09T10:00:00.000Z' })
    expect(await first.load()).toMatchObject({ state: 'empty' })
    first.schedule({ demoMode: '是' })
    await first.flush()
    first.dispose()

    const dimensions: (keyof SyntheticOrderExtFieldIdentity)[] = ['userId', 'workOrderId', 'workflowNodeId', 'actionIntent', 'scenario', 'fixtureVersion']
    for (const dimension of dimensions) {
      const changedIdentity = { ...identity, [dimension]: `${identity[dimension]}-other` } as SyntheticOrderExtFieldIdentity
      const isolated = createSyntheticOrderExtFieldDraftSession(storage, changedIdentity)
      expect(await isolated.load(), dimension).toEqual({ state: 'empty' })
      isolated.dispose()
    }
    expect(values.has(`draft:${syntheticOrderExtFieldStorageKey(identity)}`)).toBe(true)
  })

  it('preserves unknown tuple keys, including __proto__, without exposing them as editable values', async () => {
    const raw = {
      schemaVersion: 1,
      identity,
      updatedAt: '2026-10-09T09:00:00.000Z',
      values: [
        ['demoMode', '是'],
        ['futureSyntheticField', 'opaque'],
        ['__proto__', { polluted: true }],
      ],
    }
    const { storage, values } = memoryStorage(new Map([[`draft:${syntheticOrderExtFieldStorageKey(identity)}`, raw]]))
    const session = createSyntheticOrderExtFieldDraftSession(storage, identity)
    const loaded = await session.load()
    expect(loaded).toMatchObject({ state: 'ready', values: { demoMode: '是' } })
    if (loaded.state !== 'ready') throw new Error('expected valid synthetic record')
    expect(loaded.values).not.toHaveProperty('futureSyntheticField')
    expect(Object.getPrototypeOf(loaded.values)).toBeNull()

    session.schedule({ ...loaded.values, demoMode: '否' })
    await session.flush()
    const stored = values.get(`draft:${syntheticOrderExtFieldStorageKey(identity)}`) as { values: readonly (readonly [string, unknown])[] }
    expect(stored.values).toContainEqual(['futureSyntheticField', 'opaque'])
    expect(stored.values).toContainEqual(['__proto__', { polluted: true }])
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    session.dispose()
  })

  it('rejects corrupt or identity-mismatched records and never overwrites them', async () => {
    const corruptRecord = { schemaVersion: 99, identity, updatedAt: 'bad', values: [] }
    const { storage, values } = memoryStorage(new Map([[`draft:${syntheticOrderExtFieldStorageKey(identity)}`, corruptRecord]]))
    const session = createSyntheticOrderExtFieldDraftSession(storage, identity)
    expect(await session.load()).toEqual({ state: 'corrupt' })
    session.schedule({ demoMode: 'changed' })
    await session.flush()
    expect(values.get(`draft:${syntheticOrderExtFieldStorageKey(identity)}`)).toBe(corruptRecord)
    session.dispose()
  })

  it('cancels a pending debounced write when its scope is disposed', async () => {
    vi.useFakeTimers()
    const delayedWrites: unknown[] = []
    const base = memoryStorage()
    const delayedStorage: StoragePort = {
      ...base.storage,
      write: async <T>(_key: StorageKey, value: T) => {
        delayedWrites.push(value)
        return succeeded(undefined)
      },
    }

    const first = createSyntheticOrderExtFieldDraftSession(delayedStorage, identity, { debounceMs: 50 })
    await first.load()
    first.schedule({ demoMode: '是' })
    first.dispose()
    await vi.advanceTimersByTimeAsync(100)
    expect(delayedWrites).toHaveLength(0)
    vi.useRealTimers()
  })

  it('keeps a late in-flight write scoped to its original identity', async () => {
    let finishFirstWrite: (() => void) | undefined
    const base = memoryStorage()
    const originalKey = syntheticOrderExtFieldStorageKey(identity)
    const delayedStorage: StoragePort = {
      ...base.storage,
      write: async <T>(key: StorageKey, value: T) => {
        if (key.key !== originalKey) return base.storage.write(key, value)
        return new Promise<OperationSnapshot<void>>((resolve) => {
          finishFirstWrite = () => {
            void base.storage.write(key, value).then(() => resolve(succeeded(undefined)))
          }
        })
      },
    }

    const first = createSyntheticOrderExtFieldDraftSession(delayedStorage, identity)
    await first.load()
    first.schedule({ demoMode: '是' })
    const firstFlush = first.flush()
    await vi.waitFor(() => expect(finishFirstWrite).toBeTypeOf('function'))
    first.dispose()

    const nextIdentity = { ...identity, userId: 'synthetic-user-B' }
    const second = createSyntheticOrderExtFieldDraftSession(delayedStorage, nextIdentity, { debounceMs: 0 })
    await second.load()
    second.schedule({ demoMode: '否' })
    await second.flush()
    const secondKey = `draft:${syntheticOrderExtFieldStorageKey(nextIdentity)}`
    const secondRecord = base.values.get(secondKey) as { values: readonly (readonly [string, unknown])[] }
    expect(secondRecord.values).toContainEqual(['demoMode', '否'])

    finishFirstWrite?.()
    await firstFlush
    const firstRecord = base.values.get(`draft:${originalKey}`) as { values: readonly (readonly [string, unknown])[] }
    expect(firstRecord.values).toContainEqual(['demoMode', '是'])
    expect((base.values.get(secondKey) as { values: readonly (readonly [string, unknown])[] }).values).toContainEqual(['demoMode', '否'])
    second.dispose()
  })
})
