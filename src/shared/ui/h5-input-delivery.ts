/** H5 only: subscribe on the same native target AFTER uni-input's listener.
 * uni stops propagation and normalizes numeric/maxlength values on that target,
 * then delays its public input event. Do not capture before its normalization. */
type NativeTextField = HTMLInputElement | HTMLTextAreaElement
function nativeInput(root: unknown): NativeTextField | null {
  const element = (root as { $el?: Element } | null)?.$el ?? root as Element | null
  const isTextField = (node: Element | null | undefined) => node?.tagName === 'INPUT' || node?.tagName === 'TEXTAREA'
  const input = isTextField(element) ? element : element?.querySelector?.('input, textarea')
  return input && isTextField(input) && 'value' in input
    && typeof input.addEventListener === 'function' ? input as NativeTextField : null
}

export function bindH5InputDelivery(root: unknown, options: {
  readonly initialValue: string
  readonly isDisabled: () => boolean
  readonly emit: (value: string) => void
  /** Native incomplete-number state is UI-only; do not publish it as empty. */
  readonly onValidityChange?: (valid: boolean) => void
  /** Observe parent acceptance after Vue updates, including rejected no-op props. */
  readonly afterCommit?: () => void
}): { dispose(): void; syncModel(value: string): void; reconcileModel(value: string): void; isCurrent(root: unknown): boolean } | null {
  const field = nativeInput(root)
  if (!field) return null
  const inputComponent = root as { $triggerInput?: (detail: { value: string }) => void } | null
  let disposed = false, composing = false, lastPublished = options.initialValue
  let lastValidity: boolean | undefined
  const reportValidity = () => {
    const valid = !(field.tagName === 'INPUT' && (field as HTMLInputElement).type === 'number' && (field as HTMLInputElement).validity?.badInput)
    if (valid !== lastValidity) { lastValidity = valid; options.onValidityChange?.(valid) }
    return valid
  }
  reportValidity()
  const publish = () => {
    if (disposed || options.isDisabled() || typeof field.value !== 'string') return
    if (!reportValidity()) return
    if (field.value !== lastPublished) {
      lastPublished = field.value
      options.emit(field.value)
    }
    options.afterCommit?.()
  }
  const onInput = (event: Event) => {
    if (!composing && !(event as InputEvent).isComposing) publish()
  }
  const onStart = () => { composing = true }
  const onEnd = () => { composing = false; publish() }
  const onBlur = () => { if (composing) { composing = false; publish() } }
  const listeners = { input: onInput, compositionstart: onStart, compositionend: onEnd, blur: onBlur }
  for (const [name, listener] of Object.entries(listeners)) field.addEventListener(name, listener)
  const syncModel = (value: string) => {
    if (disposed || value === lastPublished) return
    lastPublished = value
    // A trailing uni input cancels its debounced prop-to-state update. Use
    // uni-input's exposed state setter for external resets, never dispatch a
    // fake user input. This hook emits update:value, not the public input.
    field.value = value
    reportValidity()
    if (typeof inputComponent?.$triggerInput === 'function') inputComponent.$triggerInput({ value: field.value })
  }
  return {
    isCurrent(root) { return !disposed && nativeInput(root) === field },
    syncModel,
    reconcileModel(value) { if (!composing) syncModel(value) },
    dispose() {
      disposed = true
      options.onValidityChange?.(true)
      for (const [name, listener] of Object.entries(listeners)) field.removeEventListener(name, listener)
    },
  }
}
