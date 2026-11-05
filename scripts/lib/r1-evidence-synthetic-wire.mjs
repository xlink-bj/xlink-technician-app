/** Build a NON-LIVE effective-subset fixture from deidentified evidence only.
 * Does not recreate original IDs/values or pretend the subset is a tenant page. */
export function projectR1EvidenceSyntheticWire(snapshot) {
  if (snapshot?.fields?.state !== 'COMPLETE_SINGLE_BOUNDED_PAGE' || !snapshot.context) return { state: 'blocked', reason: 'COMPLETE_SELECTED_CONTEXT_REQUIRED' }
  function value(atom) {
    if (atom?.kind === 'string' && typeof atom.token === 'string') return atom.token
    if (atom?.kind === 'array' && !atom.truncated) return atom.items.map(value)
    throw new Error('UNVERIFIED_PRIMITIVE_COERCION')
  }
  try {
    const rows = snapshot.fields.rows.filter(row => row.effectiveInSelectedContext).map(row => {
      if (![1,'1'].includes(row.enabled) || !Array.isArray(row.showList) || !row.showList.some(value => String(value) === '4')) throw new Error('UNVERIFIED_ACTIVE_MOBILE_ROW')
      if (!row.machineKeyRetained || !row.valueKey || row.type === 'UNKNOWN') throw new Error('INCOMPLETE_FIELD_IDENTITY')
      const frontEndConfig = { showType: row.stage }
      for (const [name, atom] of Object.entries(row.rules ?? {})) frontEndConfig[name] = ['showField','dispensableField'].includes(name) ? atom : value(atom)
      return { _id: row.fieldId, name: row.valueKey, nameDisp: row.label, type: row.type, colName: 'order', state: 1, showList: row.showList,
        ...(row.requiredKind === 'undefined' ? {} : { required: row.required }),
        ...(row.multiple === null ? {} : { multiple: row.multiple }),
        ...(row.providerId ? { valueOption: row.providerId } : {}), frontEndConfig }
    })
    function node(raw) {
      if (!raw.valuePresent || raw.originalLabelKind !== 'string') throw new Error('INCOMPLETE_CASCADE_NODE')
      return { value: value(raw.value), name: raw.label, ...(raw.children ? { children: raw.children.map(node) } : {}) }
    }
    const code = snapshot.providers.code.map(provider => {
      if (!provider.providerId || !Array.isArray(provider.options)) throw new Error('INCOMPLETE_CODE_PROVIDER')
      return { eleid: provider.providerId, options: Object.fromEntries(provider.options.map(option => {
        if (option.originalLabelKind !== 'string') throw new Error('UNVERIFIED_CODE_LABEL')
        return [value(option.value),option.label]
      })) }
    })
    const cascade = snapshot.providers.cascade.map(provider => ({ type: provider.providerId, children: provider.children.map(node) }))
    const referenced = new Set(rows.map(row => row.valueOption).filter(Boolean))
    if ([...referenced].some(id => !code.some(row => row.eleid === id) && !cascade.some(row => row.type === id))) throw new Error('UNREAD_EFFECTIVE_PROVIDER')
    return { state: 'projected', syntheticOnly: true, notForProductionRequests: true,
      fieldPageProjection: 'EFFECTIVE_SUBSET_NOT_ORIGINAL_TENANT_RESPONSE', observedTenantTotal: snapshot.fields.total,
      context: { serviceType: value(snapshot.context.serviceType), personType: value(snapshot.context.personType) },
      fieldResponse: { total: rows.length, data: rows }, codeResponse: code, cascadeResponse: cascade,
      configurationReviewRequired: snapshot.fields.rows.filter(row => row.effectiveInSelectedContext && row.unretainedConfigKeyCount > 0).map(row => ({ fieldId: row.fieldId, valueKey: row.valueKey, type: row.type, unretainedConfigKeyCount: row.unretainedConfigKeyCount })),
      sourceRuleEquivalence: 'NOT_PROVEN_FOR_UNRETAINED_CONFIGURATION',
      blockedControlTypes: ['button','area'], originalLabelsOrBusinessValuesRestored: false }
  } catch (error) { return { state: 'blocked', reason: ['UNVERIFIED_ACTIVE_MOBILE_ROW','UNVERIFIED_PRIMITIVE_COERCION','INCOMPLETE_FIELD_IDENTITY','INCOMPLETE_CASCADE_NODE','INCOMPLETE_CODE_PROVIDER','UNVERIFIED_CODE_LABEL','UNREAD_EFFECTIVE_PROVIDER'].includes(error.message) ? error.message : 'INVALID_SYNTHETIC_PROJECTION' } }
}
