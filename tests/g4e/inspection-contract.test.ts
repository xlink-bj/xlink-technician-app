/**
 * Legacy Inspection compatibility harness only.
 * This file is not the Survey contract and must not be used as the G4-E
 * application fixture or business-semantic authority.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  inspectionContractSnapshot,
  mockInspectionPartsCascadeResponse,
  mockObservedInspectionFormDefinitionId,
  mockObservedInspectionFormDefinitionResponse,
  mockQualifiedCodeOptionsResponse,
} from '@adapters/api/mock/inspection-contract'
import {
  contractFingerprint,
  discoverInspectionContract,
  validateContractSnapshot,
} from '../../scripts/inspection-contract.mjs'

function responseBody(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200 })
}

async function discoverProviderFixture(options: {
  readonly fields: readonly Record<string, unknown>[]
  readonly providerPath: string
  readonly providerResponse: unknown
  readonly formData?: Record<string, unknown>
  readonly serviceType?: string
}) {
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.includes('/basic/serviceAppointment/queryById/')) {
      return responseBody({
        data: {
          serviceAppointment: { serviceType: options.serviceType ?? 'service-type' },
          workflowNode: [{
            _id: 'inspection-node',
            state: 0,
            ...(options.formData ? { formDataId: 'inspection-form-data' } : {}),
            nodeDef: { nodeType: 'repeat', formDefId: 'inspection-form' },
          }],
        },
      })
    }
    if (url.endsWith('/biz/extField/query')) return responseBody({ data: options.fields })
    if (url.endsWith('/biz/extForm/query/inspection-form')) {
      return responseBody({ data: options.formData ? [options.formData] : [] })
    }
    if (url.endsWith(options.providerPath)) return responseBody(options.providerResponse)
    throw new Error(`unexpected provider fixture route: ${url}`)
  }))

  const snapshot = await discoverInspectionContract({
    apiBaseUrl: 'https://beta.example.invalid',
    sessionRef: 'session-only-test-input',
    timeoutMs: 1_000,
    workOrderId: 'safe-work-order',
    workflowNodeId: 'inspection-node',
  })
  return { snapshot, requests }
}

describe('G4-E legacy Inspection compatibility contract (not Survey)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('validates the committed sanitized snapshot and its deterministic fingerprint', () => {
    expect(validateContractSnapshot(inspectionContractSnapshot)).toBe(true)
    expect(contractFingerprint(inspectionContractSnapshot)).toBe(inspectionContractSnapshot.fingerprint)
    expect(inspectionContractSnapshot.environment).toBe('beta')
    expect(inspectionContractSnapshot.source.authority).toBe('authenticated_beta_read')
  })

  it('derives raw field rows from the snapshot without a second schema definition', () => {
    expect(mockObservedInspectionFormDefinitionId).toBe(inspectionContractSnapshot.form.id)
    expect(mockObservedInspectionFormDefinitionResponse.data.map((row) => row.name)).toEqual(
      inspectionContractSnapshot.fields.map((field) => field.key),
    )
    expect(mockObservedInspectionFormDefinitionResponse.data.map((row) => row._id)).toEqual(
      inspectionContractSnapshot.fields.map((field) => field.identity),
    )
    expect(mockObservedInspectionFormDefinitionResponse.total).toBe(inspectionContractSnapshot.form.fieldCount)
  })

  it('derives verified providers and preserves explicit unknown provider boundaries', () => {
    const parts = inspectionContractSnapshot.providers.find((provider) => provider.id === 'parts')
    const qualified = inspectionContractSnapshot.providers.find((provider) => provider.id === 'qualified')
    const packageProvider = inspectionContractSnapshot.providers.find((provider) => provider.id === 'projPackage')
    const sopProvider = inspectionContractSnapshot.providers.find((provider) => provider.id === 'inspectionSOP')
    const contentProvider = inspectionContractSnapshot.providers.find((provider) => provider.id === 'inspectionContent')

    expect(parts?.verification).toBe('VERIFIED')
    expect(qualified?.verification).toBe('VERIFIED')
    expect(mockInspectionPartsCascadeResponse[0].children).toEqual(
      parts?.options.map((option) => ({ value: option.value, name: option.label })),
    )
    expect(mockQualifiedCodeOptionsResponse[0].options).toEqual(
      Object.fromEntries(qualified?.options.map((option) => [option.value, option.label]) ?? []),
    )
    expect(packageProvider?.verification).toBe('UNKNOWN')
    expect(sopProvider?.verification).toBe('UNKNOWN')
    expect(contentProvider?.verification).toBe('UNKNOWN')
  })

  it('retains real form relationships without committing opaque record identities', () => {
    expect(inspectionContractSnapshot.workflowContextShape.formDefinitionId).toBe(inspectionContractSnapshot.form.id)
    expect(inspectionContractSnapshot.formDataShape.definitionRelation).toBe('form_definition_id_matches_requested')
    expect(JSON.stringify(inspectionContractSnapshot)).not.toMatch(/JSESSIONID|Cookie|customerName|phone|address/)
  })

  it('discovers an active form identity from the workflow node instead of a historical constant', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.includes('queryById/safe-work-order')) {
        return new Response(JSON.stringify({
          data: {
            serviceAppointment: { serviceType: '40' },
            workflowNode: [{
              _id: 'real-node-id',
              state: 0,
              nodeDef: { nodeType: 'repeat', formDefId: 'real-form-definition-id' },
            }],
          },
        }))
      }
      if (url.endsWith('/biz/extField/query')) {
        return new Response(JSON.stringify({
          data: [{
            _id: 'real-field-id',
            name: 'summary',
            nameDisp: '现场情况',
            type: 'textarea',
            required: '1',
            state: 1,
          }],
        }))
      }
      throw new Error('unexpected read route')
    }))

    const snapshot = await discoverInspectionContract({
      apiBaseUrl: 'https://beta.example.invalid',
      sessionRef: 'session-only-test-input',
      timeoutMs: 1_000,
      workOrderId: 'safe-work-order',
      workflowNodeId: 'real-node-id',
    })

    expect(snapshot.form.id).not.toBe('real-form-definition-id')
    expect(snapshot.form.id).toMatch(/^form-definition-/)
    expect(snapshot.form.fieldCount).toBe(1)
    expect(snapshot.workflowContextShape.formDefinitionId).toBe(snapshot.form.id)
    expect(requests).toEqual([
      'POST https://beta.example.invalid/basic/serviceAppointment/queryById/safe-work-order',
      'POST https://beta.example.invalid/biz/extField/query',
    ])
  })

  it('requires explicit work-order identity and never accepts the first readable item', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)

    await expect(discoverInspectionContract({
      apiBaseUrl: 'https://beta.example.invalid',
      sessionRef: 'session-only-test-input',
      timeoutMs: 1_000,
    })).rejects.toMatchObject({ code: 'inspection_identity_required' })
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects an Appointment-only node and does not use its form as Inspection', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(`${init?.method ?? 'GET'} ${String(input)}`)
      return new Response(JSON.stringify({
        data: {
          workflowNode: [{
            _id: 'appointment-node',
            state: 0,
            nodeDef: { nodeType: 'node', name: '预约', formDefId: 'appointment-form' },
          }],
        },
      }))
    }))

    await expect(discoverInspectionContract({
      apiBaseUrl: 'https://beta.example.invalid',
      sessionRef: 'session-only-test-input',
      timeoutMs: 1_000,
      workOrderId: 'safe-work-order',
      workflowNodeId: 'appointment-node',
    })).rejects.toMatchObject({ code: 'inspection_identity_required' })
    expect(requests).toHaveLength(1)
    expect(requests[0]).not.toContain('appointment-form')
  })

  it('rejects a historical Survey node and never falls back to its form identity', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(`${init?.method ?? 'GET'} ${String(input)}`)
      return new Response(JSON.stringify({
        data: {
          workflowNode: [{
            _id: 'historical-survey-node',
            state: 10,
            nodeDef: { nodeType: 'repeat', formDefId: 'historical-survey-form' },
          }],
        },
      }))
    }))

    await expect(discoverInspectionContract({
      apiBaseUrl: 'https://beta.example.invalid',
      sessionRef: 'session-only-test-input',
      timeoutMs: 1_000,
      workOrderId: 'safe-work-order',
      workflowNodeId: 'historical-survey-node',
    })).rejects.toMatchObject({ code: 'inspection_identity_required' })
    expect(requests).toHaveLength(1)
    expect(requests[0]).not.toContain('historical-survey-form')
  })

  it('requires node identity when more than one active Inspection node is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        workflowNode: [
          { _id: 'inspection-node-a', state: 0, nodeDef: { nodeType: 'repeat', formDefId: 'inspection-form-a' } },
          { _id: 'inspection-node-b', state: 0, nodeDef: { nodeType: 'repeat', formDefId: 'inspection-form-b' } },
        ],
      },
    }))))

    await expect(discoverInspectionContract({
      apiBaseUrl: 'https://beta.example.invalid',
      sessionRef: 'session-only-test-input',
      timeoutMs: 1_000,
      workOrderId: 'safe-work-order',
    })).rejects.toMatchObject({ code: 'ambiguous_inspection_form' })
  })

  it('does not mark malformed parts or qualified responses as VERIFIED', async () => {
    const parts = await discoverProviderFixture({
      fields: [{ name: 'part', type: 'cascade', valueOption: 'parts' }],
      providerPath: 'i/code/selectMultistageCode.do',
      providerResponse: [{ type: 'parts', children: [{ value: 'part-only' }] }],
    })
    expect(parts.snapshot.providers.find((provider) => provider.id === 'parts')).toMatchObject({
      verification: 'PARTIAL',
      options: [],
    })

    const qualified = await discoverProviderFixture({
      fields: [{ name: 'isQualified', type: 'select', valueOption: 'qualified' }],
      providerPath: 'i/code/selectCode.do',
      providerResponse: [{ eleid: 'other', options: { yes: '是' } }],
    })
    expect(qualified.snapshot.providers.find((provider) => provider.id === 'qualified')).toMatchObject({
      verification: 'UNKNOWN',
      options: [],
    })

    const validParts = await discoverProviderFixture({
      fields: [{ name: 'part', type: 'cascade', valueOption: 'parts' }],
      providerPath: 'i/code/selectMultistageCode.do',
      providerResponse: [{
        type: 'parts',
        children: [{ value: 'part', name: '屋面', children: [{ value: 'sub-part', name: '东侧' }] }],
      }],
    })
    expect(validParts.snapshot.providers.find((provider) => provider.id === 'parts')).toMatchObject({
      verification: 'VERIFIED',
      options: [{ label: '屋面', children: [{ label: '东侧' }] }],
    })

    const validQualified = await discoverProviderFixture({
      fields: [{ name: 'isQualified', type: 'select', valueOption: 'qualified' }],
      providerPath: 'i/code/selectCode.do',
      providerResponse: [{ eleid: 'qualified', options: { '0': '不合格', '1': '合格' } }],
    })
    expect(validQualified.snapshot.providers.find((provider) => provider.id === 'qualified')).toMatchObject({
      verification: 'VERIFIED',
      options: [{ label: '不合格' }, { label: '合格' }],
    })
  })

  it('requires package relationships before marking projPackage VERIFIED', async () => {
    const { snapshot } = await discoverProviderFixture({
      fields: [{ name: 'serviceGoods', type: 'bizSelect', valueOption: 'projPackage' }],
      providerPath: 'biz/projPackage/queryWithRank',
      providerResponse: { data: [{ _id: 'package', name: '套餐', serviceType: 'service-type', exts: {} }] },
    })
    expect(snapshot.providers.find((provider) => provider.id === 'projPackage')).toMatchObject({
      verification: 'PARTIAL',
      options: [],
    })
  })

  it('uses a dedicated structural sanitizer for inspectionSOP', async () => {
    const generic = await discoverProviderFixture({
      fields: [{ name: 'inspectionSOP', type: 'request' }],
      providerPath: 'biz/extForm/queryByColName/inspectionSOP',
      formData: { _id: 'inspection-form-data', extId: 'inspection-form', part: ['part'] },
      providerResponse: { data: [{ _id: 'sop-record', name: 'SOP' }] },
    })
    expect(generic.snapshot.providers.find((provider) => provider.id === 'inspectionSOP')).toMatchObject({
      verification: 'PARTIAL',
      options: [],
    })

    const valid = await discoverProviderFixture({
      fields: [{ name: 'inspectionSOP', type: 'request' }],
      providerPath: 'biz/extForm/queryByColName/inspectionSOP',
      formData: { _id: 'inspection-form-data', extId: 'inspection-form', part: ['part'] },
      providerResponse: {
        data: [{
          _id: 'sop-record',
          part: ['part'],
          content: { kind: 'text' },
          required: '1',
          sopOrder: 1,
          isQualified: '1',
          reason: { kind: 'text' },
          otherReason: { kind: 'text' },
          inspectionImg: [],
        }],
      },
    })
    expect(valid.snapshot.providers.find((provider) => provider.id === 'inspectionSOP')).toMatchObject({
      verification: 'VERIFIED',
      options: [{ idAlias: expect.stringMatching(/^inspection-sop-/), part: [expect.stringMatching(/^option-/)] }],
    })
  })

  it('keeps inspectionContent UNKNOWN when no current provider is evidenced', async () => {
    const { snapshot } = await discoverProviderFixture({
      fields: [{ name: 'inspectionContent', type: 'select', multiple: true }],
      providerPath: 'unused/provider',
      providerResponse: [],
    })
    expect(snapshot.providers.find((provider) => provider.id === 'inspectionContent')).toMatchObject({
      verification: 'UNKNOWN',
      options: [],
    })
  })
})
