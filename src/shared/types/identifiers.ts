declare const opaqueBrand: unique symbol

export type Opaque<T, Name extends string> = T & {
  readonly [opaqueBrand]: Name
}

export type UserId = Opaque<string, 'UserId'>
export type RoleId = Opaque<string, 'RoleId'>
export type WorkOrderId = Opaque<string, 'WorkOrderId'>
export type WorkflowDefinitionId = Opaque<string, 'WorkflowDefinitionId'>
export type WorkflowRunId = Opaque<string, 'WorkflowRunId'>
export type WorkflowNodeRuntimeId = Opaque<string, 'WorkflowNodeRuntimeId'>
export type FormDefinitionId = Opaque<string, 'FormDefinitionId'>
export type FormDataId = Opaque<string, 'FormDataId'>
export type SessionRef = Opaque<string, 'SessionRef'>
export type LocalMediaRef = Opaque<string, 'LocalMediaRef'>
export type CustomerContactId = Opaque<string, 'CustomerContactId'>
export type OrganizationId = Opaque<string, 'OrganizationId'>

export interface UserRef {
  readonly id: UserId
  readonly displayName?: string
}

export interface RoleRef {
  readonly id: RoleId
  readonly name?: string
}

export function asOpaqueId<Name extends string>(value: string): Opaque<string, Name> {
  if (value.trim().length === 0) {
    throw new Error('Opaque identifier must be non-empty')
  }

  return value as Opaque<string, Name>
}
