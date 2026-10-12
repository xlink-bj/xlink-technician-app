/** Synthetic provider rows for the G4-F read-only catalog foundation. */
export const mockQuotationCatalogServiceType = 'mock-service-waterproof'
export const mockQuotationCatalogSourceType = 'mock-source-standard'

export const mockQuotationPackageListResponse = {
  data: [
    {
      _id: 'mock-catalog-package-basic',
      name: '屋面防水修缮方案（示例）',
      code: 'DEMO-PKG-001',
      type: 'mock-package-type',
      agelimit: 2,
      unit: '项',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 1,
    },
    {
      _id: 'mock-catalog-package-extended',
      name: '外墙节点防水方案（示例）',
      code: 'DEMO-PKG-002',
      type: 'mock-package-type',
      agelimit: 3,
      unit: '项',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 2,
    },
  ],
  page: 1,
  rows: 20,
  total: 2,
} as const

export const mockQuotationProcedureListResponse = {
  data: [
    {
      _id: 'mock-catalog-procedure-seal',
      name: '檐口密封处理（示例）',
      content: '檐口密封处理（示例）',
      unit: '处',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 1,
    },
  ],
  page: 1,
  rows: 20,
  total: 1,
} as const

export const mockQuotationMaterialListResponse = {
  data: [
    {
      _id: 'mock-catalog-material-sealant',
      name: '弹性密封材料（示例）',
      code: 'DEMO-MAT-001',
      unit: '支',
      materialUnit: '支',
      spec: '常用包装规格（示例）',
      specUnit: '支',
      type: 1,
      // Synthetic SPU option whitelist; raw R1 ExtField/Code and SKU routes
      // independently verify these values before the local-only picker shows them.
      exts: { thickness: ['2', '3'], color: ['black', 'grey'] },
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 1,
    },
  ],
  page: 1,
  rows: 20,
  total: 1,
} as const

export const mockQuotationMeasureListResponse = {
  data: [
    {
      _id: 'mock-catalog-measure-inspection',
      name: '高处作业防护（示例）',
      content: '高处作业防护（示例）',
      unit: '次',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 1,
    },
  ],
  page: 1,
  rows: 20,
  total: 1,
} as const

export const mockQuotationPackageDetailResponse = {
  success: true,
  entity: {
    _id: 'mock-catalog-package-basic',
    name: '屋面防水修缮方案（示例）',
    code: 'DEMO-PKG-001',
    type: 'mock-package-type',
    agelimit: 2,
    unit: '项',
    serviceType: [mockQuotationCatalogServiceType],
    sourceTypeList: [mockQuotationCatalogSourceType],
    order: 1,
    procedureList: [
      {
        _id: 'mock-package-procedure-row',
        procedureId: 'mock-catalog-procedure-seal',
        procedure: {
          _id: 'mock-catalog-procedure-seal',
          name: '檐口密封处理（示例）',
          unit: '处',
          order: 1,
        },
        coefficient: 1,
        coefficientUnit: '处',
        number: '1',
        unit: '处',
        order: 1,
      },
    ],
    materialList: [
      {
        _id: 'mock-package-material-row',
        materialId: 'mock-catalog-material-sealant',
        material: {
          _id: 'mock-catalog-material-sealant',
          name: '弹性密封材料（示例）',
          code: 'DEMO-MAT-001',
          unit: '支',
          materialUnit: '支',
          spec: '常用包装规格（示例）',
          specUnit: '支',
          type: 1,
          order: 1,
        },
        exts: { layer: 'mock-layer-1' },
        coefficient: 1,
        coefficientUnit: '支',
        number: '1',
        unit: '支',
        order: 1,
      },
      {
        _id: 'mock-package-material-row-alternative',
        materialId: 'mock-catalog-material-sealant-alternative',
        material: {
          _id: 'mock-catalog-material-sealant-alternative',
          name: '高延伸密封材料（替代示例）',
          unit: '支',
          order: 2,
        },
        exts: { layer: 'mock-layer-1' },
        unit: '支',
        order: 2,
      },
      {
        _id: 'mock-package-material-row-layer-2',
        materialId: 'mock-catalog-material-layer-2',
        material: {
          _id: 'mock-catalog-material-layer-2',
          name: '基层防护涂料（示例）',
          unit: '桶',
          order: 3,
        },
        exts: { layer: 2 },
        unit: '桶',
        order: 3,
      },
    ],
    measureList: [
      {
        _id: 'mock-package-measure-row',
        measureId: 'mock-catalog-measure-inspection',
        measure: {
          _id: 'mock-catalog-measure-inspection',
          name: '高处作业防护（示例）',
          unit: '次',
          order: 1,
        },
        coefficient: 1,
        number: '1',
        unit: '次',
        order: 1,
      },
    ],
  },
} as const

/** R1-shaped, wholly synthetic DEV Mock SKU contract. Never production catalog data. */
export const mockMaterialSkuSpuId = 'mock-catalog-material-sealant'
export const mockMaterialSalesExtFieldsResponse = {
  data: [
    { _id: 'mock-sale-thickness', colName: 'material', state: 1,
      name: 'thickness', nameDisp: '厚度', valueOption: 'MOCK_MATERIAL_THICKNESS',
      frontEndConfig: JSON.stringify({ salesAttribute: true }) },
    { _id: 'mock-sale-color', colName: 'material', state: 1,
      name: 'color', nameDisp: '颜色', valueOption: 'MOCK_MATERIAL_COLOR',
      frontEndConfig: JSON.stringify({ salesAttribute: true }) },
  ],
  page: 1, rows: 20, total: 2,
} as const

export const mockMaterialSaleCodeOptions = {
  MOCK_MATERIAL_THICKNESS: { '2': '2毫米', '3': '3毫米' },
  MOCK_MATERIAL_COLOR: { black: '黑色', grey: '灰色' },
} as const

export const mockMaterialSkuVariantsResponse = {
  data: [
    { _id: 'mock-material-sku-black-2', spuid: mockMaterialSkuSpuId,
      name: '密封材料黑色 2毫米（仿真）', state: 1,
      exts: { thickness: '2', color: 'black' } },
    { _id: 'mock-material-sku-grey-3', spuid: mockMaterialSkuSpuId,
      name: '密封材料灰色 3毫米（仿真）', state: 1,
      exts: { thickness: '3', color: 'grey' } },
  ],
  page: 1, rows: 20, total: 2,
} as const
