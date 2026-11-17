import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUniApiCommandTransport, isUnapprovedR1SigningCommandPath } from '@adapters/api/uni-api-command-transport'
import { setBusinessMockMode, resetBusinessMockCache } from '@adapters/api/mock'

describe('I6 immutable signature/SMS/cancel command fence in all app environments', () => {
  afterEach(() => { vi.unstubAllEnvs(); resetBusinessMockCache() })

  const paths=[
    'signature/applyForElectronicSignature',
    'signature/applyForElectronicSignature.do',
    'signature/againApplyForElectronicSignature',
    'signature/handleReminderContract',
    'signature/applyForInvalidSignature',
    'signature/syncContract',
    'basic/contract/remove',
    'basic/contract/upsert',
    'basic/contract/getSignatureUrl',
    '/signature/applyForElectronicSignature?orderId_thread=synthetic',
    'signature%2FhandleReminderContract',
  ]

  it.each(paths)('%s is always a standalone restricted business command',(path)=>{
    expect(isUnapprovedR1SigningCommandPath(path)).toBe(true)
  })

  it.each(['dev','test','staging','prod'] as const)(
    'never sends any signing write in %s even with generic REAL_WRITES=true', async environment => {
      vi.stubEnv('VITE_XLINK_ENVIRONMENT', environment)
      vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
      setBusinessMockMode('data')
      const request=vi.fn()
      const transport=createUniApiCommandTransport({
        apiBaseUrl:'https://synthetic.invalid', getSessionRef:()=> 'test-session' as never, request,
      })
      for(const path of paths){
        await expect(transport.execute({method:'POST',path,body:{
          orderId_thread:'synthetic-order',contractId:'synthetic-contract',
        }})).rejects.toMatchObject({category:'unsupported_capability'})
      }
      expect(request).not.toHaveBeenCalled()
    },
  )

  it('never promotes ordinary quotation upsert into a signing capability', () => {
    expect(isUnapprovedR1SigningCommandPath('basic/order/upsert')).toBe(false)
    expect(isUnapprovedR1SigningCommandPath('workflow/process')).toBe(false)
  })

  it('rejects malformed encoded paths rather than bypassing the fence', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','dev')
    const request=vi.fn()
    const transport=createUniApiCommandTransport({
      apiBaseUrl:'https://synthetic.invalid',getSessionRef:()=> 'test-session' as never,request,
    })
    await expect(transport.execute({method:'POST',path:'signature/%ZZ',body:{}}))
      .rejects.toMatchObject({category:'unsupported_capability'})
    expect(request).not.toHaveBeenCalled()
  })
})
