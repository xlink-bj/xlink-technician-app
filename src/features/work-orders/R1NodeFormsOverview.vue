<template>
  <view v-if="node && (node.sourceNodeType === 'forms' || node.sourceNodeType === 'repeat')"
    class="r1-node-forms" data-testid="r1-form-list">
    <view class="r1-node-forms__heading">
      <text class="r1-node-forms__title">{{ node.sourceNodeType === 'repeat' ? '重复提交记录' : '节点表单记录' }}</text>
      <text v-if="formList?.evidence === 'available'" data-testid="r1-form-list-count"
        class="r1-node-forms__count">{{ countText }}</text>
    </view>
    <text v-if="!formList" class="r1-node-forms__hint" data-testid="r1-form-list-unknown">
      当前节点尚未提供完整记录。未知不等于没有表单；仅可查看。
    </text>
    <AppButton v-if="!formList && node.sourceNodeType==='repeat' && syntheticActionsEnabled"
      size="compact" variant="secondary" @tap="loadRepeat">查看记录</AppButton>
    <text v-else-if="formList?.evidence === 'invalid'" class="r1-node-forms__hint"
      data-testid="r1-form-list-invalid">服务端表单列表结构异常；不允许基于不完整列表编辑。</text>
    <template v-else-if="formList">
      <text v-if="formList.entries.length === 0" class="r1-node-forms__hint"
        data-testid="r1-form-list-empty">该节点返回了空表单列表。</text>
      <view v-for="(entry,index) in formList.entries" :key="String(entry.id)"
        class="r1-node-forms__item" data-testid="r1-form-list-entry">
        <text class="r1-node-forms__index">{{ index + 1 }}</text>
        <view class="r1-node-forms__item-main">
          <text class="r1-node-forms__item-title">{{ entry.title || '未命名表单' }}</text>
          <text class="r1-node-forms__state" :data-testid="`r1-form-entry-state-${entry.id}`">
            {{ stagedFor(String(entry.id)) ? '已有待处理修改' : stateName(entry.state) }}
          </text>
          <view v-if="draftStore.state === 'ready' && entry.state !== 'deleted'" class="r1-node-forms__row-actions">
            <AppButton variant="text" size="compact" :disabled="!canStage || Boolean(stagedFor(String(entry.id)))"
              @tap="selectEditing(String(entry.id),entry.title||'未命名表单')">编辑标题草稿</AppButton>
            <AppButton variant="text" size="compact" :disabled="!canStage || Boolean(stagedFor(String(entry.id)))"
              @tap="markDelete(String(entry.id))">标记待删除</AppButton>
          </view>
        </view>
      </view>
      <text v-if="formList.truncated" class="r1-node-forms__hint" data-testid="r1-form-list-truncated">
        仅展示前 50 条已加载记录，不能基于截断列表修改。
      </text>
    </template>
    <text class="r1-node-forms__hint">当前可先整理草稿；正式保存、删除和流程完成暂未开放。</text>
    <view v-if="draftStore.state === 'loading'" class="r1-node-forms__hint">正在恢复草稿…</view>
    <view v-else-if="draftStore.state === 'failed'" class="r1-node-forms__hint" data-testid="r1-form-local-error">
      {{ draftStore.message }}
    </view>
    <template v-if="draftStore.state === 'ready'">
      <view v-if="canStage && syntheticActionsEnabled && node.sourceNodeType === 'repeat' && node.formDefinitionId"
        class="r1-node-forms__draft-editor" data-testid="r1-form-new-draft">
        <text class="r1-node-forms__label">新增表单草稿</text>
        <AppInput :model-value="newTitle" placeholder="输入草稿名称"
          :maxlength="80" @update:model-value="newTitle = $event" />
        <AppButton size="compact" variant="secondary" :disabled="!newTitle.trim()"
          @tap="createDraft">新增草稿</AppButton>
      </view>
      <view v-else-if="node.sourceNodeType === 'forms'" class="r1-node-forms__draft-editor">
        <text class="r1-node-forms__label">多类型表单选项</text>
        <AppButton v-if="canStage && syntheticActionsEnabled && node.addFormCodeId"
          size="compact" variant="secondary" @tap="loadChoices">查看可选表单</AppButton>
        <view v-for="(choice,index) in draftStore.availableAddOptions" :key="String(choice.formDefinitionId)"
          class="r1-node-forms__draft-row" data-testid="r1-add-form-option">
          <text class="r1-node-forms__item-main">{{ choice.label }}</text>
          <AppButton size="compact" variant="secondary" @tap="addOption(index)">新增草稿</AppButton>
        </view>
        <text v-if="!draftStore.availableAddOptions.length" class="r1-node-forms__hint">
          未读取到已核验的选项时不能新增；不会猜测表单定义。
        </text>
      </view>
      <view v-if="editingRecordId" class="r1-node-forms__draft-editor" data-testid="r1-form-edit-draft">
        <text class="r1-node-forms__label">编辑标题草稿（原记录不变）</text>
        <AppInput :model-value="editTitle" :maxlength="80" @update:model-value="editTitle=$event" />
        <view class="r1-node-forms__buttons">
          <AppButton size="compact" variant="secondary" :disabled="!editTitle.trim()"
            @tap="applyEdit">保存标题草稿</AppButton>
          <AppButton size="compact" variant="text" @tap="editingRecordId=null">取消</AppButton>
        </view>
      </view>
      <view v-if="draftStore.snapshot.intents.length" class="r1-node-forms__draft-list" data-testid="r1-form-staged-list">
        <text class="r1-node-forms__label">待处理（{{ draftStore.snapshot.intents.length }}）</text>
        <view v-for="intent in draftStore.snapshot.intents" :key="intent.localId" class="r1-node-forms__draft-row"
          data-testid="r1-form-staged-item">
          <view class="r1-node-forms__item-main">
            <text class="r1-node-forms__item-title">{{ intent.title }}</text>
            <text class="r1-node-forms__state">{{ intentLabel(intent.kind) }} · 待处理
              <template v-if="intent.values && Object.keys(intent.values).length"> · {{ Object.keys(intent.values).length }} 项字段已保存</template>
            </text>
          </view>
          <AppButton v-if="intent.kind === 'new' || intent.kind==='edit_title'" size="compact" variant="secondary"
            :disabled="loadingFields" @tap="openFieldEditor(intent.localId)">编辑字段</AppButton>
          <AppButton size="compact" variant="text" @tap="discard(intent.localId)">撤销</AppButton>
        </view>
      </view>
      <text v-if="loadingFields" class="r1-node-forms__hint">正在准备表单…</text>
      <R1LocalFormFieldEditor v-if="activeDefinition && activeIntent"
        :definition="activeDefinition" :intent="activeIntent"
        :initial-values="activeValues" @close="closeFieldEditor" />
      <text v-if="draftStore.message" class="r1-node-forms__hint" data-testid="r1-form-draft-message">
        {{ draftStore.message }}
      </text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { WorkflowNodeRead, R1NodeFormReference, R1NodeFormListRead, FormDefinitionRead } from '@shared/ports'
import { isBusinessMockDeveloperModeAvailable, isBusinessMockMode } from '@app/business-mock'
import type { R1LocalFieldValue } from './r1-local-form-fields'
import AppButton from '@shared/ui/AppButton.vue'
import AppInput from '@shared/ui/AppInput.vue'
import R1LocalFormFieldEditor from './R1LocalFormFieldEditor.vue'
import { useR1LocalFormDraftStore, type R1LocalFormIntent } from './r1-local-form-drafts'

const props = defineProps<{
  readonly node?: WorkflowNodeRead
  readonly workOrderId?: string
  readonly actorScope?: string | null
}>()
const draftStore=useR1LocalFormDraftStore()
const newTitle=ref('')
const editTitle=ref('')
const editingRecordId=ref<string|null>(null)
const activeDefinition=ref<FormDefinitionRead|null>(null)
const activeValues=ref<Readonly<Record<string,R1LocalFieldValue>>>({})
const activeLocalId=ref<string|null>(null)
const loadingFields=ref(false)
let fieldLoadSeq=0
const activeIntent=computed(()=>draftStore.snapshot.intents.find(x=>x.localId===activeLocalId.value
  && (x.kind==='new'||x.kind==='edit_title'))??null)
const formList=computed<R1NodeFormListRead|null>(()=>draftStore.repeatList??props.node?.formList??null)
const syntheticActionsEnabled=computed(()=>Boolean(import.meta.env.DEV && props.workOrderId?.startsWith('mock-')
  && isBusinessMockDeveloperModeAvailable() && isBusinessMockMode()==='data'))
function closeFieldEditor(){
  fieldLoadSeq++
  activeLocalId.value=null
  activeDefinition.value=null
  activeValues.value={}
  loadingFields.value=false
}
async function openFieldEditor(localId:string){
  closeFieldEditor()
  const ticket=fieldLoadSeq
  loadingFields.value=true
  try {
    const intent=draftStore.snapshot.intents.find(x=>x.localId===localId)
    const existing=intent?.kind==='edit_title'?await draftStore.loadEditableExisting(localId):null
    const definition=existing?.definition ?? (intent?.kind==='new'?await draftStore.loadDraftDefinition(localId):null)
    if(ticket!==fieldLoadSeq || !definition)return
    activeLocalId.value=localId
    activeDefinition.value=definition
    activeValues.value=existing?.values??intent?.values??{}
  }finally {
    if(ticket===fieldLoadSeq)loadingFields.value=false
  }
}
const countText=computed(()=>{
  const list=formList.value
  if(!list||list.evidence!=='available')return ''
  return list.truncated?`已加载 ${list.entries.length}+ 条`:`已加载 ${list.entries.length} 条`
})
const canStage=computed(()=>Boolean(formList.value?.evidence==='available'
  && !formList.value?.truncated && props.actorScope && props.workOrderId
  && draftStore.state==='ready'))
function stateName(state:R1NodeFormReference['state']){
  return state==='active'?'已保存':state==='deleted'?'已删除':'状态待核验'
}
function intentLabel(kind:R1LocalFormIntent['kind']){
  return kind==='new'?'新增草稿':kind==='edit_title'?'编辑标题草稿':'删除意图'
}
function stagedFor(id:string){return draftStore.snapshot.intents.find(x=>x.targetFormDataId===id)}
watch(()=>[props.node,props.workOrderId,props.actorScope] as const,([node,workOrderId,actorScope])=>{
  editingRecordId.value=null
  closeFieldEditor()
  if(!node||!workOrderId||!actorScope||!['forms','repeat'].includes(node.sourceNodeType??'')){
    draftStore.clear();return
  }
  void draftStore.open({
    actorScope,workOrderId,runtimeNodeId:String(node.id),
    sourceNodeType:node.sourceNodeType as 'forms'|'repeat',
    ...(node.formDefinitionId?{formDefinitionId:String(node.formDefinitionId)}:{}),
  },node)
},{immediate:true})
onBeforeUnmount(()=>{closeFieldEditor();draftStore.clear()})
function selectEditing(id:string,title:string){editingRecordId.value=id;editTitle.value=title}
async function createDraft(){
  if(await draftStore.add(newTitle.value))newTitle.value=''
}
async function loadRepeat(){await draftStore.loadRepeatReferences()}
async function loadChoices(){await draftStore.loadAddOptions()}
async function addOption(index:number){await draftStore.addFromOption(index)}
async function applyEdit(){
  const id=editingRecordId.value
  if(id&&await draftStore.stageEditTitle(id,editTitle.value))editingRecordId.value=null
}
async function markDelete(id:string){await draftStore.stageDelete(id)}
async function discard(id:string){
  if(id===activeLocalId.value)closeFieldEditor()
  await draftStore.discard(id)
}
</script>

<style scoped>
.r1-node-forms{background:#fff;border:1px solid #e0e7ef;border-radius:16px;padding:17px 16px;margin-top:12px}
.r1-node-forms__heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
.r1-node-forms__title{font-size:16px;font-weight:650;color:#1d304b}
.r1-node-forms__count,.r1-node-forms__state{font-size:12px;color:#68788f}
.r1-node-forms__hint{display:block;font-size:12px;line-height:20px;color:#68788f;margin-top:12px}
.r1-node-forms__item,.r1-node-forms__draft-row{display:flex;align-items:center;min-height:47px;gap:10px;border-bottom:1px solid #ecf0f5;padding:6px 0}
.r1-node-forms__index{width:22px;font-size:12px;color:#8392a5}
.r1-node-forms__item-main{flex:1;min-width:0}
.r1-node-forms__item-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;color:#263b55}
.r1-node-forms__row-actions,.r1-node-forms__buttons{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.r1-node-forms__draft-editor,.r1-node-forms__draft-list{display:flex;flex-direction:column;gap:10px;border-top:1px solid #e6edf5;margin-top:14px;padding-top:12px}
.r1-node-forms__label{font-weight:600;font-size:13px;color:#263b55}
</style>
