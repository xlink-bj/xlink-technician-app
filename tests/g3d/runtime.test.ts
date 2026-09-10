import { describe, expect, it } from 'vitest'

import {
  applyAreaMeasurementRule,
  classifyFieldType,
  evaluateFieldState,
  evaluateVisibility,
  normalizeFieldValue,
  normalizeSubmission,
  selectOptionProvider,
} from '@runtimes/dynamic-form'
import type {
  FormFieldSchema,
  VisibilityExpression,
} from '@runtimes/dynamic-form'
import {
  createChildWorkflowContext,
  createMainWorkflowContext,
  createSubworkflowRef,
  createWorkflowFormIdentity,
  createWorkflowIdentityGraph,
  evaluateNodeVisibility,
  evaluateWorkflowAction,
  isHandlerMatch,
} from '@runtimes/workflow'
import type {
  HandlerIdentity,
  WorkflowActor,
  WorkflowNodeMetadata,
} from '@runtimes/workflow'
import { isCompatibilityEntryActive } from '@shared/config'
import { asOpaqueId } from '@shared/types'

const definitionId = asOpaqueId<'WorkflowDefinitionId'>('workflow-definition-main')
const mainRunId = asOpaqueId<'WorkflowRunId'>('workflow-run-main')
const childDefinitionId = asOpaqueId<'WorkflowDefinitionId'>('workflow-definition-child')
const childRunId = asOpaqueId<'WorkflowRunId'>('workflow-run-child')
const parentNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('workflow-node-parent')
const childNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('workflow-node-child')
const formDefinitionId = asOpaqueId<'FormDefinitionId'>('form-definition-001')
const formDataId = asOpaqueId<'FormDataId'>('form-data-001')
const userId = asOpaqueId<'UserId'>('user-001')
const roleId = asOpaqueId<'RoleId'>('role-001')
const organizationId = asOpaqueId<'OrganizationId'>('organization-001')

const actor: WorkflowActor = {
  userId,
  roleIds: [roleId],
  organizationRoles: [{ organizationId, roleId }],
}

function node(overrides: Partial<WorkflowNodeMetadata> = {}): WorkflowNodeMetadata {
  return {
    id: childNodeId,
    category: 'forms',
    lifecycle: 'active',
    ...overrides,
  }
}

describe('G3-D Workflow Runtime identity and policy', () => {
  it('keeps main and child workflow identities separate', () => {
    const main = createMainWorkflowContext({ definitionId, runId: mainRunId })
    const child = createChildWorkflowContext({
      parentRunId: mainRunId,
      parentNodeId,
      definitionId: childDefinitionId,
      runId: childRunId,
    })
    const graph = createWorkflowIdentityGraph({
      context: child,
      nodeId: childNodeId,
      form: createWorkflowFormIdentity({ definitionId: formDefinitionId, dataId: formDataId }),
    })
    const ref = createSubworkflowRef({
      parentRunId: mainRunId,
      parentNodeId,
      definitionId: childDefinitionId,
      runId: childRunId,
    })

    expect(main).toEqual({ kind: 'main', definitionId, runId: mainRunId })
    expect(child.parent).toEqual({ runId: mainRunId, nodeId: parentNodeId })
    expect(child.definitionId).toBe(childDefinitionId)
    expect(child.runId).toBe(childRunId)
    expect(graph.form).toEqual({ definitionId: formDefinitionId, dataId: formDataId })
    expect(ref.parentRunId).not.toBe(ref.runId)
  })

  it('matches normalized user, role, and organization-role handlers without wire composites', () => {
    const handlers: readonly HandlerIdentity[] = [
      { kind: 'user', userId },
      { kind: 'role', roleId },
      { kind: 'organizationRole', organizationId, roleId },
    ]
    expect(isHandlerMatch(actor, handlers)).toBe(true)
    expect(isHandlerMatch({ ...actor, userId: asOpaqueId<'UserId'>('other-user') }, [{ kind: 'user', userId }])).toBe(
      false,
    )
    expect(handlers).not.toContain('organization-001+role-001')
  })

  it('evaluates node visibility from semantic metadata, never array position', () => {
    const visible = node({ handlers: [{ kind: 'role', roleId }] })
    const system = node({ id: parentNodeId, category: 'system', isSystem: true })
    const inactive = node({ lifecycle: 'closed' })
    const nonUser = node({ category: 'dispatch' })
    const ordered = [system, visible]
    const reversed = [visible, system]

    expect(evaluateNodeVisibility(ordered[1], actor)).toEqual({ visible: true })
    expect(evaluateNodeVisibility(reversed[0], actor)).toEqual({ visible: true })
    expect(evaluateNodeVisibility(ordered[0], actor).reason).toBe('system_node')
    expect(evaluateNodeVisibility(inactive, actor).reason).toBe('node_inactive')
    expect(evaluateNodeVisibility(nonUser, actor).reason).toBe('non_user_node')
    expect(evaluateNodeVisibility(node({ handlers: [{ kind: 'user', userId }] }), undefined).reason).toBe(
      'not_handler',
    )
  })

  it('returns semantic action decisions and explicit blocked reasons', () => {
    const formNode = node()
    expect(evaluateWorkflowAction({ action: 'complete', node: formNode, actor })).toEqual({
      action: 'complete',
      allowed: false,
      reason: 'required_form_missing',
    })
    expect(evaluateWorkflowAction({ action: 'complete', node: formNode, actor, formRecordCount: 1 })).toEqual({
      action: 'complete',
      allowed: true,
      command: { type: 'complete', nodeId: childNodeId },
    })
    expect(evaluateWorkflowAction({ action: 'transition', node: formNode, actor })).toEqual({
      action: 'transition',
      allowed: false,
      reason: 'policy_unverified',
    })
    expect(evaluateWorkflowAction({ action: 'place_order', node: node({ category: 'placeOrder' }), actor }).allowed).toBe(
      true,
    )
  })

  it('keeps compatibility exceptions inactive unless explicitly approved', () => {
    const entry = {
      semanticName: 'sanitized-workflow-exception',
      purpose: 'test-only workflow compatibility fixture',
      scope: 'workflow' as const,
      provenance: { source: 'sanitized-fixture', evidenceRef: 'workflow-fixture-001' },
      ownerGate: 'G4 workflow fixture',
      confidence: 'low' as const,
      activation: { approved: false, condition: 'explicit reviewed activation' },
      safeFallback: 'inactive',
      reviewRemovalCondition: 'remove after verified semantic metadata',
    }
    expect(isCompatibilityEntryActive(entry)).toBe(false)
  })
})

describe('G3-D Dynamic Form Runtime capability and visibility', () => {
  it('uses deterministic option-provider precedence and explicit unsupported results', () => {
    expect(
      selectOptionProvider({
        key: 'workType',
        type: 'select',
        valueOption: 'ignored-by-semantic-special-case',
        inlineOptions: [{ value: 'x', label: 'X' }],
      }),
    ).toEqual({ state: 'provider', provider: { kind: 'workTypes' } })
    expect(selectOptionProvider({ key: 'region', type: 'cascade', valueOption: 'region', inlineOptions: [] })).toEqual({
      state: 'provider',
      provider: { kind: 'cascade', valueOption: 'region' },
    })
    expect(selectOptionProvider({ key: 'status', type: 'select', valueOption: 'status' })).toEqual({
      state: 'provider',
      provider: { kind: 'code', valueOption: 'status' },
    })
    expect(selectOptionProvider({ key: 'local', type: 'radio', inlineOptions: [{ value: 'a', label: 'A' }] })).toEqual({
      state: 'provider',
      provider: { kind: 'inline' },
    })
    expect(selectOptionProvider({ key: 'missing', type: 'checkbox' }).state).toBe('unsupported')
    expect(selectOptionProvider({ key: 'description', type: 'text' })).toEqual({ state: 'not_required' })
    expect(classifyFieldType('scan').capability).toBe('UNSUPPORTED')
    expect(classifyFieldType('area').capability).toBe('SUPPORTED_GENERIC')
  })

  it('evaluates scalar, nested, array, existence, false, and malformed visibility cases', () => {
    const values = {
      status: 'active',
      customer: { tier: 'gold' },
      choices: ['a', 'b'],
      cascade: ['north', 'city-001'],
    }
    expect(evaluateVisibility({ kind: 'equals', path: 'status', value: 'active' }, values)).toEqual({
      state: 'visible',
      visible: true,
    })
    expect(evaluateVisibility({ kind: 'equals', path: 'customer.tier', value: 'gold' }, values).visible).toBe(true)
    expect(evaluateVisibility({ kind: 'includes', path: 'choices', value: 'b' }, values).visible).toBe(true)
    expect(evaluateVisibility({ kind: 'includes', path: ['cascade'], value: 'city-001' }, values).visible).toBe(true)
    expect(evaluateVisibility({ kind: 'exists', path: 'customer.tier', expected: true }, values).visible).toBe(true)
    expect(evaluateVisibility({ kind: 'equals', path: 'status', value: 'closed' }, values).state).toBe('hidden')
    expect(evaluateVisibility({ kind: 'exists', path: 'missing', expected: true }, values).state).toBe('hidden')
    expect(evaluateVisibility({ kind: 'unknown' } as unknown as VisibilityExpression, values).state).toBe('unsupported')
  })

  it('applies unsupported, visibility, read-only, and required precedence', () => {
    const hiddenRequired: FormFieldSchema = {
      key: 'hiddenRequired',
      type: 'text',
      required: true,
      visibility: { kind: 'equals', path: 'show', value: true },
    }
    const readOnly: FormFieldSchema = { key: 'status', type: 'text', required: true, readOnly: false }
    const unsupported: FormFieldSchema = { key: 'custom', type: 'canvas' }

    expect(evaluateFieldState(hiddenRequired, { values: { show: false } })).toMatchObject({
      visible: false,
      required: false,
    })
    expect(evaluateFieldState(readOnly, { workflowReadOnly: true })).toMatchObject({
      readOnly: true,
      required: false,
    })
    expect(evaluateFieldState(readOnly, { fixedFormReadOnly: true }).readOnly).toBe(true)
    expect(evaluateFieldState(readOnly, { runtimeReadOnly: true }).readOnly).toBe(true)
    expect(evaluateFieldState(readOnly, { fixedRequired: false, runtimeRequired: true })).toMatchObject({
      required: false,
    })
    expect(evaluateFieldState(unsupported).capability).toBe('UNSUPPORTED')
    expect(evaluateFieldState({ key: 'code', type: 'select' }).capability).toBe('UNSUPPORTED')
    expect(evaluateFieldState({ key: 'genericArea', type: 'area' }).capability).toBe('SUPPORTED_GENERIC')
  })
})

describe('G3-D Dynamic Form Runtime values and submission', () => {
  it('normalizes bounded scalar, numeric, decimal, and array values', () => {
    expect(normalizeFieldValue('text', '  hello  ')).toEqual({ ok: true, value: 'hello' })
    expect(normalizeFieldValue('phone', '  test-phone  ')).toEqual({ ok: true, value: 'test-phone' })
    expect(normalizeFieldValue('number', '12')).toEqual({ ok: true, value: 12 })
    expect(normalizeFieldValue('number', '12.5').ok).toBe(false)
    expect(normalizeFieldValue('digit', '12.50')).toEqual({ ok: true, value: 12.5 })
    expect(normalizeFieldValue('checkbox', ['a', 'b'])).toEqual({ ok: true, value: ['a', 'b'] })
    expect(normalizeFieldValue('image', asOpaqueId<'LocalMediaRef'>('media-ref-001'))).toEqual({
      ok: true,
      value: 'media-ref-001',
    })
    expect(normalizeFieldValue('image', ['media-ref-001'])).toEqual({ ok: true, value: ['media-ref-001'] })
    expect(normalizeFieldValue('file', true).ok).toBe(false)
    expect(normalizeFieldValue('file', 42).ok).toBe(false)
    expect(normalizeFieldValue('image', { ref: 'media-ref-001' }).ok).toBe(false)
    expect(normalizeFieldValue('area', '12.50')).toMatchObject({
      ok: false,
      reason: 'unsupported_field_type',
    })
    expect(normalizeFieldValue('scan', 'raw-value')).toMatchObject({ ok: false, reason: 'unsupported_field_type' })
  })

  it('omits hidden required fields and returns a semantic submission without backend envelopes', () => {
    const result = normalizeSubmission({
      fields: [
        { key: 'name', type: 'text', required: true },
        {
          key: 'details',
          type: 'text',
          required: true,
          visibility: { kind: 'equals', path: 'showDetails', value: true },
        },
      ],
      values: { name: '  Sanitized  ', showDetails: false },
    })
    expect(result).toEqual({ ok: true, value: { values: { name: 'Sanitized' } } })
    expect(JSON.stringify(result)).not.toContain('dataStr')
    expect(JSON.stringify(result)).not.toContain('endpoint')

    const missing = normalizeSubmission({
      fields: [{ key: 'name', type: 'text', required: true }],
      values: {},
    })
    expect(missing).toMatchObject({ ok: false, reason: 'validation', fieldKey: 'name' })
  })

  it('keeps declarative measurement rules inactive by default and computes sanitized active rules', () => {
    const entry = {
      semanticName: 'sanitized-survey-area',
      purpose: 'test-only measurement rule',
      scope: 'form' as const,
      provenance: { source: 'sanitized-fixture', evidenceRef: 'fixture-area-001' },
      ownerGate: 'G4 sanitized form fixture',
      confidence: 'medium' as const,
      activation: { approved: false, condition: 'explicit test activation' },
      safeFallback: 'inactive',
      reviewRemovalCondition: 'remove after verified normalized rule',
      wireReference: 'sanitized-form-reference',
    }
    const rule = {
      entry,
      lengthField: 'length',
      widthField: 'width',
      areaField: 'area',
    }
    expect(applyAreaMeasurementRule({ length: 2, width: 3 }, rule)).toEqual({
      applied: false,
      values: { length: 2, width: 3 },
    })
    const active = applyAreaMeasurementRule(
      { length: 2.5, width: '4' },
      { ...rule, entry: { ...entry, activation: { approved: true, condition: 'test approval' } } },
    )
    expect(active).toEqual({ applied: true, values: { length: 2.5, width: '4', area: 10 } })
  })
})
