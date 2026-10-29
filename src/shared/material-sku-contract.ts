/** R1 @6c0a97b: placeOrders.vue lines 3498 and 6090-6390. Pure read; no IO, price, stock or write. */
type Data = Readonly<Record<string, unknown>>
const obj = (v:unknown):Data|null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Data : null
const code = (v:unknown):string|null => typeof v==='string' && v.trim() ? v.trim() : typeof v==='number' && Number.isFinite(v) ? String(v) : null
const choices = (v:unknown):readonly string[]|null => Array.isArray(v) && v.length>0 && v.every((x)=>code(x)!==null) ? v.map((x)=>code(x)!) : null
export type MaterialSkuFailure = 'malformed_source'|'unverified_sales_schema'|'duplicate_attribute'|'malformed_attribute_options'|'cross_spu_sku'|'inactive_or_malformed_sku'|'duplicate_sku_id'|'incomplete_sku_attributes'
export interface MaterialSaleAttribute {readonly name:string;readonly label:string;readonly valueOption:string;readonly values:readonly string[]}
export interface MaterialSkuVariant {readonly id:string;readonly spuid:string;readonly attributes:Readonly<Record<string,string>>;readonly existingQuantity?:number}
export type MaterialSkuRead =
  | {readonly state:'blocked';readonly reason:MaterialSkuFailure}
  | {readonly state:'not_configured';readonly spuId:string}
  | {readonly state:'no_skus';readonly spuId:string;readonly fields:readonly MaterialSaleAttribute[]}
  | {readonly state:'ready';readonly spuId:string;readonly fields:readonly MaterialSaleAttribute[];readonly skus:readonly MaterialSkuVariant[]}
export type MaterialSkuMatch =
  | {readonly state:'blocked'|'incomplete'|'not_configured'|'unavailable'|'ambiguous'}
  | {readonly state:'matched';readonly skuId:string;readonly existingQuantity?:number}
const blocked=(reason:MaterialSkuFailure):MaterialSkuRead=>({state:'blocked',reason})
function saleFieldFlag(raw:unknown):boolean|null {
  if(raw===undefined || raw===null || raw==='')return false
  let val: unknown = raw
  if(typeof raw==='string'){try{val=JSON.parse(raw) as unknown}catch{return null}}
  const value=obj(val)
  return value && typeof value.salesAttribute==='boolean'?value.salesAttribute:null
}
/**
 * Inputs MUST be complete, already-authorized provider records. The function
 * cannot grant user/role/tenant rights, and is intentionally not API wired.
 * R1 renders a sales attribute only when this SPU has a populated ext list.
 */
export function projectR1MaterialSku(input:{readonly spu:unknown;readonly salesFields:unknown;readonly skuRows:unknown}):MaterialSkuRead {
  const spu=obj(input.spu),spuId=code(spu?._id),exts=obj(spu?.exts)
  if(!spuId||!exts||!Array.isArray(input.salesFields)||!Array.isArray(input.skuRows))return blocked('malformed_source')
  const fields:MaterialSaleAttribute[]=[],seen=new Set<string>()
  for(const raw of input.salesFields){
    const row=obj(raw)
    if(!row||row.colName!=='material'||row.state!==1)return blocked('unverified_sales_schema')
    const flag=saleFieldFlag(row.frontEndConfig)
    if(flag===null)return blocked('unverified_sales_schema')
    if(!flag)continue
    const name=code(row.name),label=code(row.nameDisp),valueOption=code(row.valueOption)
    if(!name||!label||!valueOption)return blocked('unverified_sales_schema')
    if(seen.has(name))return blocked('duplicate_attribute')
    seen.add(name)
    if(exts[name]===undefined||exts[name]===null)continue
    const options=choices(exts[name])
    if(!options||new Set(options).size!==options.length)return blocked('malformed_attribute_options')
    fields.push({name,label,valueOption,values:options})
  }
  if(!fields.length)return {state:'not_configured',spuId}
  if(!input.skuRows.length)return {state:'no_skus',spuId,fields}
  const skus:MaterialSkuVariant[]=[],skuIds=new Set<string>()
  for(const raw of input.skuRows){
    const row=obj(raw),id=code(row?._id),parent=code(row?.spuid),attrs=obj(row?.exts)
    if(!row||!id||!parent||!attrs)return blocked('inactive_or_malformed_sku')
    if((code(row.id)!==null && code(row.id)!==id)
      || (code(row.spuId)!==null && code(row.spuId)!==parent))return blocked('malformed_source')
    if(parent!==spuId)return blocked('cross_spu_sku')
    if(row.state!==1)return blocked('inactive_or_malformed_sku')
    if(skuIds.has(id))return blocked('duplicate_sku_id')
    skuIds.add(id)
    const projected:Record<string,string>={}
    for(const f of fields){
      const v=code(attrs[f.name])
      if(!v||!f.values.includes(v))return blocked('incomplete_sku_attributes')
      projected[f.name]=v
    }
    const qty=row.number
    if(qty!==undefined&&(typeof qty!=='number'||!Number.isSafeInteger(qty)||qty<0))return blocked('inactive_or_malformed_sku')
    skus.push({id,spuid:spuId,attributes:projected,...(typeof qty==='number'?{existingQuantity:qty}:{})})
  }
  return {state:'ready',spuId,fields,skus}
}
/** Exact complete and unambiguous attribute combination; never auto-pick. */
export function matchR1MaterialSku(source:MaterialSkuRead,selected:Readonly<Record<string,string>>):MaterialSkuMatch {
  if(source.state==='blocked')return {state:'blocked'}
  if(source.state==='not_configured')return {state:'not_configured'}
  if(Object.keys(selected).some((n)=>!source.fields.some((f)=>f.name===n)))return {state:'blocked'}
  if(source.fields.some((f)=>!selected[f.name]))return {state:'incomplete'}
  if(source.fields.some((f)=>!f.values.includes(selected[f.name])))return {state:'blocked'}
  if(source.state==='no_skus')return {state:'unavailable'}
  const candidates=source.skus.filter((sku)=>source.fields.every((f)=>sku.attributes[f.name]===selected[f.name]))
  if(candidates.length>1)return {state:'ambiguous'}
  const result=candidates[0]
  return result?{state:'matched',skuId:result.id,...(result.existingQuantity===undefined?{}:{existingQuantity:result.existingQuantity})}:{state:'unavailable'}
}
