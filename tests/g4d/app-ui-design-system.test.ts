import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

const tokenPath = new URL('../../src/shared/ui/design-system.scss', import.meta.url)
const matrixPath = new URL('../../docs/ux/UI_REFERENCE_MATRIX.md', import.meta.url)
const uiPath = (name: string) => new URL(`../../src/shared/ui/${name}`, import.meta.url)
const pagePath = (name: string) => new URL(`../../src/pages/work-orders/${name}`, import.meta.url)
const harnessPath = new URL('./LongActionContentHarness.vue', import.meta.url)

describe('App UI Design System v0.1', () => {
  it('defines the semantic token contract used by migrated surfaces', async () => {
    const tokens = await readFile(tokenPath, 'utf8')

    for (const token of [
      '--app-color-primary',
      '--app-color-primary-soft',
      '--app-color-page',
      '--app-color-surface',
      '--app-color-border',
      '--app-color-text-primary',
      '--app-color-text-secondary',
      '--app-color-success',
      '--app-color-warning',
      '--app-color-danger',
      '--app-color-disabled',
      '--app-space-xs',
      '--app-space-sm',
      '--app-space-md',
      '--app-space-lg',
      '--app-space-xl',
      '--app-radius-control',
      '--app-radius-card',
      '--app-font-section-title',
      '--app-font-field-label',
      '--app-font-body',
      '--app-font-meta',
      '--app-font-status',
      '--app-page-gutter',
      '--app-control-height',
      '--app-touch-target',
      '--app-action-bar-padding',
    ]) {
      expect(tokens).toContain(token)
    }
  })

  it('provides shared stateful primitives without Appointment business values', async () => {
    const [button, field, selector, choice, status, informationRow] = await Promise.all([
      readFile(uiPath('AppButton.vue'), 'utf8'),
      readFile(uiPath('AppField.vue'), 'utf8'),
      readFile(uiPath('AppSelector.vue'), 'utf8'),
      readFile(uiPath('AppChoiceGroup.vue'), 'utf8'),
      readFile(uiPath('AppStatus.vue'), 'utf8'),
      readFile(uiPath('AppInformationRow.vue'), 'utf8'),
    ])

    expect(button).toContain("variant?: 'primary' | 'secondary' | 'text'")
    expect(button).toContain('loading?: boolean')
    expect(button).toContain("'app-button--loading': loading")
    expect(field).toContain('required?: boolean')
    expect(field).toContain('error?: string')
    expect(selector).toContain('selected?: boolean')
    expect(selector).toContain("name=\"chevron-right\"")
    expect(choice).toContain('options: readonly FormOption[]')
    expect(status).toContain("tone?: 'neutral' | 'success' | 'warning' | 'danger'")
    expect(informationRow).toContain('name="label"')
    expect(informationRow).toContain('name="value"')
    expect(informationRow).toContain('name="trailing"')

    for (const source of [button, field, selector, choice, status, informationRow]) {
      expect(source).not.toContain('需要上门')
      expect(source).not.toContain('预约')
      expect(source).not.toContain('datetime')
    }
  })

  it('migrates all Appointment surfaces to shared grammar and shared icons', async () => {
    const [workspace, time, confirmation, shell] = await Promise.all([
      readFile(pagePath('action-workspace.vue'), 'utf8'),
      readFile(pagePath('action-time.vue'), 'utf8'),
      readFile(pagePath('action-confirmation.vue'), 'utf8'),
      readFile(uiPath('ActionWorkspaceShell.vue'), 'utf8'),
    ])

    expect(workspace).toContain('app-surface')
    expect(workspace).toContain('AppField')
    expect(workspace).toContain('AppChoiceGroup')
    expect(workspace).toContain('AppSelector')
    expect(workspace).toContain('AppIcon name="appointment"')
    expect(time).toContain('app-surface')
    expect(time).toContain('<AppButton')
    expect(time).toContain('AppIcon name="chevron-right"')
    expect(time).toContain('AppIcon v-if="selectedOptionKey === option.key"')
    expect(confirmation).toContain('app-surface')
    expect(confirmation).toContain('<AppInformationRow')
    expect(confirmation).toContain('variant="secondary"')
    expect(confirmation).toContain('AppIcon name="complete"')
    expect(shell).toContain('AppStatus')
    expect(shell).toContain('AppButton')

    const allMigrated = [workspace, time, confirmation, shell].join('\n')
    for (const literal of ['#2878f2', '#f3f6fa', '#ffffff', '#e4eaf2', '#1d2b40', '#7b8aa1', '#18ae65', '#f06445']) {
      expect(allMigrated).not.toContain(literal)
    }
    for (const glyph of ['▣', '●', '≡', '✓', '⌄', '›']) {
      expect(allMigrated).not.toContain(glyph)
    }
  })

  it('records current external references and explicit XLink decisions', async () => {
    const matrix = await readFile(matrixPath, 'utf8')

    for (const evidence of [
      'WeUI Mini Program',
      'Vant Weapp',
      'Ant Design Mobile',
      'weui-btn_bottom-fixed',
      'button-default-height',
      '--app-control-height: 88rpx',
      'third-party UI runtime dependency',
      'does not establish business labels',
    ]) {
      expect(matrix).toContain(evidence)
    }
  })

  it('keeps the shared action footer outside the scroll region', async () => {
    const shell = await readFile(uiPath('ActionWorkspaceShell.vue'), 'utf8')
    const scrollEnd = shell.indexOf('</scroll-view>')
    const footerStart = shell.indexOf('class="action-workspace-footer"')

    expect(scrollEnd).toBeGreaterThanOrEqual(0)
    expect(footerStart).toBeGreaterThan(scrollEnd)
    expect(shell).toContain('safe-area-inset-bottom')
    expect(shell).toContain('flex-shrink: 0')
    expect(shell).not.toContain('position: sticky')
  })

  it('keeps a materially long Action Content harness test-only and Shell-owned', async () => {
    const [harness, fixture] = await Promise.all([
      readFile(harnessPath, 'utf8'),
      readFile(new URL('./long-action-content.fixture.ts', import.meta.url), 'utf8'),
    ])

    expect(harness).toContain('ActionWorkspaceShell')
    expect(harness).toContain('longActionContentFixture')
    expect(harness).toContain('draft-status="saved_local"')
    expect(harness).toContain('long-action-content-harness__item')
    expect(fixture).toContain('Array.from({ length: 36')
    expect(harness).not.toContain('pages.json')
    expect(harness).not.toContain('uni.navigateTo')
  })
})
