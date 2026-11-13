import { computed, inject, onBeforeUnmount, provide, reactive, type InjectionKey } from 'vue'

type Report = (input: object, valid: boolean) => void
const inputValidityKey: InjectionKey<Report> = Symbol('form-input-validity')

/** Transient UI input state, never a business value, persisted draft or grant.
 * A native number may display '-' while its DOM value is empty. */
export function useFormInputValidityScope() {
  const invalid = reactive(new Set<object>())
  provide(inputValidityKey, (input, valid) => { if (valid) invalid.delete(input); else invalid.add(input) })
  return computed(() => invalid.size === 0)
}
export function useFormInputValidityReporter(): (valid: boolean) => void {
  const report = inject(inputValidityKey, null), input = {}
  onBeforeUnmount(() => report?.(input, true))
  return valid => report?.(input, valid)
}
