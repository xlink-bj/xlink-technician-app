import type {
  AuthStartRequest,
  PhoneDialRequest,
  TechnicianApiReadPort,
  WorkOrderListQuery,
  WorkOrderSummary,
} from '@shared/ports'
import type { CustomerContactId, UserId, WorkOrderId } from '@shared/types'

declare const api: TechnicianApiReadPort
declare const workOrderId: WorkOrderId

void api.getWorkOrderDetail(workOrderId)

const userId: UserId = 'opaque-user-id' as UserId
void userId

const listQuery: WorkOrderListQuery = { page: 1, pageSize: 20 }
void listQuery

const authStart: AuthStartRequest = {
  phoneNumber: '13800000000',
  verificationCode: '000000',
}
void authStart

const authWithTenant: AuthStartRequest = {
  phoneNumber: 'test-phone',
  verificationCode: 'test-code',
  // @ts-expect-error tenant wire configuration belongs to the Auth adapter
  tenant: 'adapter-owned-tenant',
}
void authWithTenant

const authWithMethod: AuthStartRequest = {
  phoneNumber: 'test-phone',
  verificationCode: 'test-code',
  // @ts-expect-error backend method wire value belongs to the Auth adapter
  method: 'adapter-owned-method',
}
void authWithMethod

const customerContactId: CustomerContactId = 'opaque-contact-id' as CustomerContactId
const phoneDial: PhoneDialRequest = {
  contactRef: customerContactId,
  normalizedPhone: '13800000000',
}
void phoneDial

// @ts-expect-error raw strings must not be assignable to branded identities
const invalidWorkOrderId: WorkOrderId = 'raw-backend-id'
void invalidWorkOrderId

const leakingQuery: WorkOrderListQuery = {
  page: 1,
  pageSize: 20,
  // @ts-expect-error arbitrary backend query bags must not cross the API port
  filters: { stateCode: 'raw-backend-code' },
}
void leakingQuery

const leakingSummary: WorkOrderSummary = {
  id: workOrderId,
  // @ts-expect-error raw backend status fields must not cross the API port
  stateCode: 'raw-backend-code',
}
void leakingSummary

const leakingAuthStart: AuthStartRequest = {
  // @ts-expect-error generic transport method/parameter bags must not cross Auth
  method: 'phoneLogin.do',
  parameters: { phone: '13800000000' },
}
void leakingAuthStart

// @ts-expect-error authenticated user identity is not customer contact identity
const invalidContactIdentity: CustomerContactId = userId
void invalidContactIdentity
