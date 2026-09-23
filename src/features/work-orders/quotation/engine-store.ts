import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type { CodeOptionRead, QuotationCatalogContext, QuotationCatalogReadPort } from '@shared/ports'
import type { QuotationDraft } from './model'
import { evaluateQuotationDraft, type QuotationEngineResult } from './engine'
import { validateQuotationDraft } from './validation'

export const useQuotationEngineStore = defineStore('quotationEngine', () => {
  const state = ref<'idle' | 'loading' | 'ready' | 'blocked'>('idle')
  const result = ref<QuotationEngineResult | null>(null)
  const issueMessages = computed(() => result.value?.issues.map((issue) => issue.message) ?? [])
  let generation = 0

  function clear(): void {
    generation += 1
    state.value = 'idle'
    result.value = null
  }

  async function evaluate(input: {
    readonly draft: QuotationDraft
    readonly catalogContext: QuotationCatalogContext | null | undefined
    readonly catalogRead: QuotationCatalogReadPort | null | undefined
    readonly serviceAppointmentNum?: string
    readonly repairPartOptions?: readonly CodeOptionRead[]
  }): Promise<QuotationEngineResult | null> {
    const current = ++generation
    state.value = 'loading'
    try {
      const next = await evaluateQuotationDraft(input)
      if (current !== generation) return null
      result.value = next
      state.value = next.state
      return next
    } catch {
      if (current !== generation) return null
      result.value = {
        state: 'blocked',
        draftVersion: input.draft.draftVersion,
        validation: validateQuotationDraft(input.draft),
        issues: [{
          phase: 'hydration',
          code: 'engine.unexpected_failure',
          message: '报价数据核对失败，未生成本地报价载荷。',
        }],
      }
      state.value = 'blocked'
      return result.value
    }
  }

  return { state, result, issueMessages, clear, evaluate }
})
