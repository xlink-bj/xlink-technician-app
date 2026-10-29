/** Synthetic provider rows for the G4-F read-only catalog foundation. */
export const mockQuotationCatalogServiceType = 'mock-service-waterproof'
export const mockQuotationCatalogSourceType = 'mock-source-standard'

export const mockQuotationPackageListResponse = {
  data: [
    {
      _id: 'mock-catalog-package-basic',
      name: '平屋面节点防水维修套餐',
      code: 'ROOF-PKG-001',
      type: 'mock-package-type',
      agelimit: 2,
      unit: '项',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 1,
    },
    {
      _id: 'mock-catalog-package-extended',
      name: '外墙窗边密封维修套餐',
      code: 'WALL-PKG-002',
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
      name: '檐口与泛水节点密封处理',
      content: '檐口与泛水节点密封处理',
      guideUnitPrice: 68.4,
      unit: '处',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 1,
    },
    // Commercial UX fixture: provider-shaped, intentionally synthetic and
    // never a claim of a current tenant catalogue price.
    {
      _id: 'mock-catalog-procedure-roof-node',
      name: '屋面节点密封加强施工',
      content: '屋面节点密封加强施工',
      guideUnitPrice: 68.4,
      unit: '处',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 2,
    },
  ],
  page: 1,
  rows: 20,
  total: 2,
} as const

export const mockQuotationMaterialListResponse = {
  data: [
    {
      _id: 'mock-catalog-material-sealant',
      name: '聚氨酯建筑密封胶',
      code: 'SEAL-600-001',
      unit: '支',
      materialUnit: '支',
      spec: '600ml/支',
      specUnit: '支',
      type: 1,
      // Synthetic SPU option whitelist; raw R1 ExtField/Code and SKU routes
      // independently verify these values before the local-only picker shows them.
      exts: { thickness: ['2', '3'], color: ['black', 'grey'] },
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 1,
    },
    // The current authorized technician has active ordinary Materials but
    // no active current-tenant SKU. These synthetic rows reproduce that
    // structural case without copying Production IDs or values (#120).
    {
      _id: 'mock-catalog-material-ordinary-1',
      name: '屋面防水修缮辅材',
      code: 'MAT-AUX-001',
      // Synthetic only: the field name and R1 calculation come from the
      // source contract, but this is NOT an authorized tenant SKU sale price.
      price: 38.6,
      unit: '件',
      materialUnit: '件',
      type: 1,
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 2,
    },
    {
      _id: 'mock-catalog-material-ordinary-2',
      name: '防水基层处理辅材',
      code: 'MAT-AUX-002',
      price: 26.8,
      unit: '件',
      materialUnit: '件',
      type: 1,
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 3,
    },
    {
      _id: 'mock-catalog-material-butyl-tape',
      name: '丁基防水密封胶带（100mm×10m）',
      code: 'TAPE-10010',
      price: 38.6,
      unit: '卷',
      materialUnit: '卷',
      spec: '100mm×10m',
      type: 1,
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 4,
    },
    {
      _id: 'mock-catalog-material-polyester-fabric',
      name: '聚酯胎增强布（1m×10m）',
      code: 'FABRIC-1X10',
      price: 26.8,
      unit: '卷',
      materialUnit: '卷',
      spec: '1m×10m',
      type: 1,
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 5,
    },
  ],
  page: 1,
  rows: 20,
  total: 5,
} as const

export const mockQuotationMeasureListResponse = {
  data: [
    {
      _id: 'mock-catalog-measure-inspection',
      name: '高处作业安全防护',
      content: '高处作业安全防护',
      guideUnitPrice: 54.2,
      unit: '次',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 1,
    },
    {
      _id: 'mock-catalog-measure-site-safety',
      name: '施工区域安全防护',
      content: '施工区域安全防护',
      guideUnitPrice: 54.2,
      unit: '次',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 2,
    },
  ],
  page: 1,
  rows: 20,
  total: 2,
} as const

export const mockQuotationPackageDetailResponse = {
  success: true,
  entity: {
    _id: 'mock-catalog-package-basic',
    name: '平屋面节点防水维修套餐',
    code: 'ROOF-PKG-001',
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
          name: '檐口与泛水节点密封处理',
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
          name: '聚氨酯建筑密封胶',
          code: 'SEAL-600-001',
          unit: '支',
          materialUnit: '支',
          spec: '600ml/支',
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
          name: '高延伸率建筑密封胶',
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
          name: '基层界面处理涂料',
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
          name: '高处作业安全防护',
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
      name: '聚氨酯密封胶 黑色 2毫米', state: 1,
      exts: { thickness: '2', color: 'black' } },
    { _id: 'mock-material-sku-grey-3', spuid: mockMaterialSkuSpuId,
      name: '聚氨酯密封胶 灰色 3毫米', state: 1,
      exts: { thickness: '3', color: 'grey' } },
  ],
  page: 1, rows: 20, total: 2,
} as const
