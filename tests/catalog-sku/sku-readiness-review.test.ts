import { describe, expect, it } from 'vitest'
import { makeSameCatalogSkuMock } from '@adapters/api/mock/quotation-sku-same-catalog'
import {
  mockQuotationPackageDetailResponse, mockQuotationMaterialListResponse,
} from '@adapters/api/mock/quotation-catalog'
import { createQuotationGroup, type QuotationDraft } from '@features/work-orders/quotation/model'
import { reviewP1SyntheticSkuReadiness } from '@app/p1-sku-readiness-review'

const detail = mockQuotationPackageDetailResponse.entity

function sample(): QuotationDraft {
  return {
    workOrderId: 'mock-019', workflowNodeId: 'mock-place_order', draftVersion: 5,
    groups: [
      {
        ...createQuotationGroup('group1'),
        projPackages: [{
          selectionId: 'mock-package', kind: 'package',
          catalogId: detail._id, label: detail.name, quantity: 1,
          configuration: {
            procedures: [], measures: [],
            materials: [detail.materialList[0], detail.materialList[2]].map(row => ({
              providerComponentId: row._id, providerReferenceId: row.materialId,
              catalogId: row.materialId, label: row.material.name,
              layer: row.exts.layer,
            })),
          },
        }],
      },
      {
        ...createQuotationGroup('group2'),
        materials: [{
          selectionId: 'direct-material', kind: 'material',
          catalogId: mockQuotationMaterialListResponse.data[0]._id,
          label: mockQuotationMaterialListResponse.data[0].name, quantity: 1,
        }],
      },
    ],
  }
}

const blocked = (reason: string) =>
  ({ state: 'blocked_synthetic', reason, realSkuAuthorized: false, officialOrderAllowed: false })

describe('P1 M1.6 main quotation synthetic source→scope→sales options review', () => {
  it('integrates the ACTUAL Quote Catalog two-group IDs and raw numeric layer', () => {
    expect(reviewP1SyntheticSkuReadiness(sample())).toEqual({
      state: 'synthetic_structure_only',
      materialSpuCount: 2, saleFieldCount: 4, saleOptionCount: 4,
      realSkuAuthorized: false, officialOrderAllowed: false,
      tenantAuthorization: 'unverified', workOrderAuthorization: 'unverified',
    })
    const old = makeSameCatalogSkuMock()
    expect(old.state).toBe('ready_synthetic_only')
  })

  it('never derives a commercial SKU, order, amount, stock, or live permission', () => {
    const result = reviewP1SyntheticSkuReadiness(sample())
    expect(result?.realSkuAuthorized).toBe(false)
    expect(result?.officialOrderAllowed).toBe(false)
    for (const key of ['skuId', 'skuSelected', 'orderId', 'price', 'stock', 'amount', 'request']) {
      expect(result).not.toHaveProperty(key)
    }
  })

  it('does not accept no material, even with a valid synthetic principal', () => {
    const empty: QuotationDraft = {
      ...sample(), groups: [{ ...createQuotationGroup('group1') }],
    }
    expect(reviewP1SyntheticSkuReadiness(empty)).toEqual(blocked('no_selected_materials'))
  })

  it('fails if direct Material catalog selection is an unknown SPU', () => {
    const draft = sample()
    const groups = draft.groups.map((g, i) => i !== 1 ? g : ({
      ...g, materials: g.materials.map(m => ({ ...m, catalogId: 'foreign-spu' })),
    }))
    expect(reviewP1SyntheticSkuReadiness({ ...draft, groups }))
      .toEqual(blocked('quote_source_identity_mismatch'))
  })

  it('checks exact package material body IDs rather than matching product names', () => {
    const draft = sample()
    const groups = draft.groups.map((g, i) => i !== 0 ? g : ({
      ...g, projPackages: g.projPackages.map(p => ({
        ...p, configuration: p.configuration && {
          ...p.configuration,
          materials: p.configuration.materials.map(m => ({
            ...m, providerComponentId: 'foreign-material-body',
          })),
        },
      })),
    }))
    expect(reviewP1SyntheticSkuReadiness({ ...draft, groups }))
      .toEqual(blocked('quote_source_identity_mismatch'))
  })

  it('refuses numeric layer 2 normalized to text "2"', () => {
    const draft = sample()
    const groups = draft.groups.map((g, i) => i !== 0 ? g : ({
      ...g, projPackages: g.projPackages.map(p => ({
        ...p, configuration: p.configuration && {
          ...p.configuration,
          materials: p.configuration.materials.map(m =>
            m.layer === 2 ? { ...m, layer: '2' } : m),
        },
      })),
    }))
    expect(reviewP1SyntheticSkuReadiness({ ...draft, groups }))
      .toEqual(blocked('quote_source_identity_mismatch'))
  })

  it('does not silently accept missing package configuration', () => {
    const draft = sample()
    const groups = draft.groups.map((g, i) => i !== 0 ? g : ({
      ...g, projPackages: g.projPackages.map(p => ({ ...p, configuration: undefined })),
    }))
    expect(reviewP1SyntheticSkuReadiness({ ...draft, groups }))
      .toEqual(blocked('quote_source_identity_mismatch'))
  })

  it('propagates malformed catalog source and child SPU conflicts as blocked', () => {
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      catalogSource: { materialList: { data: null } },
    })).toEqual(blocked('catalog_unavailable'))
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      catalogSource: {
        packageDetail: {
          entity: { ...detail, materialList: detail.materialList.map((row, i) =>
            i === 0 ? { ...row, materialId: 'inconsistent-spu' } : row),
          },
        },
      },
    })).toEqual(blocked('catalog_unavailable'))
  })

  it('requires complete catalog provenance before option checking', () => {
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      catalogListingComplete: false,
    })).toEqual(blocked('source_preflight_blocked'))
  })

  it('fails closed on missing role, mismatched current WorkOrder and tenant', () => {
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      principal: null,
    })).toEqual(blocked('source_preflight_blocked'))
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      principal: {
        sessionRef: 'mock-session', userId: 'mock-user', roleId: '',
        roleVersion: '1', tenantId: 'dev-mock-tenant', workOrderId: 'mock-019',
      },
    })).toEqual(blocked('source_preflight_blocked'))
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      principal: {
        sessionRef: 'mock-session', userId: 'mock-user', roleId: 'role',
        roleVersion: '1', tenantId: 'dev-mock-tenant', workOrderId: 'foreign-wo',
      },
    })).toEqual(blocked('source_preflight_blocked'))
  })

  it('rejects a caller-supplied code option tenant even though SPU IDs correlate', () => {
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      codeTenantId: 'foreign-tenant',
    })).toEqual(blocked('sales_option_source_blocked'))
  })

  it('rejects missing, duplicate or foreign code option response identities', () => {
    expect(reviewP1SyntheticSkuReadiness(sample(), { codeResults: [] }))
      .toEqual(blocked('sales_option_source_blocked'))
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      codeResults: [
        { eleid: 'synthetic-thickness', options: { '2': '2mm' } },
        { eleid: 'synthetic-color', options: { grey: '灰色' } },
        { eleid: 'foreign-tenant-options', options: { something: 'value' } },
      ],
    })).toEqual(blocked('sales_option_source_blocked'))
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      codeResults: [
        { eleid: 'synthetic-thickness', options: { '2': '2mm' } },
        { eleid: 'synthetic-color', options: { grey: '灰色' } },
        { eleid: 'synthetic-color', options: { grey: '灰色' } },
      ],
    })).toEqual(blocked('sales_option_source_blocked'))
  })

  it('rejects malformed sale configuration and duplicate attribute definitions', () => {
    const original = [
      {
        colName: 'material', state: 1, tenantId: 'dev-mock-tenant',
        name: 'thickness', nameDisp: '厚度', valueOption: 'synthetic-thickness',
        frontEndConfig: '{bad',
      },
    ]
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      saleFieldRows: original,
    })).toEqual(blocked('sales_option_source_blocked'))
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      saleFieldRows: [
        {
          colName: 'material', state: 1, tenantId: 'dev-mock-tenant',
          name: 'thickness', nameDisp: '厚度', valueOption: 'synthetic-thickness',
          frontEndConfig: { salesAttribute: true },
        },
        {
          colName: 'material', state: 1, tenantId: 'dev-mock-tenant',
          name: 'thickness', nameDisp: '厚度', valueOption: 'synthetic-thickness',
          frontEndConfig: { salesAttribute: true },
        },
      ],
    })).toEqual(blocked('sales_option_source_blocked'))
  })

  it('does not treat an ordinary field list without sales attributes as SKU ready', () => {
    expect(reviewP1SyntheticSkuReadiness(sample(), {
      saleFieldRows: [{
        colName: 'material', state: 1, tenantId: 'dev-mock-tenant',
        frontEndConfig: '{}',
      }],
      codeResults: [],
    })).toEqual(blocked('sales_option_source_blocked'))
  })

  it('is pure and preserves the persisted quotation draft and mock catalog', () => {
    const draft = sample()
    const beforeDraft = JSON.stringify(draft)
    const beforeSource = JSON.stringify(mockQuotationPackageDetailResponse)
    reviewP1SyntheticSkuReadiness(draft)
    reviewP1SyntheticSkuReadiness(draft, { codeTenantId: 'foreign' })
    expect(JSON.stringify(draft)).toBe(beforeDraft)
    expect(JSON.stringify(mockQuotationPackageDetailResponse)).toBe(beforeSource)
  })
})
