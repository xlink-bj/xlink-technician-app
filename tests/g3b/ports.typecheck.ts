import type { TechnicianApiReadPort } from '@shared/ports'
import type { UserId, WorkOrderId } from '@shared/types'

declare const api: TechnicianApiReadPort
declare const workOrderId: WorkOrderId

void api.getWorkOrderDetail(workOrderId)

const userId: UserId = 'opaque-user-id' as UserId
void userId

// @ts-expect-error raw strings must not be assignable to branded identities
const invalidWorkOrderId: WorkOrderId = 'raw-backend-id'
void invalidWorkOrderId
