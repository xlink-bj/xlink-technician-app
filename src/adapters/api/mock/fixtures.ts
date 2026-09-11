/** Synthetic raw responses only. These fields intentionally imitate backend shapes. */

export const mockWorkOrderIds = [
  'mock-work-order-001',
  'mock-work-order-002',
  'mock-work-order-003',
] as const

const mockServiceAppointmentData = {
  [mockWorkOrderIds[0]]: {
    _id: mockWorkOrderIds[0],
    orderNum: 'DEMO-SA-001',
    name: '演示客户甲',
    address: '演示服务地址一号',
    serviceType: '40',
    status: '104',
  },
  [mockWorkOrderIds[1]]: {
    _id: mockWorkOrderIds[1],
    orderNum: 'DEMO-SA-002',
    name: '演示客户乙（长名称结构样本）',
    address: '演示区域二号服务地址，长地址字段示例用于换行校验',
    serviceType: '30',
    status: '104',
  },
  [mockWorkOrderIds[2]]: {
    _id: mockWorkOrderIds[2],
    orderNum: 'DEMO-SA-003',
    name: '演示客户丙',
    serviceType: '40',
    status: '104',
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
