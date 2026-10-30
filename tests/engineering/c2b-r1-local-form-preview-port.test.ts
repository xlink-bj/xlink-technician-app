import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const bootstrap = readFileSync('src/app/bootstrap.ts', 'utf8')
const store = readFileSync('src/features/work-orders/r1-local-form-drafts.ts', 'utf8')
const component = readFileSync('src/features/work-orders/R1NodeFormsOverview.vue', 'utf8')

describe('C2-B — App-owned DEV Mock policy at the R1 local form boundary', () => {
  it('prevents feature-to-app runtime imports for R1 local form previews', () => {
    expect(store).not.toMatch(/from\s+['"]@app\//)
    expect(component).not.toMatch(/from\s+['"]@app\//)
    expect(component).toContain('draftStore.isSyntheticMockDataModeEnabled()')
  })

  it('keeps mode authority in App composition and fail-closed feature guards', () => {
    expect(bootstrap).toContain('isSyntheticMockDataModeEnabled: () => isBusinessMockDeveloperModeAvailable()')
    expect(bootstrap).toContain("isBusinessMockMode() === 'data'")
    expect(store).toContain('if(import.meta.env.DEV!==true || !syntheticMockDataModeProbe)return false')
    expect(store).toContain('trustedDefaultMockReader')
    expect(store).toContain("current.workOrderId.startsWith('mock-')")
    expect(store).toContain('allowsR1LocalDefinitionPreview({')
  })
})
