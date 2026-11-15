<template>
  <view class="r1-file-field" :class="{'r1-file-field--commercial':commercial}">
    <view v-for="(file,index) in files" :key="file.url" class="r1-file-item">
      <image v-if="safeImage(file)" :src="file.url" mode="aspectFill"
        :data-testid="`r1-normal-file-preview-${field.valueKey}`" class="r1-file-preview" />
      <text v-else class="r1-file-name">{{ file.name }}</text>
      <AppButton class="r1-file-remove" v-if="media || allowRetainedRemoval" variant="text" size="compact" :disabled="disabled || pending"
        :data-testid="`r1-normal-file-remove-${field.valueKey}-${index}`" @tap="change('remove',index)">移除</AppButton>
    </view>
    <template v-if="media">
      <AppButton class="r1-file-add" :disabled="disabled || pending || !canPick" variant="secondary"
        :data-testid="`r1-normal-file-add-${field.valueKey}`" @tap="change('pick')">选择图片</AppButton>
      <AppButton class="r1-file-retry" v-if="hint" :disabled="disabled || pending" variant="text"
        :data-testid="`r1-normal-file-retry-${field.valueKey}`" @tap="change('retry')">重试上传</AppButton>
      <AppButton class="r1-file-discard" v-if="hint" :disabled="disabled || pending" variant="text"
        :data-testid="`r1-normal-file-discard-${field.valueKey}`" @tap="change('discardFailed')">移除失败任务</AppButton>
      <text class="r1-file-status" v-if="pending" :data-testid="`r1-normal-file-status-${field.valueKey}`">正在处理图片</text>
      <text class="r1-file-status r1-file-status--attention" v-else-if="hint" :data-testid="`r1-normal-file-status-${field.valueKey}`">{{ hint }}</text>
      <text class="r1-file-status" v-else-if="files.length" :data-testid="`r1-normal-file-status-${field.valueKey}`">图片已上传</text>
      <text v-if="localError" class="r1-file-error">{{ localError }}</text>
    </template>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import AppButton from '@shared/ui/AppButton.vue'
import type { R1FileWireValue } from '@shared/types'
import { isR1RetainedFileArray } from '@shared/form/r1-retained-file-values'
import { isR1NormalImageWireArray } from '@shared/form/r1-normal-image-contract'
import type { R1LocalField } from './r1-local-form-fields'
import type { R1NormalFormFileSessionView } from './r1-normal-form-media-port'
const props=defineProps<{readonly field:Pick<R1LocalField,'fieldId'|'valueKey'>;readonly modelValue?:unknown;
  readonly draft?:Readonly<Record<string,unknown>>;readonly media?:R1NormalFormFileSessionView;readonly commercial?:boolean;readonly disabled?:boolean;readonly retained?:boolean;readonly allowRetainedRemoval?:boolean}>()
const emit=defineEmits<{(event:'update:modelValue',value:readonly R1FileWireValue[]):void}>()
const localError=ref('')
const files=computed<readonly R1FileWireValue[]>(()=>{
  const value=props.modelValue
  if(props.retained)return isR1RetainedFileArray(value)?value:[]
  return isR1NormalImageWireArray(value)?value:[]
})
const pending=computed(()=>{void props.media?.revision.value;return props.media?.busy()??false})
const hint=computed(()=>{void props.media?.revision.value;return props.media?.message()??''})
const canPick=computed(()=>{void props.media?.revision.value;return props.media?.canPick(props.field.fieldId,props.draft??{})??false})
function safeImage(file:R1FileWireValue):boolean{
  if(!['png','jpg','jpeg','webp'].includes(file.extname.toLowerCase()))return false
  try{const base=new URL(String(import.meta.env.VITE_XLINK_MEDIA_DOWNLOAD_BASE_URL??'')),url=new URL(file.url)
    return base.protocol==='https:'&&url.origin===base.origin&&!url.username&&!url.password
      &&url.pathname.startsWith(base.pathname.replace(/\/+$/,'')+'/')
  }catch{return false}
}
async function change(kind:'pick'|'retry'|'remove'|'discardFailed',index=0){
  if(props.disabled||pending.value)return
  if(!props.media&&props.retained&&props.allowRetainedRemoval&&kind==='remove'){
    if(!Number.isSafeInteger(index)||index<0||index>=files.value.length)return
    emit('update:modelValue',files.value.filter((_file,i)=>i!==index));return
  }
  const media=props.media;if(!media)return
  localError.value=''
  try{const value=kind==='remove'?await media.remove(props.field.fieldId,index,props.draft??{})
    :await media[kind](props.field.fieldId,props.draft??{})
    if(value&&props.media===media)emit('update:modelValue',value)
  }catch{localError.value='图片尚未处理完成，请核实当前字段和上传状态。'}
}
</script>
<style scoped lang="scss">
@import "@brand-ui/form-media.scss";
</style>
