import { describe, expect, it } from 'vitest'
import { projectR1OrderExtFieldWire } from '../../src/features/work-orders/quotation/order-extfield-wire'

const definitions = ['zero', 'blank', 'off', 'hidden', 'choices'].map(name => ({ name, type: 'text' }))
describe('R1 Order.exts wire projection', () => {
  it('retains zero and configured hidden values while excluding unconfigured values and false', () => {
    expect(projectR1OrderExtFieldWire(definitions, {
      zero: 0, blank: '', off: false, hidden: 'retained', choices: [], injected: 'excluded',
    })).toEqual({ state: 'projected', exts: { zero: 0, hidden: 'retained', choices: [] } })
  })
  it('does not use inherited input or mutate selected arrays', () => {
    const choices = ['a']
    const values = Object.assign(Object.create({ hidden: 'inherited' }), { choices })
    const result = projectR1OrderExtFieldWire(definitions, values)
    choices.push('b')
    expect(result).toEqual({ state: 'projected', exts: { choices: ['a'] } })
  })
  it('blocks media references until upload projection is verified', () => {
    expect(projectR1OrderExtFieldWire([{ name: 'photos', type: 'file' }], {
      photos: [{ url: 'local-file' }],
    })).toEqual({ state: 'blocked', reason: 'media_not_verified' })
  })
  it('rejects nonfinite and structured values without returning a partial projection', () => {
    for (const value of [Infinity, NaN, { nested: true }, [['a']]]) {
      expect(projectR1OrderExtFieldWire(definitions, { hidden: 'valid', choices: value }))
        .toEqual({ state: 'blocked', reason: 'unsupported_value' })
    }
  })
  it('blocks unsafe keys and contradictory duplicate definitions', () => {
    for (const fields of [[{ name: '__proto__', type: 'text' }], [
      { name: 'shared', type: 'text' }, { name: 'shared', type: 'number' },
    ]]) expect(projectR1OrderExtFieldWire(fields, {})).toEqual({ state: 'blocked', reason: 'invalid_definition' })
  })
})
