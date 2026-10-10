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
      exts: { repairParts: '["synthetic-roof"]', constructionParts: '["synthetic-wall"]' },
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
      exts: { repairParts: '["synthetic-wall"]', constructionParts: '["synthetic-wall"]' },
    },
    {
      _id: 'mock-catalog-package-unknown',
      name: '待核实适用范围的套餐（合成）',
      type: 'mock-package-type',
      unit: '项',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 3,
    },
  ],
  page: 1,
  rows: 20,
  total: 3,
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
      exts: { repairProcedure: '[&quot;synthetic-seal&quot;]' },
    },
    {
      _id: 'mock-catalog-procedure-prep',
      name: '基层处理工序（示例）',
      content: '模拟基层处理',
      unit: '处',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 2,
      exts: { repairProcedure: '["synthetic-prep"]' },
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
      name: '弹性密封材料（示例）',
      code: 'DEMO-MAT-001',
      unit: '支',
      materialUnit: '支',
      spec: '常用包装规格（示例）',
      specUnit: '支',
      type: 1,
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 1,
    },
    {
      _id: 'mock-catalog-material-unknown',
      name: '材料分类待核实（合成）',
      unit: '支',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 2,
    },
  ],
  page: 1,
  rows: 20,
  total: 2,
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
