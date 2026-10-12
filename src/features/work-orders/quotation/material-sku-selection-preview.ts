import type {
  QuotationMaterialRead,
  QuotationMaterialSaleFieldRead,
  QuotationMaterialSkuVariantRead,
} from '@shared/ports'

/** R1 placeOrders.vue:2983-3018, 6243-6264.
 * A read-only selection proof. It MUST NOT modify a QuotationDraft or infer price.
 * R1 getMaterialSKU() drops SKU exts before later skuMatch() reads them;
 * this model checks actual backend raw values projected by the adapter instead.
 */
export type MaterialSkuSelectionPreview =
  | { readonly state: 'not_configured' | 'blocked'; readonly message: string }
  | { readonly state: 'ready'; readonly fields: readonly {
      readonly name: string
      readonly label: string
      readonly options: readonly { readonly value: string; readonly label: string }[]
    }[]; readonly variants: readonly QuotationMaterialSkuVariantRead[] }

export type MaterialSkuSelectionMatch =
  | { readonly state: 'blocked' | 'incomplete' | 'unavailable' | 'ambiguous' }
  | { readonly state: 'matched'; readonly skuId: string }

const blocked = (message: string): MaterialSkuSelectionPreview => ({ state: 'blocked', message })

/** Only dictionaries shared by this SPU and its real SKU records are displayed.
 * A global Code dictionary alone does not establish the SPU's allowed values.
 */
export function projectMaterialSkuSelectionPreview(
  spu: QuotationMaterialRead,
  fields: readonly QuotationMaterialSaleFieldRead[],
  variants: readonly QuotationMaterialSkuVariantRead[],
): MaterialSkuSelectionPreview {
  if (spu.kind !== 'material' || !spu.id || !Array.isArray(fields) || fields.length > 30
    || !Array.isArray(variants) || variants.length > 200) return blocked('材料或规格返回数据不完整')
  const candidates = spu.saleOptionCandidates ?? {}
  const active: Extract<MaterialSkuSelectionPreview, { state: 'ready' }>['fields'][number][] = []
  const seen = new Set<string>()
  for (const field of fields) {
    if (!field.name || seen.has(field.name) || field.options.length > 100) return blocked('销售属性重复或字典不完整')
    seen.add(field.name)
    const codes = candidates[field.name]
    if (!codes?.length) continue
    if (codes.length > 40 || new Set(codes).size !== codes.length) return blocked('材料属性值不完整')
    const dictionary = new Map(field.options.map(option => [option.value, option.label]))
    if (field.options.some(option => !option.value || !option.label || !option.label.trim())
      || dictionary.size !== field.options.length) return blocked('属性选项标签不完整')
    const options = codes.map(value => ({ value, label: dictionary.get(value) ?? '' }))
    if (options.some(option => !option.label)) return blocked('材料属性值没有对应 Code 标签')
    active.push({ name: field.name, label: field.label, options })
  }
  if (!active.length) return { state: 'not_configured', message: '该材料未设置销售规格' }
  if (!variants.length) return blocked('当前材料没有可用 SKU')
  const skuIds = new Set<string>()
  for (const sku of variants) {
    if (!sku.id || sku.spuId !== spu.id || skuIds.has(sku.id)) return blocked('SKU 与当前材料身份不一致')
    skuIds.add(sku.id)
    for (const field of active) {
      const value = sku.saleAttributeValues?.[field.name]
      if (!value || !field.options.some(option => option.value === value)) {
        return blocked('SKU 属性与材料选项无法精确匹配')
      }
    }
  }
  return { state: 'ready', fields: active, variants }
}

/** A complete exact-value combination, never a label/position-based guess. */
export function matchMaterialSkuSelectionPreview(
  preview: MaterialSkuSelectionPreview,
  selected: Readonly<Record<string, string>>,
): MaterialSkuSelectionMatch {
  if (preview.state !== 'ready') return { state: 'blocked' }
  if (Object.keys(selected).some(name => !preview.fields.some(field => field.name === name))) {
    return { state: 'blocked' }
  }
  if (preview.fields.some(field => !selected[field.name])) return { state: 'incomplete' }
  if (preview.fields.some(field => !field.options.some(option => option.value === selected[field.name]))) {
    return { state: 'blocked' }
  }
  const candidates = preview.variants.filter(sku =>
    preview.fields.every(field => sku.saleAttributeValues?.[field.name] === selected[field.name]))
  if (candidates.length > 1) return { state: 'ambiguous' }
  return candidates[0] ? { state: 'matched', skuId: candidates[0].id } : { state: 'unavailable' }
}
