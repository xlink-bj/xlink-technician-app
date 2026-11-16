<template>
  <view class="order-media-field" :data-testid="'order-media-' + fieldId">
    <view v-for="(file,index) in modelValue" :key="file.url" class="order-media-row">
      <text class="order-media-message">{{ uploadedLabel(file.url) }} · 已上传</text>
      <AppButton variant="text" size="compact" :disabled="disabled || busy" :data-testid="'order-media-remove-' + fieldId + '-' + index"
        @tap="removing = { url: file.url, label: uploadedLabel(file.url) }">移除</AppButton>
    </view>
    <view v-for="task in tasks.filter(task => task.state !== 'uploaded')" :key="task.taskId" class="order-media-row">
      <view class="order-media-message" data-testid="order-media-task-description">
        <text class="order-media-name">{{ labels.label(task) }}</text>
        <text class="order-media-state">{{ attachmentTaskStatus(task) }}</text>
      </view>
      <AppButton v-if="task.state === 'failed_retryable' && !['ambiguous_upload', 'ambiguous_postprocess'].includes(task.lastError?.code ?? '')" variant="text" size="compact"
        :disabled="disabled || busy" :data-testid="'order-media-retry-' + fieldId" @tap="run(() => media.retry(task.taskId))">重试</AppButton>
      <AppButton variant="text" size="compact" :disabled="disabled || busy" :data-testid="'order-media-discard-' + fieldId"
        @tap="removing = { taskId: task.taskId, label: labels.label(task) }">删除</AppButton>
    </view>
    <view v-if="removing" class="order-media-confirm" :data-testid="'order-media-confirm-' + fieldId">
      <text class="order-media-message">确认移除“{{ removing.label }}”？其他附件和填写内容将保留。</text>
      <AppButton variant="text" size="compact" :disabled="disabled || busy" :data-testid="'order-media-accept-' + fieldId" @tap="remove">确认移除</AppButton>
      <AppButton variant="text" size="compact" :disabled="busy" :data-testid="'order-media-cancel-' + fieldId" @tap="removing = null">取消</AppButton>
    </view>
    <AppButton variant="secondary" size="compact" :loading="busy" :disabled="disabled || busy || modelValue.length >= 10"
      :data-testid="'order-media-add-' + fieldId" @tap="run(() => media.pick(fieldId, valueKey))">添加附件</AppButton>
    <text v-if="error" role="alert" class="order-media-error">{{ error }}</text>
  </view>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { MediaUploadTask, MediaUploadTaskId } from '@shared/types'
import type { OrderMediaSession } from './order-field-session'
import type { OrderMediaValue } from './order-extfield-wire'
import AppButton from '@shared/ui/AppButton.vue'
import { createAttachmentLabels, attachmentTaskStatus } from '../attachment-presentation'
const props = defineProps<{ fieldId: string; valueKey: string; media: OrderMediaSession; modelValue: readonly OrderMediaValue[]; disabled: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', values: readonly OrderMediaValue[]): void; (event: 'pending', value: boolean): void }>()
const tasks = ref<readonly MediaUploadTask[]>([]), busy = ref(false), error = ref('')
const labels = createAttachmentLabels()
function uploadedLabel(url: string) {
  const task = tasks.value.find(item => item.uploadedRef?.url === url)
  return task ? labels.label(task) : labels.retainedLabel(url)
}
const removing = ref<{ url?: string; taskId?: MediaUploadTaskId; label: string } | null>(null)
let disposed = false
function pending() { emit('pending', busy.value || !!error.value || tasks.value.some(task => task.state !== 'uploaded')) }
async function restore() {
  const listed = await props.media.list()
  if (disposed) return
  tasks.value = listed.filter(task => task.scope.fieldId === props.fieldId)
  labels.register(tasks.value)
  const values = [...props.modelValue]
  for (const task of tasks.value) if (task.state === 'uploaded' && task.uploadedRef && !values.some(file => file.url === task.uploadedRef!.url)) values.push({ url: task.uploadedRef.url })
  if (JSON.stringify(values) !== JSON.stringify(props.modelValue)) emit('update:modelValue', values)
}
async function run(action: () => Promise<void>) {
  if (props.disabled || busy.value) return
  busy.value = true; error.value = ''; pending()
  try { await action() } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : '附件处理失败，请重试。' }
  finally {
    try { await restore() } catch { if (!disposed) error.value = '附件队列暂不可读，请重新进入后核对。' }
    if (!disposed) { busy.value = false; pending() }
  }
}
async function remove() {
  const target = removing.value
  if (!target || props.disabled || busy.value) return
  removing.value = null
  await run(async () => {
    const task = tasks.value.find(task => task.taskId === target.taskId || (!!target.url && task.uploadedRef?.url === target.url))
    if (task) await props.media.discard(task.taskId)
    if (!disposed && target.url) emit('update:modelValue', props.modelValue.filter(file => file.url !== target.url))
  })
}
onMounted(async () => { busy.value = true; pending(); try { await restore() } catch { error.value = '附件队列暂不可读，请重新进入后核对。' } finally { if (!disposed) { busy.value = false; pending() } } })
onBeforeUnmount(() => { disposed = true })
</script>
<style scoped lang="scss">
@import "@brand-ui/order-media.scss";
</style>
