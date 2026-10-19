#!/usr/bin/env node
/**
 * Pinned R1 source-to-new-App parity review, NO external calls.
 * This verifies source evidence integrity, executable tests, and HONEST gates.
 * It cannot establish true R1 runtime behavior or server tenant authorization.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const root=process.cwd()
const file=(path)=>readFileSync(resolve(root,path),'utf8')
const arg=process.argv.indexOf('--manifest')
const source=arg<0
  ? 'docs/verification/R1_SIX_STAGE_SOURCE_PARITY_MANIFEST.json'
  : process.argv[arg+1]
const fail=(reason)=>{throw new Error('R1_PARITY_REVIEW_BLOCKED:'+reason)}
const assert=(condition,code)=>{if(!condition)fail(code)}
assert(Boolean(source),'MISSING_MANIFEST')
const m=JSON.parse(file(source))
const front='6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d'
const backend='5fc008d32e771205260f120621c1c4fc62d0824e'
const newAppBase='2c3fa331c31fb48e1a6f7e1f6b0b9b6f949b25e3'
assert(m.schemaVersion===1 && m.scope==='PINNED_R1_SOURCE_TO_NEW_APP_STATIC_AND_SYNTHETIC_ONLY','SCHEMA_AND_SCOPE')
assert(m.r1Frontend?.repository==='xlink-bj/xlink-app' && m.r1Frontend.commit===front,'R1_FRONTEND_PIN')
assert(m.r1Backend?.repository==='xlink-bj/xlink-cloud-backend' && m.r1Backend.commit===backend,'R1_BACKEND_PIN')
assert(m.newAppParent?.repository==='xlink-bj/xlink-technician-app' && m.newAppParent.commit===newAppBase,'APP_PARENT_PIN')
assert(m.observedDate==='2026-10-19','EVIDENCE_DATE_PIN')
const gate=m.acceptance??{}
const requiredHolds={
  formalM1Iterations:'1/8',
  mainMerge:'NOT_APPROVED',
  productionRead:'NOT_AUTHORIZED_BY_THIS_AUDIT',
  productionWrite:'NOT_APPROVED',
  backendTenantACL:'NOT_VERIFIED',
  skuSourcePrice:'NOT_VERIFIED',
  officialOrderTypeOneRealReadback:'NOT_VERIFIED',
  backendSignedContract:'NOT_VERIFIED',
  physicalMpWeixin:'NOT_RUN',
  physicalApp:'NOT_RUN',
  realR1Parity:'NOT_VERIFIED',
}
for(const [name,value] of Object.entries(requiredHolds))assert(gate[name]===value,'UNAUTHORIZED_GATE_PROMOTION:'+name)

const originalSources={
  login: {'business/subpackages/login/loginAuth.vue':'2425a3a6c39ff32629736cc89f2b77193eacf186'},
  work_orders:{
    'business/pages/serviceAppointment/serviceAppointments.vue':'dbdad9e07d72ed5e395803aa3c07e78b390370c4',
    'business/subpackages/serviceAppointment/serviceAppointment.vue':'466cdbfb26850fae13149ef05b22740e93aed9be',
  },
  appointment: {'business/subpackages/serviceAppointment/serviceAppointment.vue':'466cdbfb26850fae13149ef05b22740e93aed9be'},
  survey: {'business/subpackages/serviceAppointment/serviceAppointment.vue':'466cdbfb26850fae13149ef05b22740e93aed9be'},
  quotation: {'business/subpackages/order/placeOrders.vue':'b8d8cad48783397eea907f6bb0c6f42e05673cc7'},
  signing: {'business/subpackages/serviceAppointment/serviceAppointment.vue':'466cdbfb26850fae13149ef05b22740e93aed9be'},
}
const backendOriginalSources={
  survey:{
    'src/main/java/com/fsgo/service/biz/ExtFormServiceImpl.java':'3f6a8f6c546c0cbcd2fdb9f3fd7442dac3062be6',
    'src/main/java/com/fsgo/entity/basic/Survey.java':'a65e7390af36973f317388a10624f8f103f50e9f',
  },
  quotation:{
    'src/main/java/com/fsgo/service/biz/GoodsServiceImpl.java':'09f7fe784418e901d60e50e549987e40395b8c31',
  },
}
const expectedIds=['login','work_orders','appointment','survey','quotation','signing']
const stageRefs={
  login:['L01','L02','L03','L04'],
  work_orders:['W00','W02','W03','W04','W05'],
  appointment:['A01','A02','A03','A04'],
  survey:['S01','S02','S03','S04'],
  quotation:['Q01','Q02','Q03','Q04','Q05','Q06'],
  signing:['C01','C02','C03','C04'],
}
assert(Array.isArray(m.stages)&&m.stages.length===6,'SIX_STAGES')
const originalLedger=file('docs/verification/M1_I1_R1_SIX_STAGE_PARITY_LEDGER.md')
let allTests=[]
for(const [idx,id] of expectedIds.entries()){
  const stage=m.stages[idx]
  assert(stage?.id===id && stage.liveParity==='NOT_VERIFIED','STAGE_OR_LIVE_PARITY:'+id)
  assert(stage.codeEvidence!=='VERIFIED' && /^(PARTIAL|SOURCE_LINKED)/.test(stage.codeEvidence),'UNAUTHORIZED_CODE_PARITY:'+id)
  assert(JSON.stringify(stage.i1Refs)===JSON.stringify(stageRefs[id]),'ORIGINAL_I1_REFERENCES:'+id)
  assert(stage.i1Refs.every(r=>originalLedger.includes('| '+r+' ')),'MISSING_ORIGINAL_R1_LEDGER:'+id)
  assert(typeof stage.simulatorGoal==='string'&&stage.simulatorGoal.length>=12,'SIMULATOR_ACTION:'+id)
  assert(Array.isArray(stage.confirmedOpenGaps)&&stage.confirmedOpenGaps.length>=2,'GAP_DETAILS:'+id)
  assert(Array.isArray(stage.appPaths)&&stage.appPaths.length>=2,'APP_SOURCE:'+id)
  for(const path of stage.appPaths)assert(path.startsWith('src/') && existsSync(resolve(root,path)),'APP_PATH_MISSING:'+path)
  assert(Array.isArray(stage.tests)&&stage.tests.length>=2,'BEHAVIOR_TESTS:'+id)
  for(const path of stage.tests){
    assert(path.startsWith('tests/') && path.endsWith('.test.ts')&&existsSync(resolve(root,path)),'TEST_PATH_MISSING:'+path)
    const content=file(path)
    assert(/\b(?:it|test)(?:\.each)?\s*\(/.test(content)&&/\bexpect\s*\(/.test(content),'NO_EXECUTABLE_ASSERTIONS:'+path)
    allTests.push(path)
  }
  assert(Array.isArray(stage.r1Evidence)&&stage.r1Evidence.length>=1,'SOURCE_ANCHOR:'+id)
  const allowed=originalSources[id]
  for(const x of stage.r1Evidence){
    assert(Object.hasOwn(allowed,x.path)&&allowed[x.path]===x.blob,'UNPINNED_OR_CHANGED_R1_BLOB:'+id)
    assert(Number.isInteger(x.from)&&x.from>1&&Number.isInteger(x.to)&&x.to>=x.from&&x.to-x.from<=150,'UNBOUNDED_R1_LINE_RANGE:'+id)
    assert(typeof x.fact==='string'&&x.fact.length>=25,'MISSING_BUSINESS_SOURCE_FACT:'+id)
  }
}
const appointment=m.stages[2]
assert(appointment.r1Evidence.some(e=>e.fact.includes('saveOnly'))
  && appointment.r1Evidence.some(e=>e.fact.includes('dataStr:JSON.stringify(params)'))
  && appointment.r1Evidence.some(e=>e.fact.includes('workflow/process'))
  && appointment.confirmedOpenGaps.some(e=>e.includes('datetime')),
  'APPOINTMENT_SAVE_WIRE_OR_WORKFLOW_GAP_SILENCED')
for(const id of ['survey','quotation']){
  const stage=m.stages[expectedIds.indexOf(id)]
  const pins=backendOriginalSources[id]
  const records=stage.r1BackendEvidence
  assert(Array.isArray(records)&&records.length===Object.keys(pins).length,
    'MISSING_BACKEND_SOURCE_PROOF:'+id)
  assert(new Set(records.map(x=>x.path)).size===records.length,'DUPLICATED_BACKEND_SOURCE:'+id)
  for(const x of records){
    assert(Object.hasOwn(pins,x.path)&&pins[x.path]===x.blob,'UNPINNED_BACKEND_BLOB:'+id)
    assert(Number.isInteger(x.from)&&x.from>0&&Number.isInteger(x.to)
      &&x.to>=x.from&&x.to-x.from<=150,'UNBOUNDED_BACKEND_LINES:'+id)
    assert(typeof x.fact==='string'&&x.fact.length>=45,'UNEXPLAINED_BACKEND_SIDE_EFFECT:'+id)
  }
}
assert(m.stages[3].r1BackendEvidence.some(x=>x.fact.includes('SLA')
    && x.fact.includes('ServiceAppointment')&&x.fact.includes('Survey')),
    'SURVEY_TYPED_SIDE_EFFECT_SILENCED')
assert(m.stages[4].r1BackendEvidence.some(x=>x.fact.includes('form=mini')
    && x.fact.includes('sourceType')&&x.fact.includes('tenantId')),
    'CATALOG_PRICE_CONTEXT_SILENCED')
const q=m.stages[4]
assert(q.r1Evidence.length===3&&q.r1Evidence.some(e=>e.fact.includes('creatQuotation'))
  && q.r1Evidence.some(e=>e.fact.includes('upsert'))
  && q.r1Evidence.some(e=>e.fact.includes('type=0')&&e.fact.includes('type=1')),'QUOTE_AND_OFFICIAL_ORDER_CONFLATED')
const sign=m.stages[5]
assert(sign.r1Evidence.some(e=>e.fact.includes('serviceAppointmentId'))
 && sign.r1Evidence.some(e=>e.fact.includes('type=1')&&e.fact.includes('电子签约')),'CONTRACT_IDENTITY_OR_SIGNING_SIDE_EFFECT')
const login=m.stages[0]
assert(login.confirmedOpenGaps.some(x=>x.includes('协议')),'R1_CONSENT_GAP_SILENCED')
const simulator=m.simulator
const pathCheck=(name)=>typeof name==='string' && existsSync(resolve(root,name))
assert(simulator.kind==='CREDENTIAL_FREE_SYNTHETIC_PREVIEW_ONLY','SIMULATOR_MUST_BE_OFFLINE')
assert(pathCheck(simulator.mainH5Test)&&pathCheck(simulator.playwrightConfig),'H5_SIMULATOR_EVIDENCE')
assert(simulator.unitCriticalCommand==='pnpm verify:critical'
 && simulator.fullCommand==='pnpm verify:full'
 && simulator.localMpCommand==='pnpm dev:mp-weixin','LOCAL_CODEX_COMMANDS')
assert(JSON.stringify(simulator.bundleCommands)===JSON.stringify(['pnpm build:h5','pnpm build:mp-weixin','pnpm build:app']),'PLATFORM_BUILDS')
const browser=file(simulator.mainH5Test)
assert(browser.includes("page.route('**/*'") && browser.includes("route.abort('blockedbyclient')"),
  'BROWSER_EXTERNAL_NETWORK_NOT_BLOCKED')
assert(browser.includes('no real') || browser.includes('never') || browser.includes('NEVER'),
  'SYNTHETIC_CONTEXT_MISSING')
const i8=JSON.parse(file('docs/verification/M1_I8_ACCEPTANCE_MANIFEST.json'))
assert(i8.formalAcceptedIterations===1&&i8.totalIterations===8&&i8.finalBusinessRelease==='NOT_APPROVED','I8_REVIEW_MISMATCH')
assert(i8.phases.length===6&&i8.phases.every((p,i)=>p.id===expectedIds[i]&&p.realBusinessParity==='NOT_VERIFIED'),'I8_REAL_PARITY_PROMOTED')
const result={
  state:'R1_SOURCE_GROUNDED_SYNTHETIC_ENGINEERING_ONLY',
  sourcePins:{frontend:front,backend},
  stages:expectedIds,
  frozenEvidenceAnchors:m.stages.reduce((a,s)=>a+s.r1Evidence.length+(s.r1BackendEvidence?.length??0),0),
  linkedBehaviorTests:new Set(allTests).size,
  distinctR1Writes:['type0:basic/order/creatQuotation','type1:basic/order/upsert',
    'signing:signature/applyForElectronicSignature'],
  openIntegrationGates:requiredHolds,
  formalBusinessParity:'NOT_VERIFIED',
  simulator:'SYNTHETIC_ONLY_NOT_DEVICE_PASS',
}
const o=process.argv.indexOf('--output')
if(o>=0){
  const out=process.argv[o+1]
  assert(typeof out==='string'&&out.startsWith('.review/r1-parity/')&&!out.includes('..'),'UNSAFE_OUTPUT')
  mkdirSync(dirname(resolve(root,out)),{recursive:true})
  writeFileSync(resolve(root,out),JSON.stringify(result,null,2)+'\n')
}
process.stdout.write(JSON.stringify({state:result.state,stages:6,anchors:result.frozenEvidenceAnchors,
 tests:result.linkedBehaviorTests,live:result.formalBusinessParity})+'\n')
