import { assertSurveyReadExtsValues } from '@app/r1-node-forms-read'
import { describe, expect, it } from 'vitest'
import reference from '../fixtures/survey-59-read-reference.json'
import { formData, formDefinition } from '@adapters/api/read-models/form'
import { projectR1RecordReadFields } from '@features/work-orders/r1-record-read-fields'
import { normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
import type { FormDataRead, FormDefinitionRead, FormFieldRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const definitionId = asOpaqueId<'FormDefinitionId'>('synthetic-survey-definition')
const definition = () => formDefinition({ data: reference.fields.map(f => f.row) }, definitionId)
const record = (values: Record<string, unknown> = {}) => formData({ _id: 'synthetic-record', ...values }, undefined, definitionId)
const project = (values: Record<string, unknown> = {}) => projectR1RecordReadFields(definition(), record(values))
const field = (overrides: Partial<FormFieldRead> = {}): FormFieldRead => ({ fieldId: 'f', valueKey: 'answer', label: '回答', type: 'text', required: false, readOnly: true, ...overrides })
const one = (f: FormFieldRead, value: unknown) => projectR1RecordReadFields({ id: definitionId, fields: [f] }, record({ answer: value }))[0]

describe('saved Survey structural reference, not production edit authorization', () => {
  it('keeps 59 distinct row identities, duplicate keys, unknown configuration and permission', () => {
    const d = definition()
    expect(d.fields).toHaveLength(59)
    expect(new Set(d.fields!.map(f => f.fieldId)).size).toBe(59)
    expect(new Set(d.fields!.map(f => f.valueKey)).size).toBe(56)
    expect(d.fields!.filter(f => f.showList?.map(String).includes('4'))).toHaveLength(40)
    expect(reference.productionEquivalent).toBe(false); expect(reference.writeAuthorized).toBe(false)
    expect(reference.fields.every(f => f.evidence.calculateConfig === 'UNKNOWN' && f.evidence.effectiveWritePermission === 'UNKNOWN')).toBe(true)
    expect(reference.fields.filter(f => f.evidence.conditionStatus === 'PARTIAL_REDACTED_CONDITION').map(f => f.evidence.ordinal)).toEqual([18, 27, 28])
  })
  it.each([
    [['1', '130'], true, false], [['3', '310'], false, true],
    [undefined, false, false], [['1', '130', 'unverified-child'], false, false],
    [['3'], false, false], [['6'], false, false],
  ])('honors exact complete part path %j', (part, square, plane) => {
    const rows = project({ part, squareMeter: 18.75, planeArea: 20.25 })
    expect(rows.some(f => f.valueKey === 'squareMeter')).toBe(square)
    expect(rows.some(f => f.valueKey === 'planeArea')).toBe(plane)
  })
  it('never displays non-mobile values or partially observed conditional values', () => {
    const rows = project({ part: ['1', '130'], name: 'SHOULD_NOT_APPEAR', province: 'HIDDEN', isMoldRemoved: '1', height: 123456 })
    expect(rows.some(f => ['name', 'province', 'beforeMoldRemoval', 'afterMoldRemoval', 'isMoldRemoved'].includes(f.valueKey))).toBe(false)
    expect(rows.find(f => f.valueKey === 'height')).toMatchObject({ unavailable: true, text: '字段规则尚未完整核实，暂不展示内容' })
    expect(JSON.stringify(rows)).not.toContain('123456')
  })
  it('does not mistake codec-dropped file/data objects for an unsaved field', () => {
    expect(() => assertSurveyReadExtsValues(definition(), { part: ['1', '130'], leakageCause: [{ code: 'unverified' }] })).toThrow()
    const rows = project({ part: ['1', '130'], surveyDrawing: [{ url: 'https://untrusted.invalid/private.png' }], exts: { images1: [{ url: 'https://untrusted.invalid/private.png' }] } })
    expect(rows.find(f => f.valueKey === 'surveyDrawing')).toMatchObject({ unavailable: true, text: '附件内容暂不支持在此查看' })
    expect(rows.find(f => f.valueKey === 'images1')?.text).not.toBe('未保存')
    expect(rows.find(f => f.valueKey === 'leakageCause')?.text).toBe('未保存')
    expect(JSON.stringify(rows)).not.toContain('https://')
  })
  it('does not infer the Survey provider from an Order dictionary', () => {
    expect(project({ part: ['1', '130'] }).find(f => f.valueKey === 'part')?.text).toBe('1 / 130（选项未核实）')
  })
  it('does not collapse repeated business keys with different row identities', () => {
    const d: FormDefinitionRead = { id: definitionId, fields: [field({ fieldId: 'f1' }), field({ fieldId: 'f2' })] }
    expect(projectR1RecordReadFields(d, record({ answer: 0 })).map(f => [f.fieldId, f.text])).toEqual([['f1', '0'], ['f2', '0']])
  })
  it('keeps the normal full-schema save refusal intact', () => {
    expect(() => normalizeR1RepeatValues({ workOrderId: 'synthetic-work', node: { id: asOpaqueId<'WorkflowNodeRuntimeId'>('node'), category: 'repeat', lifecycle: 'active' }, definition: definition(), records: [] }, { squareMeter: 18.75 })).toThrow()
  })
})

describe('generic read display, without granting edit or loading links', () => {
  it.each([[false, 'false'], [0, '0'], ['', '空值'], [null, '空值'], [undefined, '未保存']])('preserves scalar %j', (value, text) => expect(one(field(), value)?.text).toBe(text))
  it('resolves a verified cascade only down its actual parent chain', () => {
    const f = field({ type: 'cascade', options: [{ value: 'root', label: '合成根', children: [{ value: 'leaf', label: '合成叶' }] }, { value: 'other', label: '另一个根', children: [{ value: 'different', label: '另一叶' }] }] })
    expect(one(f, ['root', 'leaf'])?.text).toBe('合成根 / 合成叶')
    for (const value of [['root', 'different'], ['root', 'leaf', 'extra'], ['leaf'], 'root']) expect(one(f, value)?.text).toContain('选项未核实')
    expect(one({ ...f, options: [...f.options!, f.options![0]!] }, ['root', 'leaf'])?.text).toContain('选项未核实')
  })
  it('uses only trusted record identity for edit conditions', () => {
    const d = { id: definitionId, fields: [field({ visibility: { kind: 'equals' as const, path: '_id', value: 'synthetic-record' } })] }
    expect(projectR1RecordReadFields(d, record({ _id: 'synthetic-record', answer: 'saved' }))[0]?.text).toBe('saved')
    const forged: FormDataRead = { id: asOpaqueId<'FormDataId'>('other-record'), definitionId, values: { _id: 'synthetic-record', answer: 'hidden' } }
    expect(projectR1RecordReadFields(d, forged)).toEqual([])
  })
  it('does not use capability failure as a hidden field or expose ambiguous rules', () => {
    expect(one(field({ type: 'unknown' }), 'secret')).toMatchObject({ unavailable: true, text: '该字段类型暂不支持在此查看' })
    expect(one(field({ unsupportedReason: 'missing conditional comparison' }), 'secret')?.text).not.toContain('secret')
    expect(one(field({ mobileDetailHidden: true }), 'secret')).toBeUndefined()
    expect(one(field({ showList: [] }), 'secret')).toBeUndefined()
  })
  it('rejects mismatched definition and duplicate field identity', () => {
    expect(projectR1RecordReadFields({ id: asOpaqueId<'FormDefinitionId'>('other'), fields: [field()] }, record())).toEqual([])
    expect(projectR1RecordReadFields({ id: definitionId, fields: [field(), field()] }, record())).toEqual([])
  })
})
