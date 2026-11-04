const workOrderRequired = ['page', 'rows', 'sortField', 'sortOrder', 'is:state|integer#and']
const contractQueryKeys = [
  'page', 'rows', 'is:serviceAppointmentId|string#and',
  'is:state|integer#or', 'is:exts.contractStatus|string#or', 'sortField', 'sortOrder',
]
const orderQueryKeys = [
  'page', 'rows', 'sortField', 'sortOrder',
  'is:serviceAppointmentId|string#and', 'is:type|integer#and',
]

function entriesOf(value) {
  if (typeof value === 'string') return [...new URLSearchParams(value).entries()]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).map(([key, item]) => [key, String(item)])
}

function recordOf(value) {
  const entries = entriesOf(value)
  if (entries.length === 0) return null
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return null
  return Object.fromEntries(entries)
}

function hasExactKeys(record, expected) {
  const actual = Object.keys(record).sort()
  const keys = [...expected].sort()
  return actual.length === keys.length && actual.every((key, index) => key === keys[index])
}

export function isAllowedLoginRequest(method, search, body) {
  if (method !== 'POST' || [...search.keys()].length !== 0) return false
  const record = recordOf(body)
  return Boolean(record
    && hasExactKeys(record, ['method', 'phone', 'code', 'tenantId'])
    && Object.values(record).every(value => typeof value === 'string' && value.trim().length > 0))
}

export function isAllowedRoleTreeRequest(method, search, body, roleId) {
  const params = [...search.entries()]
  // The app's shared POST transport encodes an absent body as an empty string.
  // Accept that wire representation, but never permit any role-tree body fields.
  return method === 'POST' && (body === undefined || body === '')
    && params.length === 1 && params[0]?.[0] === 'roleId'
    && typeof roleId === 'string' && params[0]?.[1] === roleId
    && /^[A-Za-z0-9_-]{1,100}$/.test(roleId)
}

export function isAllowedWorkOrderListRequest(path, method, search, body, expectedPage = 1) {
  if (method !== 'POST' || [...search.keys()].length !== 0
    || !['basic/serviceAppointment/query', 'basic/serviceAppointment/querySAWorkflowNode'].includes(path)) return false
  if (!Number.isSafeInteger(expectedPage) || expectedPage < 1) return false
  const record = recordOf(body)
  if (!record) return false
  const optional = ['orderState', 'in:status|array#and']
  const keys = Object.keys(record)
  if (keys.some(key => !workOrderRequired.includes(key) && !optional.includes(key))) return false
  if (workOrderRequired.some(key => !(key in record))) return false
  return record.page === String(expectedPage) && record.rows === '3'
    && record.sortField === (path.endsWith('querySAWorkflowNode') ? 'updateTime' : 'createTime')
    && record.sortOrder === 'desc' && record['is:state|integer#and'] === '1'
    && (!('orderState' in record) || record.orderState.length <= 40)
    && (!('in:status|array#and' in record) || /^[A-Za-z0-9,._-]{1,120}$/.test(record['in:status|array#and']))
}

export function isAllowedTypeOneOrderRequest(body, selectedWorkOrderId) {
  const record = recordOf(body)
  return Boolean(record
    && hasExactKeys(record, orderQueryKeys)
    && /^[A-Za-z0-9_-]{1,100}$/.test(selectedWorkOrderId ?? '')
    && record.page === '1' && record.rows === '3'
    && record.sortField === 'createTime' && record.sortOrder === 'desc'
    && record['is:serviceAppointmentId|string#and'] === selectedWorkOrderId
    && record['is:type|integer#and'] === '1')
}

export function r1ContractQueryBody(workOrderId) {
  return {
    page: 1,
    rows: 3,
    'is:serviceAppointmentId|string#and': workOrderId,
    'is:state|integer#or': '1',
    'is:exts.contractStatus|string#or': '-2',
    sortField: 'createTime',
    sortOrder: 'desc',
  }
}

export function isAllowedR1ContractRequest({
  path, method, search, body, selectedWorkOrderId, selectedOrderIds, requestCount,
}) {
  if (path !== 'basic/contract/query.do' || method !== 'POST'
    || [...search.keys()].length !== 0 || requestCount !== 0
    || !/^[A-Za-z0-9_-]{1,100}$/.test(selectedWorkOrderId ?? '')
    || !selectedOrderIds || selectedOrderIds.size < 1
    || [...selectedOrderIds].some(id => !/^[A-Za-z0-9_-]{1,100}$/.test(id))) return false
  const actual = recordOf(body)
  const expected = recordOf(r1ContractQueryBody(selectedWorkOrderId))
  return Boolean(actual && expected && hasExactKeys(actual, contractQueryKeys)
    && contractQueryKeys.every(key => actual[key] === expected[key]))
}
