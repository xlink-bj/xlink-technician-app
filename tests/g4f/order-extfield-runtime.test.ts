import { describe, expect, it } from 'vitest'
import { evaluateOrderExtFields, type OrderFieldRuntimeInput } from '../../src/features/work-orders/quotation/order-extfield-runtime'
const base: OrderFieldRuntimeInput = {
  rows: [{ rowId: 'note', valueKey: 'note', type: 'text', required: '1', colName: 'order', state: 1, showList: [4], frontEndConfig: { showType: 'placeOrder' } }],
  context: { stage: 'placeOrder', serviceType: 'service' }, values: {}, optionsByRowId: {},
}
describe('Order fields runtime validation and wire boundary', () => {
  it('blocks required values then projects the supplied completed value', () => {
    expect(evaluateOrderExtFields(base, 'submit').state).toBe('blocked')
    expect(evaluateOrderExtFields({ ...base, values: { note: '现场说明' } }, 'submit')).toMatchObject({ state: 'ready', exts: { note: '现场说明' } })
  })
  it('preserves the R1 distinction between hidden entry fields and final obligations', () => {
    const input = { ...base, rows: [{ ...base.rows[0], frontEndConfig: { showType: 'placeOrder', showField: 'mode', showValue: 'yes' } }], values: { mode: 'no' } }
    expect(evaluateOrderExtFields(input, 'selection').state).toBe('ready')
    expect(evaluateOrderExtFields(input, 'submit').errors.note).toBeTruthy()
  })
  it('requires exact provider options and rejects foreign option values', () => {
    const input = { ...base, rows: [{ ...base.rows[0], type: 'radio', valueOption: 'dictionary' }], values: { note: 'foreign' } }
    expect(evaluateOrderExtFields(input, 'submit').state).toBe('blocked')
    const optionsByRowId = { note: [{ value: 'yes', label: '是' }] }
    expect(evaluateOrderExtFields({ ...input, optionsByRowId }, 'submit').state).toBe('blocked')
    expect(evaluateOrderExtFields({ ...input, optionsByRowId, values: { note: 'yes' } }, 'submit').state).toBe('ready')
  })
  it('does not turn a business provider into a Code provider by supplying options', () => {
    const input = { ...base, rows: [{ ...base.rows[0], type: 'bizSelect', valueOption: 'business' }],
      values: { note: 'a' }, optionsByRowId: { note: [{ value: 'a', label: 'A' }] } }
    expect(evaluateOrderExtFields(input, 'submit').state).toBe('blocked')
  })
  it('does not waive required submitOrder data when converting a placeOrder snapshot', () => {
    const input = { ...base, rows: [{ ...base.rows[0], frontEndConfig: { showType: 'submitOrder' } }] }
    expect(evaluateOrderExtFields(input, 'submit').state).toBe('ready')
    expect(evaluateOrderExtFields({ ...input, context: { ...input.context, stage: 'submitOrder' } }, 'submit').state).toBe('blocked')
  })
  it('requires a complete area path belonging to the verified three-level provider', () => {
    const options = [{ value: '110000', label: '北京', children: [{ value: '110100', label: '城区', children: [{ value: '110101', label: '东城' }] }] }]
    const input = { ...base, rows: [{ ...base.rows[0], type: 'area' }], optionsByRowId: { note: options } }
    expect(evaluateOrderExtFields({ ...input, values: { note: ['110000', '110100', '110101'] } }, 'submit')).toMatchObject({ state: 'ready', exts: { note: ['110000', '110100', '110101'] } })
    for (const path of [['110000'], ['110000', '110100'], ['110000', '110100', '999999']]) {
      expect(evaluateOrderExtFields({ ...input, values: { note: path } }, 'submit').state).toBe('blocked')
    }
    expect(evaluateOrderExtFields({ ...input, optionsByRowId: { note: [{ value: '110000', label: '北京' }] } }, 'submit').state).toBe('blocked')
  })
  it('keeps optional unsupported controls blocked', () => {
    expect(evaluateOrderExtFields({ ...base, rows: [{ ...base.rows[0], type: 'area', required: '0' }] }, 'submit').state).toBe('blocked')
  })
})
