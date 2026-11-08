/** H5 only: subscribe on the same native target AFTER uni-input's listener.
 * uni stops propagation and normalizes numeric/maxlength values on that target,
 * then delays its public input event. Do not capture before its normalization. */
function nativeInput(root: unknown): HTMLInputElement | null {
  const element = (root as { $el?: Element } | null)?.$el ?? root as Element | null
  const input = element?.tagName === 'INPUT' ? element : element?.querySelector?.('input')
  return input?.tagName === 'INPUT' && 'value' in input
    && typeof input.addEventListener === 'function' ? input as HTMLInputElement : null
}

export function bindH5InputDelivery(root: unknown, options: {
  readonly initialValue: string
  readonly isDisabled: () => boolean
  readonly emit: (value: string) => void
}): { dispose(): void; syncModel(value: string): void; isCurrent(root: unknown): boolean } | null {
  const field = nativeInput(root)
  if (!field) return null
  const inputComponent = root as { $triggerInput?: (detail: { value: string }) => void } | null
  let disposed = false, composing = false, lastPublished = options.initialValue
  const publish = () => {
    if (disposed || options.isDisabled() || typeof field.value !== 'string') return
    if (field.value === lastPublished) return
    lastPublished = field.value
    options.emit(field.value)
  }
  const onInput = (event: Event) => {
    if (!composing && !(event as InputEvent).isComposing) publish()
  }
  const onStart = () => { composing = true }
  const onEnd = () => { composing = false; publish() }
  const onBlur = () => { if (composing) { composing = false; publish() } }
  const listeners = { input: onInput, compositionstart: onStart, compositionend: onEnd, blur: onBlur }
  for (const [name, listener] of Object.entries(listeners)) field.addEventListener(name, listener)
  return {
    isCurrent(root) { return !disposed && nativeInput(root) === field },
    syncModel(value) {
      if (disposed || value === lastPublished) return
      lastPublished = value
      // A trailing uni input cancels its debounced prop-to-state update. Use
      // uni-input's exposed state setter for external resets, never dispatch a
      // fake user input. This hook emits update:value, not the public input.
      field.value = value
      if (typeof inputComponent?.$triggerInput === 'function') inputComponent.$triggerInput({ value: field.value })
    },
    dispose() {
      disposed = true
      for (const [name, listener] of Object.entries(listeners)) field.removeEventListener(name, listener)
    },
  }
}
