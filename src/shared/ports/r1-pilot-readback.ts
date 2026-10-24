/**
 * Structural pilot readback contract. The Adapter layer cannot import App or
 * Feature implementations; this read-only port contains no credentials or
 * write permission and must remain transient.
 */
export interface R1PilotReadbackScope {
  readonly userId: string
  readonly workOrderId: string
  readonly runtimeNodeId: string
  readonly workflowRunId?: string
  readonly formDefinitionId: string
  readonly sourceNodeType: 'forms' | 'repeat'
  readonly authorizationScope: string
}

export interface R1PilotReadbackReceipt {
  readonly workOrderId: string
  readonly runtimeNodeId: string
  readonly workflowRunId?: string
  readonly formDefinitionId: string
  readonly sourceNodeType: 'forms' | 'repeat'
  readonly savedFormDataIds: readonly string[]
  readonly targetFormDataId?: string
}

export interface R1PilotAuthoritativeMutationEvidence {
  readonly workOrderId: string
  readonly runtimeNodeId: string
  readonly formDefinitionId: string
  readonly workflowRunId?: string
  readonly sourceNodeType: 'forms' | 'repeat'
  readonly formData?: Readonly<Record<string, unknown>>
  readonly expectedFields?: Readonly<Record<string, string | number | boolean>>
  readonly formsExts?: Readonly<Record<string, unknown>>
  readonly repeatList?: {
    readonly complete: true
    readonly workflowRunId: string
    readonly savedIds: readonly string[]
  }
}

export interface R1PilotRawReadbackPort {
  readMutation(scope: R1PilotReadbackScope, receipt: R1PilotReadbackReceipt):
    Promise<R1PilotAuthoritativeMutationEvidence | null>
  readProcessedRecords(scope: R1PilotReadbackScope, savedIds: readonly string[]):
    Promise<readonly Readonly<Record<string, unknown>>[] | null>
}
