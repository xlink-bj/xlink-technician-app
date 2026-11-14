import type {FormDefinitionRead} from '@shared/ports'

export interface R1FormFieldGroup<T> { readonly key:string; readonly title?:string; readonly kind:'number'|'media'|'field'; readonly fields:readonly T[] }
/** Presentation only. Adjacent source rows may share a surface; no row is
 * moved, merged by valueKey, made visible, or made editable here. */
export function r1FormFieldGroups<T extends {readonly fieldId:string}>(definition:FormDefinitionRead,rows:readonly T[]):readonly R1FormFieldGroup<T>[] {
 const source=new Map((definition.fields??[]).map((field,index)=>[field.fieldId,{field,index}]))
 const groups:{key:string;title?:string;kind:'number'|'media'|'field';fields:T[]}[]=[]
 let previous=-2,identity=''
 for(const row of rows){const entry=source.get(row.fieldId);if(!entry)continue
  const title=entry.field.presentation?.group?.trim()||undefined
  const kind=entry.field.type==='number'||entry.field.type==='digit'?'number':entry.field.type==='file'?'media':'field'
  const current=title?'group:'+title:kind==='number'?'number':row.fieldId
  const last=groups[groups.length-1]
  if(last&&previous+1===entry.index&&identity===current)last.fields.push(row)
  else groups.push({key:row.fieldId,...(title?{title}:{}),kind,fields:[row]})
  previous=entry.index;identity=current
 }
 return groups
}
export interface R1FormFooterAction {readonly id:string;readonly label:string;readonly variant:'primary'|'secondary'|'text';readonly disabled:boolean;readonly loading?:boolean;readonly run:()=>void}
export interface R1FormWorkspaceFooter {readonly actions:readonly R1FormFooterAction[];readonly notice:string;readonly editing:boolean}
