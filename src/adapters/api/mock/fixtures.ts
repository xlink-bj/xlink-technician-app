/** Synthetic raw responses only. These fields intentionally imitate backend shapes. */

import { appointmentFormDefinitionWireId } from '../appointment-contract'
import { mockJourneyNodes, mockJourneyWorkOrderId, mockJourneyWorkflowRunId } from './journey'
import {
  mockQuotationCatalogServiceType,
  mockQuotationCatalogSourceType,
} from './quotation-catalog'
import {
  mockSurveyFormDefinitionId,
  mockSurveyFormDefinitionResponse,
  mockSurveyPartsCascadeResponse,
  mockSurveyLeakageCauseResponse,
  mockSurveyCodeOptionsResponse,
} from './survey-contract'

/** Synthetic-only legacy harness form; it is not the G4-E Survey contract. */
export const mockSyntheticDynamicFormDefinitionId = 'mock-form-definition-inspection'
/** DEV-only R1 local-draft walkthrough. These IDs never represent FormData persistence. */
export const mockR1FormsWorkOrderId = 'mock-work-order-020-local-forms'
export const mockR1RepeatWorkOrderId = 'mock-work-order-021-local-repeat'
export const mockR1AddFormCodeId = 'mock-code-local-form-types'
export const mockR1NoteFormDefinitionId = 'mock-form-definition-local-note'
export const mockR1FormData = {
  formsFirst: 'mock-form-data-020-existing-a',
  formsSecond: 'mock-form-data-020-existing-b',
  repeatFirst: 'mock-form-data-021-existing-a',
  repeatSecond: 'mock-form-data-021-existing-b',
} as const
export const mockR1NoteFormDefinitionResponse = {
  data: [{ _id: 'mock-local-note-field', name: 'note', nameDisp: '服务备注',
    type: 'textarea', required: '0', state: 1 }],
  page: 1, rows: 20, total: 1,
} as const
export const mockR1AddFormOptionsResponse = {
  data: [
    { name: '现场记录', state: 1, exts: { formDefId: mockSyntheticDynamicFormDefinitionId } },
    { name: '服务备注', state: 1, exts: { formDefId: mockR1NoteFormDefinitionId } },
  ], page: 1, rows: 50, total: 2,
} as const
export const mockR1ExistingFormData = {
  [mockR1FormData.formsFirst]: { _id: mockR1FormData.formsFirst,
    extId: mockSyntheticDynamicFormDefinitionId, formDefId: mockSyntheticDynamicFormDefinitionId,
    formTitle: '平屋顶现场检查', state: 1,
    exts: { inspectionSummary: '已检查屋面排水与防水节点', inspectionResult: 'follow_up' } },
  [mockR1FormData.formsSecond]: { _id: mockR1FormData.formsSecond,
    extId: mockR1NoteFormDefinitionId, formDefId: mockR1NoteFormDefinitionId,
    formTitle: '客户沟通记录', state: 1, exts: { note: '待与客户确认维修计划' } },
  [mockR1FormData.repeatFirst]: { _id: mockR1FormData.repeatFirst,
    extId: mockSyntheticDynamicFormDefinitionId, formDefId: mockSyntheticDynamicFormDefinitionId,
    formTitle: '第一次复检', workflowId: 'mock-workflow-run-021', state: 1,
    exts: { inspectionSummary: '防水层表面无明显积水' } },
  [mockR1FormData.repeatSecond]: { _id: mockR1FormData.repeatSecond,
    extId: mockSyntheticDynamicFormDefinitionId, formDefId: mockSyntheticDynamicFormDefinitionId,
    formTitle: '第二次复检', workflowId: 'mock-workflow-run-021', state: 1,
    exts: { inspectionSummary: '排水口及女儿墙根部复核完成' } },
} as const

export {
  mockSurveyFormDefinitionId,
  mockSurveyFormDefinitionResponse,
  mockSurveyPartsCascadeResponse,
  mockSurveyLeakageCauseResponse,
  mockSurveyCodeOptionsResponse,
}

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

export const mockSyntheticInspectionFormDefinitionResponse = {
  data: [
    {
      _id: 'mock-inspection-field-summary',
      name: 'inspectionSummary',
      nameDisp: '现场情况',
      type: 'textarea',
      required: '1',
      state: 1,
    },
    {
      _id: 'mock-inspection-field-result',
      name: 'inspectionResult',
      nameDisp: '勘察结论',
      type: 'radio',
      required: '1',
      state: 1,
      options: [
        { value: 'safe', name: '可继续施工' },
        { value: 'follow_up', name: '需要跟进' },
      ],
    },
    {
      _id: 'mock-inspection-field-photo',
      name: 'inspectionPhoto',
      nameDisp: '现场照片',
      type: 'image',
      required: '1',
      state: 1,
    },
    {
      _id: 'mock-inspection-field-note',
      name: 'inspectionNote',
      nameDisp: '备注',
      type: 'textarea',
      required: '0',
      state: 1,
    },
  ],
  page: 1,
  rows: 20,
  total: 4,
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
  appointmentSuccess: 'mock-work-order-016-appointment-success',
  surveySuccess: 'mock-work-order-017-survey-success',
  quotationFoundation: 'mock-work-order-018-quotation-foundation',
  continuousJourney: mockJourneyWorkOrderId,
} as const

export const mockQuotationWorkflowNodeId = 'mock-workflow-node-018-place-order'

/** Mock DATA list order is intentionally stable for visual review. */
export const mockListScenarioIds = [...mockDetailScenarioIds, ...mockStatusSampleIds, mockCommandScenarioIds.quotationFoundation, mockCommandScenarioIds.continuousJourney] as const

const mockServiceAppointmentData = {
  [mockWorkOrderIds[0]]: {
    _id: mockWorkOrderIds[0],
    orderNum: '09077',
    name: '张先生',
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
    name: '陈女士（东坝国际商贸中心业主）',
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
    name: '李先生',
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
    name: '王女士',
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
    name: '刘先生',
    address: '朝阳路16号',
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
    name: '赵女士',
    address: '朝阳区青年路',
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
    name: '周先生',
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
    name: '孙女士',
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
    name: '何先生',
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
    name: '郑女士',
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

function mockServiceAppointmentDetailData(
  id: keyof typeof mockServiceAppointmentData,
): Record<string, unknown> {
  const appointment = mockServiceAppointmentData[id] as unknown as Record<string, unknown>
  const extensions = typeof appointment.exts === 'object' && appointment.exts !== null
    ? appointment.exts as Record<string, unknown>
    : {}
  return {
    ...appointment,
    serviceType: mockQuotationCatalogServiceType,
    exts: { ...extensions, sourceType: mockQuotationCatalogSourceType },
  }
}

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
    // The quotation review Work Order must be discoverable from the normal
    // technician list, not only a developer Home shortcut. Same WorkOrderId,
    // workflow node and catalog scope as the source-shaped Detail fixture.
    {
      _id: mockQuotationWorkflowNodeId,
      state: 1,
      nodeDef: {
        nodeType: 'placeOrder',
        name: '报价',
        viewableRoleIds: ['synthetic-role'],
      },
      data: {
        _id: mockCommandScenarioIds.quotationFoundation,
        orderNum: '26018',
        name: '吴先生',
        address: '望京花园西区',
        district: 110105,
        serviceType: mockQuotationCatalogServiceType,
        exts: { sourceType: mockQuotationCatalogSourceType },
        status: mockSyntheticStatusCodes.order,
        phone: '13800000018',
        workflowRunId: 'mock-workflow-run-018',
      },
    },
    {
      _id: mockJourneyNodes.appointment,
      state: 0,
      nodeDef: {
        nodeType: 'forms',
        name: '预约上门时间',
        formDefId: appointmentFormDefinitionWireId,
        userChoose: ['synthetic-role'],
      },
      data: {
        _id: mockJourneyWorkOrderId,
        orderNum: '26019',
        name: '蒋女士',
        address: '北苑家园望春园',
        district: 110105,
        serviceType: mockQuotationCatalogServiceType,
        exts: { sourceType: mockQuotationCatalogSourceType },
        status: mockSyntheticStatusCodes.appointmentPending,
        phone: '13800000019',
        workflowRunId: mockJourneyWorkflowRunId,
      },
    },
  ],
  page: 1,
  rows: 20,
  total: 12,
} as const

/** Opt-in DEV QA rows; the established 12-row visual baseline stays fixed. */
export const mockR1MpUxListRows = [
  {
    _id: 'mock-workflow-node-020-forms', state: 0,
    nodeDef: { nodeType: 'forms', name: '现场检查',
      formDefId: mockSyntheticDynamicFormDefinitionId,
      addFormCodeId: mockR1AddFormCodeId, userChoose: ['synthetic-role'] },
    data: { _id: mockR1FormsWorkOrderId, orderNum: '26020',
      name: '韩先生', address: '双井富力城',
      status: mockSyntheticStatusCodes.onsite, workflowRunId: 'mock-workflow-run-020' },
  },
  {
    _id: 'mock-workflow-node-021-repeat', state: 0,
    nodeDef: { nodeType: 'repeat', name: '现场复检',
      formDefId: mockSyntheticDynamicFormDefinitionId, userChoose: ['synthetic-role'] },
    data: { _id: mockR1RepeatWorkOrderId, orderNum: '26021',
      name: '田女士', address: '国贸建外SOHO',
      status: mockSyntheticStatusCodes.onsite, workflowRunId: 'mock-workflow-run-021' },
  },
] as const

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
  [mockR1FormsWorkOrderId]: {
    data: {
      serviceAppointment: { _id: mockR1FormsWorkOrderId, orderNum: '26020',
        name: '韩先生', address: '双井富力城',
        status: mockSyntheticStatusCodes.onsite, workflowRunId: 'mock-workflow-run-020' },
      workflow: { _id: 'mock-workflow-run-020' },
      workflowNode: [{ _id: 'mock-workflow-node-020-forms', workflowId: 'mock-workflow-run-020', state: 0,
        nodeDef: { nodeType: 'forms', name: '现场检查',
          formDefId: mockSyntheticDynamicFormDefinitionId,
          addFormCodeId: mockR1AddFormCodeId, userChoose: ['synthetic-role'] },
        exts: { formList: [mockR1ExistingFormData[mockR1FormData.formsFirst],
          mockR1ExistingFormData[mockR1FormData.formsSecond]] } }],
    },
  },
  [mockR1RepeatWorkOrderId]: {
    data: {
      serviceAppointment: { _id: mockR1RepeatWorkOrderId, orderNum: '26021',
        name: '田女士', address: '国贸建外SOHO',
        status: mockSyntheticStatusCodes.onsite, workflowRunId: 'mock-workflow-run-021' },
      workflow: { _id: 'mock-workflow-run-021' },
      workflowNode: [{ _id: 'mock-workflow-node-021-repeat', workflowId: 'mock-workflow-run-021', state: 0,
        nodeDef: { nodeType: 'repeat', name: '现场复检',
          formDefId: mockSyntheticDynamicFormDefinitionId, userChoose: ['synthetic-role'] } }],
    },
  },
  [mockWorkOrderIds[0]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentDetailData(mockWorkOrderIds[0]),
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
        ...mockServiceAppointmentDetailData(mockWorkOrderIds[1]),
        workflowRunId: 'mock-workflow-run-002',
      },
      workflow: { _id: 'mock-workflow-run-002' },
      workflowNode: [
        {
          _id: 'mock-workflow-node-002-current',
          state: 0,
          handlerIds: ['synthetic-user'],
          nodeDef: { nodeType: 'placeOrder', name: '下单', viewableRoleIds: ['synthetic-role'] },
        },
      ],
    },
  },
  [mockWorkOrderIds[2]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentDetailData(mockWorkOrderIds[2]),
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
        ...mockServiceAppointmentDetailData(mockDetailScenarioIds[3]),
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
        ...mockServiceAppointmentDetailData(mockDetailScenarioIds[4]),
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
        ...mockServiceAppointmentDetailData(mockDetailScenarioIds[5]),
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
        ...mockServiceAppointmentDetailData(mockStatusSampleIds[0]),
        workflowRunId: 'mock-workflow-run-007',
      },
      workflow: { _id: 'mock-workflow-run-007' },
      workflowNode: [],
    },
  },
  [mockStatusSampleIds[1]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentDetailData(mockStatusSampleIds[1]),
        workflowRunId: 'mock-workflow-run-008',
      },
      workflow: { _id: 'mock-workflow-run-008' },
      workflowNode: [],
    },
  },
  [mockStatusSampleIds[2]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentDetailData(mockStatusSampleIds[2]),
        workflowRunId: 'mock-workflow-run-009',
      },
      workflow: { _id: 'mock-workflow-run-009' },
      workflowNode: [],
    },
  },
  [mockStatusSampleIds[3]]: {
    data: {
      serviceAppointment: {
        ...mockServiceAppointmentDetailData(mockStatusSampleIds[3]),
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
        name: '许先生',
        address: '光华路甲8号',
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
        name: '梁女士',
        address: '朝阳公园南路',
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
        name: '袁先生',
        address: '安贞西里二区',
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
        name: '郭女士',
        address: '太阳宫桥北',
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
        name: '秦先生',
        address: '将台路5号院',
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
  [mockCommandScenarioIds.appointmentSuccess]: {
    data: {
      serviceAppointment: {
        _id: mockCommandScenarioIds.appointmentSuccess,
        orderNum: '19016',
        name: '彭女士',
        address: '望京西园四区',
        district: 110105,
        exts: { distance: 1.6, communityOrdersTotal: 0 },
        status: mockSyntheticStatusCodes.appointmentPending,
        phone: '13800000016',
        workflowRunId: 'mock-workflow-run-016',
      },
      workflow: { _id: 'mock-workflow-run-016' },
      workflowNode: [{
        _id: 'mock-workflow-node-016-appointment',
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
  [mockCommandScenarioIds.surveySuccess]: {
    data: {
      serviceAppointment: {
        _id: mockCommandScenarioIds.surveySuccess,
        orderNum: '19017',
        name: '邓先生',
        address: '芍药居北里',
        district: 110105,
        exts: { distance: 1.7, communityOrdersTotal: 0 },
        status: mockSyntheticStatusCodes.onsite,
        phone: '13800000017',
        workflowRunId: 'mock-workflow-run-017',
      },
      workflow: { _id: 'mock-workflow-run-017' },
      workflowNode: [{
        _id: 'mock-workflow-node-017-inspection',
        state: 0,
        nodeDef: {
          nodeType: 'forms',
          name: '现场勘察',
          formDefId: mockSurveyFormDefinitionId,
          colName: 'survey',
          userChoose: ['synthetic-role'],
        },
      }],
    },
  },
  [mockCommandScenarioIds.continuousJourney]: {
    data: {
      serviceAppointment: {
        _id: mockJourneyWorkOrderId,
        orderNum: '26019',
        name: '蒋女士',
        address: '北苑家园望春园',
        district: 110105,
        serviceType: mockQuotationCatalogServiceType,
        exts: { sourceType: mockQuotationCatalogSourceType },
        status: mockSyntheticStatusCodes.appointmentPending,
        phone: '13800000019',
        workflowRunId: mockJourneyWorkflowRunId,
      },
      workflow: { _id: mockJourneyWorkflowRunId },
      workflowNode: [{
        _id: mockJourneyNodes.appointment,
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
  [mockCommandScenarioIds.quotationFoundation]: {
    data: {
      serviceAppointment: {
        _id: mockCommandScenarioIds.quotationFoundation,
        orderNum: '26018',
        name: '吴先生',
        address: '望京花园西区',
        district: 110105,
        serviceType: mockQuotationCatalogServiceType,
        exts: { sourceType: mockQuotationCatalogSourceType },
        workflowRunId: 'mock-workflow-run-018',
      },
      workflow: { _id: 'mock-workflow-run-018' },
      workflowNode: [{
        _id: mockQuotationWorkflowNodeId,
        state: 0,
        nodeDef: {
          nodeType: 'placeOrder',
          name: '报价',
          viewableRoleIds: ['synthetic-role'],
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
        createUserName: '调度中心',
        createTime: '2026-04-13 15:20:00',
      },
      {
        type: 3,
        typeId: 'mock-activity-001-002',
        content: '已与客户确认上门安排。',
        createUserName: '现场工程师',
        createTime: '2026-04-13 14:32:00',
      },
      {
        type: 1,
        typeId: 'mock-activity-001-001',
        content: '客户确认按预约时间上门。',
        createUserName: '现场工程师',
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
        createUserName: '调度中心',
        createTime: '2026-04-13 15:20:00',
      },
      {
        type: 4,
        typeId: 'mock-activity-002-002',
        content: '现场服务记录已提交。',
        createUserName: '现场工程师',
        createTime: '2026-04-13 14:32:00',
      },
      {
        type: 3,
        typeId: 'mock-activity-002-001',
        content: '已与客户确认验收安排。',
        createUserName: '现场工程师',
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
        content: '工单已分派至维修团队。',
        createUserName: '调度中心',
        createTime: '2026-04-13 11:05:00',
      },
      {
        type: 2,
        typeId: 'mock-activity-003-001',
        name: '已创建工单',
        content: '已创建待接单工单。',
        createUserName: '调度中心',
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
        createUserName: '现场工程师',
        createTime: '2026-04-14 09:40:00',
      },
      {
        type: 2,
        typeId: 'mock-activity-004-001',
        name: '已创建预约',
        content: '预约时间：2026-04-14 09:30。',
        createUserName: '调度中心',
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
        createUserName: '现场工程师',
        createTime: '2026-04-15 16:05:00',
      },
      {
        type: 2,
        typeId: 'mock-activity-005-001',
        name: '待客户确认方案',
        content: '等待客户确认服务方案。',
        createUserName: '调度中心',
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
        createUserName: '现场工程师',
        createTime: '2026-04-15 15:20:00',
      },
      {
        type: 2,
        typeId: 'mock-activity-007-001',
        name: '现场服务已开始',
        content: '已进入现场服务环节。',
        createUserName: '调度中心',
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
        createUserName: '现场工程师',
        createTime: '2026-04-15 16:10:00',
      },
      {
        type: 3,
        typeId: 'mock-activity-008-001',
        content: '已与客户确认上门安排。',
        createUserName: '现场工程师',
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
        createUserName: '现场工程师',
        createTime: '2026-04-15 17:05:00',
      },
      {
        type: 2,
        typeId: 'mock-activity-009-001',
        name: '已生成服务方案',
        content: '等待客户确认服务方案。',
        createUserName: '调度中心',
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
        createUserName: '调度中心',
        createTime: '2026-04-15 18:10:00',
      },
      {
        type: 3,
        typeId: 'mock-activity-010-001',
        content: '已向客户发送评价提醒。',
        createUserName: '现场工程师',
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
