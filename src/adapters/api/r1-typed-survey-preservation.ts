/** Reused from the reviewed Survey15 preservation contract; fixed R1 Survey DTO.
 * This is storage validation, never field permission, BSON CAS or a write grant. */
function refuse():never{throw Error('原文无法保全。')}
const strings=new Set('externalSid createUser updateUser createUserName updateUserName orgId orgName optId optName tenantId belongTo extId workflowId workflowNodeId isSettle surveyNum name phone address supervisorName supervisorPhone surveyTime orderId contractId contractdocNum sid serviceAppointmentNum serviceType nodeId memo province city district surveyPDFUrl'.split(' '))
const doubles=new Set('length width height perimeter planeArea squareMeter gapLength'.split(' '))
const integers=new Set(['state','sourceType','progress'])
const lists=new Set(['part','leakageCause','area','serviceGoods'])
/** Fixed Java property types, not an editable-field allowlist. Metadata and
 * independent node/grant checks decide whether a property may be changed. */
export function typedSurveyPropertyKind(key:string):'string'|'double'|'integer'|'list'|'object'|'date'|undefined{
 if(strings.has(key))return 'string'
 if(doubles.has(key))return 'double'
 if(integers.has(key))return 'integer'
 if(lists.has(key)||['surveyDrawing','infraredImageList'].includes(key))return 'list'
 if(['exts','etags'].includes(key))return 'object'
 if(['createTime','updateTime'].includes(key))return 'date'
 return undefined
}
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype
const stable=(v:unknown):string=>JSON.stringify(v,(_key,x)=>object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T
const epoch=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=253402271999999
const ackDate=(v:unknown)=>epoch(v)||date(v)
const date=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v))return false;const n=Date.parse(v.replace(' ','T')+'Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,19).replace('T',' ')===v}
/** Audit exceptions follow EMongoTemplate.doSave, not a loss permission. */
export function surveyExistingOriginalProblem(raw:Readonly<Record<string,unknown>>):string|null {
 if(!object(raw))return'原文不是完整对象。'
 if(raw.createTime!=null&&!epoch(raw.createTime))return'创建时间原始精度无法由秒级接口核实，当前记录不可安全替换。'
 if(raw.updateTime!=null&&!epoch(raw.updateTime)&&!date(raw.updateTime))return'更新审计时间格式无法核实。'
 try{let count=0;const check=(v:unknown,depth:number):void=>{if(++count>5000||depth>20)refuse();if(v===null||typeof v==='string'||typeof v==='boolean')return;if(typeof v==='number'&&Number.isFinite(v)&&(!Number.isInteger(v)||Number.isSafeInteger(v)))return;if(Array.isArray(v)){for(const x of v)check(x,depth+1);return}if(object(v)){for(const[k,x]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))refuse();check(x,depth+1)}return}refuse()};check(raw,0);if(JSON.stringify(raw).length>1000000)return'原文超过已验证范围。'}catch{return'原文包含无法保全的值。'}
 for(const[k,v]of Object.entries(raw)){
  if(k==='createTime'||k==='updateTime')continue
  if(v===null)return`原文字段 ${k} 的显式空值不能证明 typed 替换保全。`
  if(k==='_id'){if(typeof v!=='string'||!v||v.trim()!==v||v.includes(','))return'记录身份无效。';continue}
  if(k==='_class'){if(v!=='com.fsgo.entity.basic.Survey')return'原文类型无法核实。';continue}
  if(k==='collectionName'){if(v!=='')return'原文集合无法核实。';continue}
  if(strings.has(k)){if(v!==null&&typeof v!=='string')return`原文字段 ${k} 类型不可保全。`;continue}
  if(doubles.has(k)){if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)))return`原文字段 ${k} 数值不可保全。`;continue}
  if(integers.has(k)){if(v!==null&&(typeof v!=='number'||!Number.isSafeInteger(v)||v< -2147483648||v>2147483647))return`原文字段 ${k} 整数不可保全。`;continue}
  if(lists.has(k)){if(v!==null&&(!Array.isArray(v)||v.some(x=>typeof x!=='string')))return`原文字段 ${k} 列表不可保全。`;continue}
  if(['exts','etags'].includes(k)){if(!object(v))return`原文 ${k} 容器不可保全。`;if(k==='etags'&&Object.values(v).some(x=>!Array.isArray(x)||x.some(i=>typeof i!=='string')))return'标签容器不可保全。';continue}
  if(['surveyDrawing','infraredImageList'].includes(k)){if(v!==null&&(!Array.isArray(v)||v.some(x=>!object(x))))return'图片元数据不可保全。';continue}
  return`未知原文字段 ${k} 无完整 typed 保全合同。`
 }
 for(const k of ['tenantId','orgId','orgName','belongTo','createUser','createUserName'])if(typeof raw[k]!=='string'||!raw[k])return`原文 ${k} 默认补值无法核实。`
 if(!object(raw.exts))return'完整 EXTS 原文缺失。'
 return null
}
export function sameTypedSurveyResult(expected:Record<string,unknown>,actual:Record<string,unknown>,rawRead=false):boolean{
 if(surveyExistingOriginalProblem({...actual,createTime:null}))return false
 // The server supplies creation time only for the explicitly null/missing old
 // audit value; update audit always changes. No other original is discarded.
 if(!(rawRead?epoch(actual.createTime):ackDate(actual.createTime))||!ackDate(actual.updateTime)||typeof actual.updateUser!=='string'||!actual.updateUser||typeof actual.updateUserName!=='string'||!actual.updateUserName)return false
 if(epoch(expected.createTime)){
  const formatted=new Date(expected.createTime+8*60*60*1000).toISOString().slice(0,19).replace('T',' ')
  if(rawRead?actual.createTime!==expected.createTime:actual.createTime!==expected.createTime&&actual.createTime!==formatted)return false
 }
 const clean=(x:Record<string,unknown>)=>{const out=copy(x);for(const k of ['createTime','updateTime','updateUser','updateUserName'])delete out[k];if(out.etags===undefined)out.etags={};if(out._class===undefined)out._class='com.fsgo.entity.basic.Survey';if(out.collectionName===undefined)out.collectionName='';return out}
 return stable(clean(expected))===stable(clean(actual))
}
