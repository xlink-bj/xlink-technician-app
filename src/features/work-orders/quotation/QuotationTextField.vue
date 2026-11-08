<template>
  <textarea
    v-if="multiline"
    ref="fieldRoot"
    :value="value"
    :disabled="disabled"
    :maxlength="maxlength"
    @input="handleInput"
  />
  <input
    v-else
    ref="fieldRoot"
    :value="value"
    :type="type"
    :disabled="disabled"
    :maxlength="maxlength"
    @input="handleInput"
  />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'
// #ifdef H5
import { bindH5InputDelivery } from '@shared/ui/h5-input-delivery'
// #endif

// No styles or value normalization: keep the five quotation controls' native
// appearance and let their existing handlers/store own business validation.
const props = withDefaults(defineProps<{
  readonly value?: string
  readonly disabled?: boolean
  readonly multiline?: boolean
  readonly type?: 'text' | 'number' | 'digit'
  readonly maxlength?: number
  readonly isCurrent?: () => boolean
}>(), { value: '', disabled: false, multiline: false, type: 'text' })
const emit = defineEmits<{ (event: 'input', rawEvent: unknown): void }>()
const fieldRoot = ref<unknown>(null)
let attached = false
let disposed = false

// #ifdef H5
let delivery: ReturnType<typeof bindH5InputDelivery> = null
async function refreshDelivery() {
  // Subscribe after uni's target listener has applied its normalization.
  await nextTick()
  if (disposed || delivery?.isCurrent(fieldRoot.value)) return
  delivery?.dispose()
  delivery = bindH5InputDelivery(fieldRoot.value, {
    initialValue: props.value,
    isDisabled: () => !canPublish(),
    emit: value => emit('input', { detail: { value } }),
  })
  attached = delivery !== null
}
onMounted(refreshDelivery)
onUpdated(refreshDelivery)
watch(() => props.value, value => delivery?.syncModel(value))
// #endif
onBeforeUnmount(() => {
  disposed = true
  // #ifdef H5
  delivery?.dispose()
  // #endif
})
function canPublish() {
  return !disposed && !props.disabled && (props.isCurrent?.() ?? true)
}
function handleInput(event: unknown) {
  // Once attached, native delivery owns H5. Ignore delayed uni public events.
  // MP/App retain their original raw event contract after preprocessing.
  if (attached || !canPublish()) return
  emit('input', event)
}
</script>
