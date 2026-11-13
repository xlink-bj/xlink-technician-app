import { describe, expect, it } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import { asOpaqueId } from '@shared/types'
import { evaluateFieldState } from '@runtimes/dynamic-form'
import { actionFormSchemaFor } from '@features/work-orders/action-form-schema'
import { projectR1RecordReadFields } from '@features/work-orders/r1-record-read-fields'
import { createSelectedRoleVisibilityContext } from '@shared/form/selected-role-visibility'

function definition(showType: unknown, patch: Record<string, unknown> = {}) {
  return formDefinition({ data: [{ _id: 'row-a', name: 'sharedName', nameDisp: '角色字段', type: 'text',
    required: '0', readOnly: 0, showList: ['4'], showType, roleIds: ['r'], frontEndConfig: '{}', ...patch }] }, asOpaqueId<'FormDefinitionId'>('e'))
}
function context(roleId: string | null) {
  return createSelectedRoleVisibilityContext(() => roleId ? { roleId, sessionKey: 'synthetic-session' } : null)
}
describe('R1 current-selected-role field visibility', () => {
  it.each([['4', 'r', true], ['4', 'other', false], ['5', 'r', false], ['5', 'other', true]] as const)(
    'maps showType %s and selected role %s to visible=%s', (mode, roleId, visible) => {
      const f = definition(mode).fields![0]!
      expect(f.unsupportedReason).toBeUndefined()
      expect(f.visibility).toEqual({ kind: 'role', mode: mode === '4' ? 'include' : 'exclude', roleIds: ['r'] })
      expect(evaluateFieldState(actionFormSchemaFor({ ...f, roleVisibilityContext: context(roleId) }), { surface: 'mobile_detail' }))
        .toMatchObject({ capability: 'SUPPORTED_GENERIC', visible })
    },
  )
  it.each(['4', '5'])('never interprets missing/untrusted role as nonmembership for %s', mode => {
    const f = definition(mode).fields![0]!
    for (const roleVisibilityContext of [undefined, context(null), { kind: 'selected-role-visibility' as const }]) {
      expect(evaluateFieldState(actionFormSchemaFor({ ...f, roleVisibilityContext }), { surface: 'mobile_detail', values: { currentRoleId: 'other', roleIds: ['other'] } }))
        .toMatchObject({ capability: 'UNSUPPORTED', visible: false, readOnly: true })
    }
  })
  it.each([undefined, null, [], 'r', [1], [''], [' r '], ['r', 'r']])('refuses unproved roleIds %j in both modes', roleIds => {
    for (const mode of ['4', '5']) {
      const f = definition(mode, { roleIds }).fields![0]!
      expect(f.unsupportedReason).toBeTruthy()
      expect(evaluateFieldState(actionFormSchemaFor({ ...f, roleVisibilityContext: context('other') }), {})).toMatchObject({ capability: 'UNSUPPORTED', visible: false })
    }
  })
  it.each(['4', '5'])('refuses mixed old frontEndConfig precedence rather than evaluating root %s', mode => {
    const f = definition(mode, { frontEndConfig: JSON.stringify({ showField: 'flag', showValue: 'yes' }) }).fields![0]!
    expect(f.unsupportedReason).toBeTruthy()
  })
  it.each([false, 1, [], '{bad'])('refuses malformed role frontEndConfig %j', frontEndConfig => {
    const f = definition('5', { frontEndConfig }).fields![0]!
    expect(f.unsupportedReason).toBeTruthy()
  })
  it('permanently revokes an observed role/session/reader withdrawal and rejects serialized context', () => {
    let source: { roleId: string; sessionKey: string } | null = { roleId: 'other', sessionKey: 's1' }
    const roleVisibilityContext = createSelectedRoleVisibilityContext(() => source)
    const f = definition('5').fields![0]!, schema = actionFormSchemaFor({ ...f, roleVisibilityContext })
    expect(evaluateFieldState(schema, {}).visible).toBe(true)
    source = { roleId: 'r', sessionKey: 's1' }
    expect(evaluateFieldState(schema, {}).capability).toBe('UNSUPPORTED')
    source = { roleId: 'other', sessionKey: 's1' }
    expect(evaluateFieldState(schema, {}).capability).toBe('UNSUPPORTED')
    expect(evaluateFieldState({ ...schema, roleVisibilityContext: JSON.parse(JSON.stringify(roleVisibilityContext)) }, {}).capability).toBe('UNSUPPORTED')
    const next = actionFormSchemaFor({ ...f, roleVisibilityContext: createSelectedRoleVisibilityContext(() => source) })
    expect(evaluateFieldState(next, {}).visible).toBe(true)
    source = null
    expect(evaluateFieldState(next, {}).capability).toBe('UNSUPPORTED')
  })
  it('preserves different fieldId rows sharing one name and independently evaluates visibility', () => {
    const f = definition('4').fields![0]!, roleVisibilityContext = context('r')
    const fields = [{ ...f, roleVisibilityContext }, { ...f, fieldId: 'row-b', label: '另一同名行', roleVisibilityContext }]
    const d = { id: asOpaqueId<'FormDefinitionId'>('e'), fields }
    const record = { id: asOpaqueId<'FormDataId'>('a'), definitionId: d.id, values: { sharedName: 'kept' } }
    expect(projectR1RecordReadFields(d, record).map(row => row.fieldId)).toEqual(['row-a', 'row-b'])
    expect(projectR1RecordReadFields(d, record).every(row => !row.unavailable)).toBe(true)
  })
  it('keeps complementary same-name rows distinct across selected roles', () => {
    const f = definition('4').fields![0]!
    for (const [roleId, expected] of [['r', 'row-a'], ['other', 'row-b']]) {
      const roleVisibilityContext = context(roleId)
      const fields = [{ ...f, roleVisibilityContext }, { ...f, fieldId: 'row-b', roleVisibilityContext,
        visibility: { kind: 'role' as const, mode: 'exclude' as const, roleIds: ['r'] } }]
      const d = { id: asOpaqueId<'FormDefinitionId'>('e'), fields }
      const record = { id: asOpaqueId<'FormDataId'>('a'), definitionId: d.id, values: { sharedName: 'kept' } }
      expect(projectR1RecordReadFields(d, record).map(row => row.fieldId)).toEqual([expected])
    }
  })
  it('ignores role values in FormData and revokes same-role session replacement', () => {
    let source = { roleId: 'other', sessionKey: 's1' }
    const f = definition('4').fields![0]!
    const schema = actionFormSchemaFor({ ...f, roleVisibilityContext: createSelectedRoleVisibilityContext(() => source) })
    expect(evaluateFieldState(schema, { values: { currentRoleId: 'r', role: 'r', roleIds: ['r'] } }).visible).toBe(false)
    source = { roleId: 'other', sessionKey: 's2' }
    expect(evaluateFieldState(schema, {}).capability).toBe('UNSUPPORTED')
  })
  it('does not accept a context supplied in raw backend metadata', () => {
    const f = definition('5', { roleVisibilityContext: context('other') }).fields![0]!
    expect(f.roleVisibilityContext).toBeUndefined()
    expect(evaluateFieldState(actionFormSchemaFor(f), {}).capability).toBe('UNSUPPORTED')
  })
  it('does not turn a role-visible readonly field into an editable one', () => {
    const f = definition('4', { readOnly: 1 }).fields![0]!
    expect(evaluateFieldState(actionFormSchemaFor({ ...f, roleVisibilityContext: context('r') }), {})).toMatchObject({ visible: true, readOnly: true, required: false })
  })
})
