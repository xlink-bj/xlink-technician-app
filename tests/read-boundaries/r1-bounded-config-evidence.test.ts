import { projectR1EvidenceSyntheticWire } from '../../scripts/lib/r1-evidence-synthetic-wire.mjs'
import { describe, expect, it } from 'vitest'
import { createR1BoundedConfigEvidence } from '../../scripts/lib/r1-bounded-config-evidence.mjs'
const secret = 'PRIVATE_CUSTOMER_13800138000_SESSION_DESTINATION'
function fixture() {
  const evidence = createR1BoundedConfigEvidence()
  evidence.selected({ workOrderId: secret, serviceType: secret, sourceType: secret })
  evidence.fieldPage({ total: 3, data: [
    { _id: secret, name: 'personType', nameDisp: '客户类型', type: 'radio', state: 1, required: '1', showList: [4], valueOption: secret, frontEndConfig: { showType: 'submitOrder', serviceType: [secret] } },
    { _id: 'second-private-id', name: 'ownerName', nameDisp: secret, type: 'text', state: 1, required: '1', showList: [4], frontEndConfig: { showType: 'submitOrder', showField: 'personType', showValue: secret } },
    { _id: 'button-private-id', name: 'launch', nameDisp: secret, type: 'button', state: 1, showList: [4], required: '0', frontEndConfig: { showType: 'placeOrder', appId: secret, path: secret, extraData: { token: secret } } },
  ] }, { serviceType: secret })
  evidence.code([{ eleid: secret, options: { [secret]: secret } }], [secret])
  evidence.cascade([{ type: secret, children: [{ value: secret, name: secret, children: [{ value: 'leaf-private-value', name: secret }] }] }], [secret])
  return evidence
}
describe('bounded Production config evidence, synthetic values only', () => {
  it('removes private IDs, labels, option values and destinations while retaining public machine keys', () => {
    const snapshot = fixture().snapshot(), serialized = JSON.stringify(snapshot)
    for (const value of [secret, 'second-private-id', 'button-private-id', 'leaf-private-value']) expect(serialized).not.toContain(value)
    expect(snapshot).toMatchObject({ fields: { rows: [
      { valueKey: 'personType', label: '客户类型', machineKeyRetained: true, originalLabelRetained: true },
      { valueKey: 'ownerName', originalLabelRetained: false },
      { action: { kind: 'CONFIGURED_MINI_PROGRAM_DESTINATION', allowedActions: [], destinationOrPayloadRetained: false } },
    ] }, limits: { serverWritePermissionTested: false, noProductionFormDefExtIdRequest: true } })
  })
  it('retains the same synthetic token across field rule, Code and cascade references', () => {
    const snapshot = fixture().snapshot() as { fields: { rows: { rules: { showValue?: unknown }; providerId: string }[] }; providers: { code: { providerId: string; options: { value: unknown }[] }[]; cascade: { children: { value: unknown; children: unknown[] }[] }[] } }
    expect(snapshot.fields.rows[0].providerId).toBe(snapshot.providers.code[0].providerId)
    expect(snapshot.fields.rows[1].rules.showValue).toEqual(snapshot.providers.code[0].options[0].value)
    expect(snapshot.providers.cascade[0].children[0].value).toEqual(snapshot.providers.code[0].options[0].value)
    expect(snapshot.providers.cascade[0].children[0].children).toHaveLength(1)
  })
  it('keeps active identity and explicit Survey purpose separate from display names and history', () => {
    const evidence = fixture()
    evidence.observeWorkflow({ id: secret, workflowNodes: [
      { id: 'private-active-node', formDefinitionId: 'private-form', lifecycle: 'active', sourceNodeType: 'repeat', formPurpose: 'survey', displayName: secret },
      { id: 'private-old-node', lifecycle: 'inactive', sourceNodeType: 'repeat', displayName: '勘察' },
    ] }, { currentTask: { nodeId: 'private-active-node', actionIntent: 'onsite_inspection', execution: 'enabled' } })
    const snapshot = evidence.snapshot()
    expect(JSON.stringify(snapshot)).not.toContain('private-active-node')
    expect(JSON.stringify(snapshot)).not.toContain('勘察')
    expect(snapshot).toMatchObject({ workflows: [{ currentNodeId: 'node-001', clientEligibility: 'ENABLED_BY_CLIENT_RULES_NOT_SERVER_WRITE_PERMISSION', nodes: [
      { nodeId: 'node-001', lifecycle: 'active', formPurpose: 'survey', formDefinitionId: 'form-definition-001' },
      { lifecycle: 'inactive', formPurpose: 'UNKNOWN' },
    ] }] })
  })
  it('produces only explicitly labelled effective-subset wire with matched provider identity', () => {
    const snapshot = fixture().snapshot()
    const wire = projectR1EvidenceSyntheticWire(snapshot)
    expect(wire).toMatchObject({ state: 'projected', syntheticOnly: true, notForProductionRequests: true, observedTenantTotal: 3,
      fieldPageProjection: 'EFFECTIVE_SUBSET_NOT_ORIGINAL_TENANT_RESPONSE', fieldResponse: { total: 3 }, blockedControlTypes: ['button','area'] })
    expect(JSON.stringify(wire)).not.toContain(secret)
    expect(projectR1EvidenceSyntheticWire({})).toMatchObject({ state: 'blocked' })
    const invalid = fixture().snapshot() as { fields: { rows: { enabled: number }[] } }
    invalid.fields.rows[0].enabled = 0
    expect(projectR1EvidenceSyntheticWire(invalid)).toMatchObject({ state: 'blocked', reason: 'UNVERIFIED_ACTIVE_MOBILE_ROW' })
  })
  it('marks truncation and foreign/malformed providers rather than exporting partial verified mappings', () => {
    const evidence = createR1BoundedConfigEvidence()
    evidence.fieldPage({ total: 2, data: [] }, { serviceType: 'scope' })
    evidence.code([{ eleid: 'foreign', options: {} }], ['expected'])
    evidence.cascade([{ type: 'foreign', children: [] }], ['expected'])
    expect(evidence.snapshot()).toMatchObject({ fields: { state: 'INCOMPLETE' }, providers: { code: [{ state: 'INVALID_RESPONSE' }], cascade: [{ state: 'INVALID_RESPONSE' }] } })
  })
})
