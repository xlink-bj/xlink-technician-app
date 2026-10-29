import {describe,expect,it} from 'vitest'
import {projectR1MaterialSku,matchR1MaterialSku} from '@shared/material-sku-contract'
import {syntheticMaterialSpu as spu,syntheticMaterialSkuRows as skus,syntheticMaterialSalesFields as fields} from '@adapters/api/mock/material-sku'
const read=()=>projectR1MaterialSku({spu,salesFields:fields,skuRows:skus})
describe('R1 source-pinned Material SPU→sale fields→SKU read contract',()=>{
  it('preserves SPU and SKU IDs, matching sale fields and historical quantity',()=>{
    const r=read()
    expect(r.state).toBe('ready')
    if(r.state!=='ready')return
    expect(r.spuId).toBe('synthetic-spu-roof')
    expect(r.fields.map(x=>x.name)).toEqual(['thickness','color'])
    expect(r.skus).toHaveLength(2)
    expect(r.skus[0]).toMatchObject({id:'synthetic-sku-2-grey',spuid:'synthetic-spu-roof',existingQuantity:3})
  })
  it('matches only complete exact attribute selections, never a partial SKU',()=>{
    const r=read()
    expect(matchR1MaterialSku(r,{thickness:'2'}).state).toBe('incomplete')
    expect(matchR1MaterialSku(r,{thickness:'2',color:'black'}).state).toBe('unavailable')
    expect(matchR1MaterialSku(r,{thickness:'2',color:'grey'})).toEqual({state:'matched',skuId:'synthetic-sku-2-grey',existingQuantity:3})
    expect(matchR1MaterialSku(r,{thickness:'2',color:'grey',other:'x'}).state).toBe('blocked')
    expect(matchR1MaterialSku(r,{thickness:'5',color:'grey'}).state).toBe('blocked')
  })
  it('fails closed on wrong parent, inactive, negative quantity, duplicate SKU IDs',()=>{
    for(const bad of [
      {...skus[0],spuid:'other-spu'},
      {...skus[0],state:0},
      {...skus[0],number:-1},
    ])expect(projectR1MaterialSku({spu,salesFields:fields,skuRows:[bad]}).state).toBe('blocked')
    expect(projectR1MaterialSku({spu,salesFields:fields,skuRows:[skus[0],skus[0]]}))
      .toEqual({state:'blocked',reason:'duplicate_sku_id'})
  })
  it('rejects malformed, duplicate, missing or cross-scope sales field metadata',()=>{
    expect(projectR1MaterialSku({spu,salesFields:[fields[0],fields[0]],skuRows:skus}).state).toBe('blocked')
    expect(projectR1MaterialSku({spu,salesFields:[{...fields[0],frontEndConfig:'{bad'}],skuRows:skus}).state).toBe('blocked')
    expect(projectR1MaterialSku({spu,salesFields:[{...fields[0],colName:'order'}],skuRows:skus}).state).toBe('blocked')
    expect(projectR1MaterialSku({spu:{...spu,exts:{thickness:'2',color:['grey']}},salesFields:fields,skuRows:skus}).state).toBe('blocked')
    expect(projectR1MaterialSku({spu,salesFields:fields,skuRows:[{...skus[0],exts:{thickness:'2'}}]}).state).toBe('blocked')
  })
  it('separates SPUs without sales fields from SPUs with no SKU choices',()=>{
    const none=projectR1MaterialSku({spu:{_id:'synthetic-empty-spu',exts:{}},salesFields:fields,skuRows:[]})
    expect(none).toEqual({state:'not_configured',spuId:'synthetic-empty-spu'})
    expect(matchR1MaterialSku(none,{}).state).toBe('not_configured')
    const empty=projectR1MaterialSku({spu,salesFields:fields,skuRows:[]})
    expect(empty.state).toBe('no_skus')
    expect(matchR1MaterialSku(empty,{thickness:'2',color:'grey'}).state).toBe('unavailable')
  })
  it('blocks an ambiguous identical-attribute match across two SKUs',()=>{
    const r=projectR1MaterialSku({spu,salesFields:fields,skuRows:[skus[0],{...skus[0],_id:'other-matching-sku'}]})
    expect(matchR1MaterialSku(r,{thickness:'2',color:'grey'}).state).toBe('ambiguous')
  })
  it('is immutable and cannot infer price, stock, role authorization or Order write',()=>{
    const before=JSON.stringify({spu,fields,skus})
    const r=read()
    expect(JSON.stringify({spu,fields,skus})).toBe(before)
    if(r.state==='ready') {
      expect('price' in r.skus[0]).toBe(false)
      expect('inventory' in r.skus[0]).toBe(false)
      expect('authorized' in r.skus[0]).toBe(false)
    }
  })
})
