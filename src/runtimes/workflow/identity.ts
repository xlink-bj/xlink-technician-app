import type {
  ChildWorkflowContext,
  MainWorkflowContext,
  SubworkflowRef,
  WorkflowFormIdentity,
  WorkflowIdentityGraph,
} from './types'
import type {
  FormDataId,
  FormDefinitionId,
  WorkflowDefinitionId,
  WorkflowNodeRuntimeId,
  WorkflowRunId,
} from '@shared/types'

export function createMainWorkflowContext(input: {
  readonly definitionId: WorkflowDefinitionId
  readonly runId: WorkflowRunId
}): MainWorkflowContext {
  return { kind: 'main', definitionId: input.definitionId, runId: input.runId }
}

export function createChildWorkflowContext(input: {
  readonly parentRunId: WorkflowRunId
  readonly parentNodeId: WorkflowNodeRuntimeId
  readonly definitionId: WorkflowDefinitionId
  readonly runId: WorkflowRunId
}): ChildWorkflowContext {
  return {
    kind: 'child',
    parent: { runId: input.parentRunId, nodeId: input.parentNodeId },
    definitionId: input.definitionId,
    runId: input.runId,
  }
}

export function createSubworkflowRef(input: {
  readonly parentRunId: WorkflowRunId
  readonly parentNodeId: WorkflowNodeRuntimeId
  readonly definitionId: WorkflowDefinitionId
  readonly runId: WorkflowRunId
}): SubworkflowRef {
  return { ...input }
}

export function createWorkflowFormIdentity(input: {
  readonly definitionId: FormDefinitionId
  readonly dataId?: FormDataId
}): WorkflowFormIdentity {
  return input.dataId ? { definitionId: input.definitionId, dataId: input.dataId } : { definitionId: input.definitionId }
}

export function createWorkflowIdentityGraph(input: {
  readonly context: MainWorkflowContext | ChildWorkflowContext
  readonly nodeId: WorkflowNodeRuntimeId
  readonly form?: WorkflowFormIdentity
}): WorkflowIdentityGraph {
  return input.form ? { context: input.context, nodeId: input.nodeId, form: input.form } : { ...input }
}
