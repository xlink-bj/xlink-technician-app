<template>
  <textarea
    ref="inputRoot"
    class="app-textarea"
    :class="{
      'app-textarea--disabled': disabled,
      'app-textarea--readonly': readOnly,
      'app-textarea--focused': focused,
      'app-textarea--error': error,
    }"
    :value="modelValue"
    :placeholder="placeholder"
    :placeholder-class="placeholderClass"
    :placeholder-style="placeholderStyle"
    :disabled="nativeDisabled"
    :maxlength="maxlength"
    :auto-height="autoHeight"
    :aria-invalid="error"
    @input="handleInput"
    @focus="handleFocus"
    @blur="handleBlur"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'
// #ifdef H5
import { bindH5InputDelivery } from './h5-input-delivery'
// #endif

const props = withDefaults(
  defineProps<{
    readonly modelValue?: string
    /** H5 controlled host may reject an emitted draft without changing props. */
    readonly reconcileOnCommit?: boolean
    readonly placeholder?: string
    readonly placeholderClass?: string
    readonly placeholderStyle?: string
    readonly disabled?: boolean
    readonly readOnly?: boolean
    readonly error?: boolean
    readonly maxlength?: number
    readonly autoHeight?: boolean
  }>(),
  {
    modelValue: '',
    reconcileOnCommit: false,
    placeholder: '',
    placeholderClass: 'app-textarea__placeholder',
    disabled: false,
    readOnly: false,
    error: false,
    autoHeight: true,
  },
)

const focused = ref(false)
const nativeDisabled = computed(() => props.disabled || props.readOnly)
const inputRoot = ref<unknown>(null)
let nativeDeliveryAttached = false
let disposed = false

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

// #ifdef H5
let delivery: ReturnType<typeof bindH5InputDelivery> = null
async function refreshDelivery() {
  // uni installs native listeners from a field-ref watcher, and Apple inputs
  // are replaced when disabled changes. Subscribe after that watcher settles.
  await nextTick()
  if (disposed || delivery?.isCurrent(inputRoot.value)) return
  delivery?.dispose()
  delivery = bindH5InputDelivery(inputRoot.value, {
    initialValue: props.modelValue,
    isDisabled: () => nativeDisabled.value || disposed,
    emit: value => emit('update:modelValue', value),
    afterCommit: () => {
      void nextTick(() => { if (!disposed && props.reconcileOnCommit) delivery?.reconcileModel(props.modelValue) })
    },
  })
  nativeDeliveryAttached = delivery !== null
}
onMounted(refreshDelivery)
onUpdated(refreshDelivery)
watch(() => props.modelValue, value => delivery?.syncModel(value))
// #endif
onBeforeUnmount(() => {
  disposed = true
  // #ifdef H5
  delivery?.dispose()
  // #endif
})

function handleFocus(): void {
  focused.value = true
}

function handleBlur(): void {
  focused.value = false
}

function handleInput(event: unknown): void {
  if (nativeDeliveryAttached || disposed || nativeDisabled.value) return
  const input = typeof event === 'object' && event !== null ? event as Record<string, unknown> : {}
  const detail = typeof input.detail === 'object' && input.detail !== null
    ? input.detail as Record<string, unknown>
    : {}
  emit('update:modelValue', typeof detail.value === 'string' ? detail.value : '')
}
</script>
