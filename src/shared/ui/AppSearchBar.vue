<template>
  <!-- All appearance owned here. Search semantics & data remain caller-owned. -->
  <view class="search-band" data-testid="app-search-bar">
    <view class="search-input-shell">
      <AppIcon class="search-icon" name="search" :size="17" color="#71829e" aria-hidden="true" />
      <input
        ref="inputRoot"
        :value="modelValue"
        class="search-input"
        :placeholder="placeholder"
        placeholder-class="search-placeholder"
        confirm-type="search"
        :disabled="disabled"
        @input="handleInput"
        @confirm="handleConfirm"
      />
    </view>
    <button class="search-button" :class="{ 'search-button--disabled': disabled }"
      :disabled="disabled" @tap="handleSearch">{{ actionLabel }}</button>
  </view>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
// #ifdef H5
import { bindH5InputDelivery } from './h5-input-delivery'
// #endif

const props = withDefaults(defineProps<{
  readonly modelValue: string
  readonly placeholder?: string
  readonly actionLabel?: string
  readonly disabled?: boolean
}>(), { placeholder: '搜索', actionLabel: '搜索', disabled: false })
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'search'): void
}>()
const inputRoot = ref<unknown>(null)
let nativeDeliveryAttached = false
let disposed = false

// #ifdef H5
let delivery: ReturnType<typeof bindH5InputDelivery> = null
let disposeImeGuard: (() => void) | undefined
function bindImeConfirmGuard(root: unknown): (() => void) | undefined {
  const element = (root as { $el?: Element } | null)?.$el ?? root as Element | null
  const field = element?.tagName === 'INPUT' ? element as HTMLInputElement
    : element?.querySelector?.('input')
  if (!field) return
  let composing = false
  const start = () => { composing = true }
  const end = () => { composing = false }
  const keyup = (event: KeyboardEvent) => {
    // uni confirms and blurs on every Enter, and its custom event drops the
    // original isComposing flag. Intercept before that target listener, without
    // preventDefault: selecting an IME candidate must remain browser-owned.
    if (event.key === 'Enter' && (composing || event.isComposing)) event.stopImmediatePropagation()
  }
  const capture = { capture: true }
  field.addEventListener('compositionstart', start)
  field.addEventListener('compositionend', end)
  field.addEventListener('blur', end)
  field.addEventListener('keyup', keyup, capture)
  return () => {
    field.removeEventListener('compositionstart', start)
    field.removeEventListener('compositionend', end)
    field.removeEventListener('blur', end)
    field.removeEventListener('keyup', keyup, capture)
  }
}
async function refreshDelivery() {
  // Subscribe after uni normalization, including Apple disabled-node replacement.
  await nextTick()
  if (disposed || delivery?.isCurrent(inputRoot.value)) return
  disposeImeGuard?.()
  delivery?.dispose()
  delivery = bindH5InputDelivery(inputRoot.value, {
    initialValue: props.modelValue,
    isDisabled: () => props.disabled || disposed,
    emit: value => emit('update:modelValue', value),
  })
  nativeDeliveryAttached = delivery !== null
  disposeImeGuard = nativeDeliveryAttached ? bindImeConfirmGuard(inputRoot.value) : undefined
}
onMounted(refreshDelivery)
onUpdated(refreshDelivery)
watch(() => props.modelValue, value => delivery?.syncModel(value))
// #endif
onBeforeUnmount(() => {
  disposed = true
  // #ifdef H5
  disposeImeGuard?.()
  delivery?.dispose()
  // #endif
})

function handleInput(event: Event): void {
  // Once bound, H5's delayed public input must not overwrite newer native text.
  // MP/App retain ordinary uni detail delivery and its string/empty semantics.
  if (nativeDeliveryAttached || disposed || props.disabled) return
  const native = event as Event & { detail?: { value?: string } }
  const value = native.detail?.value ?? (event.target as HTMLInputElement | null)?.value
  if (typeof value === 'string') emit('update:modelValue', value)
}

function handleConfirm(event: Event): void {
  if (disposed || props.disabled) return
  // MP/App confirm may carry the final value before the last input callback.
  // H5 already delivered the committed native input, without publishing IME preedit.
  handleInput(event)
  handleSearch()
}

function handleSearch(): void {
  if (!disposed && !props.disabled) emit('search')
}
</script>
<style scoped>
.search-band {
  align-items: center;
  box-sizing: border-box;
  display: flex;
  gap: 16rpx;
  margin: 12rpx 8rpx 0;
  padding: 0;
  width: auto;
}

.search-input-shell {
  align-items: center;
  background: #ffffff;
  border: 1rpx solid #e1e7f0;
  border-radius: 24rpx;
  box-sizing: border-box;
  display: flex;
  flex: 1;
  gap: 12rpx;
  height: 88rpx;
  min-width: 0;
  padding: 0 22rpx;
}

.search-icon {
  color: #71819b;
  flex: 0 0 auto;
  font-size: 32rpx;
  line-height: 1;
  transform: rotate(-18deg);
}

.search-input {
  color: #17243a;
  flex: 1;
  font-size: 26rpx;
  height: 88rpx;
  line-height: 88rpx;
  min-width: 0;
}

.search-placeholder {
  color: #98a6ba;
}

.search-button {
  background: #2878f2;
  border-radius: 24rpx;
  color: #ffffff;
  flex: 0 0 128rpx;
  font-size: 28rpx;
  font-weight: 800;
  height: 88rpx;
  line-height: 88rpx;
  margin: 0;
  padding: 0;
}

.search-button--disabled {
  opacity: 0.58;
}
</style>
