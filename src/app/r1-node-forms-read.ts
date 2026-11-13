import {decodeR1ScopedJson} from '@adapters/api/r1-scoped-json'
import {bindR1ConfiguredFileReadDisplay} from '@shared/form/r1-configured-file-read-evidence'
import type {R1FileCreateStorage} from '@shared/form/r1-file-create-storage'
import {configuredFileSource} from './r1-survey-media-source'
import { configuredRecordEditStorage, recordEditAuditProjection } from './r1-record-edit-source'
import {configuredFileStorage,assertConfiguredFileOriginal,createConfiguredFileCodec} from '@adapters/api/r1-configured-file-storage'
import {surveyMediaSourceSeal} from './r1-survey-media-source'
import {assertSurveyMediaOriginal} from '@features/work-orders/r1-survey-media-create'
import {createSurveyCreateMediaCodec} from '@adapters/api/survey-create-media-codec'
import { isR1DefaultImageFieldConfig } from '@shared/form/r1-normal-image-contract'
import { conditionalSurveySourceSeal } from './r1-survey-conditional-source'
import { appointmentReplacementContextFromRead, appointmentReplacementProblem } from '@shared/form/appointment-replacement-context'
import type { AuthSessionPort, TechnicianApiReadPort, FormFieldRead, FormDefinitionRead, WorkflowNodeRead } from '@shared/ports'
import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createR1ScopedFormReader } from '@adapters/api/r1-scoped-form-read'
import { createSurveyReadOnlyMediaCodec } from '@adapters/api/survey-readonly-media-codec'
import { bindR1ScopedFieldOptions, readR1ScopedFieldOptions } from '@adapters/api/r1-scoped-field-options'
import { formDefinition } from '@adapters/api/read-models/form'
import { workflowNode } from '@adapters/api/read-models/workflow'
import { evaluateNodeVisibility } from '@runtimes/workflow/policy'
import { isFieldApplicable } from '@runtimes/dynamic-form'
import { ACTION_FORM_SURFACE, actionFormSchemaFor } from '@features/work-orders/action-form-schema'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { asOpaqueId } from '@shared/types'
import type { R1NodeFormsReader, R1NodeFormsSnapshot, R1GenericMapRouteRead, R1RecordEditRead } from '@features/work-orders/r1-node-forms-read'
import { parseR1RepeatGrant } from './r1-repeat-authorization'
import { parseR1FormsGrant } from './r1-forms-authorization'
import { assertSurveyLeakageCauseReadValue } from '@features/work-orders/survey-leakage-cause'
import { createNormalR1FileCodec } from '@adapters/api/normal-r1-file-codec'

type Row = Record<string, unknown>
const deny = (): never => { throw Error('当前表单的身份、关联或完整性无法核实，请重新读取工单。') }
const row = (v: unknown): Row => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : deny()
const id = (v: unknown): string => typeof v === 'string' && v.trim() === v && v.length > 0 ? v : deny()
// Keep complete EXTS transient. The display projection deliberately drops
// unknown keys, so comparing that projection cannot establish read stability.
function formsExtsJson(value: unknown): string {
  const validate = (v: unknown): void => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return
    if (typeof v === 'number' && Number.isFinite(v)) return
    if (Array.isArray(v)) { for (const item of v) validate(item); return }
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      for (const item of Object.values(v)) validate(item)
      return
    }
    deny()
  }
  row(value); validate(value)
  return JSON.stringify(value)
}

/** R1 getFormData copies every EXTS key over the root (pinned
 * serviceAppointment.vue:7014-7017). The display mapper cannot represent an
 * object as a scalar/choice value; neither an explicit EXTS value nor a root
 * fallback may silently disappear or expose an older copy. Check the effective
 * own slot before using the lossy display projection.
 * Limit this check to this rollout's supported mobile Survey read fields.
 * Unknown audit JSON and unsupported/presentation fields remain untouched. */
export function assertSurveyReadExtsValues(definition: FormDefinitionRead, original: Row): void {
  if (definition.purpose !== 'survey') return
  assertSurveyLeakageCauseReadValue({ purpose: definition.purpose,
    definitionId: definition.id, fields: definition.fields ?? [] }, original)
  const supported = new Set(['text', 'textarea', 'phone', 'IDNumber', 'number', 'digit', 'date', 'time', 'datetime', 'switch', 'rate', 'select', 'radio', 'checkbox', 'cascade'])
  const fields = (definition.fields ?? []).filter(field => supported.has(field.type) && !field.unsupportedReason
    && !field.presentationOnly && isFieldApplicable(actionFormSchemaFor(field), ACTION_FORM_SURFACE))
  if (!fields.length) return
  const exts = original.exts == null ? undefined : row(original.exts)
  const scalar = (value: unknown): boolean => typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  for (const field of fields) {
    const effective = exts && Object.hasOwn(exts, field.valueKey) ? exts : original
    if (!Object.hasOwn(effective, field.valueKey)) continue
    const value = effective[field.valueKey]
    if (!(value === null || scalar(value) || (Array.isArray(value) && value.every(scalar)))) deny()
  }
}

/** Explicit local read rollout, not a synthetic record/node adapter. Production stays closed. */
export function normalNodeFormsReadEnabled(env: Record<string, unknown>, origin: string): boolean {
  const readonlyMode = env.VITE_XLINK_ENABLE_REAL_WRITES === 'false' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'false'
  const scopedWriteMode = env.VITE_XLINK_R1_REPEAT_ACTIONS === 'true'
    && env.VITE_XLINK_ENABLE_REAL_WRITES === 'true' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'true'
    && parseR1RepeatGrant(env.VITE_XLINK_R1_REPEAT_GRANT)?.scope.tenantId === env.VITE_XLINK_AUTH_TENANT
  const scopedFormsMode = env.VITE_XLINK_R1_FORMS_ACTIONS === 'true'
    && env.VITE_XLINK_ENABLE_REAL_WRITES === 'true' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'true'
    && parseR1FormsGrant(env.VITE_XLINK_R1_FORMS_GRANT)?.scope.tenantId === env.VITE_XLINK_AUTH_TENANT
  return env.DEV === true && env.VITE_XLINK_R1_NODE_FORM_READ === 'true'
    && env.VITE_XLINK_ENVIRONMENT === 'dev'
    && origin === 'http://127.0.0.1:5189'
    && env.VITE_XLINK_API_BASE_URL === `${origin}/xlink/wm`
    && (readonlyMode || scopedWriteMode || scopedFormsMode)
    && env.VITE_XLINK_MOCK === 'false'
    && env.VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS !== 'true'
    && (env.VITE_XLINK_AUTH_API_BASE_URL === undefined || env.VITE_XLINK_AUTH_API_BASE_URL === '')
    && env.VITE_XLINK_H5_MOCK_E2E !== 'true'
}

export function createNormalNodeFormsReader(input: {
  readonly auth: Pick<AuthSessionPort, 'getCurrentSession'>
  readonly read: Pick<TechnicianApiReadPort, 'listWorkOrders' | 'isWorkOrderListedForCurrentSession' | 'getDynamicCodeOptions'>
  /** Same tenant used by this application's real login request. Never a route parameter. */
  readonly tenantId: string
  readonly env: Record<string, unknown>
  readonly origin: string
  readonly transport?: ApiReadTransport
}): R1NodeFormsReader {
  const transport = input.transport ?? createUniApiReadTransport({
    apiBaseUrl: String(input.env.VITE_XLINK_API_BASE_URL),
    getSessionRef: () => input.auth.getCurrentSession()?.sessionRef ?? null,
  })
  let generation = 0
  let current: { snapshot: R1NodeFormsSnapshot; fingerprint: string; formsExts?: string;
    editStorage?: R1FileCreateStorage; editSeal?: string; editSnapshotSeal?: string; editIds?: readonly string[]; editGrantSeal?: string;
    editWires?: ReadonlyMap<string,string>;
    originals: ReadonlyMap<string, string>; formsCreateRoute?: Omit<R1GenericMapRouteRead,'recordId'|'original'>; genericRoute?: Omit<R1GenericMapRouteRead, 'recordId' | 'original'>;
    schemaAtRead: string; configuredFileStorage?:R1FileCreateStorage; surveyMediaSeal?:string; surveyMediaSnapshotSeal?:string; conditionalSurveySeal?: string; conditionalSnapshotSeal?: string; appointmentRoute?: true; appointmentSeal?: string; fileRoute?: Omit<R1GenericMapRouteRead, 'recordId' | 'original'> } | null = null
  const fileDisplayChecks=new WeakMap<object,()=>boolean>()
  const editReads = new WeakMap<object, { snapshot: R1NodeFormsSnapshot; id: string; raw: string; wire: string; seal: string }>()
  const revokedEdits = new WeakSet<object>()
  const editSnapshotSeal = (s: R1NodeFormsSnapshot) => JSON.stringify([s.workOrderId,s.node,s.definition,s.fillableFieldIds,s.records])
  const liveEdit = (s: R1NodeFormsSnapshot, id: string) => {
    const valid = !revokedEdits.has(s) && current?.snapshot === s && current.editStorage
    && input.env.VITE_XLINK_R1_REPEAT_ACTIONS==='true'
    && JSON.stringify(parseR1RepeatGrant(input.env.VITE_XLINK_R1_REPEAT_GRANT))===current.editGrantSeal
    && current.editIds?.includes(id) && fingerprint() === current.fingerprint && schemaIdentity(s) === current.schemaAtRead
    && editSnapshotSeal(s) === current.editSnapshotSeal && input.read.isWorkOrderListedForCurrentSession?.(s.workOrderId) === true
    if(!valid)revokedEdits.add(s)
    return valid ? current : null
  }
  const surveyMediaReads=new WeakMap<object,{snapshot:R1NodeFormsSnapshot;fingerprint:string;seal:string;snapshotSeal:string;storage?:R1FileCreateStorage}>()
  const mediaSnapshotSeal=(s:R1NodeFormsSnapshot)=>JSON.stringify([s.workOrderId,s.node,s.definition,s.fillableFieldIds,s.records])
  const revokedSurveyMedia=new WeakSet<object>()
  const liveSurveyMedia=(s:R1NodeFormsSnapshot)=>{
    if(revokedSurveyMedia.has(s))return null
    if(current?.surveyMediaSeal&&current.snapshot===s&&fingerprint()===current.fingerprint
      &&input.read.isWorkOrderListedForCurrentSession?.(s.workOrderId)===true&&current.surveyMediaSnapshotSeal===mediaSnapshotSeal(s))return current
    revokedSurveyMedia.add(s);return null
  }
  const conditionalSurveyReads = new WeakMap<object, {snapshot:R1NodeFormsSnapshot; fingerprint:string; seal:string; snapshotSeal:string}>()
  const conditionalSnapshotSeal = (snapshot:R1NodeFormsSnapshot) => JSON.stringify([snapshot.workOrderId,snapshot.node,snapshot.definition,snapshot.fillableFieldIds,snapshot.records])
  const conditionalSurveyCurrent = (snapshot:R1NodeFormsSnapshot) => current?.conditionalSurveySeal
    && current.snapshot===snapshot && fingerprint()===current.fingerprint
    && input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId)===true
    && conditionalSnapshotSeal(snapshot)===current.conditionalSnapshotSeal ? current : null
  const appointmentReads = new WeakMap<object, {snapshot:R1NodeFormsSnapshot; fingerprint:string; schema:string; raw:string; recordId:string}>()
  const appointmentCurrent = (snapshot:R1NodeFormsSnapshot, recordId:string) => {
    if(!current?.appointmentRoute || current.snapshot!==snapshot || fingerprint()!==current.fingerprint
      || JSON.stringify([snapshot.workOrderId,schemaIdentity(snapshot)])!==current.appointmentSeal
      || schemaIdentity(snapshot)!==current.schemaAtRead || input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId)!==true
      || JSON.stringify(snapshot.records.map(r=>r.id))!==JSON.stringify([...current.originals.keys()])
      || !current.originals.has(recordId))return null
    return current
  }
  const revokedFormsCreate=new WeakSet<object>()
  const issuedFormsCreate=new WeakMap<object,{snapshot:R1NodeFormsSnapshot;seal:string}>()
  const liveFormsCreate=(s:R1NodeFormsSnapshot)=>{
    const valid=!revokedFormsCreate.has(s)&&current?.snapshot===s&&Boolean(current.formsCreateRoute)&&fingerprint()===current.fingerprint
      &&schemaIdentity(s)===current.schemaAtRead&&JSON.stringify(s.records.map(r=>r.id))===JSON.stringify([...current.originals.keys()])&&input.read.isWorkOrderListedForCurrentSession?.(s.workOrderId)===true
    if(!valid)revokedFormsCreate.add(s)
    return valid?current:null
  }
  const issuedFileRoutes = new WeakMap<object, { snapshot:R1NodeFormsSnapshot; fingerprint:string; schema:string }>()
  const issuedRoutes = new WeakMap<object, { snapshot: R1NodeFormsSnapshot; recordId: string;
    fingerprint: string; schemaAtRead: string; raw: string; original: Readonly<Record<string, unknown>> }>()
  const schemaIdentity = (snapshot: R1NodeFormsSnapshot) => JSON.stringify([snapshot.node,
    snapshot.definition,snapshot.fillableFieldIds])
  const liveRoute = (snapshot: R1NodeFormsSnapshot, recordId: string) => {
    if (!current?.genericRoute || current.snapshot !== snapshot || fingerprint() !== current.fingerprint
      || input.read.isWorkOrderListedForCurrentSession?.(current.genericRoute.workOrderId) !== true
      || schemaIdentity(snapshot) !== current.schemaAtRead
      || snapshot.workOrderId !== current.genericRoute.workOrderId || snapshot.node.id !== current.genericRoute.runtimeNodeId
      || snapshot.node.runId !== current.genericRoute.workflowRunId || snapshot.definition.id !== current.genericRoute.formDefinitionId
      || !current.originals.has(recordId)) return null
    return current
  }
  const enabled = () => normalNodeFormsReadEnabled(input.env, input.origin)
  const fingerprint = () => {
    const a = input.auth.getCurrentSession()
    return enabled() && a ? sessionAuthorizationFingerprint({ sessionRef: a.sessionRef,
      userId: a.user.id, roleId: a.currentRole?.id, roleVersion: a.roleVersion }) : null
  }
  let viewEpoch = 0
  const api:R1NodeFormsReader = {
    enabled,
    clear() { viewEpoch++; generation++; current = null },
    beginSurveyMediaRead(snapshot,evidence){
      if(api.isCurrentSurveyMediaSource?.(snapshot,evidence)!==true)return deny()
      const ticket=generation+1
      const result=api.load(snapshot.workOrderId,String(snapshot.node.id)).catch(error=>{revokedSurveyMedia.add(snapshot);throw error})
      return Object.freeze({result,isCurrent(){
        const valid=generation===ticket&&api.isSurveyMediaSourceIntact?.(snapshot,evidence)===true
        if(!valid)revokedSurveyMedia.add(snapshot)
        return valid
      }})
    },
    isSurveyMediaSourceIntact(snapshot,evidence){
      if(!evidence||typeof evidence!=='object')return false
      const stamp=surveyMediaReads.get(evidence)
      const valid=Boolean(stamp&&stamp.snapshot===snapshot&&!revokedSurveyMedia.has(snapshot)&&stamp.fingerprint===fingerprint()
        &&stamp.snapshotSeal===mediaSnapshotSeal(snapshot)&&input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId)===true)
      if(stamp&&!valid)revokedSurveyMedia.add(snapshot)
      return valid
    },
    currentSurveyMediaSource(snapshot){
      const live=liveSurveyMedia(snapshot);if(!live)return null
      const evidence=Object.freeze({});surveyMediaReads.set(evidence,{snapshot,fingerprint:live.fingerprint,seal:live.surveyMediaSeal!,snapshotSeal:live.surveyMediaSnapshotSeal!,storage:live.configuredFileStorage});return evidence
    },
    isCurrentSurveyMediaSource(snapshot,evidence){
      if(!evidence||typeof evidence!=='object')return false
      const live=liveSurveyMedia(snapshot),stamp=surveyMediaReads.get(evidence)
      return Boolean(live&&stamp&&stamp.snapshot===snapshot&&stamp.fingerprint===live.fingerprint&&stamp.seal===live.surveyMediaSeal&&stamp.snapshotSeal===live.surveyMediaSnapshotSeal)
    },
    currentConfiguredFileStorage(snapshot,evidence){
      if(api.isCurrentSurveyMediaSource?.(snapshot,evidence)!==true||!evidence||typeof evidence!=='object')return null
      return surveyMediaReads.get(evidence)?.storage??null
    },
    sameConfiguredFileSource(previous,prior,fresh,next){
      if(api.isSurveyMediaSourceIntact?.(previous,prior)!==true||api.isCurrentSurveyMediaSource?.(fresh,next)!==true
        ||!prior||typeof prior!=='object'||!next||typeof next!=='object')return false
      const a=surveyMediaReads.get(prior),b=surveyMediaReads.get(next)
      return Boolean(a?.storage&&b?.storage&&a.seal===b.seal)
    },
    currentSurveyConditionalSource(snapshot) {
      const source=conditionalSurveyCurrent(snapshot);if(!source)return null
      const evidence=Object.freeze({})
      conditionalSurveyReads.set(evidence,{snapshot,fingerprint:source.fingerprint,seal:source.conditionalSurveySeal!,snapshotSeal:source.conditionalSnapshotSeal!})
      return evidence
    },
    isCurrentSurveyConditionalSource(snapshot,evidence) {
      if(!evidence||typeof evidence!=='object')return false
      const source=conditionalSurveyCurrent(snapshot),stamp=conditionalSurveyReads.get(evidence)
      return Boolean(source&&stamp&&stamp.snapshot===snapshot&&stamp.fingerprint===source.fingerprint
        &&stamp.seal===source.conditionalSurveySeal&&stamp.snapshotSeal===source.conditionalSnapshotSeal)
    },
    currentRepeatAppointment(snapshot,recordId) {
      const source=appointmentCurrent(snapshot,recordId);if(!source)return null
      const raw=source.originals.get(recordId)!,original=JSON.parse(raw) as Row
      const context=appointmentReplacementContextFromRead(original,{definitionId:snapshot.definition.id,dataId:recordId,workflowRunId:snapshot.node.runId})
      if(appointmentReplacementProblem({definitionId:snapshot.definition.id,dataId:recordId,workflowRunId:snapshot.node.runId,
        workOrderId:snapshot.workOrderId,workflowNodeId:snapshot.node.id,appointmentReplacement:context},true))return null
      const evidence=Object.freeze({original,appointmentReplacement:context})
      appointmentReads.set(evidence,{snapshot,recordId,raw,fingerprint:source.fingerprint,schema:source.schemaAtRead});return evidence
    },
    isCurrentRepeatAppointment(snapshot,recordId,evidence) {
      if(!evidence || typeof evidence!=='object')return false
      const stamp=appointmentReads.get(evidence),source=appointmentCurrent(snapshot,recordId)
      if(!stamp||!source||stamp.snapshot!==snapshot||stamp.recordId!==recordId||stamp.fingerprint!==source.fingerprint
        ||stamp.schema!==source.schemaAtRead||stamp.raw!==source.originals.get(recordId))return false
      try{return formsExtsJson((evidence as {original:Row}).original)===stamp.raw}catch{return false}
    },
    currentFormsCreateRoute(snapshot){
      const live=liveFormsCreate(snapshot);if(!live?.formsCreateRoute)return null
      const evidence=Object.freeze({...live.formsCreateRoute});issuedFormsCreate.set(evidence,{snapshot,seal:live.schemaAtRead});return evidence
    },
    isCurrentFormsCreateRoute(snapshot,evidence){
      const live=liveFormsCreate(snapshot),stamp=evidence&&typeof evidence==='object'?issuedFormsCreate.get(evidence):undefined
      return Boolean(live&&stamp&&stamp.snapshot===snapshot&&stamp.seal===live.schemaAtRead)
    },
    currentNormalFileRoute(snapshot) {
      if(!current?.fileRoute || current.snapshot!==snapshot || fingerprint()!==current.fingerprint
        || snapshot.workOrderId!==current.fileRoute.workOrderId
        || JSON.stringify(snapshot.records.map(record=>record.id))!==JSON.stringify([...current.originals.keys()])
        || schemaIdentity(snapshot)!==current.schemaAtRead
        || input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId)!==true)return null
      const evidence=Object.freeze({...current.fileRoute})
      issuedFileRoutes.set(evidence,{snapshot,fingerprint:current.fingerprint,schema:current.schemaAtRead})
      return evidence
    },
    isCurrentNormalFileRoute(snapshot,evidence) {
      if(!evidence || typeof evidence!=='object' || !current?.fileRoute)return false
      const stamp=issuedFileRoutes.get(evidence)
      return Boolean(stamp && current.snapshot===snapshot && stamp.snapshot===snapshot
        && snapshot.workOrderId===current.fileRoute.workOrderId
        && JSON.stringify(snapshot.records.map(record=>record.id))===JSON.stringify([...current.originals.keys()])
        && fingerprint()===current.fingerprint && stamp.fingerprint===current.fingerprint
        && stamp.schema===current.schemaAtRead && schemaIdentity(snapshot)===stamp.schema
        && input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId)===true)
    },
    isCurrent(snapshot) { return (fileDisplayChecks.get(snapshot)?.()??true) && current?.snapshot === snapshot && (!current.surveyMediaSeal||Boolean(liveSurveyMedia(snapshot))) && fingerprint() === current.fingerprint
      && input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId) === true },
    currentFormsExts(snapshot) {
      return current?.snapshot === snapshot && fingerprint() === current.fingerprint
        && input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId) === true && current.formsExts
        ? JSON.parse(current.formsExts) as Record<string, unknown> : null
    },
    retainReadIdentity(snapshot) {
      if (!api.isCurrent(snapshot)) return null
      const identity = fingerprint(), epoch = viewEpoch
      let intact = Boolean(identity)
      return Object.freeze({ isSameActor() {
        intact = intact && viewEpoch === epoch && fingerprint() === identity
          && input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId) === true
        return intact
      } })
    },
    currentFormOriginal(snapshot, recordId) {
      const raw = current?.snapshot === snapshot && fingerprint() === current.fingerprint
        && input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId) === true
        ? current.originals.get(recordId) : undefined
      return raw ? JSON.parse(raw) as Record<string, unknown> : null
    },
    currentRecordEdit(snapshot, recordId) {
      const source = liveEdit(snapshot,recordId), raw = source?.originals.get(recordId)
      const wire=source?.editWires?.get(recordId)
      if (!source?.editStorage || !source.editSeal || !raw || !wire) return null
      const original=JSON.parse(raw) as Row,wireOriginal=JSON.parse(wire) as Row
      const projectedAuditDateKeys=recordEditAuditProjection(original,wireOriginal)
      if(!projectedAuditDateKeys)return null
      const evidence: R1RecordEditRead = Object.freeze({ storage: source.editStorage, sourceSeal: source.editSeal,
        original,wireOriginal,projectedAuditDateKeys })
      editReads.set(evidence,{snapshot,id:recordId,raw,wire,seal:source.editSeal});return evidence
    },
    isCurrentRecordEdit(snapshot, recordId, evidence) {
      const source=liveEdit(snapshot,recordId), stamp=evidence&&typeof evidence==='object'?editReads.get(evidence):undefined
      if(!source||!stamp||stamp.snapshot!==snapshot||stamp.id!==recordId||stamp.seal!==source.editSeal
        ||source.originals.get(recordId)!==stamp.raw||source.editWires?.get(recordId)!==stamp.wire)return false
      try{return formsExtsJson((evidence as R1RecordEditRead).original)===stamp.raw
        &&formsExtsJson((evidence as R1RecordEditRead).wireOriginal)===stamp.wire
        &&JSON.stringify((evidence as R1RecordEditRead).projectedAuditDateKeys)===JSON.stringify(recordEditAuditProjection((evidence as R1RecordEditRead).original,(evidence as R1RecordEditRead).wireOriginal))
        &&JSON.stringify((evidence as R1RecordEditRead).storage)===JSON.stringify(source.editStorage)
        &&(evidence as R1RecordEditRead).sourceSeal===stamp.seal}catch{return false}
    },
    currentGenericMapRoute(snapshot, recordId) {
      const source=liveRoute(snapshot,recordId)
      if(!source?.genericRoute)return null
      const raw=source.originals.get(recordId)!,original=JSON.parse(raw) as Record<string,unknown>
      const evidence=Object.freeze({...source.genericRoute,recordId,original})
      issuedRoutes.set(evidence,{snapshot,recordId,fingerprint:source.fingerprint,schemaAtRead:source.schemaAtRead,raw,original})
      return evidence
    },
    isCurrentGenericMapRoute(snapshot,recordId,evidence) {
      if(!evidence || typeof evidence!=='object')return false
      const stamp=issuedRoutes.get(evidence),source=liveRoute(snapshot,recordId)
      if(!stamp || !source || stamp.snapshot!==snapshot || stamp.recordId!==recordId
        || stamp.fingerprint!==source.fingerprint || stamp.schemaAtRead!==source.schemaAtRead
        || source.originals.get(recordId)!==stamp.raw || (evidence as R1GenericMapRouteRead).original!==stamp.original)return false
      try{return formsExtsJson(stamp.original)===stamp.raw}catch{return false}
    },
    async confirmFormsCompletion(snapshot) {
      const identity = fingerprint(), ticket = generation
      const check = () => {
        if (!identity || fingerprint() !== identity || ticket !== generation || current?.snapshot !== snapshot
          || input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId) !== true
          || snapshot.node.sourceNodeType !== 'forms') deny()
      }
      check()
      // Expected IDs and business values come from the private, exact-read
      // originals, not a mutable display projection or the Process ACK.
      const businessKeys=(snapshot.definition.fields??[]).map(field=>field.valueKey)
      if(!current!.originals.size || !businessKeys.length || new Set(businessKeys).size!==businessKeys.length) return deny()
      const slot=(record:Row|undefined,key:string)=>{
        if(!record || !Object.hasOwn(record,key))return {present:false as const}
        const value=record[key]
        // This rollout supports scalar business fields only. In particular an
        // explicit invalid EXTS value must never disappear into root fallback.
        if(!(value===null || typeof value==='string' || typeof value==='boolean'
          || (typeof value==='number'&&Number.isFinite(value))))return deny()
        return {present:true as const,value}
      }
      const businessState=(raw:unknown)=>{
        const record=row(raw),exts=record.exts==null?undefined:row(record.exts)
        // Preserve each proven storage slot's presence/type/value, including
        // historical distinct root/EXTS copies; ignore all unrelated metadata.
        return JSON.stringify(businessKeys.map(key=>[key,slot(record,key),slot(exts,key)]))
      }
      const expected=new Map([...current!.originals].map(([recordId,raw])=>[recordId,businessState(JSON.parse(raw))]))
      const execute=async(request:ApiReadRequest)=>{check();const value=await transport.execute(request);check();return value}
      const terminalReferences=async()=>{
        const envelope = row(await execute({method:'POST',
          path:`basic/serviceAppointment/queryById/${encodeURIComponent(snapshot.workOrderId)}`,body:{}}))
        check()
        if(envelope.success!==true || envelope.status!==1) return deny()
        const data=row(envelope.data),sa=row(data.serviceAppointment),wf=row(data.workflow)
        if(sa._id!==snapshot.workOrderId || sa.state!==1 || sa.tenantId!==input.tenantId || sa.workflowId!==snapshot.node.runId
          || wf._id!==snapshot.node.runId || wf.tenantId!==input.tenantId || wf.formDataId!==snapshot.workOrderId
          || (wf.state!==0 && wf.state!==10) || !Array.isArray(data.workflowNode)) return deny()
        const nodes=(data.workflowNode as unknown[]).map(row)
        if(new Set(nodes.map(n=>id(n._id))).size!==nodes.length) return deny()
        const n=nodes.find(n=>n._id===snapshot.node.id)
        if(!n || n.tenantId!==input.tenantId || n.workflowId!==snapshot.node.runId
          || n.workflowFormDataId!==snapshot.workOrderId || n.workflowFormColName!=='serviceAppointment'
          || (n.formDefId!==undefined && n.formDefId!==snapshot.definition.id)
          || n.state!==10 || row(n.nodeDef).nodeType!=='forms'
          || row(n.nodeDef).formDefId!==snapshot.definition.id) return deny()
        const references=workflowNode(n).formList
        if(!references || references.source!=='exts.formList' || references.evidence!=='available' || references.truncated
          || references.entries.some(entry=>!['active','deleted'].includes(entry.state)
            || (entry.formDefinitionId!==undefined && entry.formDefinitionId!==snapshot.definition.id))
          || [...expected.keys()].some(recordId=>!references.entries.some(entry=>entry.id===recordId&&entry.state==='active'))) return deny()
        return references
      }
      const references=await terminalReferences()
      const reader=createR1ScopedFormReader({transport:{execute},scope:{
        tenantId:input.tenantId,workOrderId:snapshot.workOrderId,runtimeNodeId:String(snapshot.node.id),
        workflowRunId:id(snapshot.node.runId),formDefinitionId:String(snapshot.definition.id),sourceNodeType:'forms',
      },isCurrent:()=>{check();return true},formList:references})
      const discovered=await reader.discover()
      const verified=new Map<string,string>()
      for(const discoveredRecord of discovered){
        const selected=await reader.select(String(discoveredRecord.data.id))
        const original=reader.originalFor(selected)
        if(!original)return deny()
        verified.set(String(selected.data.id),businessState(original))
      }
      for(const [recordId,values] of expected){
        const actual=verified.get(recordId)
        if(actual!==values) return deny()
      }
      // Only active relationship identities must stay stable during this read.
      // Engine-owned unknown metadata/deleted history is not frozen by this client.
      const bindings=(refs:typeof references)=>JSON.stringify(refs.entries.filter(entry=>entry.state==='active')
        .map(entry=>[entry.id,entry.formDefinitionId??snapshot.definition.id]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
      if(bindings(await terminalReferences())!==bindings(references)) return deny()
      check(); generation++; current=null
      return {transitionVerified:true as const}
    },
    async load(workOrderId, runtimeNodeId) {
      const ticket = ++generation; current = null
      const actor = input.auth.getCurrentSession(), identity = fingerprint()
      if (!identity || !actor?.currentRole || !enabled()) return deny()
      id(workOrderId); id(runtimeNodeId); id(input.tenantId)
      const checkActor = () => { if (ticket !== generation || fingerprint() !== identity) deny() }
      // A cold route must rebuild authority through the normal role-scoped list.
      let total: number | undefined
      const listed = new Set<string>()
      if (input.read.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) {
        for (let page = 1; page <= 10; page++) {
          checkActor()
          const response = await input.read.listWorkOrders({ page, pageSize: 20 })
          checkActor()
          const d = response.data
          if (response.state !== 'succeeded' || !d) return deny()
          if (!Number.isSafeInteger(d.totalCount)
            || d.totalCount! < 0 || d.totalCount! > 200 || (total !== undefined && total !== d.totalCount)
            || (d.page !== undefined && d.page !== page) || d.items.length !== Math.min(20, Math.max(0, d.totalCount! - (page - 1) * 20))) deny()
          total = d.totalCount
          for (const item of d.items) { const key = id(item.id); if (listed.has(key)) deny(); listed.add(key) }
          if (listed.has(workOrderId) || listed.size === total) break
        }
      }
      const check = () => { checkActor(); if (input.read.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) deny() }
      const execute = async (request: ApiReadRequest) => { check(); const raw = await transport.execute(request); check(); return raw }
      let rawFill: readonly string[] | undefined
      let rawFormsExts: string | undefined
      let appointmentSubmitAllowed = false
      const readNode = async (): Promise<WorkflowNodeRead> => {
        const envelope = row(await execute({ method: 'POST', path: `basic/serviceAppointment/queryById/${encodeURIComponent(workOrderId)}`, body: {} }))
        if (envelope.success !== true || envelope.status !== 1) deny()
        const data = row(envelope.data), sa = row(data.serviceAppointment), wf = row(data.workflow)
        if (sa._id !== workOrderId || sa.tenantId !== input.tenantId || sa.state !== 1
          || wf._id !== id(sa.workflowId) || wf.tenantId !== input.tenantId || wf.formDataId !== workOrderId || wf.state !== 0
          || !Array.isArray(data.workflowNode)) deny()
        const nodes = (data.workflowNode as unknown[]).map(row)
        if (new Set(nodes.map(n => id(n._id))).size !== nodes.length) deny()
        const rawNode = nodes.find(n => n._id === runtimeNodeId)
        if (!rawNode) return deny()
        if (rawNode.tenantId !== input.tenantId || rawNode.workflowId !== wf._id
          || rawNode.workflowFormDataId !== workOrderId || rawNode.workflowFormColName !== 'serviceAppointment' || rawNode.state !== 0) deny()
        const def = row(rawNode.nodeDef)
        if (!['forms', 'repeat'].includes(String(def.nodeType)) || (rawNode.formDefId !== undefined && rawNode.formDefId !== def.formDefId)) deny()
        id(def.formDefId)
        rawFormsExts = def.nodeType === 'forms' ? formsExtsJson(rawNode.exts) : undefined
        const readonlyIds = rawNode.formFieldIdsReadOnly ?? def.formFieldIdsReadOnly
        const readonlyValid = Array.isArray(readonlyIds)
          && readonlyIds.every(v => typeof v === 'string' && v.length > 0 && v.trim() === v)
          && new Set(readonlyIds).size === readonlyIds.length
          && (rawNode.formFieldIdsReadOnly === undefined || def.formFieldIdsReadOnly === undefined
            || JSON.stringify(rawNode.formFieldIdsReadOnly) === JSON.stringify(def.formFieldIdsReadOnly))
        rawFill = readonlyValid && Array.isArray(def.formFieldIdsFill)
          && def.formFieldIdsFill.every(v => typeof v === 'string' && v.length > 0 && v.trim() === v)
          && new Set(def.formFieldIdsFill).size === def.formFieldIdsFill.length
          ? [...def.formFieldIdsFill] : undefined
        appointmentSubmitAllowed = !Object.hasOwn(def,'submitHideNodeId') || def.submitHideNodeId === ''
        const node = workflowNode(rawNode)
        if (node.formDefinitionId !== def.formDefId || node.runId !== wf._id || node.nodeTypeEvidence !== 'runtime_node_def'
          || !evaluateNodeVisibility(node, { userId: actor.user.id, roleIds: [actor.currentRole!.id], organizationRoles: [] }).visible) deny()
        return node
      }
      const node = await readNode(), definitionId = id(node.formDefinitionId)
      const appointmentSubmitAtRead = appointmentSubmitAllowed
      const fillableFieldIds = rawFill
      const formsExts = rawFormsExts
      const ext = row(await execute({ method: 'POST', path: 'biz/ext/queryById.do', body: { id: definitionId } }))
      if (ext._id !== definitionId || ext.tenantId !== input.tenantId || ext.state !== 1
        || !['0', '1'].includes(String(ext.type)) || typeof ext.colName !== 'string' || !ext.colName) deny()
      const fields: Row[] = []; let fieldTotal: number | undefined
      for (let page = 1; page <= 4; page++) {
        const raw = row(await execute({ method: 'POST', path: 'biz/extField/query', body: {
          extId: definitionId, 'is:state|integer#and': 1, sortField: 'order', sortOrder: 'asc', page, rows: 50 } }))
        if (!Number.isSafeInteger(raw.total) || (raw.total as number) < 1 || (raw.total as number) > 200
          || (fieldTotal !== undefined && fieldTotal !== raw.total) || raw.page !== page || raw.size !== 50 || !Array.isArray(raw.data)) deny()
        fieldTotal = raw.total as number
        if ((raw.data as unknown[]).length !== Math.min(50, fieldTotal - (page - 1) * 50)) deny()
        for (const f of (raw.data as unknown[]).map(row)) {
          if (f.extId !== definitionId || f.tenantId !== input.tenantId || f.state !== 1 || fields.some(x => x._id === f._id)) deny()
          id(f._id); fields.push(f)
        }
        if (fields.length === fieldTotal) break
      }
      if (fields.length !== fieldTotal) deny()
      const definition = formDefinition({ data: fields }, asOpaqueId<'FormDefinitionId'>(definitionId))
      // Validate every applicable binding before the first provider request.
      // Static mobile exclusions alone can skip a provider; conditional fields
      // still hydrate, regardless of the currently selected record's values.
      const bindings = (definition.fields ?? []).map(field =>
        isFieldApplicable(actionFormSchemaFor(field), ACTION_FORM_SURFACE)
          ? bindR1ScopedFieldOptions({ rawField: fields.find(raw => raw._id === field.fieldId),
            field, tenantId: input.tenantId, definitionId })
          : null)
      const hydrated: FormFieldRead[] = []
      for (const [index, field] of (definition.fields ?? []).entries()) {
        const binding = bindings[index]
        hydrated.push(binding ? { ...field, options: await readR1ScopedFieldOptions(binding, { execute }) } : field)
      }
      const routeColName=ext.colName
      const routeFacts = node.sourceNodeType==='forms' && ext.type==='0'
        && typeof routeColName==='string' && routeColName!=='serviceAppointment' && routeColName.trim()===routeColName
        && ['id','extId','definitionId','formDefinitionId'].every(key=>!Object.hasOwn(ext,key)||ext[key]===definitionId)
        && (!Object.hasOwn(ext,'collectionName')||ext.collectionName===''||ext.collectionName===routeColName)
        && fields.every(field=>field.colName===routeColName
          && (!Object.hasOwn(field,'collectionName')||field.collectionName===''||field.collectionName===routeColName))
        ? Object.freeze({tenantId:input.tenantId,workOrderId,runtimeNodeId,workflowRunId:id(node.runId),
          formDefinitionId:definitionId,type:'0' as const,colName:routeColName,collectionName:`frm_${input.tenantId}_${routeColName}`}) : undefined
      // SOURCE create handles Survey/inspectionAppointment before checking type.
      // Only the ordinary generic collection branch is eligible for this new
      // file create route; the presence of a file field is never type evidence.
      const fileRoute=routeFacts && fields.length<=50 && definition.purpose===undefined
        && !['survey','inspectionAppointment','serviceAppointment'].includes(routeFacts.colName)
        && hydrated.filter(field=>field.type==='file'&&!field.readOnly
          && !node.formFieldIdsReadOnly?.includes(field.fieldId)&&fillableFieldIds?.includes(field.fieldId))
          .every(field=>isR1DefaultImageFieldConfig(fields.find(raw=>raw._id===field.fieldId)))
        && hydrated.some(field=>field.type==='file'&&!field.readOnly
          && !node.formFieldIdsReadOnly?.includes(field.fieldId)&&fillableFieldIds?.includes(field.fieldId))
        ?routeFacts:undefined
      // Ordinary first-create source: complete raw metadata per field. Default
      // images retain their already-supported omitted boolean/operation defaults
      // and numeric required representation; no other field inherits them.
      const ordinaryFileConfig=(f:Record<string,unknown>)=>{
        if(f.type!=='file'||!isR1DefaultImageFieldConfig(f))return false
        if(f.frontEndConfig==null||f.frontEndConfig==='')return true
        try{const v=typeof f.frontEndConfig==='string'?decodeR1ScopedJson(f.frontEndConfig):f.frontEndConfig
          return Boolean(v&&typeof v==='object'&&!Array.isArray(v)&&Object.entries(v).every(([k,x])=>k==='max'&&typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=10))}catch{return false}
      }
      const formsCreateRoute=routeFacts&&fields.length<=50&&!['survey','inspectionAppointment','serviceAppointment'].includes(routeFacts.colName)
        &&fields.every(f=>(!hydrated.some(mapped=>mapped.fieldId===f._id&&['switch','rate'].includes(mapped.type))
          ||['switch','rate'].includes(String(f.type))&&!['count','allowHalf','half','step','activeValue','inactiveValue','max','min','options'].some(k=>Object.hasOwn(f,k)))
          &&[0,1].includes(f.preset as number)&&(ordinaryFileConfig(f)?['0','1',0,1].includes(f.required as never):['0','1'].includes(f.required as string))
          &&(typeof f.multiple==='boolean'||ordinaryFileConfig(f)&&!Object.hasOwn(f,'multiple'))
          &&(f.operationType==='1'||ordinaryFileConfig(f)&&!Object.hasOwn(f,'operationType'))&&(f.calculateConfig==null||f.calculateConfig==='')&&(f.router==null||f.router==='')
          &&(f.roleIds==null||Array.isArray(f.roleIds)&&f.roleIds.length===0)&&(!Object.hasOwn(f,'readOnly')||f.readOnly===0||f.readOnly===1)
          &&(!Object.hasOwn(f,'readonly')||[0,1].includes(f.readonly as number)&&(!Object.hasOwn(f,'readOnly')||f.readOnly===f.readonly))
          &&!['componentType','surveyTool','url','params'].some(k=>Object.hasOwn(f,k))
          &&(!Object.hasOwn(f,'customizeFlag')||f.customizeFlag===0||f.customizeFlag===1)
          &&(ordinaryFileConfig(f)||f.frontEndConfig==null||f.frontEndConfig===''||(()=>{try{const v=decodeR1ScopedJson(f.frontEndConfig);return Boolean(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===0)}catch{return false}})()))
        ?routeFacts:undefined
      const writeMedia=input.env.VITE_XLINK_ENABLE_REAL_WRITES==='true'&&input.env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES==='true'
      const configuredGrant=parseR1RepeatGrant(input.env.VITE_XLINK_R1_REPEAT_GRANT)?.version===4
      const sourceSnapshot={workOrderId,node,definition:{...definition,fields:hydrated},records:[],fillableFieldIds}
      const configuredSource=writeMedia&&configuredGrant?configuredFileSource(sourceSnapshot,ext,fields,input.tenantId):undefined
      const configuredReadSource=input.env.VITE_XLINK_ENABLE_REAL_WRITES==='false'&&input.env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES==='false'
        ?configuredFileSource(sourceSnapshot,ext,fields,input.tenantId,'read'):undefined
      const fileDecodeSource=configuredSource??configuredReadSource
      const surveyMediaSeal=configuredGrant?configuredSource?.seal:writeMedia?surveyMediaSourceSeal(sourceSnapshot,ext,fields,input.tenantId):undefined
      const surveyMediaCodec=fileDecodeSource?createConfiguredFileCodec(fileDecodeSource.storage):surveyMediaSeal?createSurveyCreateMediaCodec(sourceSnapshot.definition,ext):undefined
      const normalFileCodec=!fileDecodeSource&&fileRoute?createNormalR1FileCodec({...definition,fields:hydrated},
        (fillableFieldIds??[]).filter(fieldId=>!node.formFieldIdsReadOnly?.includes(fieldId))):undefined
      // Attachment decoding belongs only to this read-only rollout, never the
      // scoped write snapshots consumed by edit/save/completion capabilities.
      const readOnlySurveyMedia = input.env.VITE_XLINK_ENABLE_REAL_WRITES === 'false'
        && input.env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'false'
        ? createSurveyReadOnlyMediaCodec(definition, ext.colName, fields) : undefined
      const reader = createR1ScopedFormReader({ transport: { execute }, readOnlySurveyMedia:normalFileCodec||surveyMediaCodec?undefined:readOnlySurveyMedia,
        ...(normalFileCodec||surveyMediaCodec?{valueCodec:normalFileCodec??surveyMediaCodec}:{}), scope: {
        tenantId: input.tenantId, workOrderId, runtimeNodeId, workflowRunId: id(node.runId),
        formDefinitionId: definitionId, sourceNodeType: node.sourceNodeType as 'forms' | 'repeat',
      }, isCurrent: () => ticket === generation && fingerprint() === identity,
      ...(node.formList ? { formList: node.formList } : {}) })
      const discovered = await reader.discover()
      // List rows are discovery, not the detail read used to display a record.
      const records = []
      const originals = new Map<string,string>()
      const requestedEdit = parseR1RepeatGrant(input.env.VITE_XLINK_R1_REPEAT_GRANT)
      const editStorage = configuredRecordEditStorage(sourceSnapshot,ext,fields,input.tenantId)
      const editGrant = requestedEdit?.version===6 && requestedEdit.synthetic===true && editStorage
        && input.env.VITE_XLINK_R1_REPEAT_ACTIONS==='true'
        && input.env.VITE_XLINK_ENABLE_REAL_WRITES==='true' && input.env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES==='true'
        && requestedEdit.scope.tenantId===input.tenantId && requestedEdit.scope.userId===actor.user.id
        && requestedEdit.scope.roleId===actor.currentRole.id && requestedEdit.scope.workOrderId===workOrderId
        && requestedEdit.scope.runtimeNodeId===runtimeNodeId && requestedEdit.scope.workflowRunId===node.runId
        && requestedEdit.scope.formDefinitionId===definitionId ? requestedEdit : null
      const editIds=editGrant?.recordIds??[]
      if(editIds.some(key=>!discovered.some(r=>String(r.data.id)===key)))deny()
      const editWires=new Map<string,string>(),preciseEditIds=new Set<string>()
      for (const r of discovered) {
        const selected=await reader.select(String(r.data.id))
        let original=reader.originalFor(selected)
        if(!original) return deny()
        // Survey15 precision refinement, limited to IDs already discovered AND
        // selected through the normal scoped reader. Raw lookup is not authority.
        if(editStorage && editIds.includes(String(selected.data.id))){
          const wire=formsExtsJson(original)
          const checkGrant=()=>{check();if(JSON.stringify(parseR1RepeatGrant(input.env.VITE_XLINK_R1_REPEAT_GRANT))!==JSON.stringify(editGrant))deny()}
          try{
          checkGrant()
          const rawEnvelope=row(await execute({method:'POST',path:'biz/extForm/findByIdWithWorkflow',body:{extId:definitionId,id:String(selected.data.id)}}))
          checkGrant()
          if(rawEnvelope.success!==true||rawEnvelope.status!==1)deny()
          const full=row(row(rawEnvelope.data).data)
          const expected={_id:String(selected.data.id),tenantId:input.tenantId,sid:workOrderId,nodeId:runtimeNodeId,workflowId:node.runId,state:1}
          if(Object.entries(expected).some(([key,value])=>full[key]!==value)
            ||['extId','definitionId','formDefId','formDefinitionId'].some(key=>Object.hasOwn(full,key)&&full[key]!==definitionId)
            ||Object.hasOwn(full,'workflowNodeId')&&full.workflowNodeId!==runtimeNodeId)deny()
          formsExtsJson(full)
          if(!recordEditAuditProjection(full,original)||fields.some(f=>['createTime','updateTime','createDateTime','updateDateTime'].includes(String(f.name))))deny()
          original=full
          editWires.set(String(selected.data.id),wire);preciseEditIds.add(String(selected.data.id))
          }catch(error){
            // Lack of a Map type source removes edit capability, never promotes
            // the formatted query to proof. Existing scoped readonly display
            // remains available; actor/grant loss still fails the entire read.
            checkGrant();if(editStorage.kind==='survey-dto')throw error
          }
        }
        if(configuredGrant&&!fileDecodeSource&&hydrated.some(field=>field.type==='file'))throw Error('当前附件配置的存储位置无法核实，不能把原文投影成未保存。')
        if(fileDecodeSource)assertConfiguredFileOriginal(fileDecodeSource.storage,original)
        else if(surveyMediaSeal)assertSurveyMediaOriginal(original)
        assertSurveyReadExtsValues(definition, original)
        records.push(selected.data)
        originals.set(String(selected.data.id),formsExtsJson(original))
      }
      const after = await readNode()
      if (JSON.stringify(after) !== JSON.stringify(node) || JSON.stringify(rawFill) !== JSON.stringify(fillableFieldIds)
        || rawFormsExts !== formsExts) deny()
      check()
      const snapshot: R1NodeFormsSnapshot = { workOrderId, node, definition: { ...definition, fields: hydrated } as FormDefinitionRead, records,
        ...(fillableFieldIds ? { fillableFieldIds } : {}) }
      // SOURCE backend ExtFormServiceImpl existing-id branch: only exact
      // string "0" uses frm_{tenant}_{colName} Map replacement. The query's
      // serviceAppointment privacy branch can omit phone, so never issue for it.
      const appointmentRoute = appointmentSubmitAtRead && appointmentSubmitAllowed && node.sourceNodeType==='repeat' && definition.purpose==='appointment'
        && ext.type==='0' && ext.colName==='appointment'
        && ['id','extId','definitionId','formDefinitionId'].every(k=>!Object.hasOwn(ext,k)||ext[k]===definitionId)
        && (!Object.hasOwn(ext,'collectionName')||ext.collectionName===''||ext.collectionName===ext.colName)
        && fields.every(f=>f.colName===ext.colName&&(!Object.hasOwn(f,'collectionName')||f.collectionName===''||f.collectionName===ext.colName))
        ?true:undefined
      const genericRoute = fields.length>50?routeFacts:undefined
      const conditionalSurveySeal = conditionalSurveySourceSeal(snapshot,ext,fields,input.tenantId)
      current = { snapshot, fingerprint: identity, originals, schemaAtRead:schemaIdentity(snapshot),
        ...(editGrant&&editStorage?{editStorage,editWires,editIds:[...preciseEditIds],editGrantSeal:JSON.stringify(editGrant),editSeal:JSON.stringify([ext,fields,editStorage]),editSnapshotSeal:editSnapshotSeal(snapshot)}:{}),
        ...(formsCreateRoute?{formsCreateRoute}:{}),
        ...(surveyMediaSeal?{surveyMediaSeal,surveyMediaSnapshotSeal:mediaSnapshotSeal(snapshot),...(configuredSource?{configuredFileStorage:configuredSource.storage}:{})}:{}),
        ...(conditionalSurveySeal?{conditionalSurveySeal,conditionalSnapshotSeal:conditionalSnapshotSeal(snapshot)}:{}),
        ...(appointmentRoute?{appointmentRoute,appointmentSeal:JSON.stringify([workOrderId,schemaIdentity(snapshot)])}:{}), ...(genericRoute?{genericRoute}:{}), ...(fileRoute?{fileRoute}:{}), ...(formsExts ? { formsExts } : {}) }
      // Real legacy codec/route validation may also supply display evidence;
      // array shape by itself never does. This is not a new write capability.
      const legacyDisplayFields=snapshot.definition.fields?.filter(f=>f.type==='file'&&(surveyMediaSeal
        ||fillableFieldIds?.includes(f.fieldId)&&!node.formFieldIdsReadOnly?.includes(f.fieldId)))
      const displayStorage=fileDecodeSource?.storage??((normalFileCodec||surveyMediaSeal)
        ?configuredFileStorage({...snapshot.definition,fields:legacyDisplayFields},ext):undefined)
      if(displayStorage){
        let displayRevoked=false
        const recordSeal=JSON.stringify(snapshot.records)
        const displayCurrent=()=>{
          if(displayRevoked)return false
          try{
            const valid=current?.snapshot===snapshot&&current.schemaAtRead===schemaIdentity(snapshot)
              &&recordSeal===JSON.stringify(snapshot.records)&&fingerprint()===identity
              &&input.read.isWorkOrderListedForCurrentSession?.(workOrderId)===true
            if(!valid)displayRevoked=true
            return valid
          }catch{displayRevoked=true;return false}
        }
        fileDisplayChecks.set(snapshot,displayCurrent)
        for(const record of records){
          const raw=originals.get(String(record.id));if(!raw)return deny()
          bindR1ConfiguredFileReadDisplay(snapshot.definition,record,displayStorage,JSON.parse(raw),displayCurrent,!fileDecodeSource)
        }
      }
      return snapshot
    },
  }
  return api
}
