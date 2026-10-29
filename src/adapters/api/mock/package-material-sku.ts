/** DEV-only R1-shaped package layer/Material SKU. Never a real package/price. */
import {
  syntheticMaterialSalesFields, syntheticMaterialSpu, syntheticMaterialSkuRows,
} from './material-sku'

export const syntheticPackageId = 'synthetic-package-roof'
export const syntheticPackageMaterialLinks = [
  {
    _id: 'synthetic-link-l1-roof', materialId: syntheticMaterialSpu._id,
    material: { ...syntheticMaterialSpu, name: '防水卷材（模拟）' },
    exts: { layer: '1' },
  },
  {
    _id: 'synthetic-link-l1-alternative', materialId: 'synthetic-spu-alternative',
    material: { _id: 'synthetic-spu-alternative', name: '替代卷材（模拟）',
      exts: { thickness: ['2'], color: ['grey'] } },
    exts: { layer: '1' },
  },
  {
    _id: 'synthetic-link-l2-coating', materialId: 'synthetic-spu-coating',
    material: { _id: 'synthetic-spu-coating', name: '配套涂料（模拟）',
      exts: { thickness: ['3'], color: ['black'] } },
    exts: { layer: '2' },
  },
] as const
export const syntheticPackageSkuRows = [
  ...syntheticMaterialSkuRows,
  { _id: 'synthetic-sku-alt-2-grey', spuid: 'synthetic-spu-alternative',
    state: 1, exts: { thickness: '2', color: 'grey' }, number: 0 },
  { _id: 'synthetic-sku-coat-3-black', spuid: 'synthetic-spu-coating',
    state: 1, exts: { thickness: '3', color: 'black' }, number: 1 },
] as const
export { syntheticMaterialSalesFields as syntheticPackageSalesFields }
