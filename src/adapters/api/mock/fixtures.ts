/** Synthetic raw responses only. These fields intentionally imitate backend shapes. */

export const mockWorkOrderIds = [
  'mock-work-order-001',
  'mock-work-order-002',
  'mock-work-order-003',
] as const

const mockServiceAppointmentData = {
  [mockWorkOrderIds[0]]: {
    _id: mockWorkOrderIds[0],
    orderNum: '09077',
    name: '演示客户甲',
    address: '日坛东一街',
    district: 110105,
    exts: {
      leakagesite_copy: [['repair-part-code-001']],
      distance: 2.6,
      communityOrdersTotal: 2,
    },
    serviceType: '40',
    status: '206',
    phone: '13800000000',
  },
  [mockWorkOrderIds[1]]: {
    _id: mockWorkOrderIds[1],
    orderNum: '04009',
    name: '演示客户乙（长名称结构样本）',
    address: '东坝北路17号国际贸易中心A座',
    exts: {
      leakagesite_copy: [['repair-part-code-001']],
      distance: 2.6,
      communityOrdersTotal: 2,
    },
    serviceType: '30',
    status: '401',
    phone: '13800000001',
  },
  [mockWorkOrderIds[2]]: {
    _id: mockWorkOrderIds[2],
    orderNum: '11850',
    name: '演示客户丙',
    address: '日坛国际贸易中心A座',
    district: 110105,
    exts: {
      leakagesite_copy: [['repair-part-code-001']],
      distance: 4.2,
      communityOrdersTotal: 2,
    },
    serviceType: '40',
    status: '101',
    phone: '13800000002',
  },
} as const

export const mockRoleFunctionResponse = {
  data: {
    functionList: [
      {
        functionList: [
          {
            order: 1,
            exts: { tabDisplay: '1' },
            action:
              '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=mock-ready&status=mock-open',
          },
        ],
      },
    ],
  },
} as const

export const mockSanodeListResponse = {
  data: [
    {
      _id: 'mock-workflow-node-001',
      state: 1,
      nodeDef: { nodeType: 'mock-technician-task' },
      data: mockServiceAppointmentData[mockWorkOrderIds[0]],
    },
    {
      _id: 'mock-workflow-node-002',
      state: 1,
      nodeDef: { nodeType: 'mock-technician-task' },
      data: mockServiceAppointmentData[mockWorkOrderIds[1]],
    },
    {
      _id: 'mock-workflow-node-003',
      state: 1,
      nodeDef: { nodeType: 'mock-technician-task' },
      data: mockServiceAppointmentData[mockWorkOrderIds[2]],
    },
  ],
  page: 1,
  rows: 20,
  total: 3,
} as const

export const mockOrdinaryListResponse = {
  data: [
    mockServiceAppointmentData[mockWorkOrderIds[0]],
    mockServiceAppointmentData[mockWorkOrderIds[1]],
  ],
  page: 1,
  rows: 20,
  total: 2,
} as const

/** Sanitized raw status code-table response used to exercise adapter lookup. */
export const mockStatusOptionsResponse = {
  data: [
    { value: '206', codelabel: '跟进签约' },
    { value: '401', codelabel: '验收回款' },
    { value: '101', codelabel: '待接单' },
  ],
  page: 1,
  rows: 20,
  total: 3,
} as const

export const mockWorkOrderDetailResponses = {
  [mockWorkOrderIds[0]]: {
    entity: {
      ...mockServiceAppointmentData[mockWorkOrderIds[0]],
      workflowRunId: 'mock-workflow-run-001',
    },
  },
  [mockWorkOrderIds[1]]: {
    entity: {
      ...mockServiceAppointmentData[mockWorkOrderIds[1]],
      workflowRunId: 'mock-workflow-run-002',
    },
  },
  [mockWorkOrderIds[2]]: {
    entity: {
      ...mockServiceAppointmentData[mockWorkOrderIds[2]],
      workflowRunId: 'mock-workflow-run-003',
    },
  },
} as const

export type MockWorkOrderId = (typeof mockWorkOrderIds)[number]

export function mockWorkOrderDetailResponseFor(id: string): unknown | null {
  return mockWorkOrderDetailResponses[id as MockWorkOrderId] ?? null
}

export function isSyntheticWorkOrderId(id: string): id is MockWorkOrderId {
  return Object.prototype.hasOwnProperty.call(mockWorkOrderDetailResponses, id)
}

export const mockWorkOrderDetailResponse = mockWorkOrderDetailResponses[mockWorkOrderIds[0]]
