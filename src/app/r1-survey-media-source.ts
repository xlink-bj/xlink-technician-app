import {decodeR1ScopedJson} from '@adapters/api/r1-scoped-json'
import {supportsSurveyMediaCreate} from '@features/work-orders/r1-survey-media-create'
import type {R1NodeFormsSnapshot} from '@features/work-orders/r1-node-forms-read'
/** Held only by the genuine reader. Pure validation does not issue a credential. */
export function surveyMediaSourceSeal(s:R1NodeFormsSnapshot,ext:Readonly<Record<string,unknown>>,fields:readonly Readonly<Record<string,unknown>>[],tenant:string):string|undefined{
 if(!supportsSurveyMediaCreate(s)||ext._id!==s.definition.id||ext.tenantId!==tenant||ext.state!==1||ext.type!=='1'||ext.colName!=='survey'
  ||['id','extId','definitionId','formDefinitionId'].some(k=>Object.hasOwn(ext,k)&&ext[k]!==s.definition.id)
  ||(Object.hasOwn(ext,'collectionName')&&ext.collectionName!==''&&ext.collectionName!=='survey')||fields.length!==2)return
 // Fixed R1 ExtField.class declares neither enabled nor readOnly: actual
 // query omits them. State/operation/node scope remain positive evidence;
 // explicit future values may never contradict that evidence.
 for(const f of fields){
  const mapped=s.definition.fields!.find(x=>x.fieldId===f._id&&x.valueKey===f.name)
  if(!mapped||f.extId!==s.definition.id||f.tenantId!==tenant||f.state!==1||(Object.hasOwn(f,'enabled')&&f.enabled!==1)||f.type!=='file'||f.colName!=='survey'
   ||f.preset!==(f.name==='infraredImageList'?1:0)||f.required!==(f.name==='images1'?'1':'0')||f.multiple!==false
   ||JSON.stringify(f.showList)!==JSON.stringify(['1','2','4'])||f.operationType!=='1'||(Object.hasOwn(f,'readOnly')&&f.readOnly!==0)||f.showFieldPreset!==0||!f.exts||typeof f.exts!=='object'||Array.isArray(f.exts)||Object.keys(f.exts).length!==0||f.showType!=='1'
   ||f.showField!==''||f.showValue!==''||f.calculateConfig!==''||f.valueOption
   ||(Object.hasOwn(f,'collectionName')&&f.collectionName!==''&&f.collectionName!=='survey'))return
  let cfg:unknown;try{cfg=decodeR1ScopedJson(f.frontEndConfig)}catch{return}
  if(!cfg||typeof cfg!=='object'||Array.isArray(cfg)||Object.keys(cfg).join()!=='max'
   ||(cfg as {max:unknown}).max!==(f.name==='infraredImageList'?4:10))return
 }
 if(new Set(fields.map(f=>f._id)).size!==2)return
 return JSON.stringify([tenant,ext,fields])
}
