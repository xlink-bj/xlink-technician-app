<template>
  <view v-if="node?.formList" class="r1-node-forms" data-testid="r1-form-list">
    <view class="r1-node-forms__heading">
      <text class="r1-node-forms__title">{{ node.sourceNodeType === 'repeat' ? '重复提交记录' : '节点表单记录' }}</text>
      <text v-if="node.formList.evidence === 'available'" data-testid="r1-form-list-count"
        class="r1-node-forms__count">{{ countText }}</text>
    </view>
    <text v-if="node.formList.evidence === 'invalid'" class="r1-node-forms__hint"
      data-testid="r1-form-list-invalid">服务端表单列表结构异常；不允许基于不完整列表编辑。</text>
    <template v-else>
      <text v-if="node.formList.entries.length === 0" class="r1-node-forms__hint"
        data-testid="r1-form-list-empty">该节点返回了空表单列表。</text>
      <view v-for="(entry,index) in node.formList.entries" :key="String(entry.id)"
        class="r1-node-forms__item" data-testid="r1-form-list-entry">
        <text class="r1-node-forms__index">{{ index + 1 }}</text>
        <view class="r1-node-forms__item-main">
          <text class="r1-node-forms__item-title">{{ entry.title || '未命名表单' }}</text>
          <text class="r1-node-forms__state">{{ stateName(entry.state) }}</text>
          <view v-if="draftStore.state === 'ready' && entry.state !== 'deleted'" class="r1-node-forms__row-actions">
            <AppButton variant="text" size="compact" :disabled="!canStage || Boolean(stagedFor(String(entry.id)))"
              @tap="selectEditing(String(entry.id),entry.title||'未命名表单')">编辑标题草稿</AppButton>
            <AppButton variant="text" size="compact" :disabled="!canStage || Boolean(stagedFor(String(entry.id)))"
              @tap="markDelete(String(entry.id))">标记待删除</AppButton>
          </view>
        </view>
      </view>
      <text v-if="node.formList.truncated" class="r1-node-forms__hint" data-testid="r1-form-list-truncated">
        仅展示前 50 条已加载记录，不能基于截断列表修改。
      </text>
    </template>
    <text class="r1-node-forms__hint">此处仅管理本机草稿。不会保存业务数据、删除表单或推进工作流。</text>
    <view v-if="draftStore.state === 'loading'" class="r1-node-forms__hint">正在恢复本机草稿…</view>
    <view v-else-if="draftStore.state === 'failed'" class="r1-node-forms__hint" data-testid="r1-form-local-error">
      {{ draftStore.message }}
    </view>
    <template v-if="draftStore.state === 'ready'">
      <view v-if="canStage && node.sourceNodeType === 'repeat' && node.formDefinitionId"
        class="r1-node-forms__draft-editor" data-testid="r1-form-new-draft">
        <text class="r1-node-forms__label">新增本地表单草稿</text>
        <AppInput :model-value="newTitle" placeholder="输入草稿名称（不创建服务端表单）"
          :maxlength="80" @update:model-value="newTitle = $event" />
        <AppButton size="compact" variant="secondary" :disabled="!newTitle.trim()"
          @tap="createDraft">新增草稿</AppButton>
      </view>
      <text v-else-if="node.sourceNodeType === 'forms'" class="r1-node-forms__hint">
        多类型表单新增选项须从 R1 的 addFormCodeId 读取核验；当前不生成伪造表单定义。
      </text>
      <view v-if="editingRecordId" class="r1-node-forms__draft-editor" data-testid="r1-form-edit-draft">
        <text class="r1-node-forms__label">仅编辑本机标题草稿（原业务记录不变）</text>
        <AppInput :model-value="editTitle" :maxlength="80" @update:model-value="editTitle=$event" />
        <view class="r1-node-forms__buttons">
          <AppButton size="compact" variant="secondary" :disabled="!editTitle.trim()"
            @tap="applyEdit">保存本地标题</AppButton>
          <AppButton size="compact" variant="text" @tap="editingRecordId=null">取消</AppButton>
        </view>
      </view>
      <view v-if="draftStore.snapshot.intents.length" class="r1-node-forms__draft-list" data-testid="r1-form-staged-list">
        <text class="r1-node-forms__label">本机待处理（{{ draftStore.snapshot.intents.length }}）</text>
        <view v-for="intent in draftStore.snapshot.intents" :key="intent.localId" class="r1-node-forms__draft-row"
          data-testid="r1-form-staged-item">
          <view class="r1-node-forms__item-main">
            <text class="r1-node-forms__item-title">{{ intent.title }}</text>
            <text class="r1-node-forms__state">{{ intentLabel(intent.kind) }} · 未同步</text>
          </view>
          <AppButton size="compact" variant="text" @tap="discard(intent.localId)">撤销</AppButton>
        </view>
      </view>
      <text v-if="draftStore.message" class="r1-node-forms__hint" data-testid="r1-form-draft-message">
        {{ draftStore.message }}
      </text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { WorkflowNodeRead, R1NodeFormReference } from '@shared/ports'
import AppButton from '@shared/ui/AppButton.vue'
import AppInput from '@shared/ui/AppInput.vue'
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
const countText=computed(()=>{
  const list=props.node?.formList
  if(!list||list.evidence!=='available')return ''
  return list.truncated?`已加载 ${list.entries.length}+ 条`:`已加载 ${list.entries.length} 条`
})
const canStage=computed(()=>Boolean(props.node?.formList?.evidence==='available'
  && !props.node?.formList?.truncated && props.actorScope && props.workOrderId
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
  if(!node?.formList||!workOrderId||!actorScope||!['forms','repeat'].includes(node.sourceNodeType??'')){
    draftStore.clear();return
  }
  void draftStore.open({
    actorScope,workOrderId,runtimeNodeId:String(node.id),
    sourceNodeType:node.sourceNodeType as 'forms'|'repeat',
    ...(node.formDefinitionId?{formDefinitionId:String(node.formDefinitionId)}:{}),
  },node)
},{immediate:true})
onBeforeUnmount(()=>draftStore.clear())
function selectEditing(id:string,title:string){editingRecordId.value=id;editTitle.value=title}
async function createDraft(){
  if(await draftStore.add(newTitle.value))newTitle.value=''
}
async function applyEdit(){
  const id=editingRecordId.value
  if(id&&await draftStore.stageEditTitle(id,editTitle.value))editingRecordId.value=null
}
async function markDelete(id:string){await draftStore.stageDelete(id)}
async function discard(id:string){await draftStore.discard(id)}
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
