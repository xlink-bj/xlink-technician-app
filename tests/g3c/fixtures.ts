export const rawWorkOrderPage = {
  data: [
    {
      id: 'work-order-001',
      orderNum: 'DEMO-SA-001',
      name: 'Sanitized customer',
      address: 'Sanitized service address',
      stateCode: 'legacy-state-code',
    },
  ],
  page: 1,
  rows: 20,
  total: 1,
  dataCount: 1,
}

export const rawWorkOrderDetail = {
  serviceAppointment: {
    _id: 'work-order-001',
    orderNum: 'DEMO-SA-001',
    name: 'Sanitized customer',
    address: 'Sanitized service address',
    workflowRunId: 'workflow-run-001',
    stateCode: 'legacy-state-code',
  },
}

export const rawWorkflowNodes = {
  data: [
    {
      _id: 'workflow-node-001',
      defId: 'workflow-definition-001',
      runId: 'workflow-run-001',
      parentWorkflowNodeId: 'workflow-node-parent',
      nodeStateCode: 'legacy-node-state',
    },
  ],
}

export const rawFormDataPage = {
  data: [
    {
      _id: 'form-data-001',
      extId: 'form-definition-001',
      runId: 'workflow-run-001',
    },
  ],
  page: 1,
  rows: 20,
  total: 1,
}

export const rawCodeOptionsPage = {
  data: [{ value: 'option-a', codelabel: 'Sanitized option' }],
  page: 1,
  rows: 20,
  total: 1,
}

export const rawAuthResponse = {
  data: {
    token: 'sanitized-session-token',
    user: { id: 'sanitized-user-id', displayName: 'Sanitized Technician' },
    role: { id: 'sanitized-role-id', name: 'Technician' },
    functionList: ['work-order.read'],
  },
}

export const rawUploadToken = { token: 'sanitized-upload-token' }
export const rawUploadResponse = {
  url: 'https://uploads.example.invalid/sanitized-object',
  key: 'sanitized/object',
}
