import { afterEach, describe, expect, it, vi } from 'vitest'
import { createR1PilotAuthoritativeReadback } from '@adapters/api/r1-pilot-authoritative-readback'
import type { ApiReadRequest } from '@adapters/api/technician-api'
import type { R1MultiStepReceipt, R1MultiStepScope } from '@features/work-orders/r1-multistep-offline-transaction'

const scope: R1MultiStepScope = {
  userId: 'pilot-user', workOrderId: 'pilot-order', runtimeNodeId: 'pilot-node',
  workflowRunId: 'pilot-run', formDefinitionId: 'pilot-def', sourceNodeType: 'forms',
  authorizationScope: 'pilot-role',
}
const receipt: R1MultiStepReceipt = {
  version: 1, ...scope, actorHash: 'synthetic', steps: ['form_upsert', 'forms_exts_update'],
  state: 'completed', stepIndex: 1, savedFormDataIds: ['saved-one'],
}
const record = (id = 'saved-one') => ({
  _id: id, sid: 'pilot-order', nodeId: 'pilot-node',
  workflowId: 'pilot-run', smodule: 'serviceAppointment',
  state: 1, formDefId: 'pilot-def', note: 'verified',
})
const formPage = (rows: unknown[], total = rows.length) => ({
  data: { items: rows }, total, success: true,
})
const workOrderDetail = {
  success: true, data: {
    serviceAppointment: { _id: 'pilot-order' },
    workflowNode: [{
      _id: 'pilot-node', workflowId: 'pilot-run',
      exts: { formList: [{ _id: 'saved-one', state: 1 }] },
    }],
  },
}
function readback(input?: {
  allow?: () => boolean
  environment?: string
  apiBaseUrl?: string
  response?: (request: ApiReadRequest) => unknown
}) {
  const requests: ApiReadRequest[] = []
  const port = createR1PilotAuthoritativeReadback({
    environment: input?.environment ?? 'beta',
    apiBaseUrl: input?.apiBaseUrl ?? 'https://isolated-beta.invalid',
    mayReadScope: input?.allow ?? (() => true),
    transport: { execute: vi.fn(async (request: ApiReadRequest) => {
      requests.push(request)
      return input?.response ? input.response(request)
        : request.path.startsWith('biz/extForm/query/')
          ? formPage([record()]) : workOrderDetail
    }) },
  })
  return { port, requests }
}
afterEach(() => vi.unstubAllEnvs())

describe('R1 source-backed isolated readback transport', () => {
  it('reads exact FormData + full EXTS; never requests the legacy type=query bypass', async () => {
    const h = readback()
    expect(await h.port.readMutation(scope, receipt)).toMatchObject({
      formData: record(), formsExts: { formList: [{ _id: 'saved-one', state: 1 }] },
    })
    expect(h.requests.map(req => req.path)).toEqual([
      'biz/extForm/query/pilot-def', 'basic/serviceAppointment/queryById/pilot-order',
    ])
    expect(h.requests[0]?.body).toMatchObject({
      'is:_id|string#and': 'saved-one', page: 1, rows: 2,
    })
    expect(h.requests[1]?.body).toEqual({})
  })

  it('rejects absent grant, Production environment and Production host before HTTP', async () => {
    for (const input of [
      { allow: () => false },
      { environment: 'prod' },
      { apiBaseUrl: 'https://xlink.fsgo365.cn' },
    ]) {
      const h = readback(input)
      expect(await h.port.readMutation(scope, receipt)).toBeNull()
      expect(h.requests).toHaveLength(0)
    }
  })

  it('rejects duplicate exact-ID results and cross-WorkOrder raw records', async () => {
    for (const response of [formPage([record(), record()]), formPage([
      { ...record(), sid: 'another-order' },
    ])]) {
      const h = readback({ response: request => request.path.startsWith('biz/extForm/query/')
        ? response : workOrderDetail })
      expect(await h.port.readMutation(scope, receipt)).toBeNull()
      expect(h.requests).toHaveLength(1)
    }
  })

  it('denies stale EXTS source node and changes in scope during asynchronous reads', async () => {
    const stale = readback({ response: req => req.path.startsWith('biz/extForm/query/')
      ? formPage([record()])
      : { ...workOrderDetail, data: { ...workOrderDetail.data,
        workflowNode: [{ _id: 'another-node', exts: { formList: [] } }] } } })
    expect(await stale.port.readMutation(scope, receipt)).toBeNull()
    let allowed = true
    const drift = readback({ allow: () => allowed,
      response: req => {
        if (req.path.startsWith('biz/extForm/query/')) allowed = false
        return formPage([record()])
      },
    })
    expect(await drift.port.readMutation(scope, receipt)).toBeNull()
    expect(drift.requests).toHaveLength(1)
  })

  it('requires a complete repeat query, never treats a partial page as an authoritative absence', async () => {
    const repeatScope: R1MultiStepScope = { ...scope, sourceNodeType: 'repeat' }
    const deleted: R1MultiStepReceipt = {
      ...receipt, sourceNodeType: 'repeat', steps: ['repeat_remove'],
      stepIndex: 0, savedFormDataIds: [], targetFormDataId: 'saved-one',
    }
    const h = readback({ response: req =>
      req.body?.['is:workflowId|string#and'] === 'pilot-run'
        ? formPage([], 21)
        : formPage([], 0) })
    expect(await h.port.readMutation(repeatScope, deleted)).toBeNull()
    expect(h.requests).toHaveLength(2)
    expect(h.requests[1]?.body).toMatchObject({ page: 1, rows: 20,
      'ne:state|integer#and': -1, 'is:workflowId|string#and': 'pilot-run' })
  })

  it('fetches processed records by exact identities one at a time and rejects missing records', async () => {
    const h = readback({ response: req =>
      req.body?.['is:_id|string#and'] === 'saved-two'
        ? formPage([record('saved-two')])
        : formPage([record('saved-one')]),
    })
    expect(await h.port.readProcessedRecords(scope, ['saved-one', 'saved-two']))
      .toEqual([record('saved-one'), record('saved-two')])
    expect(h.requests.map(req => req.body?.['is:_id|string#and']))
      .toEqual(['saved-one', 'saved-two'])
    expect(await h.port.readProcessedRecords(scope, ['saved-one', 'saved-one'])).toBeNull()
    expect(h.requests).toHaveLength(2)
  })
})
