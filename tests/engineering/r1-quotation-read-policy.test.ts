import { expect, it } from 'vitest'
import { normalQuotationReadEnabled, normalQuotationScopeMatches, parseNormalQuotationReadScope } from '@app/r1-quotation-read-policy'
import type { SessionSnapshot } from '@shared/ports'
const origin = 'http://127.0.0.1:5189'
const scope = { tenantId: 'tenant', userId: 'user', roleId: 'role', workOrderId: 'work', workflowRunId: 'run', runtimeNodeId: 'node', workflowDefinitionId: 'definition' }
const grant = () => ({ version: 1, scope, expiresAt: new Date(Date.now() + 60000).toISOString() })
const env = () => ({ DEV: true, PROD: false, VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_MOCK: 'false', VITE_XLINK_API_BASE_URL: origin + '/xlink/wm', VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false', VITE_XLINK_AUTH_TENANT: 'tenant', VITE_XLINK_NORMAL_QUOTATION_RUN: 'create-once', VITE_XLINK_NORMAL_QUOTATION_SCOPE: JSON.stringify(grant()) })
const session = { sessionRef: 'secret', user: { id: 'user' }, currentRole: { id: 'role' } } as unknown as SessionSnapshot
it('enables only scoped read providers during exact external Order run, not command permission', () => {
  expect(normalQuotationReadEnabled(env(), origin)).toBe(true)
  expect(normalQuotationScopeMatches(env(), session, 'work', 'node', 'run', 'definition')).toBe(true)
})
it.each(['tenantId','userId','roleId','workOrderId','workflowRunId','runtimeNodeId','workflowDefinitionId'])('rejects mismatched %s', key => {
 const e = env(); e.VITE_XLINK_NORMAL_QUOTATION_SCOPE = JSON.stringify({ ...grant(), scope: { ...scope, [key]: 'other' } })
 expect(normalQuotationScopeMatches(e, session, 'work', 'node', 'run', 'definition')).toBe(false)
})
it.each([{}, { expiresAt: 'invalid' }, { expiresAt: '2000-01-01T00:00:00Z' }, { extra: 1 }, { version: 2 }, { scope: { ...scope, extra: 'x' } }, { scope: { ...scope, runtimeNodeId: ' node' } }])('rejects malformed/expired scope %j', changes => {
 const raw = Object.keys(changes).length ? { ...grant(), ...changes } : {}
 expect(parseNormalQuotationReadScope(JSON.stringify(raw))).toBeNull()
 expect(normalQuotationReadEnabled({ ...env(), VITE_XLINK_NORMAL_QUOTATION_SCOPE: JSON.stringify(raw) }, origin)).toBe(false)
})
it.each([{ PROD: true }, { DEV: false }, { VITE_XLINK_ENVIRONMENT: 'production' }, { VITE_XLINK_NORMAL_QUOTATION_RUN: '' }, { VITE_XLINK_NORMAL_QUOTATION_SCOPE: '' }, { VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true' }, { VITE_XLINK_AUTH_TENANT: 'other' }, { VITE_XLINK_MOCK: 'true' }, { VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS: 'true' }, { VITE_XLINK_AUTH_API_BASE_URL: 'https://other' }, { VITE_XLINK_H5_MOCK_E2E: 'true' }])('keeps unsafe gate closed %j', override => expect(normalQuotationReadEnabled({ ...env(), ...override }, origin)).toBe(false))
it('keeps other origins closed', () => { expect(normalQuotationReadEnabled(env(), 'http://localhost:5189')).toBe(false); expect(normalQuotationReadEnabled(env(), 'https://production')).toBe(false) })
it('keeps readonly mode available without grant; production/mock gates still apply', () => {
 const readonly = { ...env(), VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_NORMAL_QUOTATION_RUN: '', VITE_XLINK_NORMAL_QUOTATION_SCOPE: '' }
 expect(normalQuotationReadEnabled(readonly, origin)).toBe(true)
 expect(normalQuotationReadEnabled({ ...readonly, PROD: true }, origin)).toBe(false)
})
