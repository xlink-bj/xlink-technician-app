import { projectR1MaterialSku, type MaterialSkuRead } from '@shared/material-sku-contract'
import { projectR1PackageMaterialSku, type PackageMaterialSkuRead } from '@shared/package-material-sku-contract'
import { syntheticMaterialSalesFields } from './material-sku'
import {
  mockQuotationMaterialListResponse, mockQuotationPackageDetailResponse,
  mockQuotationPackageListResponse,
} from './quotation-catalog'

type Rec = Readonly<Record<string, unknown>>
const object = (v: unknown): Rec | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Rec : null
const id = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() === v && v.length > 0 ? v : null

export type SameCatalogMockRead =
  | { readonly state: 'blocked'; readonly reason: 'package_not_listed' | 'malformed_catalog' | 'conflicting_spu_identity' | 'incomplete_layer_reference' }
  | {
      readonly state: 'ready_synthetic_only'
      readonly direct: readonly MaterialSkuRead[]
      readonly packages: readonly PackageMaterialSkuRead[]
      readonly quoteCatalogMaterialIds: readonly string[]
      readonly syntheticPricingMethod: '1'
      readonly syntheticSaleAttributes: true
      readonly realSourceAuthorized: false
    }

/**
 * Creates TEST DATA tied to the EXISTING Quotation Catalog synthetic IDs.
 *
 * Never convert the original Material/Package responses into a falsely
 * "authorized" SKU provider. The R1 pricingMethod and sale attributes do not
 * exist in those responses: BOTH are explicitly synthesized for DEV proof.
 */
export function makeSameCatalogSkuMock(input: {
  readonly packageList?: unknown
  readonly materialList?: unknown
  readonly packageDetail?: unknown
} = {}): SameCatalogMockRead {
  const packageList = object(input.packageList ?? mockQuotationPackageListResponse)
  const materialList = object(input.materialList ?? mockQuotationMaterialListResponse)
  const detailResponse = object(input.packageDetail ?? mockQuotationPackageDetailResponse)
  const packages = packageList?.data, directs = materialList?.data
  const detail = object(detailResponse?.entity)
  if (!Array.isArray(packages) || !Array.isArray(directs) || !detail || !Array.isArray(detail.materialList)) {
    return { state: 'blocked', reason: 'malformed_catalog' }
  }
  const packageId = id(detail._id)
  if (!packageId || !packages.some(p => object(p)?._id === packageId)) {
    return { state: 'blocked', reason: 'package_not_listed' }
  }

  const spuById = new Map<string, { readonly _id: string; readonly name: string }>()
  const add = (raw: unknown): boolean => {
    const row = object(raw), key = id(row?._id), name = id(row?.name)
    if (!row || !key || !name) return false
    const previous = spuById.get(key)
    if (previous && previous.name !== name) return false
    if (!previous) spuById.set(key, { _id: key, name })
    return true
  }
  const quoteCatalogMaterialIds: string[] = []
  for (const direct of directs) {
    const value = object(direct), key = id(value?._id)
    if (!key || !add(direct) || quoteCatalogMaterialIds.includes(key)) {
      return { state: 'blocked', reason: 'conflicting_spu_identity' }
    }
    quoteCatalogMaterialIds.push(key)
  }
  for (const entry of detail.materialList) {
    const body = object(entry), material = object(body?.material)
    if (!body || !material || !id(body._id)
      || id(body.materialId) !== id(material._id)
      || !add(material)) return { state: 'blocked', reason: 'incomplete_layer_reference' }
  }

  // Pinned Production structural evidence (#120) contains ordinary active
  // Materials WITHOUT a sale-attribute value and WITHOUT an active SKU.
  // They must remain ordinary catalog items, never gain a synthetic SKU here.
  // The demo SKU overlay is explicit only where the test source declares
  // sale attributes, or for the separately synthetic Package detail pathway.
  const eligibleDirectSkuIds = new Set(directs.flatMap(raw => {
    const row = object(raw), exts = object(row?.exts), key = id(row?._id)
    return key && exts && ['thickness', 'color'].some(field =>
      Array.isArray(exts[field]) && (exts[field] as unknown[]).length > 0
    ) ? [key] : []
  }))
  const packageSkuIds = new Set(detail.materialList.map(entry => id(object(entry)?.materialId)).filter(
    (key): key is string => key !== null,
  ))
  const eligibleSkuIds = new Set([...eligibleDirectSkuIds, ...packageSkuIds])

  // Purely synthetic R1 sales-field overlay; never copy quantity/price to
  // real quotation drafts, never infer an existing Production activity SKU.
  const materialWithDemoFields = (key: string): Rec => ({
    ...spuById.get(key)!,
    exts: { thickness: ['2'], color: ['grey'] },
  })
  const skuRows = [...eligibleSkuIds].map(key => ({
    _id: 'same-catalog-demo-sku:' + key,
    spuid: key, state: 1,
    exts: { thickness: '2', color: 'grey' },
    number: 0,
  }))
  const packageMaterialLinks = detail.materialList.map(entry => {
    const body = object(entry)!, key = id(body.materialId)!
    return { ...body, material: materialWithDemoFields(key) }
  })
  const direct = quoteCatalogMaterialIds.filter(key => eligibleDirectSkuIds.has(key)).map(key => projectR1MaterialSku({
    spu: materialWithDemoFields(key),
    salesFields: syntheticMaterialSalesFields,
    skuRows: skuRows.filter(s => s.spuid === key),
  }))
  const packaged = projectR1PackageMaterialSku({
    packageId, pricingMethod: '1', // DEV-only hypothetical R1 SKU pricing path.
    materialLinks: packageMaterialLinks,
    salesFields: syntheticMaterialSalesFields,
    skuRows: skuRows.filter(s => packageMaterialLinks.some(
      b => object(b)?.materialId === s.spuid,
    )),
  })
  return {
    state: 'ready_synthetic_only',
    direct, packages: [packaged],
    quoteCatalogMaterialIds,
    syntheticPricingMethod: '1',
    syntheticSaleAttributes: true,
    realSourceAuthorized: false,
  }
}
