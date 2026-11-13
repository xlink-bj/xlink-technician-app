import {existingRecordFixture} from './r1-existing-record-edit-fixture'

/** Synthetic metadata over the actual normal reader/provider, not a second writer. */
export function mapChoiceDatetimeFixture(inline=false) {
 const h=existingRecordFixture(true);h.mapRoute();h.ext.colName='appointment'
 const keys={choice:'contactMode',time:'windowStart',note:'visitNotes'} as const
 const providerId='configured-contact-options'
 const source=h.fields[0]!
 h.fields.splice(0,h.fields.length,...[
  {...source,_id:'choice-field',colName:'appointment',name:keys.choice,type:'radio',preset:1,
   ...(inline?{options:[{value:'onsite',label:'现场'},{value:'remote',label:'远程'}]}:{valueOption:providerId})},
  {...source,_id:'time-field',colName:'appointment',name:keys.time,type:'datetime',preset:0},
  {...source,_id:'note-field',colName:'appointment',name:keys.note,type:'textarea',preset:1,required:'0'},
 ])
 h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id)
 h.grant.fieldIds=[...h.node.nodeDef.formFieldIdsFill];h.setGrant()
 for(const r of [h.record,h.other])Object.assign(r,{[keys.choice]:'onsite',[keys.time]:'2027-03-04 09:15:23',
  [keys.note]:'保持原文',exts:{...r.exts,[keys.time]:'2027-03-04 09:15:23'}})
 let options:Record<string,string>={onsite:'现场',remote:'远程'}
 const original=h.transport.execute.getMockImplementation()!
 h.transport.execute.mockImplementation(async req=>{
  if(req.path==='i/code/selectCode.do'){
   h.events.push(req.path)
   if(req.body.tenantId!==h.scope.tenantId||req.body.jsonPara!==JSON.stringify([{codeId:providerId,eleid:providerId}]))throw Error('Unbound option request')
   return JSON.stringify([{codeId:providerId,eleid:providerId,options}])
  }
  return original(req)
 })
 return {...h,names:keys,setOptions:(next:Record<string,string>)=>{options=next}}
}
