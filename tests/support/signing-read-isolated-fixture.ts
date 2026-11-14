/** Data preparation only. No seed, server, credentials, Contract grant or network. */
export function createSigningReadIsolatedFixture(namespace: string) {
  if (!/^synthetic-signing-[a-z0-9-]{1,32}$/.test(namespace)) {
    throw new Error('Use a new synthetic-signing namespace for each isolated window')
  }
  const principal = { tenantId: `${namespace}-tenant`, orgId: `${namespace}-org`,
    userId: `${namespace}-user`, roleId: `${namespace}-role`, accountType: 'b', dataAuth: 2,
    sourceTypes: ['4'], foreignUserId: `${namespace}-other-user` }
  const metadata = { workflowDefinitionId: `${namespace}-definition`, localBindingsVerified: false as const }
  const cases = (['matched', 'non-handler'] as const).map(kind => {
    const id = (suffix: string) => `${namespace}-${kind}-${suffix}`
    const common = { tenantId: principal.tenantId, orgId: principal.orgId, belongTo: principal.userId }
    const serviceAppointment = { ...common, _id: id('work'), workflowId: id('run'), state: 1, status: 203,
      serviceType: '11', name: '合成签约资料', orderNum: id('number'), exts: { sourceType: '4' } }
    const workflow = { ...common, _id: id('run'), state: 0, defId: metadata.workflowDefinitionId,
      formDataId: serviceAppointment._id }
    const node = { ...common, _id: id('node'), workflowId: workflow._id, defId: metadata.workflowDefinitionId,
      workflowFormDataId: serviceAppointment._id, workflowFormColName: 'serviceAppointment', state: 0,
      handlerIds: [kind === 'matched' ? principal.userId : principal.foreignUserId],
      nodeDef: { nodeType: 'placeOrder', name: '下单', viewableRoleIds: [principal.roleId] } }
    const order = { ...common, _id: id('order'), serviceAppointmentId: serviceAppointment._id,
      orderNumber: id('order-number'), type: 1, state: 1, processState: 0,
      // No fake amount, signer, phone, address, PDF URL or Contract is required.
      bjProducts: JSON.stringify({ orderList: [] }), exts: { sourceType: '4' } }
    return { kind, expectedHandler: kind === 'matched', serviceAppointment, workflow, node, order }
  })
  return { namespace, phase: 'offline-prepared-not-seeded' as const, principal, metadata, cases,
    contractBoundary: { enabled: false as const, maxRequests: 0 as const, records: [] as never[] },
    prerequisites: [
      'Bind an existing isolated principal/tenant/active organization and effective ordinary-list role; no credentials in this file',
      'Verify active ServiceAppointment Ext and WorkflowDef, then bind defId and the real placeOrder nodeDef snapshot',
      'Verify the foreign handler User exists in the same isolated tenant',
      'Allocate a fresh namespace, check all IDs absent, and reserve the read window before seeding',
    ] }
}

export type SigningReadIsolatedFixture = ReturnType<typeof createSigningReadIsolatedFixture>
