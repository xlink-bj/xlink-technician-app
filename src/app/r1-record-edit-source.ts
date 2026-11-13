import { typedSurveyPropertyKind } from '@adapters/api/r1-typed-survey-preservation'
import { decodeR1ScopedJson } from '@adapters/api/r1-scoped-json'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import type { R1FileCreateStorage } from '@shared/form/r1-file-create-storage'

/** The query formats top-level Dates. Recognize only the existing inherited
 * audit slots, from TWO same-record server reads; never guess epoch/timezone
 * from a date-looking string or extend this exception to business fields. */
export function recordEditAuditProjection(raw:Readonly<Record<string,unknown>>,wire:Readonly<Record<string,unknown>>):readonly string[]|undefined{
  const audits=new Set(['createTime','updateTime','createDateTime','updateDateTime'])
  const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)
    ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)
  const ordinary=(v:Readonly<Record<string,unknown>>)=>Object.fromEntries(Object.entries(v).filter(([k])=>!audits.has(k)))
  if(stable(ordinary(raw))!==stable(ordinary(wire)))return
  const projected=[]
  for(const key of audits){
    if(Object.hasOwn(raw,key)!==Object.hasOwn(wire,key))return
    if(stable(raw[key])===stable(wire[key]))continue
    if(typeof raw[key]!=='number'||!Number.isSafeInteger(raw[key])||typeof wire[key]!=='string'
      ||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(wire[key] as string))return
    projected.push(key)
  }
  return Object.freeze(projected)
}

/** Bounded scalar storage policy. It never chooses fields by business name or
 * issues authority: the normal reader owns raw route/record provenance. */
export function configuredRecordEditStorage(snapshot: R1NodeFormsSnapshot, ext: Readonly<Record<string, unknown>>,
  rawFields: readonly Readonly<Record<string, unknown>>[], tenantId: string, appointmentSubmitAllowed=false) {
  const fields = snapshot.definition.fields, fill = snapshot.fillableFieldIds, ro = snapshot.node.formFieldIdsReadOnly
  if (!fields?.length || fields.length > 50 || fields.length !== rawFields.length || !Array.isArray(fill) || !Array.isArray(ro)
    || new Set(fill).size !== fill.length || new Set(ro).size !== ro.length
    || new Set(fields.map(f => f.valueKey)).size !== fields.length || new Set(fields.map(f => f.fieldId)).size !== fields.length
    || [...fill, ...ro].some(id => !fields.some(f => f.fieldId === id)) || fill.some(id => ro.includes(id))
    || !fill.length || snapshot.node.sourceNodeType !== 'repeat' || snapshot.node.lifecycle !== 'active'
    || snapshot.node.nodeTypeEvidence !== 'runtime_node_def' || snapshot.node.formDefinitionId !== snapshot.definition.id
    || ext._id !== snapshot.definition.id || ext.tenantId !== tenantId || ext.state !== 1
    || typeof ext.colName!=='string'||!/^[A-Za-z][\w-]{0,79}$/.test(ext.colName)
    || ['id', 'extId', 'definitionId', 'formDefinitionId'].some(k => Object.hasOwn(ext, k) && ext[k] !== snapshot.definition.id)
    || Object.hasOwn(ext, 'collectionName') && ext.collectionName !== '' && ext.collectionName !== ext.colName
    || ['preScriptContent', 'scriptContent'].some(k => ext[k] != null && ext[k] !== '')) return
  for (const field of fields) {
    const raw = rawFields.find(f => f._id === field.fieldId)
    const mapChoice=ext.type==='0'&&field.type==='radio'
    const mapTemporal=ext.type==='0'&&field.type==='datetime'
    if (!raw || raw.extId !== ext._id || raw.tenantId !== tenantId || raw.state !== 1 || raw.colName !== ext.colName
      || raw.name !== field.valueKey || raw.type !== field.type || !(['text', 'textarea', 'number', 'digit'].includes(field.type)||mapChoice||mapTemporal)
      || ![0, 1].includes(raw.preset as number) || field.preset !== (raw.preset === 1)
      || !['0', '1'].includes(String(raw.required)) || field.required !== (String(raw.required) === '1')
      || raw.operationType !== '1' || raw.multiple !== undefined && raw.multiple !== false || field.multiple
      || raw.enabled !== undefined && raw.enabled !== 1
      || raw.readOnly !== undefined && ![0, 1].includes(raw.readOnly as number)
      || raw.readonly !== undefined && ![0, 1].includes(raw.readonly as number)
      || raw.readOnly !== undefined && raw.readonly !== undefined && raw.readOnly !== raw.readonly
      || typeof field.readOnly !== 'boolean' || field.readOnly !== (raw.readOnly === 1 || raw.readonly === 1)
      || field.readOnly && fill.includes(field.fieldId) || !field.readOnly && !ro.includes(field.fieldId) && !fill.includes(field.fieldId)
      || !Array.isArray(raw.showList) || !raw.showList.includes('4') || field.visibility || field.unsupportedReason || field.presentationOnly
      || !mapChoice&&(field.valueOption || field.options?.length || raw.valueOption) || raw.calculateConfig || raw.router
      || raw.roleIds != null && (!Array.isArray(raw.roleIds) || raw.roleIds.length)
      || ['componentType', 'surveyTool', 'url', 'params'].some(k => Object.hasOwn(raw, k))
      || raw.showType !== undefined && raw.showType !== '1' || raw.showField || raw.showValue
      || raw.showFieldPreset !== undefined && raw.showFieldPreset !== 0
      || Object.hasOwn(raw, 'collectionName') && raw.collectionName !== '' && raw.collectionName !== ext.colName) return
    if(mapChoice){
      // Options were resolved by the existing scoped reader, or came from this
      // exact inline metadata. No synthetic defaults or business-name mapping.
      const options=field.options
      if(!options?.length||options.length>5000||new Set(options.map(o=>o.value)).size!==options.length
        ||options.some(o=>typeof o.value!=='string'||!o.value||o.value.trim()!==o.value||!o.label?.trim()||o.children?.length))return
      if(raw.valueOption){
        if(typeof raw.valueOption!=='string'||raw.valueOption!==field.valueOption||raw.options!==undefined||raw.items!==undefined)return
      }else{
        const inline=raw.options??raw.items
        if(field.valueOption||raw.options!==undefined&&raw.items!==undefined||!Array.isArray(inline)||inline.length!==options.length)return
        for(let i=0;i<inline.length;i++){
          const entry=inline[i],option=options[i]!
          if(!entry||typeof entry!=='object'||Array.isArray(entry)
            ||['value','code','id'].some(k=>Object.hasOwn(entry,k)&&entry[k]!==option.value)
            ||['label','name','text','codelabel'].some(k=>Object.hasOwn(entry,k)&&entry[k]!==option.label))return
        }
      }
    }
    try {
      const cfg = raw.frontEndConfig == null || raw.frontEndConfig === '' ? {} : decodeR1ScopedJson(raw.frontEndConfig)
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg) || Object.keys(cfg).length) return
    } catch { return }
  }
  // SOURCE routing: type0 Map excludes special typed collections. No fallback.
  if (!(ext.type === '1' && ext.colName === 'survey')
    && !(ext.type === '0' && !['survey', 'inspectionAppointment', 'serviceAppointment'].includes(ext.colName)
      && (ext.colName!=='appointment'||appointmentSubmitAllowed))) return
  const kind=ext.type==='1'?'survey-dto':'generic-map'
  const storageFields=[]
  for(const f of fields){
    const property=kind==='survey-dto'?typedSurveyPropertyKind(f.valueKey):undefined
    if(kind==='survey-dto'&&(f.preset||property)&&!(['number','digit'].includes(f.type)
      ?property==='double'||property==='integer':property==='string'))return
    const slots:('root'|'exts')[]=f.preset?['root']:kind==='generic-map'||property?['root','exts']:['exts']
    storageFields.push(Object.freeze({fieldId:f.fieldId,valueKey:f.valueKey,type:f.type,max:0,slots:Object.freeze(slots)}))
  }
  return Object.freeze({kind,definitionId:String(snapshot.definition.id),colName:ext.colName,
    fields:Object.freeze(storageFields)}) satisfies R1FileCreateStorage
}
