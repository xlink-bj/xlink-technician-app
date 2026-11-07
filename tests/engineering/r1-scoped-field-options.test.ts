import { describe, expect, it, vi } from 'vitest'
import { bindR1ScopedFieldOptions, parseR1ScopedFieldOptions, readR1ScopedFieldOptions } from '@adapters/api/r1-scoped-field-options'
import { formDefinition } from '@adapters/api/read-models/form'
import { asOpaqueId } from '@shared/types'

// Synthetic wire fixtures. V5 proves these three field/type/reference pairings,
// not any of the option values/labels used below or effective write permission.
const references = [
  { name: 'province', type: 'select', valueOption: 'regions' },
  { name: 'part', type: 'cascade', valueOption: 'parts' },
  { name: 'isMoldRemoved', type: 'radio', valueOption: 'IS' },
]
const codeBinding = { kind: 'code' as const, providerId: 'synthetic', tenantId: 'tenant' }
const cascadeBinding = { ...codeBinding, kind: 'cascade' as const }
const code = (options: unknown = { yes: 'Synthetic yes' }) => [{ codeId: 'synthetic', eleid: 'synthetic', options }]
const leaf = (value = 'leaf') => ({ value, name: `Synthetic ${value}`, children: [] as unknown[] })
const cascade = (children: unknown = [leaf()]) => [{ type: 'synthetic', children }]
function fixture(metadata: Record<string, unknown> = {}) {
  const raw = { _id: 'field', tenantId: 'tenant', extId: 'ext', state: 1,
    name: 'answer', type: 'select', valueOption: 'synthetic', ...metadata }
  const field = formDefinition({ data: [raw] }, asOpaqueId<'FormDefinitionId'>('ext')).fields![0]!
  return { rawField: raw, field, tenantId: 'tenant', definitionId: 'ext' }
}

describe('strict scoped Code / Cascade wire parsing', () => {
  it.each(['array', 'json'])('reads only exact echoed Code group (%s)', shape => {
    const raw = code({ yes: 'Synthetic yes', no: 'Synthetic no' })
    expect(parseR1ScopedFieldOptions(shape === 'json' ? JSON.stringify(raw) : raw, codeBinding))
      .toEqual([{ value: 'yes', label: 'Synthetic yes' }, { value: 'no', label: 'Synthetic no' }])
  })
  it('preserves repeated values under distinct parents and explicit empty leaf children', () => {
    const raw = cascade([
      { ...leaf('left'), children: [leaf('same')] },
      { ...leaf('right'), children: [leaf('same')] },
    ])
    expect(parseR1ScopedFieldOptions(raw, cascadeBinding)).toEqual([
      { value: 'left', label: 'Synthetic left', children: [{ value: 'same', label: 'Synthetic same', children: [] }] },
      { value: 'right', label: 'Synthetic right', children: [{ value: 'same', label: 'Synthetic same', children: [] }] },
    ])
  })
  it('accepts verified empty maps/children but does not infer them from missing groups', () => {
    expect(parseR1ScopedFieldOptions(code({}), codeBinding)).toEqual([])
    expect(parseR1ScopedFieldOptions(cascade([]), cascadeBinding)).toEqual([])
  })
  it.each([
    null, {}, [], { data: code() }, { items: code() }, [[...code()]],
    [{ eleid: 'synthetic', options: {} }], [{ codeId: 'synthetic', options: {} }],
    [{ codeId: 'foreign', eleid: 'synthetic', options: {} }],
    [{ codeId: 'synthetic', eleid: 'foreign', options: {} }],
    [{ codeId: 'synthetic', eleid: 'synthetic' }], ...[null, [], ''].map(code), [{ codeId: 'synthetic', eleid: 'synthetic', options: undefined }],
    code({ valid: 'valid', invalid: '' }), code({ a: 1 }), code({ a: null }),
    code({ a: ' x' }), code({ a: 'x\n' }), code({ '': 'x' }), code({ ' x': 'x' }),
    code({ a: 'x'.repeat(513) }), code({ ['x'.repeat(257)]: 'x' }),
    [...code(), ...code()], [...code(), { codeId: 'foreign', eleid: 'foreign', options: {} }],
    [{ ...code()[0], codeType: 'java' }], [{ ...code()[0], tenantId: 'foreign' }],
    JSON.stringify(JSON.stringify(code())), '[',
    '[{"codeId":"synthetic","eleid":"synthetic","options":{"a":"first","a":"second"}}]',
    '[{"codeId":"synthetic","eleid":"synthetic","options":{"a":"first","\\u0061":"second"}}]',
  ])('rejects unverified Code input %# without dropping anything', raw => {
    expect(() => parseR1ScopedFieldOptions(raw, codeBinding)).toThrow(/unverified/)
  })
  it.each([
    null, {}, [], { data: cascade() }, { items: cascade() }, JSON.stringify(cascade()),
    [{ type: 'foreign', children: [] }], [{ type: 'synthetic' }], cascade(null), cascade({}),
    [...cascade(), ...cascade()], cascade([null]), cascade([{ value: 'v', name: 'x' }]),
    cascade([{ ...leaf(), children: null }]), cascade([{ ...leaf(), children: {} }]),
    cascade([{ ...leaf(), name: '' }]), cascade([{ value: 'v', label: 'No name', children: [] }]),
    cascade([{ ...leaf(), name: 'x'.repeat(513) }]), cascade([leaf(), leaf()]),
    cascade([{ ...leaf(), type: 'foreign' }]), cascade([{ ...leaf(), tenantId: 'foreign' }]),
    [{ type: 'synthetic', _id: 'root', children: [{ ...leaf(), _id: 'a', parentId: 'foreign' }] }],
    [{ type: 'synthetic', _id: 'root', children: [{ ...leaf(), _id: 'root', parentId: 'root' }] }],
    cascade([{ ...leaf('a'), _id: 'same' }, { ...leaf('b'), _id: 'same' }]),
  ])('rejects unverified Cascade input %# without changing paths', raw => {
    expect(() => parseR1ScopedFieldOptions(raw, cascadeBinding)).toThrow(/unverified/)
  })
  it('checks supplied wire identity and parent relationships without flattening values', () => {
    const raw = [{ type: 'synthetic', _id: 'root', children: [
      { ...leaf('a'), _id: 'one', parentId: 'root', type: 'synthetic', children: [
        { ...leaf('a'), _id: 'two', parentId: 'one', type: 'synthetic' },
      ] },
    ] }]
    expect(parseR1ScopedFieldOptions(raw, cascadeBinding)[0]?.children?.[0]?.value).toBe('a')
  })
  it('bounds total options, depth, and encoded input before accepting a partial provider', () => {
    expect(parseR1ScopedFieldOptions(code(Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [String(i), 'value']))), codeBinding)).toHaveLength(5000)
    expect(() => parseR1ScopedFieldOptions(code(Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [String(i), 'value']))), codeBinding)).toThrow()
    const children = Array.from({ length: 2500 }, (_, i) => leaf(String(i)))
    expect(() => parseR1ScopedFieldOptions(cascade([
      { ...leaf('a'), children }, { ...leaf('b'), children },
    ]), cascadeBinding)).toThrow()
    let child = leaf()
    for (let depth = 1; depth < 20; depth++) child = { ...leaf(), children: [child] }
    expect(parseR1ScopedFieldOptions(cascade([child]), cascadeBinding)).toHaveLength(1)
    expect(() => parseR1ScopedFieldOptions(cascade([{ ...leaf(), children: [child] }]), cascadeBinding)).toThrow()
    expect(() => parseR1ScopedFieldOptions(' '.repeat(2_000_001), codeBinding)).toThrow()
    expect(() => parseR1ScopedFieldOptions('['.repeat(49) + ']'.repeat(49), codeBinding)).toThrow()
  })
})

describe('raw field binding and exact readonly requests', () => {
  it.each(references)('binds V5 reference metadata $name without asserting real options', async metadata => {
    const input = fixture(metadata), binding = bindR1ScopedFieldOptions(input)!
    const raw = metadata.type === 'cascade'
      ? [{ type: metadata.valueOption, children: [leaf()] }]
      : [{ codeId: metadata.valueOption, eleid: metadata.valueOption, options: { yes: 'Synthetic yes' } }]
    const execute = vi.fn(async () => raw)
    expect(await readR1ScopedFieldOptions(binding, { execute })).toHaveLength(1)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(metadata.type === 'cascade'
      ? { method: 'POST', path: 'i/code/selectMultistageCode.do', body: { types: metadata.valueOption, tenantId: 'tenant' } }
      : { method: 'POST', path: 'i/code/selectCode.do', body: {
        jsonPara: JSON.stringify([{ codeId: metadata.valueOption, eleid: metadata.valueOption }]), tenantId: 'tenant',
      } })
  })
  it.each([
    { tenantId: 'foreign' }, { extId: 'foreign' }, { state: 0 },
    { type: 'select ' }, { name: ' answer' }, { valueOption: 123 },
    { valueOption: ' types' }, { valueOption: 'a,b' }, { valueOption: 'java:com.example.Codes' },
    { valueOption: 'com.example.Codes' }, { valueOption: '{"codeType":"java"}' },
    { valueOption: ['synthetic'] }, { type: 'bizSelect' }, { valueOption: 'x'.repeat(129) },
  ])('rejects raw field binding %j before executing a provider', async metadata => {
    const execute = vi.fn()
    await expect((async () => {
      const binding = bindR1ScopedFieldOptions(fixture(metadata))
      if (binding) await readR1ScopedFieldOptions(binding, { execute })
    })()).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })
  it.each(['_id', 'name', 'type', 'valueOption', 'id', 'fieldId', 'key', 'fieldName', 'fieldType', 'formDefId', 'definitionId'])('rejects later contradictory %s binding', key => {
    const input = fixture()
    Object.assign(input.rawField, { [key]: 'foreign' })
    expect(() => bindR1ScopedFieldOptions(input)).toThrow()
  })
  it('does not reinterpret fields with no provider reference', () => {
    expect(bindR1ScopedFieldOptions(fixture({ type: 'text', valueOption: '' }))).toBeNull()
  })
})
