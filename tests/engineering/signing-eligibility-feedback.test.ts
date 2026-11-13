import {it,expect} from 'vitest'
import fs from 'node:fs'
import {signingEligibilityFeedback} from '@features/work-orders/signing/r1-signing-ui-rules'
import {reviewR1SigningIntent} from '@features/work-orders/signing/r1-signing-command-intents'
it('known conditions remain explicitly readonly in technician copy',()=>{
 const x=signingEligibilityFeedback('candidate','verified')
 expect(x.summary).toBe('条件已核对，此处仅查看，不会发起签约。');expect(x.handler).toBe('当前处理信息已核对。')
 expect(x.notice).toBe('此处仅供查看，不会发起签约或发送消息。')
})
it.each(['blocked','source_conflict'] as const)('%s maps to a business next step without technical diagnostics',assessment=>{
 const x=signingEligibilityFeedback(assessment,'blocked')
 expect(x.summary).toBe('当前操作条件尚未确认，请重新读取订单信息。');expect(JSON.stringify(x)).not.toMatch(/handlerIds|R1|API|roleVersion|EXTS|生产合同/)
})
it('internal reasons and no-dispatch assessment remain intact',()=>{
 const review=reviewR1SigningIntent('electronic',{workOrderId:'s',selectedOrderId:'o',officialOrder:null,contractState:'idle',contracts:[],currentRoleWorkOrderVerified:false,currentNodeHandlerVerified:false,currentIdentityVerified:false})
 const before=JSON.stringify(review);expect(review.reasons.join(' ')).toContain('handlerIds')
 signingEligibilityFeedback(review.assessment,'blocked');expect(JSON.stringify(review)).toBe(before);expect(review.mayDispatch).toBe(false);expect(review.backendPermissionProven).toBe(false)
})
it('the actual new card renders only the business projection, retaining its structure and controls',()=>{
 const source=fs.readFileSync('src/pages/work-orders/signing-order-read.vue','utf8'),card=source.slice(source.indexOf('data-testid="signing-eligibility"'),source.indexOf('<navigator class="signing-read-return'))
 expect(card).toContain('{{ eligibilityFeedback.summary }}');expect(card).toContain('{{ eligibilityFeedback.handler }}');expect(card).toContain('v-for="reason in eligibilityFeedback.notes"')
 expect(card).not.toContain('{{ review.handlerSnapshot.reason }}');expect(card).not.toContain('review.initialSigningIntent.reasons')
 expect(card).toContain('@tap="review.loadNodeHandlerEvidence()"');expect(card).toContain(':disabled="productionReadOnly || review.handlerSnapshot.state === \'loading\'"')
})
