/** Isolated R1-shaped synthetic Material SKU read samples; no route/price/tenant ID. */
export const syntheticMaterialSpu={
  _id:'synthetic-spu-roof',name:'模拟卷材SPU',
  exts:{thickness:['2','3'],color:['grey','black']},
} as const
export const syntheticMaterialSalesFields=[
  {colName:'material',state:1,name:'thickness',nameDisp:'厚度',valueOption:'synthetic-thickness',frontEndConfig:'{"salesAttribute":true}'},
  {colName:'material',state:1,name:'color',nameDisp:'颜色',valueOption:'synthetic-color',frontEndConfig:{salesAttribute:true}},
  {colName:'material',state:1,name:'otherMaterialOnly',nameDisp:'其它材料字段',valueOption:'synthetic-other',frontEndConfig:{salesAttribute:true}},
  {colName:'material',state:1,name:'memo',nameDisp:'非销售字段',valueOption:'synthetic-memo',frontEndConfig:{salesAttribute:false}},
] as const
export const syntheticMaterialSkuRows=[
  {_id:'synthetic-sku-2-grey',spuid:'synthetic-spu-roof',state:1,exts:{thickness:'2',color:'grey'},number:3},
  {_id:'synthetic-sku-3-black',spuid:'synthetic-spu-roof',state:1,exts:{thickness:'3',color:'black'},number:0},
] as const
