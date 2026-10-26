<template>
  <view class="r1-field-editor" data-testid="r1-local-field-editor">
    <text class="r1-field-editor__title">本机字段草稿 · {{ intent.title }}</text>
    <text class="r1-field-editor__hint">体验表单 · 记录仅保存在本机，未提交后台。</text>
    <template v-for="field in fields" :key="field.fieldId">
      <AppField v-if="field.supported" :label="field.label" :required="field.required">
        <AppMultiChoiceGroup v-if="field.type === 'checkbox'" :options="field.options"
          :model-value="listValue(field.valueKey)"
          @update:model-value="set(field.valueKey,$event)" />
        <AppChoiceGroup v-else-if="field.type === 'radio' || field.type === 'select'"
          :options="field.options" :model-value="scalarValue(field.valueKey)"
          @update:model-value="set(field.valueKey,$event)" />
        <AppChoiceGroup v-else-if="field.type === 'switch'"
          :options="[{value:'1',label:'是'},{value:'0',label:'否'}]"
          :model-value="scalarValue(field.valueKey)"
          @update:model-value="set(field.valueKey,$event)" />
        <AppTextarea v-else-if="field.type === 'textarea'"
          :model-value="scalarValue(field.valueKey)" placeholder="仅存入本机草稿"
          @update:model-value="set(field.valueKey,$event)" />
        <AppInput v-else :model-value="scalarValue(field.valueKey)" placeholder="填写本机草稿"
          @update:model-value="set(field.valueKey,$event)" />
      </AppField>
      <view v-else class="r1-field-editor__unsupported" :data-testid="`r1-field-unsupported-${field.fieldId}`">
        <text>{{ field.label }} · {{ field.reason || '暂不支持' }}</text>
      </view>
    </template>
    <text class="r1-field-editor__hint" data-testid="r1-local-field-result">当前字段只完成本地编辑；数据校验不代表服务端可接受。</text>
    <text v-if="error" class="r1-field-editor__hint" data-testid="r1-field-local-validation">{{ error }}</text>
    <view class="r1-field-editor__buttons">
      <AppButton variant="secondary" size="compact" :disabled="saving" :loading="saving"
        @tap="save">保存本机字段草稿</AppButton>
      <AppButton variant="text" size="compact" :disabled="saving" @tap="emit('close')">取消</AppButton>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FormDefinitionRead, FormFieldValue } from '@shared/ports'
import AppField from '@shared/ui/AppField.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import AppMultiChoiceGroup from '@shared/ui/AppMultiChoiceGroup.vue'
import AppButton from '@shared/ui/AppButton.vue'
import { useR1LocalFormDraftStore, type R1LocalFormIntent } from './r1-local-form-drafts'
import { normalizeR1LocalFieldPatch, projectR1LocalFields, type R1LocalFieldValue } from './r1-local-form-fields'

const props=defineProps<{readonly definition:FormDefinitionRead;readonly intent:R1LocalFormIntent;
  readonly initialValues?:Readonly<Record<string,R1LocalFieldValue>>}>()
const emit=defineEmits<{(event:'close'):void}>()
const draft=useR1LocalFormDraftStore()
const values=ref<Readonly<Record<string,R1LocalFieldValue>>>({...props.initialValues??props.intent.values})
const error=ref('')
const saving=ref(false)
const fields=computed(()=>projectR1LocalFields(props.definition,values.value))
function scalarValue(key:string):string {
  const v=values.value[key]
  return typeof v==='string'||typeof v==='number'||typeof v==='boolean'?String(v):''
}
function listValue(key:string):readonly string[]{
  const v=values.value[key]
  return Array.isArray(v)?v as readonly string[]:[]
}
function set(key:string,value:FormFieldValue){
  if(saving.value)return
  const next=normalizeR1LocalFieldPatch(props.definition,values.value,key,value)
  if(!next){error.value='字段值不符合当前表单定义，未修改本地草稿。';return}
  error.value=''
  values.value=next
}
async function save(){
  if(saving.value)return
  saving.value=true
  try {
    const saved=await draft.saveDraftValues(props.intent.localId,props.definition,values.value)
    if(saved)emit('close')
    else error.value=draft.message||'本机草稿保存失败，未执行业务操作。'
  }finally{saving.value=false}
}
</script>

<style scoped>
.r1-field-editor{display:flex;flex-direction:column;gap:12px;border-top:1px solid #e0e7ef;padding-top:14px;margin-top:12px}
.r1-field-editor__title{font-size:15px;font-weight:650;color:#263b55}
.r1-field-editor__hint{font-size:12px;line-height:19px;color:#68788f}
.r1-field-editor__buttons{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.r1-field-editor__unsupported{padding:8px 10px;border:1px solid #e0e7ef;border-radius:10px;font-size:12px;color:#68788f}
</style>
