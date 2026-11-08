<template>
  <input
    ref="inputRoot"
    class="app-input"
    :class="{
      'app-input--disabled': disabled,
      'app-input--readonly': readOnly,
      'app-input--focused': focused,
      'app-input--error': error,
    }"
    :value="modelValue"
    :type="inputType"
    :placeholder="placeholder"
    :placeholder-class="placeholderClass"
    :placeholder-style="placeholderStyle"
    :disabled="nativeDisabled"
    :maxlength="maxlength"
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
    readonly placeholder?: string
    readonly placeholderClass?: string
    readonly placeholderStyle?: string
    readonly disabled?: boolean
    readonly readOnly?: boolean
    readonly error?: boolean
    readonly maxlength?: number
    /** Native uni-input keyboard hint only. Never coerce its string value:
     * phone/IDNumber must preserve leading zeros; number/digit normalization
     * and safe precision checks belong to the Form Runtime. */
    readonly inputType?: 'text' | 'number' | 'digit'
  }>(),
  {
    modelValue: '',
    placeholder: '',
    placeholderClass: 'app-input__placeholder',
    disabled: false,
    readOnly: false,
    error: false,
    inputType: 'text',
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
  // uni installs its target listeners from a field-ref watcher. Let that
  // watcher finish before subscribing, so rejected/normalized input stays so.
  await nextTick()
  if (disposed) return
  if (delivery?.isCurrent(inputRoot.value)) return
  delivery?.dispose()
  delivery = bindH5InputDelivery(inputRoot.value, {
    initialValue: props.modelValue,
    isDisabled: () => nativeDisabled.value || disposed,
    emit: value => emit('update:modelValue', value),
  })
  nativeDeliveryAttached = delivery !== null
}
onMounted(refreshDelivery)
// Apple/WebKit uni-input replaces its inner input when disabled changes.
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
  // H5's delayed uni event is a second, stale-capable channel. Native delivery
  // owns this instance after attachment; MP/App keep their ordinary uni input.
  if (nativeDeliveryAttached || disposed || nativeDisabled.value) return
  const input = typeof event === 'object' && event !== null ? event as Record<string, unknown> : {}
  const detail = typeof input.detail === 'object' && input.detail !== null
    ? input.detail as Record<string, unknown>
    : {}
  emit('update:modelValue', typeof detail.value === 'string' ? detail.value : '')
}
</script>
