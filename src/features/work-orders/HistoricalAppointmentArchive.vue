<template>
  <view data-testid="historical-appointment-archive">
    <view class="archive-heading" :class="{ 'archive-summary-heading': summary }"><text class="archive-title">预约信息</text>
      <navigator v-if="!loading && !message && targets.length" :url="route(summary && targets.length===1?targets[0]!.recordId:undefined)" class="archive-link" data-testid="appointment-archive-open">{{ summary?'查看详情':'全部预约' }} ›</navigator>
    </view>
    <text v-if="loading" class="archive-hint" data-testid="appointment-archive-loading">正在读取预约记录…</text>
    <view v-else-if="message" class="archive-failure" data-testid="appointment-archive-error"><text class="archive-hint">{{ message }}</text><AppButton v-if="reader?.enabled()" variant="text" @tap="load">重新读取</AppButton></view>
    <template v-else>
      <text v-if="!targets.length" class="archive-hint" data-testid="appointment-archive-empty">暂无可查看的预约记录</text>
      <text v-else-if="summary && targets.length>1" class="archive-copy">共 {{ targets.length }} 条预约，请选择记录查看</text>
      <template v-if="visibleRead">
        <view v-if="summary" :class="{ 'appointment-preview': preview.length }" data-testid="appointment-archive-summary">
          <view v-for="field in preview" :key="field.fieldId" class="archive-copy appointment-preview__row">
            <text>{{ field.label }}<text class="appointment-preview__separator">：</text></text><text class="appointment-preview__value">{{ field.text }}</text>
          </view>
        </view>
        <view v-else data-testid="appointment-record-detail">
          <AppInformationRow v-for="field in fields" :key="field.fieldId"><template #label>{{ field.label }}</template><template #value>{{ field.text }}</template></AppInformationRow>
          <text class="archive-hint" data-testid="appointment-read-only">此预约节点已结束，记录仅可查看。</text>
        </view>
      </template>
      <template v-else-if="!summary">
        <text v-if="recordId && targets.length" class="archive-hint" data-testid="appointment-record-unavailable">这条预约暂不可查看，请返回全部预约重新选择。</text>
        <navigator v-for="(target,index) in !recordId?targets:[]" :key="target.recordId" :url="route(target.recordId)" class="archive-entry archive-link" :data-testid="`appointment-record-${target.recordId}`">预约记录 {{ index+1 }} · 查看详情 ›</navigator>
      </template>
    </template>
  </view>
</template>
<script setup lang="ts">
import {computed,inject,onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import {historicalFormsReaderKey,type HistoricalFormRead,type HistoricalFormTarget} from './r1-historical-forms-read'
import {projectR1RecordReadFields} from './r1-record-read-fields'
import {appointmentDisplayFor} from './appointment-time'
import {appointmentArchiveRoute} from './appointment-archive'
import AppButton from '@shared/ui/AppButton.vue'
import AppInformationRow from '@shared/ui/AppInformationRow.vue'
const props=defineProps<{workOrderId:string;nodeId:string;recordId?:string;actorScope:string|null;summary:boolean}>()
const reader=inject(historicalFormsReaderKey,null)?.({appointmentArchive:true,nodeId:props.nodeId})??null
const targets=shallowRef<readonly HistoricalFormTarget[]>([]),read=shallowRef<HistoricalFormRead|null>(null)
const loading=ref(false),message=ref(''),readActor=ref<string|null>(null)
let version=0
const visibleRead=computed(()=>props.actorScope===readActor.value&&read.value&&reader?.isCurrent(read.value)?read.value:null)
const fields=computed(()=>{
  const value=visibleRead.value
  if(!value)return[]
  return projectR1RecordReadFields(value.definition,value.record).map(field=>{
    const parsed=!field.unavailable&&value.definition.fields?.find(f=>f.fieldId===field.fieldId)?.type==='datetime'?appointmentDisplayFor(value.record.values?.[field.valueKey]):undefined
    return parsed?{...field,text:`${parsed.date} ${parsed.timeLabel}`}:field
  })
})
const preview=computed(()=>fields.value.filter(field=>['need','datetime'].includes(field.valueKey)))
function route(recordId?:string){return appointmentArchiveRoute(props.workOrderId,props.nodeId,recordId)}
function clear(){version++;reader?.clear();targets.value=[];read.value=null;readActor.value=null;loading.value=false;message.value=''}
async function load(){
  clear();const ticket=version,actor=props.actorScope
  if(!actor||!reader?.enabled()){message.value='当前环境暂不支持读取预约档案。';return}
  loading.value=true
  try{
    const discovered=await reader.discover(props.workOrderId)
    if(ticket!==version||actor!==props.actorScope)return
    const rows=discovered.filter(target=>target.runtimeNodeId===props.nodeId&&reader.isCurrent(target))
    const selected=props.recordId?rows.find(target=>target.recordId===props.recordId):props.summary&&rows.length===1?rows[0]:undefined
    const value=selected?await reader.read(selected):null
    if(ticket!==version||actor!==props.actorScope)return
    if(value&&!reader.isCurrent(value))throw Error('Stale history')
    targets.value=rows;read.value=value;readActor.value=actor
  }catch{if(ticket===version){targets.value=[];read.value=null;message.value='预约记录暂时无法完整核实，请重新读取。'}}
  finally{if(ticket===version)loading.value=false}
}
watch(()=>[props.workOrderId,props.nodeId,props.recordId,props.actorScope],()=>{void load()},{immediate:true})
onBeforeUnmount(clear)
</script>
<style scoped lang="scss">
@import "@brand-ui/detail-archives.scss";
</style>
