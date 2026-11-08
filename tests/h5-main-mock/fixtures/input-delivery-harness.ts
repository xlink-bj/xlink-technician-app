import { createApp, h, nextTick, ref } from 'vue'
import AppInput from '../../../src/shared/ui/AppInput.vue'
import AppTextarea from '../../../src/shared/ui/AppTextarea.vue'

/** Browser-only component test fixture, never imported by application source. */
export function mountInputDeliveryHarness(type: 'text' | 'number' | 'digit' | 'textarea' = 'text', maxlength = 140) {
  const host = document.createElement('div')
  host.id = 'input-delivery-component'
  document.body.append(host)
  const model = ref(''), disabled = ref(false), readOnly = ref(false)
  const component = ref<{ $refs: { inputRoot?: { $triggerInput?: unknown } } } | null>(null)
  const events: string[] = []
  const app = createApp({ setup: () => () => h(type === 'textarea' ? AppTextarea : AppInput, {
    ref: component,
    modelValue: model.value, ...(type === 'textarea' ? {} : { inputType: type }), maxlength, disabled: disabled.value, readOnly: readOnly.value,
    'onUpdate:modelValue': (value: string) => { model.value = value; events.push(value) },
  }) })
  app.mount(host)
  return {
    value: () => model.value,
    events: () => [...events],
    hasNativeStateSetter: () => typeof component.value?.$refs.inputRoot?.$triggerInput === 'function',
    setModel: async (value: string) => { model.value = value; await nextTick() },
    lock: async (kind: 'disabled' | 'readOnly') => {
      disabled.value = kind === 'disabled'
      readOnly.value = kind === 'readOnly'
      await nextTick()
    },
    unlock: async () => { disabled.value = false; readOnly.value = false; await nextTick(); await nextTick() },
    unmount: () => { app.unmount(); host.remove() },
  }
}
