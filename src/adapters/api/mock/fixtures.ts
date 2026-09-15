/** Synthetic raw responses only. These fields intentionally imitate backend shapes. */

import { appointmentFormDefinitionWireId } from '../appointment-contract'

export const mockAppointmentFormDefinitionResponse = {
  data: [
    {
      _id: 'mock-form-field-need',
      name: 'need',
      nameDisp: '是否需要上门',
      type: 'radio',
      required: '1',
      state: 1,
      options: [
        { value: '1', name: '需要上门' },
        { value: '0', name: '暂不上门' },
      ],
    },
    {
      _id: 'mock-form-field-datetime',
      name: 'datetime',
      nameDisp: '预约时间',
      type: 'datetime',
      required: '1',
      state: 1,
    },
    {
      _id: 'mock-form-field-note',
      name: 'note',
      nameDisp: '备注',
      type: 'textarea',
      required: '0',
      state: 1,
    },
  ],
  page: 1,
  rows: 20,
  total: 3,
} as const

export const mockWorkOrderIds = [
  'mock-work-order-001',
  'mock-work-order-002',
  'mock-work-order-003',
] as const

/** The bounded fixture set is shared by the Mock List and direct Detail reads. */
export const mockDetailScenarioIds = [
  ...mockWorkOrderIds,
  'mock-work-order-004',
  'mock-work-order-005',
  'mock-work-order-006',
] as const

/** Visual-only status samples use synthetic codes; R2 supplies presentation examples only. */
export const mockStatusSampleIds = [
  'mock-work-order-007',
  'mock-work-order-008',
  'mock-work-order-009',
  'mock-work-order-010',
] as const

/** Mock-only codes keep visual status coverage out of the unverified production vocabulary. */
export const mockSyntheticStatusCodes = {
  appointmentPending: 'mock-status-appointment-pending',
  onsite: 'mock-status-onsite',
  visit: 'mock-status-visit',
  deferred: 'mock-status-deferred',
  order: 'mock-status-order',
  proposal: 'mock-status-proposal',
  rating: 'mock-status-rating',
} as const

/** Functional command fixtures are direct-detail harness entries, not List rows. */
export const mockCommandScenarioIds = {
  acceptDirect: 'mock-work-order-011-accept-direct',
  acceptRetryable: 'mock-work-order-012-accept-retryable',
  acceptTerminal: 'mock-work-order-013-accept-terminal',
  appointmentRetryable: 'mock-work-order-014-appointment-retryable',
  appointmentTerminal: 'mock-work-order-015-appointment-terminal',
} as const

/** Mock DATA list order is intentionally stable for visual review. */
export const mockListScenarioIds = [...mockDetailScenarioIds, ...mockStatusSampleIds] as const

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
    status: mockSyntheticStatusCodes.appointmentPending,
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
    status: mockSyntheticStatusCodes.deferred,
    describe: '等待客户确认方案',
    phone: '13800000004',
  },
  [mockDetailScenarioIds[5]]: {
    _id: mockDetailScenarioIds[5],
    orderNum: '19006',
    name: '演示客户己',
    address: '朝阳区演示街',
    district: 110105,
    exts: {
      distance: 6.8,
      communityOrdersTotal: 0,
    },
    serviceType: '40',
    status: mockSyntheticStatusCodes.order,
    phone: '13800000005',
  },
  [mockStatusSampleIds[0]]: {
    _id: mockStatusSampleIds[0],
    orderNum: '09090',
    name: '演示客户庚',
    address: '日坛路',
    district: 110105,
    exts: {
      leakagesite_copy: [['repair-part-code-001']],
      distance: 0.9,
      communityOrdersTotal: 3,
    },
    serviceType: '40',
    status: mockSyntheticStatusCodes.onsite,
    phone: '13800000007',
  },
  [mockStatusSampleIds[1]]: {
    _id: mockStatusSampleIds[1],
    orderNum: '00067',
    name: '演示客户辛',
    address: '朝阳门地铁站',
    district: 110105,
    exts: {
      leakagesite_copy: [['repair-part-code-001']],
      distance: 4.9,
      communityOrdersTotal: 4,
    },
    serviceType: '40',
    status: mockSyntheticStatusCodes.visit,
    phone: '13800000008',
  },
  [mockStatusSampleIds[2]]: {
    _id: mockStatusSampleIds[2],
    orderNum: '14825',
    name: '演示客户壬',
    address: '天福园小区',
    district: 110105,
    exts: {
      leakagesite_copy: [['repair-part-code-003']],
      distance: 0.5,
      communityOrdersTotal: 1,
    },
    serviceType: '40',
    status: mockSyntheticStatusCodes.proposal,
    phone: '13800000009',
  },
  [mockStatusSampleIds[3]]: {
    _id: mockStatusSampleIds[3],
    orderNum: '09224',
    name: '演示客户癸',
    address: '日坛国际贸易中心A座',
    district: 110105,
    exts: {
      leakagesite_copy: [['repair-part-code-001']],
      distance: 1.6,
      communityOrdersTotal: 1,
    },
    serviceType: '40',
    status: mockSyntheticStatusCodes.rating,
    phone: '13800000010',
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
      state: 0,
      handlerIds: ['synthetic-user'],
      nodeDef: { nodeType: 'accept', name: '接单' },
      data: mockServiceAppointmentData[mockWorkOrderIds[2]],
    },
    {
      _id: 'mock-workflow-node-004',
      state: 1,
      nodeDef: { nodeType: 'placeOrder', name: '下单' },
      data: mockServiceAppointmentData[mockDetailScenarioIds[3]],
    },
    {
      _id: 'mock-workflow-node-005',
      state: 1,
      nodeDef: { nodeType: 'forms', name: '服务' },
      data: mockServiceAppointmentData[mockDetailScenarioIds[4]],
    },
    {
      _id: 'mock-workflow-node-006',
      state: 1,
      nodeDef: { nodeType: 'unverified-node-type', name: '待核验' },
      data: mockServiceAppointmentData[mockDetailScenarioIds[5]],
    },
    {
      _id: 'mock-workflow-node-007',
      state: 1,
      nodeDef: { nodeType: 'forms', name: '现场服务' },
      data: mockServiceAppointmentData[mockStatusSampleIds[0]],
    },
    {
      _id: 'mock-workflow-node-008',
      state: 1,
      nodeDef: { nodeType: 'forms', name: '上门服务' },
      data: mockServiceAppointmentData[mockStatusSampleIds[1]],
    },
    {
      _id: 'mock-workflow-node-009',
      state: 1,
      nodeDef: { nodeType: 'forms', name: '跟进方案' },
      data: mockServiceAppointmentData[mockStatusSampleIds[2]],
    },
    {
      _id: 'mock-workflow-node-010',
      state: 1,
      nodeDef: { nodeType: 'forms', name: '待评价' },
      data: mockServiceAppointmentData[mockStatusSampleIds[3]],
    },
  ],
  page: 1,
  rows: 20,
  total: 10,
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
    { value: mockSyntheticStatusCodes.appointmentPending, codelabel: '待预约' },
    { value: mockSyntheticStatusCodes.onsite, codelabel: '现场服务' },
    { value: mockSyntheticStatusCodes.visit, codelabel: '上门服务' },
    { value: mockSyntheticStatusCodes.deferred, codelabel: '暂不上门' },
    { value: mockSyntheticStatusCodes.order, codelabel: '待下单' },
    { value: mockSyntheticStatusCodes.proposal, codelabel: '跟进方案' },
    { value: mockSyntheticStatusCodes.rating, codelabel: '待评价' },
  ],
  page: 1,
  rows: 20,
  total: 10,
} as const

/** Sanitized raw repair-part cascade response used by the R1-backed adapter lookup. */
export const mockRepairPartsCascadeResponse = [
  {
    type: 'repairParts',
    children: [
      { value: 'repair-part-code-001', name: '屋面' },
      { value: 'repair-part-code-002', name: '外墙' },
      { value: 'repair-part-code-003', name: '卫生间' },
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
          nodeDef: { nodeType: 'forms', name: '勘察', userChoose: ['synthetic-role'] },
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
          nodeDef: { nodeType: 'placeOrder', name: '下单', viewableRoleIds: ['synthetic-role'] },
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
          handlerIds: ['synthetic-user'],
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
          nodeDef: { nodeType: 'placeOrder', name: '下单', viewableRoleIds: ['other-role'] },
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
  [mockStatusSampleIds[0]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentData[mockStatusSampleIds[0]],
        workflowRunId: 'mock-workflow-run-007',
      },
      workflow: { _id: 'mock-workflow-run-007' },
      workflowNode: [],
    },
  },
  [mockStatusSampleIds[1]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentData[mockStatusSampleIds[1]],
        workflowRunId: 'mock-workflow-run-008',
      },
      workflow: { _id: 'mock-workflow-run-008' },
      workflowNode: [],
    },
  },
  [mockStatusSampleIds[2]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentData[mockStatusSampleIds[2]],
        workflowRunId: 'mock-workflow-run-009',
      },
      workflow: { _id: 'mock-workflow-run-009' },
      workflowNode: [],
    },
  },
  [mockStatusSampleIds[3]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentData[mockStatusSampleIds[3]],
        workflowRunId: 'mock-workflow-run-010',
      },
      workflow: { _id: 'mock-workflow-run-010' },
      workflowNode: [],
    },
  },
  [mockCommandScenarioIds.acceptDirect]: {
    data: {
      serviceAppointment: {
        _id: mockCommandScenarioIds.acceptDirect,
        orderNum: '19011',
        name: '演示接单直通样本',
        address: '演示地址一',
        district: 110105,
        exts: { distance: 1.1, communityOrdersTotal: 0 },
        status: mockSyntheticStatusCodes.appointmentPending,
        phone: '13800000011',
        workflowRunId: 'mock-workflow-run-011',
      },
      workflow: { _id: 'mock-workflow-run-011' },
      workflowNode: [{
        _id: 'mock-workflow-node-011-accept',
        state: 0,
        handlerIds: ['synthetic-user'],
        nodeDef: { nodeType: 'accept', name: '接单' },
      }],
    },
  },
  [mockCommandScenarioIds.acceptRetryable]: {
    data: {
      serviceAppointment: {
        _id: mockCommandScenarioIds.acceptRetryable,
        orderNum: '19012',
        name: '演示接单重试样本',
        address: '演示地址二',
        district: 110105,
        exts: { distance: 1.2, communityOrdersTotal: 0 },
        status: mockSyntheticStatusCodes.appointmentPending,
        phone: '13800000012',
        workflowRunId: 'mock-workflow-run-012',
      },
      workflow: { _id: 'mock-workflow-run-012' },
      workflowNode: [{
        _id: 'mock-workflow-node-012-accept',
        state: 0,
        handlerIds: ['synthetic-user'],
        nodeDef: { nodeType: 'accept', name: '接单' },
      }],
    },
  },
  [mockCommandScenarioIds.acceptTerminal]: {
    data: {
      serviceAppointment: {
        _id: mockCommandScenarioIds.acceptTerminal,
        orderNum: '19013',
        name: '演示接单终止样本',
        address: '演示地址三',
        district: 110105,
        exts: { distance: 1.3, communityOrdersTotal: 0 },
        status: mockSyntheticStatusCodes.appointmentPending,
        phone: '13800000013',
        workflowRunId: 'mock-workflow-run-013',
      },
      workflow: { _id: 'mock-workflow-run-013' },
      workflowNode: [{
        _id: 'mock-workflow-node-013-accept',
        state: 0,
        handlerIds: ['synthetic-user'],
        nodeDef: { nodeType: 'accept', name: '接单' },
      }],
    },
  },
  [mockCommandScenarioIds.appointmentRetryable]: {
    data: {
      serviceAppointment: {
        _id: mockCommandScenarioIds.appointmentRetryable,
        orderNum: '19014',
        name: '演示预约重试样本',
        address: '演示地址四',
        district: 110105,
        exts: { distance: 1.4, communityOrdersTotal: 0 },
        status: mockSyntheticStatusCodes.appointmentPending,
        phone: '13800000014',
        workflowRunId: 'mock-workflow-run-014',
      },
      workflow: { _id: 'mock-workflow-run-014' },
      workflowNode: [{
        _id: 'mock-workflow-node-014-appointment',
        state: 0,
        nodeDef: {
          nodeType: 'forms',
          name: '预约上门时间',
          formDefId: appointmentFormDefinitionWireId,
          userChoose: ['synthetic-role'],
        },
      }],
    },
  },
  [mockCommandScenarioIds.appointmentTerminal]: {
    data: {
      serviceAppointment: {
        _id: mockCommandScenarioIds.appointmentTerminal,
        orderNum: '19015',
        name: '演示预约终止样本',
        address: '演示地址五',
        district: 110105,
        exts: { distance: 1.5, communityOrdersTotal: 0 },
        status: mockSyntheticStatusCodes.appointmentPending,
        phone: '13800000015',
        workflowRunId: 'mock-workflow-run-015',
      },
      workflow: { _id: 'mock-workflow-run-015' },
      workflowNode: [{
        _id: 'mock-workflow-node-015-appointment',
        state: 0,
        nodeDef: {
          nodeType: 'forms',
          name: '预约上门时间',
          formDefId: appointmentFormDefinitionWireId,
          userChoose: ['synthetic-role'],
        },
      }],
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
  [mockStatusSampleIds[0]]: {
    status: 1,
    data: [
      {
        type: 4,
        typeId: 'mock-activity-007-002',
        content: '现场服务记录已提交。',
        createUserName: '演示技师',
        createTime: '2026-04-15 15:20:00',
      },
      {
        type: 2,
        typeId: 'mock-activity-007-001',
        name: '现场服务已开始',
        content: '已进入现场服务环节。',
        createUserName: '演示系统',
        createTime: '2026-04-15 14:50:00',
      },
    ],
  },
  [mockStatusSampleIds[1]]: {
    status: 1,
    data: [
      {
        type: 4,
        typeId: 'mock-activity-008-002',
        content: '已完成上门服务记录。',
        createUserName: '演示技师',
        createTime: '2026-04-15 16:10:00',
      },
      {
        type: 3,
        typeId: 'mock-activity-008-001',
        content: '已与客户确认上门安排。',
        createUserName: '演示技师',
        createTime: '2026-04-15 15:35:00',
      },
    ],
  },
  [mockStatusSampleIds[2]]: {
    status: 1,
    data: [
      {
        type: 6,
        typeId: 'mock-activity-009-002',
        content: '已向客户发送服务方案。',
        createUserName: '演示技师',
        createTime: '2026-04-15 17:05:00',
      },
      {
        type: 2,
        typeId: 'mock-activity-009-001',
        name: '已生成服务方案',
        content: '等待客户确认服务方案。',
        createUserName: '演示系统',
        createTime: '2026-04-15 16:40:00',
      },
    ],
  },
  [mockStatusSampleIds[3]]: {
    status: 1,
    data: [
      {
        type: 2,
        typeId: 'mock-activity-010-002',
        name: '服务已完成',
        content: '服务已完成，等待客户评价。',
        createUserName: '演示系统',
        createTime: '2026-04-15 18:10:00',
      },
      {
        type: 3,
        typeId: 'mock-activity-010-001',
        content: '已向客户发送评价提醒。',
        createUserName: '演示技师',
        createTime: '2026-04-15 17:45:00',
      },
    ],
  },
} as const

export type MockWorkOrderActivityId = keyof typeof mockWorkOrderActivityResponses

export function mockWorkOrderActivityResponseFor(id: string): unknown | null {
  return mockWorkOrderActivityResponses[id as MockWorkOrderActivityId] ?? null
}

export type MockWorkOrderId = keyof typeof mockWorkOrderDetailResponses

export function mockWorkOrderDetailResponseFor(id: string): unknown | null {
  return mockWorkOrderDetailResponses[id as MockWorkOrderId] ?? null
}

export function isSyntheticWorkOrderId(id: string): id is MockWorkOrderId {
  return Object.prototype.hasOwnProperty.call(mockWorkOrderDetailResponses, id)
}

export const mockWorkOrderDetailResponse = mockWorkOrderDetailResponses[mockWorkOrderIds[0]]
