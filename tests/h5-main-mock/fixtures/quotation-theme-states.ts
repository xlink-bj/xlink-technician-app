import { createApp, h, nextTick } from 'vue'
import Q01EntryScreen from '../../../src/features/work-orders/quotation/Q01EntryScreen.vue'
import AppButton from '../../../src/shared/ui/AppButton.vue'
import { createQuotationGroup } from '../../../src/features/work-orders/quotation/model'

/** Actual business component with explicit readonly/error props. Synthetic
 * visual states only: no store grant, API, persistence or workflow action. */
export async function mountQuotationFieldState(mode: 'readonly' | 'error') {
  const host = document.createElement('div'); host.id = 'quotation-field-state'; document.body.append(host)
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '3000', overflow: 'auto', padding: '16px', boxSizing: 'border-box', background: 'var(--app-color-page)' })
  const group = { ...createQuotationGroup('theme-preview'), repairParts: mode === 'error' ? [] : ['roof'], partDescription: mode === 'error' ? '' : '屋面维修范围', maintainAreaNum: mode === 'error' ? '0' : '12.5' }
  const errors = mode === 'error' ? { repairParts: '请选择维修部位', partDescription: '请填写维修描述', maintainAreaNum: '请输入合法工程量' }
    : { repairParts: '', partDescription: '', maintainAreaNum: '' }
  const app = createApp({ render: () => h('div', [h(Q01EntryScreen, {
    group, options: [], canEdit: mode !== 'readonly', showDraftNotice: false, repairPartsLabel: '屋面', errors,
  }), h(AppButton, { disabled: true, 'data-testid': 'quotation-preview-disabled-action' }, () => '保存草稿')]) })
  app.mount(host); await nextTick()
  return () => { app.unmount(); host.remove() }
}
