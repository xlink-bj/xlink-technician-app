import { describe, expect, it } from 'vitest'
import { workOrderInformationFields, projectWorkOrderInformation } from '@adapters/api/read-models/work-order-information'
import { createSelectedRoleVisibilityContext } from '@shared/form/selected-role-visibility'

const row = (patch: Record<string, unknown> = {}) => ({ _id: 'role-row', tenantId: 't', colName: 'serviceAppointment', name: 'memo', nameDisp: '角色资料',
  type: 'text', state: 1, preset: 0, required: '0', readOnly: 0, operationType: 'editable', showList: ['4'], showType: '4', roleIds: ['r'], frontEndConfig: '{}', ...patch })
const fields = (rows: Record<string, unknown>[]) => workOrderInformationFields({ data: rows, total: rows.length, page: 1 }, 't')
const context = (roleId: string) => createSelectedRoleVisibilityContext(() => ({ sessionKey: 'synthetic-trusted-reader', roleId }))
const record = { status: 203, memo: 'ROOT', exts: { memo: 'EXT', phone: '13800000000', gate: 'yes' }, gate: 'no' }

describe('Work Order information role rules use only explicit trusted context', () => {
  it.each([['4', 'r', true], ['4', 'other', false], ['5', 'r', false], ['5', 'other', true]] as const)('root %s selected %s visible %s without showFieldPreset', (showType, roleId, visible) => {
    const f = fields([row({ showType })]); expect(f).toHaveLength(1)
    const result = projectWorkOrderInformation(record, f, true, context(roleId))
    expect(result.map(r => r.value)).toEqual(visible ? ['EXT'] : [])
    if (visible) expect(result[0]!.field).toMatchObject({ readOnly: true, roleVisibilityContext: { kind: 'selected-role-visibility' } })
  })
  it.each([undefined, null, [], 'r', [''], [1], ['r', 'r']])('denies missing/malformed roleIds %j in both modes', roleIds => {
    for (const showType of ['4', '5']) expect(projectWorkOrderInformation(record, fields([row({ showType, roleIds })]), true, context('other'))).toEqual([])
  })
  it('cannot use raw metadata, field values or serialized context to open an exclude rule', () => {
    const f = fields([row({ showType: '5', roleVisibilityContext: context('other') })])
    expect(projectWorkOrderInformation({ ...record, currentRole: { _id: 'other' } }, f, true)).toEqual([])
    expect(projectWorkOrderInformation(record, f, true, JSON.parse(JSON.stringify(context('other'))))).toEqual([])
  })
  it('refuses mixed legacy frontend conditions while retaining exact value-condition root/EXTS behavior', () => {
    expect(fields([row({ frontEndConfig: { showField: 'gate', showValue: 'yes' }, showFieldPreset: 0 })])).toEqual([])
    const f = fields([row({ showType: '3', roleIds: [], showField: 'gate', showFieldPreset: 0, showValue: 'yes' })])
    expect(projectWorkOrderInformation(record, f, true).map(r => r.value)).toEqual(['EXT'])
    expect(projectWorkOrderInformation(record, fields([row({ showType: '3', roleIds: [], showField: 'gate', showFieldPreset: 1, showValue: 'yes' })]), true)).toEqual([])
  })
  it('keeps same-name fieldId rows distinct and phone masking independent of roles', () => {
    const f = fields([row({ preset: 1 }), row({ _id: 'ext-role' }), row({ _id: 'role-phone', name: 'phone', type: 'phone' })])
    const result = projectWorkOrderInformation(record, f, true, context('r'))
    expect(result.map(r => r.field.fieldId)).toEqual(['role-row', 'ext-role', 'role-phone'])
    expect(result.map(r => r.value)).toEqual(['ROOT', 'EXT', '138****0000'])
    expect(projectWorkOrderInformation(record, f, false, context('r')).some(r => r.field.type === 'phone')).toBe(false)
  })
})


it('withdrawal notifications are one-shot, unsubscribe on unmount and never trust copied tokens', async () => {
  const { onSelectedRoleVisibilityRevoked, revokeSelectedRoleVisibilityContext, selectedRoleForVisibility } = await import('@shared/form/selected-role-visibility')
  const token = createSelectedRoleVisibilityContext(() => ({ sessionKey: 's', roleId: 'r' }))
  let active = 0, unmounted = 0
  onSelectedRoleVisibilityRevoked(token, () => { active++ })
  const stop = onSelectedRoleVisibilityRevoked(token, () => { unmounted++ }); stop()
  revokeSelectedRoleVisibilityContext(JSON.parse(JSON.stringify(token)))
  expect(selectedRoleForVisibility(token)).toBe('r')
  revokeSelectedRoleVisibilityContext(token); revokeSelectedRoleVisibilityContext(token)
  expect([active, unmounted, selectedRoleForVisibility(token)]).toEqual([1, 0, undefined])
})
