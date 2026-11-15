/** R1 Ext(type=1)/Survey read shapes. Four source-backed field definitions
 * reuse the normal-reader fixture contract; all identities and values are
 * synthetic. This is read-only Mock configuration, never Production evidence.
 */
export const normalSurveyMockIds = {
  work: 'mock-work-order-017-survey-success', node: 'mock-workflow-node-017-inspection',
  run: 'mock-workflow-run-017', definition: 'mock-normal-survey-definition-017',
  record: 'mock-normal-survey-record-017', tenant: 'synthetic-qa-tenant',
} as const
const ids = normalSurveyMockIds
const sourceFields: readonly Record<string, unknown>[] = [
  {
    "_id": "synthetic-survey-field-017",
    "required": "1",
    "multiple": false,
    "showList": [
      "1",
      "2",
      "4",
      "5"
    ],
    "enabled": 1,
    "showType": "1",
    "preset": 1,
    "name": "part",
    "type": "cascade",
    "colName": "survey",
    "operationType": "1",
    "order": 17,
    "showField": "",
    "showValue": "",
    "showFieldPreset": 0,
    "frontEndConfig": "{}",
    "valueOption": "unresolved-cascade-provider-001"
  },
  {
    "_id": "synthetic-survey-field-024",
    "required": "0",
    "multiple": false,
    "showList": [
      "2",
      "4"
    ],
    "enabled": 1,
    "showType": "3",
    "preset": 1,
    "name": "width",
    "type": "digit",
    "colName": "survey",
    "operationType": "1",
    "order": 24,
    "showField": "part",
    "showValue": "",
    "showFieldPreset": 1,
    "exts": {
      "showValue": [
        [
          "survey-option-6b86b273ff34",
          "survey-option-9bdb2af67992"
        ],
        [
          "survey-option-6b86b273ff34",
          "survey-option-2abaca4911e6"
        ],
        [
          "survey-option-6b86b273ff34",
          "survey-option-38d66d9692ac"
        ],
        [
          "survey-option-6b86b273ff34",
          "survey-option-dbae772db290"
        ],
        [
          "survey-option-d4735e3a265e",
          "survey-option-d29d53701d3c"
        ],
        [
          "survey-option-d4735e3a265e",
          "survey-option-36790ecd55c2"
        ],
        [
          "survey-option-2c624232cdd2"
        ],
        [
          "survey-option-19581e27de7c"
        ],
        [
          "survey-option-ef2d127de37b"
        ]
      ]
    },
    "frontEndConfig": "{}"
  },
  {
    "_id": "synthetic-survey-field-057",
    "required": "0",
    "multiple": false,
    "showList": [
      "4"
    ],
    "enabled": 1,
    "showType": "3",
    "preset": 1,
    "name": "leakageCauseSelect",
    "type": "select",
    "colName": "survey",
    "operationType": "1",
    "order": 57,
    "showField": "part",
    "showValue": "",
    "showFieldPreset": 1,
    "exts": {
      "showValue": [
        [
          "survey-option-6b86b273ff34",
          "survey-option-9bdb2af67992"
        ],
        [
          "survey-option-6b86b273ff34",
          "survey-option-2abaca4911e6"
        ],
        [
          "survey-option-6b86b273ff34",
          "survey-option-38d66d9692ac"
        ],
        [
          "survey-option-6b86b273ff34",
          "survey-option-dbae772db290"
        ],
        [
          "survey-option-d4735e3a265e",
          "survey-option-d29d53701d3c"
        ],
        [
          "survey-option-d4735e3a265e",
          "survey-option-36790ecd55c2"
        ],
        [
          "survey-option-4e07408562be",
          "survey-option-226f76b55acb"
        ],
        [
          "survey-option-4e07408562be",
          "survey-option-88820462180e"
        ],
        [
          "survey-option-2c624232cdd2"
        ],
        [
          "survey-option-19581e27de7c"
        ],
        [
          "survey-option-ef2d127de37b"
        ],
        [
          "survey-option-e7f6c011776e"
        ],
        [
          "survey-option-4b227777d4dd"
        ]
      ]
    },
    "frontEndConfig": "{}"
  },
  {
    "_id": "synthetic-survey-field-058",
    "required": "1",
    "multiple": true,
    "showList": [
      "1",
      "2",
      "4"
    ],
    "enabled": 1,
    "showType": "3",
    "preset": 1,
    "name": "leakageCause",
    "type": "data",
    "colName": "survey",
    "operationType": "1",
    "order": 58,
    "showField": "part",
    "showValue": "",
    "showFieldPreset": 1,
    "exts": {
      "showValue": [
        [
          "survey-option-6b86b273ff34",
          "survey-option-9bdb2af67992"
        ],
        [
          "survey-option-6b86b273ff34",
          "survey-option-2abaca4911e6"
        ],
        [
          "survey-option-6b86b273ff34",
          "survey-option-38d66d9692ac"
        ],
        [
          "survey-option-6b86b273ff34",
          "survey-option-dbae772db290"
        ],
        [
          "survey-option-d4735e3a265e",
          "survey-option-d29d53701d3c"
        ],
        [
          "survey-option-d4735e3a265e",
          "survey-option-36790ecd55c2"
        ],
        [
          "survey-option-4e07408562be",
          "survey-option-226f76b55acb"
        ],
        [
          "survey-option-4e07408562be",
          "survey-option-88820462180e"
        ],
        [
          "survey-option-2c624232cdd2"
        ],
        [
          "survey-option-19581e27de7c"
        ],
        [
          "survey-option-ef2d127de37b"
        ],
        [
          "survey-option-e7f6c011776e"
        ]
      ]
    },
    "frontEndConfig": "{}"
  }
]
const labels: Record<string,string> = { part:'维修部位', width:'宽（m）', leakageCauseSelect:'渗漏原因', leakageCause:'渗漏原因' }
export const normalSurveyMockFields: readonly Record<string, unknown>[] = sourceFields.map(field => ({ ...field,
  tenantId:ids.tenant, extId:ids.definition, state:1, nameDisp:labels[String(field.name)] }))
export const normalSurveyMockNode = { _id:ids.node, tenantId:ids.tenant, workflowId:ids.run,
  workflowFormDataId:ids.work, workflowFormColName:'serviceAppointment', state:0,
  handlerIds:['synthetic-role'], exts:{formList:[{_id:ids.record,formDefId:ids.definition,state:1}]},
  nodeDef:{nodeType:'forms',name:'现场勘察',formDefId:ids.definition,userChoose:['synthetic-role'],
    viewableRoleIds:['synthetic-role'],formFieldIdsFill:[],
    formFieldIdsReadOnly:normalSurveyMockFields.map(field=>String(field._id))} }
export const normalSurveyMockAppointment = { _id:ids.work,tenantId:ids.tenant,workflowId:ids.run,
  workflowRunId:ids.run,state:1,status:'mock-status-onsite',orderNum:'19017',name:'邓先生',
  address:'芍药居北里',district:110105,phone:'13800000017',serviceType:'mock-service-waterproof',
  exts:{sourceType:'mock-source-standard'} }
export const normalSurveyMockDetail = {success:true,status:1,data:{serviceAppointment:normalSurveyMockAppointment,
  workflow:{_id:ids.run,tenantId:ids.tenant,formDataId:ids.work,state:0},workflowNode:[normalSurveyMockNode]}}
const record = {_id:ids.record,tenantId:ids.tenant,sid:ids.work,nodeId:ids.node,
  workflowId:ids.run,extId:ids.definition,state:1,part:['survey-option-6b86b273ff34','survey-option-38d66d9692ac'],width:0,leakageCause:['mock-leakage-cause-roof-1'],exts:{}}

/** Only the existing normal-reader request shapes get synthetic responses. */
export function normalSurveyMockRead(path:string, body:Readonly<Record<string,unknown>>):unknown|null {
  path = path.replace(/\.do$/, '')
  if(path===`basic/serviceAppointment/queryById/${ids.work}`)return normalSurveyMockDetail
  if(path==='biz/ext/queryById'&&body.id===ids.definition&&Object.keys(body).length===1)return{_id:ids.definition,
    tenantId:ids.tenant,state:1,type:'1',colName:'survey'}
  if(path==='biz/extField/query'&&body.extId===ids.definition){
    if(Object.keys(body).length!==6||body.page!==1||body.rows!==50||body['is:state|integer#and']!==1||body.sortField!=='order'||body.sortOrder!=='asc')return null
    return{data:normalSurveyMockFields,total:normalSurveyMockFields.length,page:1,size:50}
  }
  if(path==='i/code/selectMultistageCode'&&Object.keys(body).length===2&&body.types===sourceFields[0]!.valueOption&&body.tenantId===ids.tenant)
    return[{type:body.types,children:[{value:'survey-option-6b86b273ff34',name:'屋面',children:[{value:'survey-option-38d66d9692ac',name:'有保护平屋面',children:[]}]}]}]
  if(path===`biz/extForm/query/${ids.definition}`){
    const owned=Object.keys(body).length===9&&body.sortField==='createTime'&&body.sortOrder==='desc'
      &&body['is:sid|string#and']===ids.work&&body['is:nodeId|string#and']===ids.node
      &&body['is:workflowId|string#and']===ids.run&&body['ne:state|integer#and']===-1
      &&body['is:_id|string#and']===ids.record&&body.page===1&&body.rows===2
    return{data:owned?[record]:[],total:owned?1:0,page:1,size:2,dataCount:owned?1:0}
  }
  return null
}
