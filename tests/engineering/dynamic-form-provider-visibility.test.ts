import { describe, expect, it, vi } from 'vitest'
import { asOpaqueId } from '@shared/types'
import type { FormDefinitionRead, FormFieldRead, TechnicianApiReadPort } from '@shared/ports'
import { TechnicianApiCommandAdapter, type ApiCommandTransport } from '@adapters/api/technician-api-commands'
import { cascadeCodeOptions } from '@adapters/api/read-models/code-options'
import { evaluateFieldState, evaluateVisibility, normalizeSubmission } from '@runtimes/dynamic-form'
import type { VisibilityExpression } from '@runtimes/dynamic-form'

const id = asOpaqueId<'FormDefinitionId'>('provider-scoped-form')
const field = (fieldId: string, valueKey: string, type: string, valueOption: string): FormFieldRead => ({
  fieldId, valueKey, type, valueOption, label: valueKey, required: false, readOnly: false,
  showList: ['4'],
})
const codeRows = [
  field('a', 'materialA', 'select', 'CONDITION'),
  field('b', 'materialB', 'radio', 'CONDITION'),
  field('c', 'repairArea', 'cascade', 'CONDITION'),
  field('d', 'quality', 'checkbox', 'QUALITY'),
  field('e', 'serviceType', 'select', 'SERVICE'),
  field('f', 'review', 'select', 'REVIEW'),
]
function source(fields: readonly FormFieldRead[], overrides: Partial<TechnicianApiReadPort> = {}) {
  const definition: FormDefinitionRead = { id, fields }
  const getFormDefinition = vi.fn(async () => ({ state: 'succeeded' as const, data: definition }))
  const getFormData = vi.fn(async () => ({ state: 'succeeded' as const, data: { items: [] } }))
  const api = {
    getFormDefinition, getFormData,
    getDynamicCodeOptions: vi.fn(async ({ valueOption }: { readonly valueOption: string }) => ({
      state: 'succeeded' as const, data: { items: [{ value: 'code-' + valueOption, label: valueOption }] },
    })),
    getCascadeCodeOptions: vi.fn(async ({ codeType }: { readonly codeType: string }) => ({
      state: 'succeeded' as const, data: { items: [{
        value: 'root-' + codeType, label: 'root', children: [{ value: 'leaf', label: 'leaf' }],
      }] },
    })),
    ...overrides,
  } as unknown as TechnicianApiReadPort
  const command = { execute: async () => { throw new Error('no business writes permitted') } } as ApiCommandTransport
  return { adapter: new TechnicianApiCommandAdapter(command, api), api, getFormDefinition, getFormData }
}

describe('R1 FormDef option Provider resolution', () => {
  it('deduplicates by provider KIND and valueOption, preserves field order and scopes choices per read', async () => {
    const x = source(codeRows)
    for (let read = 0; read < 2; read++) {
      const result = await x.adapter.readDynamicForm({ definitionId: id })
      expect(result.state).toBe('succeeded')
      expect(result.data?.fields.map(f => f.fieldId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
      expect(result.data?.fields[0]?.options).toEqual([{ value: 'code-CONDITION', label: 'CONDITION' }])
      expect(result.data?.fields[1]?.options).toEqual(result.data?.fields[0]?.options)
      expect(result.data?.fields[2]?.options?.[0]?.children?.[0]?.value).toBe('leaf')
    }
    expect(x.api.getDynamicCodeOptions).toHaveBeenCalledTimes(8)
    expect(x.api.getCascadeCodeOptions).toHaveBeenCalledTimes(2)
    expect(x.getFormDefinition).toHaveBeenCalledTimes(2)
    expect(x.getFormData).not.toHaveBeenCalled()
  })

  it('bounds concurrent provider reads without serializing all unrelated sources', async () => {
    let active = 0
    let maximum = 0
    const provider = vi.fn(async ({ valueOption }: { readonly valueOption: string }) => {
      active++
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      await Promise.resolve()
      active--
      return { state: 'succeeded' as const, data: { items: [{ value: valueOption, label: valueOption }] } }
    })
    const fields = Array.from({ length: 8 }, (_, i) => field('row-' + i, 'key-' + i, 'select', 'CODE-' + i))
    const x = source(fields, { getDynamicCodeOptions: provider } as unknown as Partial<TechnicianApiReadPort>)
    const result = await x.adapter.readDynamicForm({ definitionId: id })
    expect(result.state).toBe('succeeded')
    expect(provider).toHaveBeenCalledTimes(8)
    expect(maximum).toBeGreaterThan(1)
    expect(maximum).toBeLessThanOrEqual(3)
  })

  it('fails closed on a denied option source; no FormData read and no invented fallback options', async () => {
    const code = vi.fn(async () => ({
      state: 'failed_terminal' as const, error: { category: 'authorization_denied' as const, message: 'role denied' },
    }))
    const x = source(codeRows.slice(0, 2), {
      getDynamicCodeOptions: code,
    } as unknown as Partial<TechnicianApiReadPort>)
    const result = await x.adapter.readDynamicForm({ definitionId: id })
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('authorization_denied')
    expect(code).toHaveBeenCalledTimes(1)
    expect(x.getFormData).not.toHaveBeenCalled()
  })

  it('keeps empty and absent providers explicitly unsupported instead of inventing choices', async () => {
    const x = source([field('row', 'answer', 'select', 'ANSWERS')], {
      getDynamicCodeOptions: vi.fn(async () => ({ state: 'succeeded' as const, data: { items: [] } })),
    } as unknown as Partial<TechnicianApiReadPort>)
    const empty = await x.adapter.readDynamicForm({ definitionId: id })
    expect(empty.data?.fields[0]?.unsupportedReason).toMatch(/returned no options/)
    expect(evaluateFieldState({
      fieldId: 'row', valueKey: 'answer', type: 'select', unsupportedReason: empty.data?.fields[0]?.unsupportedReason,
    }).capability).toBe('UNSUPPORTED')

    const missing = source([field('row', 'answer', 'select', 'ANSWERS')], {
      getDynamicCodeOptions: undefined,
    } as Partial<TechnicianApiReadPort>)
    const unresolved = await missing.adapter.readDynamicForm({ definitionId: id })
    expect(unresolved.data?.fields[0]?.options).toBeUndefined()
  })

  it('rejects partial or invalid provider trees rather than silently omitting branches', () => {
    expect(cascadeCodeOptions([{
      type: 'parts', children: [
        { value: 'roof', name: '平屋顶', children: [{ value: 'parapet', name: '女儿墙' }] },
      ],
    }], 'parts').items[0]?.children?.[0]?.value).toBe('parapet')
    expect(() => cascadeCodeOptions([{
      type: 'parts', children: [
        { value: 'roof', name: '平屋顶', children: [{ value: 'invalid-without-label' }] },
      ],
    }], 'parts')).toThrow(/cascade option/)
    expect(() => cascadeCodeOptions([{ type: 'parts', children: 'unexpected' }], 'parts'))
      .toThrow(/children/)
  })
})

describe('R1 bizSelect business-record provider boundary', () => {
  const businessField: FormFieldRead = {
    ...field('biz-1', 'serviceGoods', 'bizSelect', 'projPackage'), multiple: true,
  }
  it('uses a distinct read-only record provider, preserves record IDs and validates choices', async () => {
    const recordRead = vi.fn(async () => ({ state: 'succeeded' as const,
      data: { items: [{ value: 'package-a', label: '屋面维修套餐' },
        { value: 'package-b', label: '墙面维修套餐' }] },
    }))
    const x = source([businessField], {
      getBusinessRecordOptions: recordRead,
    } as unknown as Partial<TechnicianApiReadPort>)
    const result = await x.adapter.readDynamicForm({ definitionId: id })
    expect(result.state).toBe('succeeded')
    expect(recordRead).toHaveBeenCalledWith({ valueOption: 'projPackage' })
    expect(x.api.getDynamicCodeOptions).not.toHaveBeenCalled()
    const selected = result.data?.fields[0]
    expect(selected?.options?.map(item => item.value)).toEqual(['package-a', 'package-b'])
    expect(evaluateFieldState({ fieldId: selected!.fieldId, valueKey: selected!.valueKey,
      type: selected!.type, multiple: selected!.multiple,
      valueOption: selected!.valueOption, inlineOptions: selected!.options }).capability).toBe('SUPPORTED_GENERIC')
    expect(normalizeSubmission({ fields: [{
      fieldId: selected!.fieldId, valueKey: selected!.valueKey, type: 'bizSelect',
      multiple: true, valueOption: 'projPackage', inlineOptions: selected!.options,
    }], values: { serviceGoods: ['package-b', 'package-a'] } }))
      .toMatchObject({ ok: true, value: { values: { serviceGoods: ['package-b', 'package-a'] } } })
    expect(normalizeSubmission({ fields: [{
      fieldId: selected!.fieldId, valueKey: selected!.valueKey, type: 'bizSelect',
      multiple: true, valueOption: 'projPackage', inlineOptions: selected!.options,
    }], values: { serviceGoods: ['forged-package'] } })).toMatchObject({ ok: false })
  })

  it('keeps unknown live provider disabled; rejects duplicate and malformed records', async () => {
    const absent = source([businessField])
    const unavailable = await absent.adapter.readDynamicForm({ definitionId: id })
    const row = unavailable.data?.fields[0]
    expect(row?.options).toBeUndefined()
    expect(evaluateFieldState({ fieldId: row!.fieldId, valueKey: row!.valueKey,
      type: row!.type, valueOption: row!.valueOption }).capability).toBe('UNSUPPORTED')
    expect(absent.api.getDynamicCodeOptions).not.toHaveBeenCalled()
    const duplicate = source([businessField], {
      getBusinessRecordOptions: vi.fn(async () => ({ state: 'succeeded' as const,
        data: { items: [{ value: 'same', label: '套餐一' }, { value: 'same', label: '套餐二' }] },
      })),
    } as unknown as Partial<TechnicianApiReadPort>)
    expect(await duplicate.adapter.readDynamicForm({ definitionId: id }))
      .toMatchObject({ state: 'failed_terminal' })
  })
})

describe('R1 conditional rules and read-only Save safety', () => {
  const hidden = { kind: 'equals' as const, path: 'switch', value: '1' }
  const malformed = { kind: 'unknown' } as unknown as VisibilityExpression
  it('checks EVERY AND clause before treating a false first condition as safe hidden', () => {
    const expression: VisibilityExpression = { kind: 'all', conditions: [hidden, malformed] }
    expect(evaluateVisibility(expression, { switch: '0' }).state).toBe('unsupported')
    expect(evaluateVisibility({ kind: 'all', conditions: [] }, {}).state).toBe('unsupported')
    expect(evaluateVisibility({
      kind: 'all', conditions: [
        { kind: 'equals', path: 'switch', value: '1' },
        { kind: 'includes', path: 'part', value: 'roof' },
      ],
    }, { switch: '1', part: ['roof', 'parapet'] }).state).toBe('visible')
  })
  it('never drops an unsupported nested condition into a hidden optional-field skip', () => {
    const invalid: VisibilityExpression = { kind: 'all', conditions: [hidden, malformed] }
    const fields = [{
      fieldId: 'conditional-row', valueKey: 'evidence', type: 'text',
      required: true, visibility: invalid,
    }]
    const result = normalizeSubmission({ fields, values: { switch: '0' } })
    expect(result).toMatchObject({ ok: false, reason: 'unsupported_capability', fieldId: 'conditional-row' })
  })
  it('omits verified hidden values but keeps Workflow readonly persisted values', () => {
    const fields = [{
      fieldId: 'note-row', valueKey: 'note', type: 'text', required: true,
      visibility: hidden,
    }]
    expect(normalizeSubmission({
      fields, values: { switch: '0', note: '旧值不可提交' },
    })).toEqual({ ok: true, value: { values: {} } })
    expect(normalizeSubmission({
      fields, values: { switch: '1', note: '保存值' },
      fieldContexts: { 'note-row': { workflowReadOnly: true } },
    })).toEqual({ ok: true, value: { values: { note: '保存值' } } })
  })
})
