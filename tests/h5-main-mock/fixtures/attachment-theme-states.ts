import { createApp, h, nextTick, ref } from 'vue'
import R1NormalFileField from '../../../src/features/work-orders/R1NormalFileField.vue'
import OrderMediaField from '../../../src/features/work-orders/quotation/OrderMediaField.vue'
import type { OrderMediaSession } from '../../../src/features/work-orders/quotation/order-field-session'
import type { OrderMediaValue } from '../../../src/features/work-orders/quotation/order-extfield-wire'

let disposePrevious: (() => void) | undefined
/** Actual components, presentation props only. No API, store grants or persistence. */
export async function mountAttachmentState(mode: 'empty' | 'uploaded' | 'failed' | 'readonly') {
  disposePrevious?.(); disposePrevious = undefined
  const host = document.createElement('div'); host.id = 'attachment-theme-state'; document.body.append(host)
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '3000', overflow: 'auto', padding: '16px', boxSizing: 'border-box', background: 'var(--app-color-page)' })
  const values = ref<readonly OrderMediaValue[]>(mode === 'uploaded' || mode === 'readonly' ? [{ url: 'https://attachment.example.invalid/photo.png' }] : [])
  const media: OrderMediaSession = {
    list: async () => { if (mode === 'failed') throw new Error('Unavailable'); return [] },
    pick: async () => {}, retry: async () => {}, discard: async () => {},
    finalize: async () => false, verify: async () => false,
  }
  const names = ['屋面排水节点与墙根接缝现场勘查照片及详细位置说明.jpg', '第二处维修范围与周边设施现场核对记录照片.jpg']
  const app = createApp({ render: () => h('div', [
    h('h2', { style: 'font-size:var(--app-font-body);line-height:1.5;color:var(--app-color-text-primary)' }, '已保存附件'),
    h(R1NormalFileField, { field: { fieldId: 'photos', valueKey: 'photos' }, commercial: true, retained: true,
      modelValue: names.map((name, i) => ({ name, extname: 'jpg', url: `https://untrusted.example.invalid/photo-${i}.jpg` })) }),
    h('h2', { style: 'font-size:var(--app-font-body);line-height:1.5;color:var(--app-color-text-primary)' }, '订单附件'),
    h(OrderMediaField, { fieldId: 'theme-attachment', valueKey: 'attachment', modelValue: values.value,
      media, disabled: mode === 'readonly', 'onUpdate:modelValue': (value: readonly OrderMediaValue[]) => { values.value = value } }),
  ]) })
  app.mount(host); await nextTick(); await nextTick()
  disposePrevious = () => { app.unmount(); host.remove() }
  return disposePrevious
}
