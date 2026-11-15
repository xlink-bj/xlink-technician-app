import { useSessionStore } from '../../../src/shared/state'
import { useWorkOrderDetailStore } from '../../../src/features/work-orders/detail'
import { useWorkOrderListStore } from '../../../src/features/work-orders/list'
import { useSigningReviewReadStore } from '../../../src/features/work-orders/signing/signing-review-read-store'
import { createQuotationOrderReadAdapter } from '../../../src/adapters/api/quotation-order-api'
import { tryMockRead } from '../../../src/adapters/api/mock/router'
import { isDevSyntheticContractReadPreviewEnabled } from '../../../src/app/business-mock'
import { sessionAuthorizationFingerprint } from '../../../src/shared/session-authorization'

// Test-only source-shaped read response variants. No store snapshot injection,
// no command port, no new read grant, no production transport or DTO changes.
let mode = 'normal', release: (() => void) | undefined
export const ledger: Array<{path:string; mode:string}> = []
export function selectReadMode(value: string) { mode=value }
export function releaseRead() { mode='normal'; release?.(); release=undefined }
export function installReadVariants() {
 const session=useSessionStore(), detail=useWorkOrderDetailStore(), list=useWorkOrderListStore()
 const workId=String(detail.detail?.id??'')
 if(!isDevSyntheticContractReadPreviewEnabled(workId)||!session.session||detail.loadState!=='succeeded'
   ||!list.items.some(item=>String(item.id)===workId))throw Error('Existing DEV Mock list/detail scope required')
 const listed=(id:string)=>detail.loadState==='succeeded'&&String(detail.detail?.id)===id&&list.items.some(item=>String(item.id)===id)
 const identity=()=>{const s=session.session;return sessionAuthorizationFingerprint(s?{sessionRef:s.sessionRef,userId:s.user.id,roleId:s.currentRole?.id,roleVersion:s.roleVersion}:null)}
 const port=createQuotationOrderReadAdapter({execute:async request=>{
   const s=session.session
   if(!s||!listed(workId))throw Error('Current list membership required')
   ledger.push({path:request.path,mode})
   if(!['basic/order/query','basic/contract/query.do'].includes(request.path))throw Error('Unexpected read path')
   const current=mode, contract=request.path==='basic/contract/query.do'
   const data:any=await tryMockRead(request.path,request.body??{}, {latencyMs:0,actor:{userId:s.user.id,roleId:s.currentRole?.id}})
   if(data===null)throw Error('Unmatched Mock route cannot be manufactured')
   if((current==='order-loading'&&!contract)||(current==='contract-loading'&&contract))await new Promise<void>(resolve=>{release=resolve})
   if((current==='order-failed'&&!contract)||(current==='contract-failed'&&contract))throw Error('Synthetic retryable read failure')
   if(contract){
    if(current==='zero'){data.data=[];data.total=0}
    if(current==='many'){data.data=[data.data[0],{...data.data[0],_id:'mock-contract-002',contractdocNum:'HT202610260002'}];data.total=2}
    if(current==='signed'||current==='conflict'){data.data[0].exts.contractStatus='10';data.data[0].signedDate='2026-11-14 10:00:00'}
    if(current==='exception')data.data[0].exts.contractStatus='-3'
    if(current==='unknown')data.data[0].exts.contractStatus='99'
   }else if(current==='signed')data.data[0].processState=1
   return data
 }},listed,identity,isDevSyntheticContractReadPreviewEnabled)
 useSigningReviewReadStore().configure(port,()=>session.session,listed)
 return workId
}
