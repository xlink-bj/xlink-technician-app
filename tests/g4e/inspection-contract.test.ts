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

describe('G4-E Beta Inspection contract and Mock derivation', () => {
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
              nodeDef: { nodeType: 'forms', formDefId: 'real-form-definition-id' },
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
})
