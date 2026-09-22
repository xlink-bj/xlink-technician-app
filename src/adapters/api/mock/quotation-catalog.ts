/** Synthetic provider rows for the G4-F read-only catalog foundation. */
export const mockQuotationCatalogServiceType = 'mock-service-waterproof'
export const mockQuotationCatalogSourceType = 'mock-source-standard'

export const mockQuotationPackageListResponse = {
  data: [
    {
      _id: 'mock-catalog-package-basic',
      name: 'Mock 服务方案 A',
      unit: '项',
      serviceType: [mockQuotationCatalogServiceType],
      sourceTypeList: [mockQuotationCatalogSourceType],
      order: 1,
    },
    {
      _id: 'mock-catalog-package-extended',
      name: 'Mock 服务方案 B',
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
      name: 'Mock 施工工序 A',
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
      name: 'Mock 材料 A',
      unit: '支',
      spec: '合成规格',
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
      name: 'Mock 计措 A',
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
    name: 'Mock 服务方案 A',
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
          name: 'Mock 施工工序 A',
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
          name: 'Mock 材料 A',
          unit: '支',
          spec: '合成规格',
          order: 1,
        },
        coefficient: 1,
        coefficientUnit: '支',
        number: '1',
        unit: '支',
        order: 1,
      },
    ],
    measureList: [
      {
        _id: 'mock-package-measure-row',
        measureId: 'mock-catalog-measure-inspection',
        measure: {
          _id: 'mock-catalog-measure-inspection',
          name: 'Mock 计措 A',
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
