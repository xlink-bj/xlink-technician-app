import { describe, expect, it } from 'vitest'
import { r1SpecialFormUpsert } from '@adapters/api/r1-special-workflow-wires'
import { formData } from '@adapters/api/read-models/form'
import { asOpaqueId } from '@shared/types'

type Input = Parameters<typeof r1SpecialFormUpsert>[0]
const original = {
  _id: 'saved', sid: 'work', nodeId: 'node', formDefId: 'ext', state: 1,
  answer: 'old', count: 2, approved: true, optionalNote: 'clear me',
  hidden: 'preserved top-level', unknownMetadata: { nested: ['keep', { zero: 0 }] },
  exts: { answer: 'old', count: 2, approved: true, optionalNote: 'clear me',
    hidden: 'preserved projected value', opaqueConfig: { preserved: [false, 'x'] } },
}
function input(kind: 'forms' | 'repeat' = 'forms'): Input {
  return { sourceNodeType: kind, definitionId: asOpaqueId<'FormDefinitionId'>('ext'),
    workOrderId: asOpaqueId<'WorkOrderId'>('work'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('node'),
    workflowRunId: asOpaqueId<'WorkflowRunId'>('run-A'), existingFormDataId: asOpaqueId<'FormDataId'>('saved'),
    state: 1, formData: { answer: 'new', count: 0, approved: false, newOnly: 'top-level only' },
    authoritativeOriginal: structuredClone(original) }
}
function body(options: Input): Record<string, unknown> {
  return JSON.parse(String(r1SpecialFormUpsert(options).body!.dataStr)) as Record<string, unknown>
}

// Direct wire and actual mapper, never the Mock gateway's automatic exts merge.
for (const kind of ['forms', 'repeat'] as const) {
  describe(`${kind} existing record identity and raw wire preservation`, () => {
    it.each(['workflowId', 'workflowRunId', 'runId', 'formDefinitionId'])(
      'rejects a conflicting persisted %s before contextual fields can overwrite it', key => {
        const options = input(kind)
        const source = { ...original, [key]: key === 'formDefinitionId' ? 'other-ext' : 'run-B' }
        expect(() => r1SpecialFormUpsert({ ...options, authoritativeOriginal: source })).toThrow()
        expect(source[key as keyof typeof source]).toBe(key === 'formDefinitionId' ? 'other-ext' : 'run-B')
      })

    it.each(['workflowId', 'workflowRunId', 'runId'])(
      'rejects contradictory nested Workflow %s without treating its _id as FormData identity', key => {
        expect(() => r1SpecialFormUpsert({ ...input(kind), authoritativeOriginal: {
          ...original, workflow: { _id: 'distinct-workflow-entity', [key]: 'run-B' },
        } })).toThrow()
      })

    it('preserves all consistent optional aliases and a separate nested Workflow entity', () => {
      const result = body({ ...input(kind), authoritativeOriginal: { ...original,
        id: 'saved', dataId: 'saved', formDataId: 'saved', smodule: 'serviceAppointment',
        extId: 'ext', definitionId: 'ext', formDefinitionId: 'ext',
        workflowId: 'run-A', workflowRunId: 'run-A', runId: 'run-A',
        workflow: { _id: 'distinct-workflow-entity', workflowId: 'run-A', workflowRunId: 'run-A', runId: 'run-A' },
      } })
      expect(result).toMatchObject({ _id: 'saved', id: 'saved', dataId: 'saved', formDataId: 'saved',
        workflowId: 'run-A', workflowRunId: 'run-A', runId: 'run-A',
        workflow: { _id: 'distinct-workflow-entity', workflowId: 'run-A', workflowRunId: 'run-A', runId: 'run-A' } })
    })

    it('keeps omitted aliases optional without fabricating them', () => {
      const result = body(input(kind))
      expect(result.workflowId).toBe('run-A') // Explicit command context, not inferred from source.
      for (const key of ['workflowRunId', 'runId', 'formDefinitionId', 'workflow']) expect(result).not.toHaveProperty(key)
    })

    it('updates only existing duplicate business keys and round-trips them through the actual read mapper', () => {
      const options = input(kind), before = structuredClone(options.authoritativeOriginal)
      const result = body(options), exts = result.exts as Record<string, unknown>
      expect(result).toMatchObject({ answer: 'new', count: 0, approved: false, newOnly: 'top-level only' })
      expect(exts).toMatchObject({ answer: 'new', count: 0, approved: false })
      expect(exts).not.toHaveProperty('newOnly') // Do not duplicate the Mock's unconditional merge.
      expect(formData(result, undefined, options.definitionId).values).toMatchObject({ answer: 'new', count: 0, approved: false })
      expect(result.unknownMetadata).toEqual(original.unknownMetadata)
      expect(result.hidden).toBe(original.hidden); expect(exts.hidden).toBe(original.exts.hidden)
      expect(exts.opaqueConfig).toEqual(original.exts.opaqueConfig)
      expect(options.authoritativeOriginal).toEqual(before)
    })

    it('keeps explicit optional clearing in both locations while preserving hidden/unknown source values', () => {
      const options = input(kind), before = structuredClone(options.authoritativeOriginal)
      const result = body({ ...options, clearedFieldKeys: ['optionalNote'] })
      expect(result).not.toHaveProperty('optionalNote'); expect(result.exts).not.toHaveProperty('optionalNote')
      expect(result.hidden).toBe(original.hidden)
      expect((result.exts as Record<string, unknown>).opaqueConfig).toEqual(original.exts.opaqueConfig)
      expect(formData(result, undefined, options.definitionId).values).not.toHaveProperty('optionalNote')
      expect(options.authoritativeOriginal).toEqual(before)
    })

    it.each(['id', 'dataId', 'formDataId', 'sid', 'nodeId', 'smodule', 'formDefId', 'definitionId', 'extId'])(
      'keeps the existing contradictory %s guard', key => {
        expect(() => r1SpecialFormUpsert({ ...input(kind), authoritativeOriginal: {
          ...original, [key]: 'foreign',
        } })).toThrow()
      })
  })
}

describe('optional forms run context and malformed saved ownership', () => {
  it('retains legacy forms edits with no caller run and no persisted run alias', () => {
    const options = { ...input(), workflowRunId: undefined }
    const result = body(options)
    expect(result).not.toHaveProperty('workflowId')
    expect(formData(result, undefined, options.definitionId).values?.answer).toBe('new')
  })
  it.each(['workflowId', 'workflowRunId', 'runId'])('does not infer missing caller run from source %s', key => {
    expect(() => r1SpecialFormUpsert({ ...input(), workflowRunId: undefined,
      authoritativeOriginal: { ...original, [key]: 'run-A' } })).toThrow()
    expect(() => r1SpecialFormUpsert({ ...input(), workflowRunId: undefined,
      authoritativeOriginal: { ...original, workflow: { [key]: 'run-A' } } })).toThrow()
  })
  it('does not infer a run from a nested entity _id alone', () => {
    const result = body({ ...input(), workflowRunId: undefined,
      authoritativeOriginal: { ...original, workflow: { _id: 'separate-entity' } } })
    expect(result).not.toHaveProperty('workflowId')
    expect(result.workflow).toEqual({ _id: 'separate-entity' })
  })
  it.each([undefined, null, '', 1, false])('rejects present malformed run aliases %#', value => {
    expect(() => r1SpecialFormUpsert({ ...input(), authoritativeOriginal: { ...original, runId: value } })).toThrow()
    expect(() => r1SpecialFormUpsert({ ...input(), authoritativeOriginal: {
      ...original, workflow: { workflowRunId: value },
    } })).toThrow()
  })
  it.each(['run-A', [], 42])('rejects malformed nested Workflow %#', workflow => {
    expect(() => r1SpecialFormUpsert({ ...input(), authoritativeOriginal: { ...original, workflow } })).toThrow()
  })
  it('does not introduce exts for an original without that object', () => {
    const { exts: omitted, ...withoutExts } = original
    void omitted
    const result = body({ ...input(), authoritativeOriginal: withoutExts })
    expect(result).not.toHaveProperty('exts')
    expect(result.answer).toBe('new')
  })
  it('keeps creation payloads free of synthesized exts', () => {
    const result = body({ ...input(), existingFormDataId: undefined, authoritativeOriginal: undefined })
    expect(result).not.toHaveProperty('exts'); expect(result).not.toHaveProperty('_id')
  })
})
