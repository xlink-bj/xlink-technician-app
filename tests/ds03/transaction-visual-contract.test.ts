import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

const quote = source('src/features/work-orders/quotation/QuotationOrderHub.vue')
const signing = source('src/pages/work-orders/signing-order-read.vue')
const footer = source('src/features/work-orders/quotation/QuotationActionWorkspace.vue')
const tokens = source('src/shared/ui/design-system.scss')
const amount = source('src/shared/ui/AppAmountValue.vue')

describe('DS-03 transaction visual system', () => {
  it('has one shared, presentation-only amount typography contract', () => {
    expect(amount).toContain('readonly value: string')
    expect(amount).toContain('{{ value }}')
    expect(amount).not.toMatch(/useWorkOrder|calculate|fetch\\(|submitOrder|@tap|@click/)
    expect(tokens).toContain('--app-transaction-money-regular-size')
    expect(tokens).toContain('--app-transaction-money-prominent-size')
  })

  it('real quotation and signing reuse shared card, section and descriptive tags', () => {
    for (const page of [quote, signing]) {
      expect(page).toContain('app-transaction-page')
      expect(page).toContain('<AppRecordCard')
      expect(page).toContain('<AppSectionHeading')
      expect(page).toContain('<AppMetaTag')
      expect(page).toContain('<AppAmountValue')
    }
    expect(quote).not.toContain('--q-')
    expect(quote).toContain('data-testid="quotation-hub-order-${order.id}"')
    expect(signing).toContain('data-testid="signing-order-read-verified"')
    expect(signing).toContain('data-testid="signing-read-reconciled-status"')
  })

  it('keeps source-driven amounts, local-draft caution, signing read-only gates and disabled actions', () => {
    expect(quote).toContain('money(order.totalPrice)')
    expect(quote).toContain('amount === undefined || !Number.isFinite(amount)')
    expect(quote).toContain('hasLocalDraft')
    expect(footer).toContain(':value="amountPresentation.value"')
    expect(footer).toContain('quotation-production-read-only')
    expect(signing).toContain('review.snapshot.review.order.totalPrice.toFixed(2)')
    expect(signing).toContain('signing-order-read-contract-disabled')
    expect(signing).toContain('signing-order-read-sign-disabled')
    expect(signing).toContain('signing-order-read-no-write')
  })
})
