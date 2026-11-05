/** Output-only projection over already authorized responses. No fetch, auth,
 * raw response persistence, or request-scope mutation exists in this module. */
import { parseOrderExtFieldPage, providerRows, r1ServiceTypeApplies, r1PersonTypeApplies,
  sanitizeOrderCodeProviderResponse, sanitizeOrderCascadeProviderResponse } from './g4f-order-extfield-shape.mjs'
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null
const parse = value => { try { return record(typeof value === 'string' ? JSON.parse(value) : value) } catch { return null } }
const kind = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
const safeKey = value => typeof value === 'string' && /^[A-Za-z][A-Za-z_.-]{0,63}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value)
const types = new Set(['text','textarea','phone','IDNumber','number','digit','date','time','datetime','select','bizSelect','code','cascade','radio','checkbox','switch','rate','file','image','area','button','gap'])
const configKeys = new Set(['showType','serviceType','personType','showField','showValue','dispensableField','dispensableValue','appId','path','extraData','type','color','block','round','icon','plain','action','event','url','function','fn'])
const genericLabels = new Set(['客户类型','客户姓名','客户电话','姓名','电话','联系人','联系电话','委托方姓名','委托方电话','下单人姓名','下单人电话','工程量','施工面积','省市区','城市','详细地址','施工地址','项目地址','预约时间','备注','现场照片','选择套餐','智能报价','报价名称','报价说明','面积','建筑面积','维修面积','测量面积','房屋面积','业主姓名','业主电话','客户地址','委托方类型','身份证号','手机号','企业名称','公司名称'])
export function createR1BoundedConfigEvidence() {
  const maps = new Map(), workflows = [], seenWorkOrders = new Set()
  let fields = null, context = null
  const providers = { code: [], cascade: [] }
  function alias(domain, value) {
    if (value === undefined || value === null || value === '') return null
    if (!maps.has(domain)) maps.set(domain, new Map())
    const map = maps.get(domain), token = `${kind(value)}:${JSON.stringify(value)}`
    if (!map.has(token)) map.set(token, `${domain}-${String(map.size + 1).padStart(3, '0')}`)
    return map.get(token)
  }
  function atom(value) {
    if (Array.isArray(value)) return { kind: 'array', items: value.slice(0, 100).map(atom), truncated: value.length > 100 }
    if (record(value)) return { kind: 'object', valueRetained: false }
    return { kind: kind(value), token: alias('value', value) }
  }
  const key = value => safeKey(value) ? value : alias('field-key', value)
  function selected(raw) {
    context = { workOrderId: alias('work-order', raw.workOrderId), serviceType: atom(raw.serviceType), sourceType: atom(raw.sourceType), personType: atom('0'), personTypeSource: 'R1_SOURCE_DEFAULT_NOT_OBSERVED_CUSTOMER_VALUE' }
  }
  return {
    selected,
    observeWorkflow(detail, projection) {
      if (!detail?.id || seenWorkOrders.has(String(detail.id))) return
      seenWorkOrders.add(String(detail.id))
      workflows.push({ workOrderId: alias('work-order', String(detail.id)),
        currentNodeId: alias('node', projection?.currentTask?.nodeId),
        clientAction: ['appointment','onsite_inspection','place_order','sign_contract','survey','inspection','complete'].includes(projection?.currentTask?.actionIntent) ? projection.currentTask.actionIntent : 'OTHER_OR_UNRESOLVED',
        clientEligibility: projection?.currentTask?.execution === 'enabled' ? 'ENABLED_BY_CLIENT_RULES_NOT_SERVER_WRITE_PERMISSION' : 'NOT_ENABLED_OR_UNKNOWN',
        nodes: (detail.workflowNodes ?? []).map(node => ({ nodeId: alias('node', node.id),
          workflowId: alias('workflow', node.runId), formDefinitionId: alias('form-definition', node.formDefinitionId), formDataId: alias('form-data', node.formDataId),
          sourceNodeType: ['forms','repeat','form','empty','workflow','subWorkflow','system'].includes(node.sourceNodeType) ? node.sourceNodeType : 'OTHER_OR_UNRESOLVED',
          lifecycle: ['active','completed','pending','cancelled','inactive'].includes(node.lifecycle) ? node.lifecycle : 'UNKNOWN',
          formPurpose: ['survey','inspection','appointment'].includes(node.formPurpose) ? node.formPurpose : 'UNKNOWN',
          formDefinitionEvidence: ['runtime_node_def','runtime_node'].includes(node.formDefinitionIdEvidence) ? node.formDefinitionIdEvidence : 'UNKNOWN',
          handlersCount: Array.isArray(node.handlers) ? node.handlers.length : null,
          rawNodeNamesRetained: false,
        })) })
    },
    fieldPage(payload, rawContext) {
      const page = parseOrderExtFieldPage(payload)
      if (!page.ok) { fields = { state: 'INVALID_PAGE', reason: page.reason }; return }
      fields = { state: page.total === page.rows.length ? 'COMPLETE_SINGLE_BOUNDED_PAGE' : 'INCOMPLETE', total: page.total, returned: page.rows.length,
        rows: page.rows.map((row, index) => {
          const config = parse(row.frontEndConfig), fieldId = alias('field', row._id ?? `row-${index}`)
          const service = config ? r1ServiceTypeApplies(config, rawContext.serviceType) : { state: 'blocked' }
          const person = config ? r1PersonTypeApplies(config, rawContext.personType ?? '0') : { state: 'blocked' }
          const stage = ['placeOrder','submitOrder'].includes(config?.showType) ? config.showType : 'UNKNOWN'
          const effective = service.state === 'applies' && (stage === 'placeOrder' || stage === 'submitOrder' && person.state === 'applies')
          return { fieldId, valueKey: key(row.name), machineKeyRetained: safeKey(row.name), label: genericLabels.has(row.nameDisp) ? row.nameDisp : `配置字段 ${String(index + 1).padStart(2,'0')}`, originalLabelRetained: genericLabels.has(row.nameDisp), labelConfigured: typeof row.nameDisp === 'string' && !!row.nameDisp.trim(),
            enabled: [0,1,'0','1'].includes(row.state) ? row.state : null,
            type: types.has(row.type) ? row.type : 'UNKNOWN', required: [0,1,'0','1',true,false].includes(row.required) ? row.required : null,
            requiredKind: kind(row.required), multiple: typeof row.multiple === 'boolean' ? row.multiple : null,
            operationType: ['editable','readonly','creatable'].includes(row.operationType) ? row.operationType : { kind: kind(row.operationType), recognized: false },
            showList: Array.isArray(row.showList) ? row.showList.filter(value => [1,2,3,4,5,6,'1','2','3','4','5','6'].includes(value)) : null,
            providerId: alias(row.type === 'cascade' ? 'cascade-provider' : 'code-provider', row.valueOption),
            stage, effectiveInSelectedContext: effective, serviceApplicability: service.state, personApplicability: stage === 'submitOrder' ? person.state : 'NOT_APPLICABLE',
            rules: config ? { ...(Object.hasOwn(config,'serviceType') ? { serviceType: atom(config.serviceType) } : {}),
              ...(Object.hasOwn(config,'personType') ? { personType: atom(config.personType) } : {}),
              ...(Object.hasOwn(config,'showField') ? { showField: key(config.showField), showValue: atom(config.showValue) } : {}),
              ...(Object.hasOwn(config,'dispensableField') ? { dispensableField: key(config.dispensableField), dispensableValue: atom(config.dispensableValue) } : {}) } : null,
            configShape: config ? Object.fromEntries(Object.entries(config).filter(([name]) => configKeys.has(name)).map(([name,value]) => [name,kind(value)])) : null,
            unretainedConfigKeyCount: config ? Object.keys(config).filter(name => !configKeys.has(name)).length : null,
            ...(row.type === 'button' ? { action: { kind: typeof config?.appId === 'string' && config.appId ? 'CONFIGURED_MINI_PROGRAM_DESTINATION' : 'COMMON_EVENT_OR_UNRESOLVED',
              destinationOrPayloadRetained: false, allowedActions: [], gate: 'BLOCKED_NO_DESTINATION_OR_ACTION_ALLOWLIST' } } : {}),
          }
        }) }
    },
    code(payload, ids) {
      const summary = sanitizeOrderCodeProviderResponse(payload, ids)
      if (!summary.ok) { providers.code = [{ state: 'INVALID_RESPONSE', reason: summary.reason }]; return }
      providers.code = providerRows(payload).map(row => {
        const options = typeof row.options === 'string' ? JSON.parse(row.options) : row.options
        return { providerId: alias('code-provider',row.eleid), options: Object.entries(options).map(([value,label], index) => ({ value: atom(value), label: `选项 ${index + 1}`, originalLabelKind: kind(label), originalLabelRetained: false })) }
      })
    },
    cascade(payload, ids) {
      const summary = sanitizeOrderCascadeProviderResponse(payload, ids)
      if (!summary.ok) { providers.cascade = [{ state: 'INVALID_RESPONSE', reason: summary.reason }]; return }
      function visit(node, path) {
        const label = typeof node.name === 'string' ? node.name : node.label
        return { value: atom(node.value), label: `节点 ${path}`, originalLabelKind: kind(label),
          valuePresent: typeof node.value === 'string' && !!node.value,
          ...(Array.isArray(node.children) ? { children: node.children.map((child,index) => visit(child,`${path}.${index+1}`)) } : {}) }
      }
      providers.cascade = providerRows(payload).map(row => ({ providerId: alias('cascade-provider',row.type), children: row.children.map((child,index) => visit(child,String(index+1))) }))
    },
    snapshot() {
      return { version: 1, evidenceClass: 'PRODUCTION_READ_SYNTHETIC_CONFIG_PROJECTION', context, workflows, fields, providers,
        privacy: { credentialsAndSessionRetained: false, rawBusinessIdsRetained: false, customerDataRetained: false, rawOptionValuesOrLabelsRetained: false,
          fieldLabelsPolicy: 'EXACT_GENERIC_LABEL_ALLOWLIST_ELSE_SYNTHETIC', machineKeysPolicy: 'ASCII_NON_NUMERIC_CONFIGURATION_KEYS_ONLY', aliasScope: 'ONE_CAPTURE_ONLY_NOT_LINKABLE_TO_OTHER_CAPTURES' },
        limits: { noProductionFormDefExtIdRequest: true, formDefinitionFields: 'BLOCKED_PRODUCTION_EXTID_READ_NOT_IN_ALLOWLIST',
          optionTokensAreNotLiveWireValues: true, originalScalarKindsRetained: true, originalNumericCoercionOrSubstringParity: 'NOT_PROVEN_BY_ALIAS',
          permittedButtonActions: [], serverWritePermissionTested: false, mutations: 0 } }
    },
  }
}
