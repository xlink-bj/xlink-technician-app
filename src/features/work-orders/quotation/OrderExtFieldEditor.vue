<template>
  <view id="order-extfield-editor" data-testid="order-extfield-editor" :data-revision="draft?.revision" :data-draft-status="localDraftStatus">
    <text class="order-fields-title">报价资料</text>
    <AppLoadingState v-if="loading" variant="inline" label="正在读取报价资料" />
    <AppStatus v-else-if="unavailable" message="报价资料暂不可用，原草稿已保留。请返回后重试。" tone="warning" quiet />
    <template v-else-if="draft && evaluated">
      <AppField v-for="field in evaluated.fields" :key="field.fieldId" :label="draft.labels[field.fieldId]"
        :required="field.required" :error="evaluated.errors[field.fieldId] ?? ''"
        :data-testid="'order-field-' + field.fieldId">
        <AppCascadeSheetField v-if="field.type === 'cascade'" :options="field.options"
          :model-value="pathValue(field.valueKey)" :disabled="locked || saveFailed"
          :title="draft.labels[field.fieldId]" :test-id-prefix="'order-cascade-' + field.fieldId"
          @update:model-value="setValue(field.valueKey, $event)" />
        <R1FormFieldControl v-else :field="{ fieldId: field.fieldId, valueKey: field.valueKey,
          label: draft.labels[field.fieldId], type: field.type, required: !!field.required,
          readOnly: false, options: field.options, multiple: !!field.multiple, supported: true }"
          :model-value="valueFor(field.valueKey)" :disabled="locked || saveFailed"
          @update:model-value="setValue(field.valueKey, $event)" />
      </AppField>

    </template>
  </view>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { AppActionDraftStatus } from '@shared/ui/types'
import type { OrderFieldDraft, OrderFieldSession } from './order-field-session'
import { evaluateOrderExtFields } from './order-extfield-runtime'
import type { R1LocalFieldValue } from '../r1-local-form-fields'
import R1FormFieldControl from '../R1FormFieldControl.vue'
import AppField from '@shared/ui/AppField.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppCascadeSheetField from '@shared/ui/AppCascadeSheetField.vue'
const props = defineProps<{ session: OrderFieldSession; serviceType: string; locked: boolean }>()
const emit = defineEmits<{ (event: 'change', ready: boolean): void; (event: 'draft-status', status: AppActionDraftStatus): void }>()
const draft = ref<OrderFieldDraft | null>(null)
const values = ref<Readonly<Record<string, unknown>>>({})
const loading = ref(true)
const unavailable = ref(false)
const saveFailed = ref(false)
const pending = ref(0)
const localDraftStatus = computed<AppActionDraftStatus>(() => saveFailed.value ? 'save_failed' : pending.value > 0 ? 'saving' : draft.value && draft.value.revision > 0 ? 'saved_local' : 'clean')
watch(localDraftStatus, status => { if (!disposed) emit('draft-status', status) })
let generation = 0
let disposed = false
let queue = Promise.resolve()
const evaluated = computed(() => draft.value ? evaluateOrderExtFields({ ...draft.value.input, values: values.value }, 'submit') : null)
watch(() => props.serviceType, async serviceType => {
  const ticket = ++generation
  loading.value = true
  emit('change', false)
  const loaded = await props.session.load(serviceType)
  if (disposed || ticket !== generation) return
  draft.value = loaded
  values.value = loaded?.input.values ?? {}
  unavailable.value = !loaded
  loading.value = false
  emit('change', evaluated.value?.state === 'ready')
}, { immediate: true })
function valueFor(key: string): R1LocalFieldValue | undefined { return values.value[key] as R1LocalFieldValue | undefined }
function pathValue(key: string): readonly string[] { const value = values.value[key]; return Array.isArray(value) ? value as string[] : [] }
function setValue(key: string, value: R1LocalFieldValue): void {
  if (props.locked || saveFailed.value || !draft.value) return
  values.value = { ...values.value, [key]: value }
  const snapshot = { ...values.value }
  const ticket = generation
  pending.value += 1
  emit('change', false)
  queue = queue.then(async () => {
    if (ticket !== generation || !draft.value || saveFailed.value) return
    const revision = await props.session.save(snapshot, draft.value.revision)
    if (ticket !== generation) return
    if (revision === null) saveFailed.value = true
    else draft.value = { ...draft.value, revision }
  }).catch(() => { if (ticket === generation) saveFailed.value = true }).finally(() => {
    if (ticket !== generation) return
    pending.value -= 1
    if (!disposed) emit('change', !saveFailed.value && pending.value === 0 && evaluated.value?.state === 'ready')
  })
}
defineExpose({ validateSelectionEntry: () => Boolean(draft.value && !loading.value && !saveFailed.value && pending.value === 0 && props.session.current() && evaluateOrderExtFields({ ...draft.value.input, values: values.value }, 'selection').state === 'ready') })
// Let already queued, authorized saves drain when leaving the page.
onBeforeUnmount(() => { disposed = true })
</script>
<style scoped>
.order-fields-title { display:block; margin:24rpx 0 16rpx; font-size:var(--app-font-section-title); font-weight:600; color:var(--app-color-text-primary); }
</style>
