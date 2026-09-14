/** Synthetic raw responses only. These fields intentionally imitate backend shapes. */

export const mockWorkOrderIds = [
  'mock-work-order-001',
  'mock-work-order-002',
  'mock-work-order-003',
] as const

/** Detail-only reads extend the bounded fixture set without changing List density. */
export const mockDetailScenarioIds = [
  ...mockWorkOrderIds,
  'mock-work-order-004',
  'mock-work-order-005',
  'mock-work-order-006',
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
  [mockDetailScenarioIds[3]]: {
    _id: mockDetailScenarioIds[3],
    orderNum: '16204',
    name: '演示客户丁',
    address: '建国门外大街',
    district: 110105,
    describe: '请确认上门时间',
    exts: {
      leakagesite_copy: [['repair-part-code-001']],
      distance: '5.1',
      communityOrdersTotal: 0,
      applyTimeStr: '2026-04-14 09:30',
    },
    serviceType: '40',
    status: '206',
    phone: '13800000003',
  },
  [mockDetailScenarioIds[4]]: {
    _id: mockDetailScenarioIds[4],
    orderNum: '17505',
    name: '演示客户戊',
    address: '朝阳路演示地址',
    exts: {
      leakagesite_copy: [['repair-part-code-001']],
      distance: 3.8,
      communityOrdersTotal: 1,
    },
    serviceType: '30',
    status: '101',
    describe: '等待客户确认方案',
    phone: '13800000004',
  },
  [mockDetailScenarioIds[5]]: {
    _id: mockDetailScenarioIds[5],
    orderNum: '19006',
    exts: {},
    serviceType: '40',
    status: 'unverified-status',
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
      nodeDef: { nodeType: 'forms', name: '勘察' },
      data: mockServiceAppointmentData[mockWorkOrderIds[0]],
    },
    {
      _id: 'mock-workflow-node-002',
      state: 1,
      nodeDef: { nodeType: 'placeOrder', name: '下单' },
      data: mockServiceAppointmentData[mockWorkOrderIds[1]],
    },
    {
      _id: 'mock-workflow-node-003',
      state: 1,
      nodeDef: { nodeType: 'accept', name: '接单' },
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

/** Sanitized raw repair-part cascade response used by the R1-backed adapter lookup. */
export const mockRepairPartsCascadeResponse = [
  {
    type: 'repairParts',
    children: [
      { value: 'repair-part-code-001', name: '屋面' },
      { value: 'repair-part-code-002', name: '外墙' },
    ],
  },
] as const

export const mockWorkOrderDetailResponses = {
  [mockWorkOrderIds[0]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentData[mockWorkOrderIds[0]],
        workflowRunId: 'mock-workflow-run-001',
      },
      workflow: { _id: 'mock-workflow-run-001' },
      workflowNode: [
        {
          _id: 'mock-workflow-node-001-current',
          state: 0,
          nodeDef: { nodeType: 'forms', name: '勘察' },
        },
      ],
    },
  },
  [mockWorkOrderIds[1]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentData[mockWorkOrderIds[1]],
        workflowRunId: 'mock-workflow-run-002',
      },
      workflow: { _id: 'mock-workflow-run-002' },
      workflowNode: [
        {
          _id: 'mock-workflow-node-002-current',
          state: 0,
          nodeDef: { nodeType: 'placeOrder', name: '下单' },
        },
      ],
    },
  },
  [mockWorkOrderIds[2]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentData[mockWorkOrderIds[2]],
        workflowRunId: 'mock-workflow-run-003',
      },
      workflow: { _id: 'mock-workflow-run-003' },
      workflowNode: [
        {
          _id: 'mock-workflow-node-003-current',
          state: 0,
          nodeDef: { nodeType: 'subflows', name: '派工' },
        },
      ],
    },
  },
  [mockDetailScenarioIds[3]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentData[mockDetailScenarioIds[3]],
        workflowRunId: 'mock-workflow-run-004',
      },
      workflow: { _id: 'mock-workflow-run-004' },
      workflowNode: [
        {
          _id: 'mock-workflow-node-004-complete',
          state: 10,
          nodeDef: { nodeType: 'forms', name: '勘察' },
        },
        {
          _id: 'mock-workflow-node-004-current',
          state: 0,
          nodeDef: { nodeType: 'placeOrder', name: '下单' },
        },
      ],
    },
  },
  [mockDetailScenarioIds[4]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentData[mockDetailScenarioIds[4]],
        workflowRunId: 'mock-workflow-run-005',
      },
      workflow: { _id: 'mock-workflow-run-005' },
      workflowNode: [
        {
          _id: 'mock-workflow-node-005-current',
          state: 0,
          handlerIds: ['mock-other-role'],
          nodeDef: { nodeType: 'forms', name: '服务' },
        },
      ],
    },
  },
  [mockDetailScenarioIds[5]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentData[mockDetailScenarioIds[5]],
        workflowRunId: 'mock-workflow-run-006',
      },
      workflow: { _id: 'mock-workflow-run-006' },
      workflowNode: [
        {
          _id: 'mock-workflow-node-006-current',
          state: 7,
          nodeDef: { nodeType: 'unverified-node-type', name: '待核验' },
        },
      ],
    },
  },
} as const

/**
 * Sanitized raw `biz/action/query.do` responses. These records intentionally
 * keep R2's action type/name/content/time shape; the Technician adapter owns
 * the title, icon, tone, badge, and newest-first presentation mapping.
 */
export const mockWorkOrderActivityResponses = {
  [mockWorkOrderIds[0]]: {
    status: 1,
    data: [
      {
        type: 2,
        typeId: 'mock-activity-001-003',
        name: '已完成现场服务',
        content: '现场服务节点已完成。',
        createUserName: '演示系统',
        createTime: '2026-04-13 15:20:00',
      },
      {
        type: 3,
        typeId: 'mock-activity-001-002',
        content: '已与客户确认上门安排。',
        createUserName: '演示技师',
        createTime: '2026-04-13 14:32:00',
      },
      {
        type: 1,
        typeId: 'mock-activity-001-001',
        content: '客户确认按预约时间上门。',
        createUserName: '演示技师',
        createTime: '2026-04-13 14:10:00',
      },
    ],
  },
  [mockWorkOrderIds[1]]: {
    status: 1,
    data: [
      {
        type: 2,
        typeId: 'mock-activity-002-003',
        name: '已完成现场服务',
        content: '现场服务已完成，等待验收。',
        createUserName: '演示系统',
        createTime: '2026-04-13 15:20:00',
      },
      {
        type: 4,
        typeId: 'mock-activity-002-002',
        content: '现场服务记录已提交。',
        createUserName: '演示技师',
        createTime: '2026-04-13 14:32:00',
      },
      {
        type: 3,
        typeId: 'mock-activity-002-001',
        content: '已与客户确认验收安排。',
        createUserName: '演示技师',
        createTime: '2026-04-13 14:10:00',
      },
    ],
  },
  [mockWorkOrderIds[2]]: {
    status: 1,
    data: [
      {
        type: 5,
        typeId: 'mock-activity-003-002',
        content: '工单已分派至演示工队。',
        createUserName: '演示系统',
        createTime: '2026-04-13 11:05:00',
      },
      {
        type: 2,
        typeId: 'mock-activity-003-001',
        name: '已创建工单',
        content: '已创建待接单工单。',
        createUserName: '演示系统',
        createTime: '2026-04-13 10:40:00',
      },
    ],
  },
  [mockDetailScenarioIds[3]]: {
    status: 1,
    data: [
      {
        type: 6,
        typeId: 'mock-activity-004-002',
        content: '已向客户说明上门时间和服务安排。',
        createUserName: '演示技师',
        createTime: '2026-04-14 09:40:00',
      },
      {
        type: 2,
        typeId: 'mock-activity-004-001',
        name: '已创建预约',
        content: '预约时间：2026-04-14 09:30。',
        createUserName: '演示系统',
        createTime: '2026-04-14 09:30:00',
      },
    ],
  },
  [mockDetailScenarioIds[4]]: {
    status: 1,
    data: [
      {
        type: 3,
        typeId: 'mock-activity-005-002',
        content: '已与客户沟通方案确认事项。',
        createUserName: '演示技师',
        createTime: '2026-04-15 16:05:00',
      },
      {
        type: 2,
        typeId: 'mock-activity-005-001',
        name: '待客户确认方案',
        content: '等待客户确认服务方案。',
        createUserName: '演示系统',
        createTime: '2026-04-15 15:40:00',
      },
    ],
  },
  [mockDetailScenarioIds[5]]: {
    status: 1,
    data: [],
  },
} as const

export type MockWorkOrderActivityId = keyof typeof mockWorkOrderActivityResponses

export function mockWorkOrderActivityResponseFor(id: string): unknown | null {
  return mockWorkOrderActivityResponses[id as MockWorkOrderActivityId] ?? null
}

export type MockWorkOrderId = (typeof mockDetailScenarioIds)[number]

export function mockWorkOrderDetailResponseFor(id: string): unknown | null {
  return mockWorkOrderDetailResponses[id as MockWorkOrderId] ?? null
}

export function isSyntheticWorkOrderId(id: string): id is MockWorkOrderId {
  return Object.prototype.hasOwnProperty.call(mockWorkOrderDetailResponses, id)
}

export const mockWorkOrderDetailResponse = mockWorkOrderDetailResponses[mockWorkOrderIds[0]]
