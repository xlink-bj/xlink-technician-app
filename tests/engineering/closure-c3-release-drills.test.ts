import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock'
import { isProductionReadOnlyTarget } from '@shared/config'

function instrumentedTransport(baseUrl = 'https://synthetic.invalid') {
  const realRequest = vi.fn((_input: UniNamespace.RequestOptions) => {
    throw new Error('REAL_NETWORK_SHOULD_NOT_BE_REACHED')
  })
  const transport = createUniApiCommandTransport({
    apiBaseUrl: baseUrl, getSessionRef: () => 'synthetic-session' as never,
    request: realRequest,
  })
  return { transport, realRequest }
}
const writes = [
  'workflow/process',
  'biz/extForm/upsert/synthetic-definition',
  'basic/order/upsert',
  'workflow/startWorkflow/order/null/synthetic-workorder',
  'basic/order/creatQuotation',
  'basic/order/orderConfirm',
  'basic/contract/upsert',
  'signature/sendSms',
] as const

describe('Closure C3 — offline production deny & release recovery drills', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetBusinessMockCache()
    setBusinessMockMode('off')
  })

  it.each(writes)('denies %s on Production even when generic real-write flag is set', async path => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','prod')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES','true')
    setBusinessMockMode('off')
    const {transport,realRequest}=instrumentedTransport()
    await expect(transport.execute({path,method:'POST',body:{sid:'synthetic-workorder'}}))
      .rejects.toMatchObject({category:'unsupported_capability'})
    expect(realRequest).not.toHaveBeenCalled()
  })

  it('treats canonical Production hostname as read-only even if environment is mislabeled staging', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','staging')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES','true')
    expect(isProductionReadOnlyTarget('staging','https://xlink.fsgo365.cn')).toBe(true)
    const {transport,realRequest}=instrumentedTransport('https://xlink.fsgo365.cn')
    await expect(transport.execute({path:'workflow/process',method:'POST',body:{}}))
      .rejects.toMatchObject({category:'unsupported_capability'})
    expect(realRequest).not.toHaveBeenCalled()
  })

  it('fails closed in non-Production when real business write flag is absent', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','staging')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES','false')
    const {transport,realRequest}=instrumentedTransport()
    for (const path of ['workflow/process','biz/extForm/upsert/synthetic','basic/order/upsert']) {
      await expect(transport.execute({path,method:'POST',body:{sid:'synthetic'}}))
        .rejects.toMatchObject({category:'unsupported_capability'})
    }
    expect(realRequest).not.toHaveBeenCalled()
  })

  it('rejects deferred appointment wire whose authoritative R1 encoding remains unknown', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','staging')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES','true')
    const {transport,realRequest}=instrumentedTransport()
    await expect(transport.execute({
      path:'biz/extForm/upsert/synthetic',method:'POST',
      safety:'deferred_appointment_datetime_encoding_unknown',
      body:{need:'0'},
    })).rejects.toMatchObject({category:'unsupported_capability'})
    expect(realRequest).not.toHaveBeenCalled()
  })


  it.each([
    [401,'session_invalid'],
    [403,'authorization_denied'],
    [500,'network_retryable'],
    [422,'server_terminal'],
  ] as const)('classifies synthetic HTTP %s without a real network connection', async (http,category) => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','staging')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES','false')
    const request=vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({statusCode:http,data:{success:false}} as never)
    })
    const transport=createUniApiCommandTransport({
      apiBaseUrl:'https://synthetic.invalid',
      getSessionRef:()=> 'synthetic-session' as never,
      request,
    })
    await expect(transport.execute({method:'POST',path:'synthetic/diagnostic-only',body:{}}))
      .rejects.toMatchObject({category})
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('classifies callback network errors and malformed success envelopes independently', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','staging')
    const fail=vi.fn((options: UniNamespace.RequestOptions) => {
      options.fail?.({errMsg:'synthetic network disconnected'} as never)
    })
    const errorTransport=createUniApiCommandTransport({
      apiBaseUrl:'https://synthetic.invalid',
      getSessionRef:()=> 'synthetic-session' as never,
      request:fail,
    })
    await expect(errorTransport.execute({method:'POST',path:'synthetic/diagnostic-only'}))
      .rejects.toMatchObject({category:'network_retryable'})

    const malformed=vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({statusCode:200,data:{success:'not-a-boolean'}} as never)
    })
    const malformedTransport=createUniApiCommandTransport({
      apiBaseUrl:'https://synthetic.invalid',
      getSessionRef:()=> 'synthetic-session' as never,
      request:malformed,
    })
    await expect(malformedTransport.execute({method:'POST',path:'synthetic/diagnostic-only'}))
      .rejects.toMatchObject({category:'server_terminal'})
    expect(fail).toHaveBeenCalledTimes(1)
    expect(malformed).toHaveBeenCalledTimes(1)
  })

  it('refuses mocked transport execution when no session or explicit blockRealRequests applies', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','staging')
    const request=vi.fn(() => {throw Error('must not reach executor')})
    const noSession=createUniApiCommandTransport({
      apiBaseUrl:'https://synthetic.invalid',
      getSessionRef:()=>null,request,
    })
    await expect(noSession.execute({method:'POST',path:'synthetic/diagnostic-only'}))
      .rejects.toMatchObject({category:'session_invalid'})
    const blocked=createUniApiCommandTransport({
      apiBaseUrl:'https://synthetic.invalid',
      getSessionRef:()=> 'synthetic-session' as never,
      blockRealRequests:true,request,
    })
    await expect(blocked.execute({method:'POST',path:'synthetic/diagnostic-only'}))
      .rejects.toMatchObject({category:'unsupported_capability'})
    expect(request).not.toHaveBeenCalled()
  })

  it('accepts only synthetic 200 responses through the injected executor, without issuing a network request', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','staging')
    const request=vi.fn((options: UniNamespace.RequestOptions)=>{
      options.success?.({statusCode:200,data:{success:true,data:{id:'synthetic'}}} as never)
    })
    const transport=createUniApiCommandTransport({
      apiBaseUrl:'https://synthetic.invalid',
      getSessionRef:()=> 'synthetic-session' as never,request,
    })
    await expect(transport.execute({
      method:'POST',path:'synthetic/diagnostic-only',body:{example:'1'},
    })).resolves.toMatchObject({success:true})
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('release evidence check rejects nine unsafe synthetic changes and holds Production approval', () => {
    const result=execFileSync(process.execPath,['scripts/check-closure-c3-release.mjs','--self-test'],{
      cwd:process.cwd(),encoding:'utf8',timeout:20000,
      env:{...process.env,VITE_XLINK_ENABLE_REAL_WRITES:'false',VITE_XLINK_ENVIRONMENT:'test'},
    })
    expect(result).toContain('HOLD_EXTERNAL_EVIDENCE')
    expect(result).toContain('negative readiness drills PASS: 9')
  })
})
