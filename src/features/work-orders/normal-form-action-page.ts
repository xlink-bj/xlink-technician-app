import { computed, ref, watch, type Ref } from 'vue'
import type { ActionDescriptor } from '@runtimes/action'
import type { useActionWorkspaceStore } from './action-workspace'

/** Page lifecycle bridge only; every read/write capability stays in the normal controller. */
export function useNormalFormActionPage(input: {
  workspace: ReturnType<typeof useActionWorkspaceStore>
  pageLease: object
  isNavigating: Ref<boolean>
  getAction(): ActionDescriptor | null
  matchesRoute(): boolean
}) {
  const content=ref<{flushLocalDraft():Promise<boolean>}|null>(null)
  const visible=ref(true),message=ref(''),fromDetail=ref(false)
  let wasHidden=false,wasContent=false
  const isContent=computed(()=>Boolean(input.workspace.normalFormNode && input.matchesRoute()
    && input.workspace.ownsPage(input.getAction(),input.pageLease)))
  watch(isContent,value=>{if(value)wasContent=true},{immediate:true,flush:'sync'})
  function begin(detail:boolean){wasContent=false;fromDetail.value=detail;message.value=''}
  function replaced(){return wasContent && !input.workspace.ownsPage(input.getAction(),input.pageLease)
    && Boolean(input.workspace.descriptor || input.workspace.loadState==='loading')}
  function hide(){if(isContent.value){wasHidden=true;visible.value=false}}
  function show(){visible.value=true;const reload=wasHidden;wasHidden=false;return reload}
  async function changed(){await input.workspace.refreshNormalContext(input.getAction(),input.pageLease)}
  async function exit():Promise<boolean>{
    if(!isContent.value){
      if(replaced()){message.value='当前操作空间已变化，请重新进入工单。';return true}
      return false
    }
    if(input.isNavigating.value)return true
    input.isNavigating.value=true
    const action=input.getAction();message.value=''
    try{
      if(!await content.value?.flushLocalDraft()){
        message.value='本地草稿尚未安全保存，请保留页面后重试。';return true
      }
      if(!input.workspace.ownsPage(action,input.pageLease))return true
      const result=await input.workspace.leaveNormalContent(action,input.pageLease,fromDetail.value)
      if(result.state!=='succeeded')message.value='当前操作空间已变化，请重新进入工单。'
    }catch{message.value='本地草稿尚未安全保存，请保留页面后重试。'}
    finally{input.isNavigating.value=false}
    return true
  }
  // The completed normal flush uses navigateBack; do not intercept it twice.
  function backPress(options:{from:string}){
    if((isContent.value || replaced()) && options.from!=='navigateBack'){void exit();return true}
    return false
  }
  return {content,visible,message,fromDetail,isContent,begin,hide,show,changed,exit,backPress}
}
