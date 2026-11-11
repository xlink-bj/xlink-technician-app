import {describe,it,expect} from 'vitest'
import {supportsSurveyMediaCreate} from '@features/work-orders/r1-survey-media-create'
export const mediaSnapshot=()=>({workOrderId:'s',node:{id:'n',runId:'w',formDefinitionId:'e',sourceNodeType:'repeat',nodeTypeEvidence:'runtime_node_def',lifecycle:'active',formFieldIdsReadOnly:[]},definition:{id:'e',purpose:'survey',fields:[{fieldId:'infrared',valueKey:'infraredImageList',label:'红外照片',type:'file',preset:true,required:false,readOnly:false,multiple:false,showList:['1','2','4'],presentation:{max:4}},{fieldId:'images',valueKey:'images1',label:'现场照片',type:'file',preset:false,required:true,readOnly:false,multiple:false,showList:['1','2','4'],presentation:{max:10}}]},fillableFieldIds:['infrared','images'],records:[]}) as any
describe('typed Survey minimal image schema',()=>{it('admits only explicit two-field repeat schema',()=>expect(supportsSurveyMediaCreate(mediaSnapshot())).toBe(true));it.each(['forms','special','unknown'])('rejects source %s',source=>{const s=mediaSnapshot();s.node.sourceNodeType=source;expect(supportsSurveyMediaCreate(s)).toBe(false)})})

import {normalizeSurveyMediaCreate,assertSurveyMediaOriginal} from '@features/work-orders/r1-survey-media-create'
import {parseR1RepeatGrant} from '@app/r1-repeat-authorization'
const image=(n:number)=>({url:`https://upload.invalid/${n}.png`,name:`${n}.png`,extname:'png'})
describe('narrow first pair values and distinct absence contracts',()=>{
 it('canonical root and EXTS values preserve exact bytes',()=>expect(normalizeSurveyMediaCreate(mediaSnapshot(),{infraredImageList:[image(1)],images1:[image(2)]})).toEqual({infraredImageList:[image(1)],images1:[image(2)]}))
 it.each([undefined,null,[]])('optional root %j not certified as a saved empty pair',value=>{expect(()=>normalizeSurveyMediaCreate(mediaSnapshot(),{...(value===undefined?{}:{infraredImageList:value}),images1:[image(2)]})).toThrow()})
 it.each([undefined,null,[]])('required EXTS %j denied',value=>{expect(()=>normalizeSurveyMediaCreate(mediaSnapshot(),{infraredImageList:[image(1)],images1:value})).toThrow()})
 it.each([['infraredImageList',5],['images1',11]] as const)('enforces full %s capacity', (key,count)=>{expect(()=>normalizeSurveyMediaCreate(mediaSnapshot(),{infraredImageList:[image(1)],images1:[image(2)],[key]:Array.from({length:count},(_,i)=>image(i+20))})).toThrow()})
 it('duplicate provider key across fields rejected',()=>expect(()=>normalizeSurveyMediaCreate(mediaSnapshot(),{infraredImageList:[image(1)],images1:[image(1)]})).toThrow())
 it.each(['http://upload.invalid/a.png','https://a.invalid\\b.png','https://user@a.invalid/a.png','https://a.invalid/%GG.png'])('rejects unsafe URL %s',url=>expect(()=>normalizeSurveyMediaCreate(mediaSnapshot(),{infraredImageList:[image(1)],images1:[{...image(2),url}]})).toThrow())
 it('original media object order is semantic; slots and list order remain exact',()=>{expect(()=>assertSurveyMediaOriginal({infraredImageList:[{extname:'png',name:'1.png',url:image(1).url}],exts:{images1:[image(2)]}},{infraredImageList:[image(1)],images1:[image(2)]})).not.toThrow()})
})
describe('explicit create-only profile grant preserves old versions',()=>{
 const base:any={version:1,scope:{tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'},fieldIds:['a','b'],expiresAt:'2099-01-01T00:00:00Z',operations:['create','complete']}
 it('old v1 unchanged',()=>expect(parseR1RepeatGrant(JSON.stringify(base))?.version).toBe(1))
 it('old v2 unchanged',()=>expect(parseR1RepeatGrant(JSON.stringify({...base,version:2,operations:['edit'],recordIds:['record']}))?.version).toBe(2))
 it('new distinct profile has no complete operation',()=>expect(parseR1RepeatGrant(JSON.stringify({...base,version:3,profile:'survey-media-first',operations:['create']}))?.operations).toEqual(['create']))
 it.each([{version:3,operations:['create']},{version:3,profile:'other',operations:['create']},{version:3,profile:'survey-media-first',operations:['create','complete']},{version:3,profile:'survey-media-first',operations:['edit']},{version:1,operations:['create']},{version:4,profile:'survey-media-first',operations:['create']}])('rejects invalid grant %j',patch=>expect(parseR1RepeatGrant(JSON.stringify({...base,...patch}))).toBeNull())
})
