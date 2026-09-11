/** Synthetic raw responses only. These fields intentionally imitate backend shapes. */

export const mockWorkOrderIds = [
  'mock-work-order-001',
  'mock-work-order-002',
  'mock-work-order-003',
] as const

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
      data: { _id: mockWorkOrderIds[0], name: '演示工单 · 屋面检查 A' },
    },
    {
      _id: 'mock-workflow-node-002',
      state: 1,
      nodeDef: { nodeType: 'mock-technician-task' },
      data: { _id: mockWorkOrderIds[1], name: '演示工单 · 防水维修 B' },
    },
    {
      _id: 'mock-workflow-node-003',
      state: 1,
      nodeDef: { nodeType: 'mock-technician-task' },
      data: { _id: mockWorkOrderIds[2], name: '演示工单 · 屋面复查 C' },
    },
  ],
  page: 1,
  rows: 20,
  total: 3,
} as const

export const mockOrdinaryListResponse = {
  data: [
    { _id: mockWorkOrderIds[0], name: '演示工单 · 普通服务 A' },
    { _id: mockWorkOrderIds[1], name: '演示工单 · 普通服务 B' },
  ],
  page: 1,
  rows: 20,
  total: 2,
} as const

export const mockWorkOrderDetailResponse = {
  entity: {
    _id: mockWorkOrderIds[0],
    orderNum: 'MOCK-WO-001',
    name: '模拟客户 A（演示数据）',
    address: '模拟地址 A（非真实地点）',
    workflowRunId: 'mock-workflow-run-001',
  },
} as const
