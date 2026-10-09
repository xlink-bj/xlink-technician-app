import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import {
  buildOrderExtFieldRequestBody,
  isAllowedOrderExtFieldTarget,
  ORDER_EXTFIELD_PAGE_LIMIT,
  ORDER_EXTFIELD_ROUTE,
  sanitizeOrderExtFieldPage,
} from '../../scripts/lib/g4f-order-extfield-shape.mjs'

describe('active Order ExtField shape inspection (synthetic only)', () => {
  it('builds a single current-account-scoped detail page with a server-enforced limit and no _all', () => {
    const body = buildOrderExtFieldRequestBody()
    expect(ORDER_EXTFIELD_ROUTE).toBe('biz/extField/query')
    expect(body).toEqual({
      tenantId: '__current_account_tenant__',
      colName: 'order',
      'is:state|integer#and': '1',
      'in:showList|string#and': '4',
      sortField: 'order',
      sortOrder: 'asc',
      page: '1',
      size: '50',
    })
    expect(ORDER_EXTFIELD_PAGE_LIMIT).toBe(50)
    expect(body).not.toHaveProperty('_all')
  })

  it('sanitizes metadata and drops record IDs, option IDs, condition values, URLs, and executable snippets', () => {
    const privateMarker = 'DO_NOT_EMIT_7bfe922f'
    const result = sanitizeOrderExtFieldPage({
      total: 2,
      data: [
        {
          _id: privateMarker,
          tenantId: privateMarker,
          name: 'fixtureMode',
          nameDisp: '合成模式',
          colName: 'order',
          state: 1,
          showList: ['4', '9'],
          type: 'radio',
          valueOption: privateMarker,
          required: '1',
          multiple: false,
          showType: 1,
          operationType: 'editable',
          frontEndConfig: JSON.stringify({ showType: 'placeOrder', serviceType: [privateMarker] }),
        },
        {
          _id: privateMarker,
          name: 'fixtureDependent',
          nameDisp: privateMarker,
          state: 1,
          showList: [4],
          type: 'bizSelect',
          valueOption: privateMarker,
          required: '0',
          showType: 3,
          showField: 'fixtureMode',
          showValue: privateMarker,
          frontEndConfig: JSON.stringify({
            showType: 'placeOrder',
            showField: 'fixtureMode',
            showValue: privateMarker,
            requestUrl: `https://untrusted.invalid/${privateMarker}`,
            evaluate: privateMarker,
          }),
        },
      ],
    })
    expect(result).toMatchObject({ ok: true, total: 2, returned: 2, truncated: false })
    if (!result.ok) throw new Error(`Synthetic sanitizer rejected fixture: ${result.reason}`)
    expect(result.fields[0]).toMatchObject({
      row: 'Field-01',
      valueKeyAlias: 'ValueKey-01',
      enabled: true,
      showList: [4],
      required: true,
      stage: 'PLACE_ORDER',
      provider: { kind: 'CODE_PROVIDER', configured: true, readiness: 'CONFIGURED_REQUIRES_RUNTIME_MAPPING_REVIEW' },
      runtimeCapability: 'SUPPORTED_GENERIC',
    })
    expect(result.fields[1]).toMatchObject({
      row: 'Field-02',
      labelConfigured: true,
      visibility: 'CONDITIONAL',
      condition: { present: true, dependsOn: 'Field-01', comparisonValue: 'REDACTED' },
      provider: { kind: 'DYNAMIC_PROVIDER_UNTRUSTED', configured: true, readiness: 'BLOCKED_DYNAMIC_PROVIDER_UNTRUSTED' },
      runtimeCapability: 'SUPPORTED_GENERIC',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(privateMarker)
    expect(serialized).not.toContain('fixtureMode')
    expect(serialized).not.toContain('fixtureDependent')
    expect(serialized).not.toContain('requestUrl')
    expect(serialized).not.toContain('evaluate')
    expect(serialized).not.toContain('_id')
    expect(serialized).not.toContain('tenantId')
  })

  it('rejects malformed pages and marks an over-50 schema as one-page truncated without pagination', () => {
    expect(sanitizeOrderExtFieldPage({ data: [] })).toEqual({ ok: false, reason: 'INVALID_TOTAL' })
    expect(sanitizeOrderExtFieldPage({ total: 1, data: [null] })).toEqual({ ok: false, reason: 'INVALID_ROW_SHAPE' })
    const overPage = Array.from({ length: 50 }, (_, index) => ({
      name: `field${index}`,
      state: 1,
      showList: [4],
      type: 'text',
    }))
    expect(sanitizeOrderExtFieldPage({ total: 51, data: overPage })).toMatchObject({
      ok: true,
      total: 51,
      returned: 50,
      truncated: true,
      pageLimit: 50,
    })
  })

  it('does not guess a conditional dependency when the value key is duplicated', () => {
    const result = sanitizeOrderExtFieldPage({
      total: 3,
      data: [
        { name: 'sharedKey', state: 1, showList: [4], type: 'text' },
        { name: 'sharedKey', state: 1, showList: [4], type: 'radio' },
        { name: 'dependent', state: 1, showList: [4], type: 'text', showType: 3, showField: 'sharedKey' },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fields[0].valueKeyAlias).toBe(result.fields[1].valueKeyAlias)
    expect(result.fields[2].condition.dependsOn).toBe('AMBIGUOUS')
  })

  it('separates component availability from provider readiness', () => {
    const result = sanitizeOrderExtFieldPage({
      total: 4,
      data: [
        { name: 'plainText', state: 1, showList: [4], type: 'text', required: 1 },
        { name: 'missingChoices', state: 1, showList: [4], type: 'select', required: 1 },
        { name: 'layoutGap', state: 1, showList: [4], type: 'gap' },
        { name: 'futureWidget', state: 1, showList: [4], type: 'customWidget' },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fields.map(({ runtimeCapability, provider }) => ({ runtimeCapability, provider: provider.readiness }))).toEqual([
      { runtimeCapability: 'SUPPORTED_GENERIC', provider: 'NOT_REQUIRED_OR_INLINE' },
      { runtimeCapability: 'SUPPORTED_GENERIC', provider: 'BLOCKED_PROVIDER_MISSING' },
      { runtimeCapability: 'PRESENTATION_ONLY', provider: 'NOT_REQUIRED_OR_INLINE' },
      { runtimeCapability: 'UNSUPPORTED', provider: 'NOT_REQUIRED_OR_INLINE' },
    ])
  })

  it('accepts only the pinned HTTPS Production API origin and context path', () => {
    expect(isAllowedOrderExtFieldTarget('https://xlink.fsgo365.cn/fsgo/wm')).toBe(true)
    expect(isAllowedOrderExtFieldTarget('http://xlink.fsgo365.cn/fsgo/wm')).toBe(false)
    expect(isAllowedOrderExtFieldTarget('https://other.invalid/fsgo/wm')).toBe(false)
    expect(isAllowedOrderExtFieldTarget('https://xlink.fsgo365.cn/fsgo/wm?redirect=1')).toBe(false)
    expect(isAllowedOrderExtFieldTarget('https://user@xlink.fsgo365.cn/fsgo/wm')).toBe(false)
  })

  it('does zero network by default and blocks an unconfigured profile before login or read', () => {
    const defaultRun = spawnSync(process.execPath, ['scripts/inspect-g4f-active-order-extfield.mjs'], { encoding: 'utf8' })
    expect(defaultRun.status).toBe(0)
    expect(JSON.parse(defaultRun.stdout)).toMatchObject({
      status: 'NO_NETWORK_DEFAULT',
      requests: { login: 0, schemaRead: 0, unexpected: 0 },
    })

    const preflightRun = spawnSync(process.execPath, [
      'scripts/inspect-g4f-active-order-extfield.mjs',
      '--preflight-only',
    ], {
      encoding: 'utf8',
      env: { ...process.env, XLINK_SCHEMA_PROD_PROFILE_DIR: '/tmp/g4f-extfield-profile-does-not-exist' },
    })
    expect(preflightRun.status).toBe(1)
    expect(JSON.parse(preflightRun.stdout)).toMatchObject({
      status: 'BLOCKED_ENV',
      requests: { login: 0, schemaRead: 0, unexpected: 0 },
    })

    const blockedRun = spawnSync(process.execPath, [
      'scripts/inspect-g4f-active-order-extfield.mjs',
      '--authorize-bounded-prod-read',
    ], {
      encoding: 'utf8',
      env: { ...process.env, XLINK_SCHEMA_PROD_PROFILE_DIR: '/tmp/g4f-extfield-profile-does-not-exist' },
    })
    expect(blockedRun.status).toBe(1)
    expect(JSON.parse(blockedRun.stdout)).toMatchObject({
      status: 'BLOCKED_PREFLIGHT',
      requests: { login: 0, schemaRead: 0, unexpected: 0 },
      businessMutations: 0,
    })
  })
})
