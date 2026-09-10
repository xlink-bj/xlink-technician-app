import type {
  ChildWorkflowContext,
  MainWorkflowContext,
} from '@runtimes/workflow'
import type {
  FormDefinitionId,
  WorkflowDefinitionId,
  WorkflowRunId,
} from '@shared/types'

declare const mainContext: MainWorkflowContext
declare const childContext: ChildWorkflowContext
declare const formDefinitionId: FormDefinitionId

const mainDefinition: WorkflowDefinitionId = mainContext.definitionId
const mainRun: WorkflowRunId = mainContext.runId
void mainDefinition
void mainRun

const childDefinition: WorkflowDefinitionId = childContext.definitionId
const childRun: WorkflowRunId = childContext.runId
void childDefinition
void childRun

void formDefinitionId

// @ts-expect-error workflow run identity must not be used as a definition identity
const invalidDefinition: WorkflowDefinitionId = mainContext.runId
void invalidDefinition

// @ts-expect-error child run identity must not replace the parent run identity
const invalidParentRun: WorkflowRunId = childContext.parent.nodeId
void invalidParentRun

// @ts-expect-error workflow definition identity must not be used as form definition identity
const invalidFormDefinition: FormDefinitionId = mainContext.definitionId
void invalidFormDefinition
