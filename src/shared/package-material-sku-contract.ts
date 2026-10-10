import { matchR1MaterialSku, projectR1MaterialSku, type MaterialSkuRead } from './material-sku-contract'

/**
 * R1 xlink-app@6c0a97b placeOrders.vue L6289–6390, L6410–6525, L6715–6745:
 * package material body link (id, materialId, layer), Material SPU and its
 * SKU rows are three identities. This is a PURE read/preview contract, never
 * an authorization/availability/pricing or official Order encoder.
 */
type Rec = Readonly<Record<string, unknown>>
const rec = (v: unknown): Rec | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Rec : null
const key = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

export type PackageSkuFailure =
  | 'missing_package_identity' | 'unsupported_pricing_method'
  | 'invalid_material_link' | 'duplicate_link_id'
  | 'orphan_sku_parent' | 'duplicate_sku_id'
  | 'invalid_material_source'

export interface PackageSkuMaterialOption {
  readonly linkId: string
  readonly layer: string
  readonly materialId: string
  readonly name: string
  readonly skuRead: MaterialSkuRead
}
export interface PackageSkuLayerRead {
  readonly layer: string
  readonly options: readonly PackageSkuMaterialOption[]
}
export type PackageMaterialSkuRead =
  | { readonly state: 'blocked'; readonly reason: PackageSkuFailure }
  | { readonly state: 'not_applicable'; readonly packageId: string }
  | { readonly state: 'ready'; readonly packageId: string; readonly layers: readonly PackageSkuLayerRead[] }

export interface PackageSkuChoice {
  readonly layer: string
  readonly linkId: string
  readonly attributes: Readonly<Record<string, string>>
}
export interface PackageSkuChosenVariant {
  readonly layer: string
  readonly linkId: string
  readonly materialId: string
  readonly skuId: string
  readonly historicalQuantity?: number
}
export type PackageSkuSelection =
  | { readonly state: 'blocked' | 'incomplete' | 'unavailable' | 'ambiguous' | 'not_applicable' }
  | { readonly state: 'ready'; readonly rows: readonly PackageSkuChosenVariant[] }
const fail = (reason: PackageSkuFailure): PackageMaterialSkuRead => ({ state: 'blocked', reason })

export function projectR1PackageMaterialSku(input: {
  readonly packageId: unknown
  readonly pricingMethod: unknown
  readonly materialLinks: unknown
  readonly salesFields: unknown
  readonly skuRows: unknown
}): PackageMaterialSkuRead {
  const packageId = key(input.packageId)
  if (!packageId) return fail('missing_package_identity')
  if (input.pricingMethod !== '1') {
    if (typeof input.pricingMethod === 'string' && input.pricingMethod.trim()) {
      return { state: 'not_applicable', packageId }
    }
    return fail('unsupported_pricing_method')
  }
  if (!Array.isArray(input.materialLinks) || !Array.isArray(input.skuRows)
    || !Array.isArray(input.salesFields) || !input.materialLinks.length) {
    return fail('invalid_material_source')
  }

  const ids = new Set<string>()
  const materials = new Map<string, { layer: string; materialId: string; name: string; spu: unknown }[]>()
  const validParents = new Set<string>()
  for (const raw of input.materialLinks) {
    const link = rec(raw), material = rec(link?.material), exts = rec(link?.exts)
    const linkId = key(link?._id), materialId = key(link?.materialId)
    const layer = key(exts?.layer)
    const spuId = key(material?._id), name = key(material?.name)
    if (!linkId || !materialId || !layer || !spuId || spuId !== materialId || !name) {
      return fail('invalid_material_link')
    }
    if (ids.has(linkId)) return fail('duplicate_link_id')
    ids.add(linkId)
    validParents.add(materialId)
    const old = materials.get(layer) ?? []
    old.push({ layer, materialId, name, spu: material })
    materials.set(layer, old)
  }

  // Preserve original body link identity, including two alternatives in one
  // layer. Never drop a SKU with a foreign parent and silently offer a subset.
  const seenSkuIds = new Set<string>()
  for (const raw of input.skuRows) {
    const row = rec(raw)
    const skuId = key(row?._id), parent = key(row?.spuid)
    if (!skuId || !parent) return fail('invalid_material_source')
    if (seenSkuIds.has(skuId)) return fail('duplicate_sku_id')
    seenSkuIds.add(skuId)
    if (!validParents.has(parent)) return fail('orphan_sku_parent')
  }

  const layers: PackageSkuLayerRead[] = []
  // Map retains backend supplied order; UI may label but MUST NOT infer
  // mandatory/optional layer flags from absent body metadata.
  let i = 0
  for (const [layer, links] of materials) {
    const options: PackageSkuMaterialOption[] = []
    for (const source of input.materialLinks) {
      const link = rec(source), exts = rec(link?.exts)
      if (key(exts?.layer) !== layer) continue
      const material = rec(link?.material)
      if (!material) return fail('invalid_material_link')
      const materialId = key(link?.materialId)
      const linkId = key(link?._id)
      const name = key(material.name)
      if (!materialId || !linkId || !name) return fail('invalid_material_link')
      const rows = input.skuRows.filter((sku: unknown) => rec(sku)?.spuid === materialId)
      const skuRead = projectR1MaterialSku({
        spu: material, salesFields: input.salesFields, skuRows: rows,
      })
      // A malformed material/SKU must not be downgraded into a usable
      // package option, even if other layers contain valid SKUs.
      if (skuRead.state === 'blocked' || skuRead.state === 'not_configured') {
        return fail('invalid_material_source')
      }
      options.push({ linkId, layer, materialId, name, skuRead })
    }
    if (!options.length || links.length !== options.length) return fail('invalid_material_source')
    layers.push({ layer, options })
    i += 1
  }
  return layers.length ? { state: 'ready', packageId, layers } : fail('invalid_material_source')
}

/** Full layer-by-layer preview only, never a pricing or draft write command. */
export function matchR1PackageMaterialSku(
  source: PackageMaterialSkuRead,
  selected: readonly PackageSkuChoice[],
): PackageSkuSelection {
  if (source.state !== 'ready') return { state: source.state === 'blocked' ? 'blocked' : 'not_applicable' }
  if (selected.length > source.layers.length) return { state: 'blocked' }
  const seenLayers = new Set<string>()
  for (const row of selected) {
    if (seenLayers.has(row.layer) || !source.layers.some((l) => l.layer === row.layer)) {
      return { state: 'blocked' }
    }
    seenLayers.add(row.layer)
  }
  if (selected.length !== source.layers.length) return { state: 'incomplete' }
  const chosen: PackageSkuChosenVariant[] = []
  for (const layer of source.layers) {
    const selection = selected.find((s) => s.layer === layer.layer)
    if (!selection) return { state: 'incomplete' }
    const option = layer.options.find((x) => x.linkId === selection.linkId)
    if (!option) return { state: 'blocked' }
    const result = matchR1MaterialSku(option.skuRead, selection.attributes)
    if (result.state === 'ambiguous') return { state: 'ambiguous' }
    if (result.state === 'unavailable') return { state: 'unavailable' }
    if (result.state === 'blocked' || result.state === 'not_configured') return { state: 'blocked' }
    if (result.state === 'incomplete') return { state: 'incomplete' }
    chosen.push({
      layer: layer.layer, linkId: option.linkId, materialId: option.materialId,
      skuId: result.skuId,
      ...(result.existingQuantity === undefined ? {} : { historicalQuantity: result.existingQuantity }),
    })
  }
  return { state: 'ready', rows: chosen }
}
