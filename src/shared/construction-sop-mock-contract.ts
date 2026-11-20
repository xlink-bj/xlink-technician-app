export const constructionLocations = ['屋面女儿墙根部', '屋面排水口'] as const
export type ConstructionLocation = typeof constructionLocations[number]

export interface ConstructionSopTarget {
  readonly projectId: string
  readonly serviceId: string
  readonly constructionId: string
  readonly workflowId: string
  readonly workflowNodeId: string
}

export interface ConstructionSopRecord {
  readonly requestId: string
  readonly target: ConstructionSopTarget
  readonly location: ConstructionLocation
  readonly description: string
  readonly task: {
    readonly name: '现场工序复核'
    readonly version: string
    readonly state: 0 | 10
    readonly receipt?: {
      readonly workflowNodeId: string
      readonly handleUserId: string
      readonly formDataId: string
      readonly completedAt: string
      readonly note: string
    }
  }
}

export interface ConstructionSopRead {
  readonly created: ConstructionSopRecord | null
  readonly assigned: ConstructionSopRecord
}

export type ConstructionSopReadResult =
  | { readonly state: 'ready'; readonly data: ConstructionSopRead }
  | { readonly state: 'denied' | 'failed' }

export type ConstructionSopCommandResult = 'accepted' | 'rejected' | 'unknown' | 'denied'
export type ConstructionSopOperation = 'read' | 'create' | 'process'
export type ConstructionSopFault = 'reject' | 'lose-receipt'

export interface ConstructionSopPort {
  readonly isCurrent: () => boolean
  read(): Promise<ConstructionSopReadResult>
  create(input: { location: ConstructionLocation; description: string }): Promise<ConstructionSopCommandResult>
  process(target: ConstructionSopTarget, note: string): Promise<ConstructionSopCommandResult>
}

export function sameConstructionSopTarget(
  observed: ConstructionSopTarget, expected: ConstructionSopTarget,
): boolean {
  return observed?.projectId === expected.projectId
    && observed.serviceId === expected.serviceId
    && observed.constructionId === expected.constructionId
    && observed.workflowId === expected.workflowId
    && observed.workflowNodeId === expected.workflowNodeId
}
