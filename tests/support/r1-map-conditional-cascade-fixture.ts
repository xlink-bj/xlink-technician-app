import { existingRecordFixture } from './r1-existing-record-edit-fixture'

export function mapConditionalCascadeFixture(checkbox = false, extDependency = false) {
  const h = existingRecordFixture(true)
  h.mapRoute()
  const raw = h.fields[0], colName = h.ext.colName, providerId = 'configured-location-tree'
  h.fields.splice(0, h.fields.length,
    { ...raw, _id: 'choice-field', name: 'operationMode', type: 'radio', preset: extDependency ? 0 : 1,
      options: [{ value: 'show', label: '填写明细' }, { value: 'hide', label: '暂不填写' }] },
    { ...raw, _id: 'time-field', name: 'conditionalValue', type: checkbox ? 'checkbox' : 'textarea', multiple: checkbox,
      preset: 0, required: '0', showType: '3', showField: 'operationMode', showFieldPreset: extDependency ? 0 : 1, showValue: 'show',
      ...(checkbox ? { options: [{ value: 'a', label: '事项甲' }, { value: 'b', label: '事项乙' }] } : {}) },
    { ...raw, _id: 'note-field', name: 'locationPath', type: 'cascade', preset: 0, required: '0', multiple: false, valueOption: providerId },
  )
  h.node.nodeDef.formFieldIdsFill = h.fields.map(f => f._id)
  h.grant.fieldIds = [...h.node.nodeDef.formFieldIdsFill]
  h.setGrant()
  for (const r of [h.record, h.other]) {
    r.operationMode = 'show'
    r.conditionalValue = checkbox ? ['a'] : '原始说明'
    r.locationPath = ['north', 'upper', 'left']
    Object.assign(r.exts, { conditionalValue: structuredClone(r.conditionalValue), locationPath: [...r.locationPath] },
      extDependency ? { operationMode: 'show' } : {})
  }
  const leaf = (id: string, value: string, parentId: string, children: any[] = []) =>
    ({ _id: id, value, name: value, parentId, type: providerId, tenantId: h.scope.tenantId, children })
  const group = { _id: 'G', type: providerId, tenantId: h.scope.tenantId, children: [
    leaf('N', 'north', 'G', [leaf('U', 'upper', 'N', [leaf('L', 'left', 'U')])]),
    leaf('S', 'south', 'G', [leaf('D', 'lower', 'S', [leaf('R', 'right', 'D')])]),
  ] }
  const execute = h.transport.execute.getMockImplementation()!
  h.transport.execute.mockImplementation(async request => {
    if (request.path === 'i/code/selectMultistageCode.do') {
      if (request.body.types !== providerId || request.body.tenantId !== h.scope.tenantId) throw Error('Unbound tree request')
      h.events.push(request.path)
      return structuredClone([group])
    }
    return execute(request)
  })
  return { ...h, group, colName }
}
