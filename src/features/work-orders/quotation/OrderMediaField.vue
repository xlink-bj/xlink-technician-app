<template>
  <view :data-testid="'order-media-' + fieldId">
    <view v-for="(file,index) in modelValue" :key="file.url" class="order-media-row">
      <text>附件 {{ index + 1 }} · 已上传</text>
      <AppButton variant="text" size="compact" :disabled="disabled || busy" :data-testid="'order-media-remove-' + fieldId + '-' + index"
        @tap="removing = { url: file.url }">移除</AppButton>
    </view>
    <view v-for="task in tasks.filter(task => task.state !== 'uploaded')" :key="task.taskId" class="order-media-row">
      <text>{{ task.lastError?.code === 'ambiguous_postprocess' ? '附件结果待核对，请勿重复上传' : task.state === 'failed_retryable' ? '上传失败，附件已保留' : task.state === 'failed_terminal' ? '附件无法上传，请重新选择' : '附件待处理，尚未完成' }}</text>
      <AppButton v-if="task.state === 'failed_retryable' && task.lastError?.code !== 'ambiguous_postprocess'" variant="text" size="compact"
        :disabled="disabled || busy" :data-testid="'order-media-retry-' + fieldId" @tap="run(() => media.retry(task.taskId))">重试</AppButton>
      <AppButton variant="text" size="compact" :disabled="disabled || busy" :data-testid="'order-media-discard-' + fieldId"
        @tap="removing = { taskId: task.taskId }">删除</AppButton>
    </view>
    <view v-if="removing" class="order-media-confirm" :data-testid="'order-media-confirm-' + fieldId">
      <text>确认移除这份附件？</text>
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
const props = defineProps<{ fieldId: string; valueKey: string; media: OrderMediaSession; modelValue: readonly OrderMediaValue[]; disabled: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', values: readonly OrderMediaValue[]): void; (event: 'pending', value: boolean): void }>()
const tasks = ref<readonly MediaUploadTask[]>([]), busy = ref(false), error = ref('')
const removing = ref<{ url?: string; taskId?: MediaUploadTaskId } | null>(null)
let disposed = false
function pending() { emit('pending', busy.value || !!error.value || tasks.value.some(task => task.state !== 'uploaded')) }
async function restore() {
  const listed = await props.media.list()
  if (disposed) return
  tasks.value = listed.filter(task => task.scope.fieldId === props.fieldId)
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
<style scoped>
.order-media-row,.order-media-confirm { display:flex; align-items:center; justify-content:space-between; gap:16rpx; flex-wrap:wrap; margin-bottom:12rpx; }
.order-media-error { display:block; color:var(--app-color-error); margin-top:12rpx; }
</style>
