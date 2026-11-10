import { describe, expect, it } from 'vitest'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { normalizeR1GenericScalarEditValues as normalize, projectR1GenericScalarEditValues as project } from '@features/work-orders/r1-generic-scalar-edit-values'
import { normalizeR1FormsEditValues } from '@features/work-orders/r1-forms-edit-values'
import { r1SpecialFormUpsert } from '@adapters/api/r1-special-workflow-wires'

function fixture() {
  const fields: any[] = [
    { fieldId: 'area', valueKey: 'area', type: 'digit', required: true, readOnly: false, preset: false },
    { fieldId: 'mode', valueKey: 'mode', type: 'radio', required: true, readOnly: false, preset: false, options: [{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }] },
    { fieldId: 'note', valueKey: 'note', type: 'text', required: false, readOnly: false, preset: false, visibility: { kind: 'equals', path: 'mode', value: 'show' } },
    { fieldId: 'detail', valueKey: 'detail', type: 'text', required: true, readOnly: false, preset: false, visibility: { kind: 'equals', path: 'mode', value: 'show' } },
    ...Array.from({ length: 55 }, (_, i) => ({ fieldId: `ro-${i}`, valueKey: `protected${i}`, type: 'unknown', required: true, readOnly: i % 2 === 0, preset: true })),
  ]
  const snapshot = { workOrderId: 's', node: { id: 'n', runId: 'w', sourceNodeType: 'forms', formFieldIdsReadOnly: fields.filter(field => field.fieldId.startsWith('ro-') && !field.readOnly).map(field => field.fieldId) },
    definition: { id: 'e', fields }, fillableFieldIds: ['area', 'mode', 'note', 'detail'] } as unknown as R1NodeFormsSnapshot
  const original: Record<string, any> = { _id: 'a', sid: 's', nodeId: 'n', workflowId: 'w', formDefId: 'e', state: 1, smodule: 'serviceAppointment',
    area: 2, mode: 'show', note: 'old note', detail: 'old detail', protected0: { retain: ['raw'] }, protected2: 'readonly scalar',
    formTitle: 'Existing title', unknownTop: { keep: [0, false] },
    exts: { area: 2, mode: 'show', note: 'old note', detail: 'old detail', protected1: ['unknown raw'], unknownNested: { retain: true } } }
  return { snapshot, fields, original }
}

describe('private generic scalar edit validation without an edit grant', () => {
  it('projects only writable scalar effective slots, keeping zero, false and null', () => {
    const { snapshot, original } = fixture()
    original.area = { shadowed: true }; original.exts.area = 0; original.exts.note = false; original.exts.detail = null
    expect(project(snapshot, original)).toEqual({ area: 0, mode: 'show', note: false, detail: null })
  })
  it('uses root only when the EXTS slot is absent', () => {
    const { snapshot, original } = fixture(); delete original.exts.area
    expect(project(snapshot, original).area).toBe(2)
    delete original.exts; expect(project(snapshot, original).area).toBe(2)
  })
  it.each([{}, [], [1], Infinity, NaN, undefined])('rejects an unrepresentable own writable original slot: %j', value => {
    const { snapshot, original } = fixture(); original.exts.area = value
    expect(() => project(snapshot, original)).toThrow()
    expect(() => normalize(snapshot, original, { area: 6 })).toThrow()
  })
  it.each([null, [], 'broken'])('rejects malformed own EXTS containers: %j', value => {
    const { snapshot, original } = fixture(); original.exts = value
    expect(() => project(snapshot, original)).toThrow()
  })
  it('returns only changed normalized fields and never mutates either input', () => {
    const { snapshot, original } = fixture(), before = structuredClone(original), draft = { area: '6.5', mode: 'show', note: 'new note' }
    expect(normalize(snapshot, original, draft)).toEqual({ fields: { area: 6.5, note: 'new note' }, clearedFieldKeys: [] })
    expect(original).toEqual(before); expect(draft).toEqual({ area: '6.5', mode: 'show', note: 'new note' })
  })
  it('preserves every unknown, readonly and newly hidden original through the existing full wire', () => {
    const { snapshot, original } = fixture(), before = structuredClone(original)
    const normalized = normalize(snapshot, original, { mode: 'hide' })
    const request = r1SpecialFormUpsert({ sourceNodeType: 'forms', definitionId: 'e' as never, workOrderId: 's' as never,
      workflowNodeId: 'n' as never, workflowRunId: 'w' as never, existingFormDataId: 'a' as never,
      authoritativeOriginal: original, formData: normalized.fields, clearedFieldKeys: normalized.clearedFieldKeys,
      fieldStorage: snapshot.definition.fields, state: 1 })
    expect(JSON.parse(String(request.body?.dataStr))).toEqual({ ...before, mode: 'hide', exts: { ...before.exts, mode: 'hide' } })
    expect(original).toEqual(before)
  })
  it.each([null, undefined, '', '   '])('clears optional fields only by explicit proven two-slot omission: %j', value => {
    const { snapshot, original } = fixture()
    expect(normalize(snapshot, original, { note: value })).toEqual({ fields: {}, clearedFieldKeys: ['note'] })
    delete original.note; expect(() => normalize(snapshot, original, { note: value })).toThrow()
  })
  it('refuses a clear when only the root slot exists', () => {
    const { snapshot, original } = fixture(); delete original.exts.note
    expect(() => normalize(snapshot, original, { note: '' })).toThrow()
  })
  it.each([{ area: '' }, { detail: '  ' }, { mode: 'bad' }, { area: 'Infinity' }, { area: [] }, { note: [] }, { note: ['new'] }, { note: {} }, { unknownTop: 'new' }, { protected0: 'new' }])('rejects invalid or unapproved draft %j', draft => {
    const { snapshot, original } = fixture(); expect(() => normalize(snapshot, original, draft)).toThrow()
  })
  it('allows an unchanged readonly scalar but does not copy it to the patch', () => {
    const { snapshot, original } = fixture()
    expect(normalize(snapshot, original, { protected2: 'readonly scalar', area: 6 })).toEqual({ fields: { area: 6 }, clearedFieldKeys: [] })
    expect(() => normalize(snapshot, original, { protected2: 'changed', area: 6 })).toThrow()
  })
  it('refuses even identical readonly JSON supplied in the draft', () => {
    const { snapshot, original } = fixture()
    expect(() => normalize(snapshot, original, { protected0: original.protected0, area: 6 })).toThrow()
  })
  it('retains unchanged hidden scalar values but refuses hidden changes', () => {
    const { snapshot, original } = fixture()
    expect(normalize(snapshot, original, { mode: 'hide', note: 'old note' })).toEqual({ fields: { mode: 'hide' }, clearedFieldKeys: [] })
    expect(() => normalize(snapshot, original, { mode: 'hide', note: 'new note' })).toThrow()
  })
  it('requires missing values when a branch becomes visible', () => {
    const { snapshot, original } = fixture(); original.mode = original.exts.mode = 'hide'; delete original.detail; delete original.exts.detail
    expect(() => normalize(snapshot, original, { mode: 'show' })).toThrow()
    expect(normalize(snapshot, original, { mode: 'show', detail: 'new required' }).fields).toEqual({ mode: 'show', detail: 'new required' })
  })
  it('evaluates exists against deleted slots and validates newly visible required values', () => {
    const { snapshot, original, fields } = fixture(); delete fields[2].visibility
    fields[3].visibility = { kind: 'exists', path: 'note', expected: false }; delete original.detail; delete original.exts.detail
    expect(() => normalize(snapshot, original, { note: '' })).toThrow()
    expect(normalize(snapshot, original, { note: '', detail: 'new required' })).toEqual({ fields: { detail: 'new required' }, clearedFieldKeys: ['note'] })
    fields.reverse()
    expect(normalize(snapshot, original, { note: '', detail: 'new required' })).toEqual({ fields: { detail: 'new required' }, clearedFieldKeys: ['note'] })
  })
  it('keeps unchanged hidden empty own slots in the actual persisted condition context', () => {
    const { snapshot, original, fields } = fixture(); original.mode = original.exts.mode = 'hide'; original.note = original.exts.note = ''
    fields[3].visibility = { kind: 'exists', path: 'note', expected: false }; fields[3].required = false
    expect(() => normalize(snapshot, original, { note: '', detail: 'forged hidden change' })).toThrow()
    expect(normalize(snapshot, original, { note: '', area: 6 })).toEqual({ fields: { area: 6 }, clearedFieldKeys: [] })
    fields.reverse()
    expect(normalize(snapshot, original, { note: '', area: 6 })).toEqual({ fields: { area: 6 }, clearedFieldKeys: [] })
  })
  it('does not use normalization of unchanged originals to create false condition context', () => {
    const { snapshot, original, fields } = fixture(); fields[0].type = 'text'; original.area = original.exts.area = ' 2 '
    fields[3].visibility = { kind: 'equals', path: 'area', value: '2' }
    expect(() => normalize(snapshot, original, { note: 'changed', detail: 'hidden edit' })).toThrow()
  })
  it('refuses controller normalization that changes visible or required states', () => {
    const { snapshot, original, fields } = fixture(); fields[0].type = 'text'
    fields[3].visibility = { kind: 'equals', path: 'area', value: '2' }
    expect(() => normalize(snapshot, original, { area: ' 2 ' })).toThrow()
  })
  it('checks required whitespace after normalization even in unchanged originals', () => {
    const { snapshot, original } = fixture(); original.detail = original.exts.detail = '   '
    expect(() => normalize(snapshot, original, { area: 6 })).toThrow()
  })
  it('keeps the inherited specialized Appointment schema closed', () => {
    const { snapshot, original } = fixture(); (snapshot.definition as any).purpose = 'appointment'
    expect(() => normalize(snapshot, original, { area: 6 })).toThrow()
  })
  it('does not treat Survey purpose or pure validation success as an edit grant', () => {
    const { snapshot, original } = fixture(); (snapshot.definition as any).purpose = 'survey'
    expect(normalize(snapshot, original, { area: 6 })).toEqual({ fields: { area: 6 }, clearedFieldKeys: [] })
    // The reader/provider must independently prove the exact generic Map route.
    // Calling this pure helper cannot open the existing public edit entry.
    expect(() => normalizeR1FormsEditValues(snapshot, original, { area: 6 })).toThrow()
  })
  it('does not enable any existing public large edit path', () => {
    const { snapshot, original } = fixture()
    expect(() => normalizeR1FormsEditValues(snapshot, original, { area: 6 })).toThrow()
  })
  it.each(['duplicate key', 'duplicate ID', 'readonly controller', 'unknown provider', 'missing readonly', 'too many metadata'])('retains subset schema rejection for %s', kind => {
    const { snapshot, original, fields } = fixture()
    if (kind === 'duplicate key') fields[10].valueKey = 'area'
    if (kind === 'duplicate ID') fields[10].fieldId = 'area'
    if (kind === 'readonly controller') fields[0].visibility = { kind: 'exists', path: 'protected0', expected: true }
    if (kind === 'unknown provider') fields[0].valueOption = 'unverified'
    if (kind === 'missing readonly') (snapshot.node as any).formFieldIdsReadOnly = undefined
    if (kind === 'too many metadata') while (fields.length < 201) fields.push({ fieldId: `extra-${fields.length}`, valueKey: `extra${fields.length}`, readOnly: true })
    expect(() => normalize(snapshot, original, { area: 6 })).toThrow()
  })
  it.each([{}, { area: 2 }, { area: '2' }])('rejects a draft with no effective scalar changes: %j', draft => {
    const { snapshot, original } = fixture(); expect(() => normalize(snapshot, original, draft)).toThrow()
  })
})
