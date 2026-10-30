import { describe, expect, it } from 'vitest'

import { codeOption, cascadeCodeOptions, dynamicCodeOptions, flattenCodeOptions } from '@adapters/api/read-models/code-options'
import { formData, formDefinition } from '@adapters/api/read-models/form'
import { workOrderActivities } from '@adapters/api/read-models/work-order-activity'
import { workOrderDetail, workOrderSummary } from '@adapters/api/read-models/work-order'
import { workflowNode, assertUniqueRuntimeNodeIds } from '@adapters/api/read-models/workflow'
import { asOpaqueId } from '@shared/types'

const definitionId = asOpaqueId<'FormDefinitionId'>('form-definition-1')

describe('C4 transport-independent R1 read mappers', () => {
  it('preserves a verified form definition and fails closed on contradictory ExtField scope', () => {
    const row = { _id: 'field-1', extId: 'form-definition-1', name: 'leakageArea', colName: 'survey', type: 'text' }
    const result = formDefinition({ data: [row] }, definitionId)
    expect(result.id).toBe(definitionId)
    expect(result.purpose).toBe('survey')
    expect(result.fields?.[0]).toMatchObject({ fieldId: 'field-1', valueKey: 'leakageArea', type: 'text' })
    expect(() => formDefinition({ data: [{ ...row, extId: 'foreign-definition' }] }, definitionId))
      .toThrow(/identity|Form field definition/i)
    expect(() => formDefinition({ data: [row, row] }, definitionId)).toThrow(/duplicate/i)
  })

  it('preserves exact FormData identities and rejects a contradictory saved row', () => {
    const saved = formData({
      _id: 'saved-1',
      extId: 'form-definition-1',
      workflowRunId: 'workflow-1',
      exts: { leakageArea: 'roof' },
    }, undefined, definitionId)
    expect(saved).toMatchObject({
      id: 'saved-1',
      definitionId: 'form-definition-1',
      workflowRunId: 'workflow-1',
      values: { leakageArea: 'roof' },
    })
    expect(() => formData({
      _id: 'saved-1', id: 'saved-2', extId: 'form-definition-1',
    }, undefined, definitionId)).toThrow(/identit/i)
  })

  it('preserves code identity, dynamic provider shape and cascade flattening', () => {
    expect(codeOption({ value: 'a', name: '选项 A' })).toEqual({ value: 'a', label: '选项 A' })
    expect(() => codeOption({ name: '缺少代码' })).toThrow()
    expect(dynamicCodeOptions([{ eleid: 'field-1', options: { '1': '合格', '2': '' } }], 'field-1'))
      .toEqual({ items: [{ value: '1', label: '合格' }] })
    expect(() => dynamicCodeOptions({}, 'field-1')).toThrow(/malformed/i)
    const cascade = cascadeCodeOptions([{
      type: 'parts',
      children: [{ value: 'roof', name: '屋顶', children: [{ value: 'flat', name: '平屋顶' }] }],
    }], 'parts')
    expect(flattenCodeOptions(cascade.items).map((item) => item.value)).toEqual(['roof', 'flat'])
  })

  it('keeps historical activity labels presentation-only without inventing executable actions', () => {
    const activities = workOrderActivities({ data: [
      { type: 1, typeId: 'note-1', content: '已记录勘察情况', createTime: '2026-10-30 10:00:00' },
      { type: 99, typeId: 'unknown', content: '未知行为' },
    ] })
    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({ id: 'note-1', badge: '笔记' })
  })

  it('preserves exact Work Order and Workflow runtime node authority', () => {
    const workOrderId = asOpaqueId<'WorkOrderId'>('wo-1')
    expect(workOrderSummary({ id: 'wo-1', orderNum: 'W-001' }, new Map(), new Map()))
      .toMatchObject({ id: 'wo-1', displayNumber: 'W-001' })
    expect(() => workOrderSummary({ id: 'wo-1', _id: 'foreign-wo' }, new Map(), new Map()))
      .toThrow(/identit/i)
    const node = workflowNode({ id: 'node-1', workflowId: 'run-1' })
    expect(node).toMatchObject({ id: 'node-1', runId: 'run-1' })
    expect(() => assertUniqueRuntimeNodeIds([node, node], 'C4'))
      .toThrow(/duplicate/i)
    expect(() => workOrderDetail({
      data: {
        id: 'wo-1', workflowRunId: 'run-1',
        workflowNode: [{ id: 'node-1', workflowId: 'foreign-run' }],
      },
    }, workOrderId, new Map(), new Map())).toThrow(/different workflow run/i)
  })
})
