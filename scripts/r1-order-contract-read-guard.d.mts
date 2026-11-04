export function isAllowedLoginRequest(method: string, search: URLSearchParams, body: unknown): boolean
export function isAllowedRoleTreeRequest(method: string, search: URLSearchParams, body: unknown, roleId: string | null): boolean
export function isAllowedWorkOrderListRequest(path: string, method: string, search: URLSearchParams, body: unknown, expectedPage?: number): boolean
export function isAllowedTypeOneOrderRequest(body: unknown, selectedWorkOrderId: string | null): boolean
export function r1ContractQueryBody(workOrderId: string): Readonly<Record<string, string | number>>
export function isAllowedR1ContractRequest(input: {
  readonly path: string
  readonly method: string
  readonly search: URLSearchParams
  readonly body: unknown
  readonly selectedWorkOrderId: string | null
  readonly selectedOrderIds: ReadonlySet<string>
  readonly requestCount: number
}): boolean
