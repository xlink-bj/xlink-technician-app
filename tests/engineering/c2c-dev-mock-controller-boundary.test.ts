import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const text = (path: string) => readFileSync(path, 'utf8')
const special = text('src/features/work-orders/R1SpecialMockTransactionPanel.vue')
const quote = text('src/features/work-orders/quotation/AStageMockQuoteOrderPanel.vue')
const detail = text('src/pages/work-orders/detail.vue')
const page = text('src/pages/work-orders/action-workspace.vue')
describe('C2-C1 synthetic transaction controller dependency direction', () => {
  it('prevents feature presentation from importing app runtime adapters', () => {
    expect(special).not.toMatch(/from\s+['"]@app\//)
    expect(quote).not.toMatch(/from\s+['"]@app\//)
    expect(special).toContain('props.createController({')
    expect(quote).toContain('props.createController(actor)')
  })
  it('composes exact same synthetic controller at both existing page boundaries', () => {
    expect(detail).toContain(':create-controller="createAStageSpecialControllerForUi"')
    expect(detail).toContain('createAStageSpecialMockController({ ...options, storage: createDefaultStoragePort() })')
    expect(page).toContain(':create-controller="createAStageMockQuoteOrderControllerForUi"')
    expect(page).toContain('createAStageMockQuoteOrderController({ getActor, storage: createDefaultStoragePort() })')
  })
})
