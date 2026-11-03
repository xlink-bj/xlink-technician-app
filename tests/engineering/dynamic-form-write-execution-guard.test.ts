import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('R1 form-node write authorization is independent of visible input controls', () => {
  it('refuses single-FormData Save for disabled execution before draft flush or mutation checkpoints', () => {
    const source = readFileSync(new URL('../../src/features/work-orders/action-workspace.ts', import.meta.url), 'utf8')
    const section = source.slice(source.indexOf('async function saveDynamicForm():'), source.indexOf('async function completeDynamicForm():'))
    const forbidden = section.indexOf("currentDescriptor.execution !== 'enabled'")
    expect(forbidden).toBeGreaterThan(0)
    expect(forbidden).toBeLessThan(section.indexOf('const validation = normalizeDynamicForm(form)'))
    expect(forbidden).toBeLessThan(section.indexOf('await flushDraft()'))
    expect(forbidden).toBeLessThan(section.indexOf('mutationCheckpointsFor(currentDescriptor)'))
  })

  it('disables Save in the visible action bar for source-verified R1 forms/repeat nodes', () => {
    const ui = readFileSync(new URL('../../src/shared/ui/ActionWorkspaceFormActions.vue', import.meta.url), 'utf8')
    const page = readFileSync(new URL('../../src/pages/work-orders/action-workspace.vue', import.meta.url), 'utf8')
    expect(ui).toContain(':disabled="!canSave || saveState')
    expect(page).toContain(':can-save="workspace.descriptor.execution === \'enabled\'"')
    expect(page).toContain('@save="workspace.saveDynamicForm"')
  })

  it('keeps a synthetic local-preview QA test honest about FormData authority', () => {
    const test = readFileSync(new URL('../h5-main-mock/dynamic-form-scalar-closure.spec.ts', import.meta.url), 'utf8')
    expect(test).toContain("await expect(save).toHaveAttribute('aria-disabled', 'true')")
    expect(test).not.toContain("toContainText('已保存')")
    expect(test).not.toContain('await save.click()')
  })
})
