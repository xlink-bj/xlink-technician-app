/** Offline structural projection of the retained, deidentified F04 receipt.
 * A complete field page is NOT a complete form model, Survey identity, provider
 * response or write entitlement. No transport or application gate lives here. */
export function projectCurrentFormDefStructure(receipt) {
  const require = (condition, reason) => {
    if (!condition) throw new Error(`R1_FORMDEF_EVIDENCE_BLOCKED:${reason}`)
  }
  const evidence = receipt?.evidence, fields = evidence?.fields
  require(receipt?.status === 'CURRENT_FORMDEF_BOUNDED_FIELDS_COMPLETE'
    && fields?.state === 'COMPLETE_BOUNDED_PAGES', 'INCOMPLETE_CAPTURE')
  require(receipt.productionBusinessMutationNetworkRequests === 0
    && receipt.blockedUnexpectedNetworkRequests === 0
    && evidence.customerValuesRead === false
    && receipt.provenance?.rawResponseRetained === false, 'CAPTURE_BOUNDARY')
  require(Number.isInteger(fields.total) && fields.total > 0
    && fields.returned === fields.total && fields.rows?.length === fields.total, 'COUNT')
  require(receipt.diagnostics?.length === 2 && receipt.currentFormDefReads === 2
    && receipt.diagnostics.every(page => page.httpStatus === 200 && page.parser === 'VALID_PAGE_SHAPE'
      && page.reportedTotal === fields.total && page.returnedRows > 0 && page.returnedRows <= 50)
    && receipt.diagnostics.reduce((total, page) => total + page.returnedRows, 0) === fields.total, 'PAGES')
  require(evidence.nodeType === 'repeat' && evidence.formPurpose === 'UNKNOWN'
    && evidence.providerReads === 'NOT_AUTHORIZED_BY_THIS_FIELD_ONLY_CAPTURE', 'UNPROVEN_SEMANTICS')
  const ids = new Set(), definitionId = 'synthetic-current-definition'
  const rows = fields.rows.map(row => {
    require(typeof row.fieldId === 'string' && /^field-\d{3}$/.test(row.fieldId)
      && !ids.has(row.fieldId), 'FIELD_IDENTITY')
    ids.add(row.fieldId)
    require(typeof row.valueKey === 'string' && row.valueKey.length > 0
      && typeof row.machineKeyRetained === 'boolean'
      && typeof row.type === 'string' && row.type.length > 0, 'FIELD_SHAPE')
    require(row.enabled === 1 && row.requiredKind === 'string' && ['0', '1'].includes(row.required)
      && typeof row.multiple === 'boolean' && Array.isArray(row.showList)
      && row.showList.every(item => typeof item === 'string')
      && Number.isInteger(row.unretainedConfigKeyCount) && row.unretainedConfigKeyCount >= 0, 'PRIMITIVE_KIND')
    require(row.providerId === null || /^(code|cascade)-provider-\d{3}$/.test(row.providerId), 'PROVIDER_ALIAS')
    const config = {}
    for (const [key, value] of Object.entries(row.rules ?? {})) {
      if (key === 'showField') {
        require(typeof value === 'string' && fields.rows.some(field => field.valueKey === value), 'CONDITION_REFERENCE')
        config[key] = value
      } else {
        require(key === 'showValue' && value?.kind === 'string' && /^value-\d{3}$/.test(value.token), 'UNRETAINED_RULE')
        config[key] = value.token
      }
    }
    return {
      evidenceFieldId: row.fieldId,
      machineKeyRetained: row.machineKeyRetained,
      unknownType: row.type === 'UNKNOWN',
      unretainedConfigKeyCount: row.unretainedConfigKeyCount,
      operationTypeKnown: false,
      wire: { _id: `synthetic-current-${row.fieldId}`, extId: definitionId,
        name: row.valueKey, nameDisp: `合成 ${row.fieldId}`, type: row.type,
        state: row.enabled, required: row.required, multiple: row.multiple, showList: [...row.showList],
        ...(row.providerId ? { valueOption: `synthetic-${row.providerId}` } : {}),
        ...(Object.keys(config).length ? { frontEndConfig: config } : {}),
      },
    }
  })
  return {
    version: 1, syntheticOnly: true, notForProductionRequests: true,
    classification: 'COMPLETE_FIELD_STRUCTURE_NOT_COMPLETE_MODEL',
    nodeType: evidence.nodeType, formPurpose: 'UNKNOWN', definitionId,
    sourcePageLengths: receipt.diagnostics.map(page => page.returnedRows),
    total: fields.total, rows,
    limits: {
      unknownTypeFields: rows.filter(row => row.unknownType).map(row => row.evidenceFieldId),
      unretainedConfigurationFields: rows.filter(row => row.unretainedConfigKeyCount > 0).map(row => row.evidenceFieldId),
      unretainedMachineKeys: rows.filter(row => !row.machineKeyRetained).map(row => row.evidenceFieldId),
      providerReferences: rows.filter(row => row.wire.valueOption).map(row => row.wire.valueOption),
      providers: 'NOT_CAPTURED', operationTypes: 'NOT_RETAINED',
      sourceRuleEquivalence: 'NOT_PROVEN', liveParity: 'NOT_VERIFIED',
      customerValuesIncluded: false, serverWritePermissionTested: false,
    },
  }
}

/** Evidence status only. This must not become an application write/render gate. */
export function validateCurrentFormDefEvidence(current, receipt, fixture) {
  const projected = projectCurrentFormDefStructure(receipt)
  if (current?.id !== 'F04'
    || current.productionObservation !== 'BOUNDED_FIELD_STRUCTURE_COMPLETE_MODEL_PARTIAL'
    || current.liveParity !== 'NOT_VERIFIED' || current.serverBusinessWritePermissionTested !== false
    || current.fieldCount !== projected.total
    || JSON.stringify(fixture) !== JSON.stringify(projected)) {
    throw new Error('R1_FORMDEF_EVIDENCE_BLOCKED:UNPROVEN_MODEL_PROMOTION_OR_FIXTURE_DRIFT')
  }
  return projected
}
