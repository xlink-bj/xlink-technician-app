import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'

const tokenPath = new URL('../../src/shared/ui/design-system.scss', import.meta.url)
const matrixPath = new URL('../../docs/ux/UI_REFERENCE_MATRIX.md', import.meta.url)
const sharedUiPath = new URL('../../src/shared/ui/', import.meta.url)
const uiPath = (name: string) => new URL(`../../src/shared/ui/${name}`, import.meta.url)
const pagePath = (name: string) => new URL(`../../src/pages/work-orders/${name}`, import.meta.url)
const harnessPath = new URL('./LongActionContentHarness.vue', import.meta.url)
const actionWorkspaceFormActionsPath = uiPath('ActionWorkspaceFormActions.vue')
const genericDynamicFormPath = new URL('../../src/features/work-orders/components/GenericDynamicFormActionContent.vue', import.meta.url)
const surveyActionPath = new URL('../../src/features/work-orders/components/SurveyActionContent.vue', import.meta.url)
const formPresentationPath = new URL('../../src/features/work-orders/form-presentation.ts', import.meta.url)

describe('App UI Design System v0.2', () => {
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
      '--app-control-padding-x',
      '--app-control-padding-y',
      '--app-card-padding',
      '--app-field-gap',
      '--app-section-gap',
      '--app-control-gap',
      '--app-action-bar-padding-x',
      '--app-action-bar-gap',
      '--app-input-padding-x',
      '--app-input-padding-y',
      '--app-textarea-min-height',
      '--app-information-value-max-width',
    ]) {
      expect(tokens).toContain(token)
    }
    expect(tokens).toContain('--app-textarea-min-height: 160rpx;')
  })

  it('provides shared stateful primitives without Appointment business values', async () => {
    const [button, field, input, textarea, selector, choice, status, informationRow, loading, actions] = await Promise.all([
      readFile(uiPath('AppButton.vue'), 'utf8'),
      readFile(uiPath('AppField.vue'), 'utf8'),
      readFile(uiPath('AppInput.vue'), 'utf8'),
      readFile(uiPath('AppTextarea.vue'), 'utf8'),
      readFile(uiPath('AppSelector.vue'), 'utf8'),
      readFile(uiPath('AppChoiceGroup.vue'), 'utf8'),
      readFile(uiPath('AppStatus.vue'), 'utf8'),
      readFile(uiPath('AppInformationRow.vue'), 'utf8'),
      readFile(uiPath('AppLoadingState.vue'), 'utf8'),
      readFile(actionWorkspaceFormActionsPath, 'utf8'),
    ])
    expect(button).toContain("variant?: 'primary' | 'secondary' | 'text'")
    expect(button).toContain('loading?: boolean')
    expect(button).toContain("'app-button--loading': loading")
    expect(button).toContain("'app-button--pressed': pressed")
    expect(button).toContain(':disabled="disabled || loading"')
    expect(button).toContain(':aria-busy="loading"')
    expect(button).toContain('app-button__loading-slot--active')
    expect(button).toContain('app-button__label')
    expect(field).toContain('required?: boolean')
    expect(field).toContain('error?: string')
    expect(field).toContain('showOptional')
    expect(input).toContain('modelValue?: string')
    expect(input).toContain('readOnly?: boolean')
    expect(input).toContain(':disabled="nativeDisabled"')
    expect(input).toContain('props.disabled || props.readOnly')
    expect(input).toContain(':placeholder-class="placeholderClass"')
    expect(input).toContain(':placeholder-style="placeholderStyle"')
    expect(input).toContain('@focus="handleFocus"')
    expect(input).toContain('@blur="handleBlur"')
    expect(input).not.toContain(':readonly=')
    expect(input).toContain("'app-input--error': error")
    expect(textarea).toContain('class="app-textarea"')
    expect(textarea).toContain("'app-textarea--readonly': readOnly")
    expect(textarea).toContain(':disabled="nativeDisabled"')
    expect(textarea).toContain('props.disabled || props.readOnly')
    expect(textarea).toContain(':placeholder-class="placeholderClass"')
    expect(textarea).toContain(':placeholder-style="placeholderStyle"')
    expect(textarea).toContain('autoHeight?: boolean')
    expect(textarea).toContain(':auto-height="autoHeight"')
    expect(textarea).toContain('@focus="handleFocus"')
    expect(textarea).toContain('@blur="handleBlur"')
    expect(textarea).not.toContain(':readonly=')
    expect(selector).toContain('selected?: boolean')
    expect(selector).toContain('readOnly?: boolean')
    expect(selector).toContain('error?: boolean')
    expect(selector).toContain(':disabled="disabled || readOnly"')
    expect(selector).toContain("name=\"chevron-right\"")
    expect(choice).toContain('options: readonly AppChoiceOption[]')
    expect(choice).toContain("from './types'")
    expect(status).toContain("tone?: 'neutral' | 'success' | 'warning' | 'danger'")
    expect(status).toContain("variant?: 'text' | 'strip'")
    expect(status).toContain('icon?: AppIconName')
    expect(status).toContain('role="status"')
    expect(informationRow).toContain('name="label"')
    expect(informationRow).toContain('name="value"')
    expect(informationRow).toContain('name="trailing"')
    expect(loading).toContain("variant?: 'page' | 'workspace' | 'inline'")
    expect(loading).toContain('aria-busy="true"')
    expect(loading).toContain('app-loading-state--workspace')
    expect(loading).toContain('app-loading-state--inline')
    expect(loading).not.toContain('<text')
    expect(actions).toContain('data-testid="action-workspace-form-actions"')
    expect(actions).toContain('保存表单')
    expect(actions).toContain('保存中…')
    expect(actions).toContain('已保存')
    expect(actions).toContain('!canSubmit')

    for (const source of [button, field, input, textarea, selector, choice, status, informationRow, loading]) {
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
    expect(workspace).toContain('AppInput')
    expect(workspace).toContain('AppTextarea')
    expect(workspace).toContain('ActionWorkspaceFormActions')
    expect(workspace).toContain('<template #actions')
    expect(workspace).toContain('@save="workspace.saveDynamicForm"')
    expect(workspace).toContain(":submit-label=\"workspace.descriptor.formPurpose === 'survey' ? '完成勘查' : '完成'\"")
    expect(workspace).toContain('variant="workspace"')
    expect(workspace).not.toContain('正在准备操作内容</text>')
    expect(workspace).toContain('appChoiceOptionsFor')
    expect(workspace).toContain('AppIcon name="appointment"')
    expect(workspace).not.toContain('action-content-input')
    expect(workspace).not.toContain('action-content-note')
    expect(time).toContain('app-surface')
    expect(time).toContain('<AppButton')
    expect(time).toContain('AppIcon name="chevron-right"')
    expect(time).toContain('AppIcon v-if="selectedOptionKey === option.key"')
    expect(time).toContain('var(--app-control-gap)')
    expect(time).toContain('variant="workspace"')
    expect(time).not.toContain('正在准备时间选择</text>')
    expect(time).not.toContain('var(--app-action-bar-gap)')
    expect(confirmation).toContain('app-surface')
    expect(confirmation).toContain('<AppInformationRow')
    expect(confirmation).toContain('variant="secondary"')
    expect(confirmation).toContain('AppIcon name="complete"')
    expect(confirmation).toContain('variant="workspace"')
    expect(confirmation).not.toContain('正在准备预约信息</text>')
    expect(shell).toContain('AppStatus')
    expect(shell).toContain('AppButton')

    const tokens = await readFile(tokenPath, 'utf8')
    expect(tokens).toContain('.app-button__content')
    expect(tokens).toContain('.app-button__loading-slot--active {')
    expect(tokens).toContain('visibility: visible;')
    expect(tokens).toContain('--app-motion-loading-duration')
    expect(tokens).toContain('@keyframes app-loading-pulse')
    expect(tokens).toContain('@keyframes app-loading-spin')
    expect(tokens).toContain('@keyframes app-loading-slide')
    expect(tokens).not.toContain('::placeholder')
    expect(tokens).not.toContain('.app-input:focus')
    expect(tokens).not.toContain('.app-textarea:focus')
    expect(tokens).toContain('.app-input--focused')
    expect(tokens).toContain('.app-textarea--focused')
    expect(tokens).toContain('.app-choice-group { display: flex; gap: var(--app-control-gap); }')
    expect(tokens).not.toContain('.app-choice-group { display: flex; gap: var(--app-action-bar-gap); }')
    expect(confirmation).toContain('var(--app-action-bar-gap)')

    const allMigrated = [workspace, time, confirmation, shell].join('\n')
    for (const literal of ['#2878f2', '#f3f6fa', '#ffffff', '#e4eaf2', '#1d2b40', '#7b8aa1', '#18ae65', '#f06445']) {
      expect(allMigrated).not.toContain(literal)
    }
    for (const glyph of ['▣', '●', '≡', '✓', '⌄', '›']) {
      expect(allMigrated).not.toContain(glyph)
    }
  })

  it('keeps business Save in the persistent action bar and shares multiline field presentation', async () => {
    const [generic, survey, presentation] = await Promise.all([
      readFile(genericDynamicFormPath, 'utf8'),
      readFile(surveyActionPath, 'utf8'),
      readFile(formPresentationPath, 'utf8'),
    ])

    expect(generic).not.toContain('data-testid="dynamic-form-save"')
    expect(generic).not.toContain('saveDynamicForm()')
    expect(generic).toContain('isMultilineField(field)')
    expect(survey).not.toContain('saved-label')
    expect(presentation).toContain("'memo'")
    expect(presentation).toContain("'remarks'")
    expect(presentation).toContain("'description'")
  })

  it('records current external references and explicit XLink decisions', async () => {
    const matrix = await readFile(matrixPath, 'utf8')

    for (const evidence of [
      'WeUI Mini Program',
      'Vant Weapp',
      'Ant Design Mobile',
      '739eca530481e9dc9860cc298cb126b9890799cf',
      '7a7d43757ed19d3ad5e6bca69059e0b9ea565d0b',
      'eee5477f8d6221ced8298e3547eb03e0a037a615',
      'weui-btn_bottom-fixed',
      'button-default-height',
      '--app-control-height: 88rpx',
      '--app-control-padding-x',
      '--app-textarea-min-height',
      'third-party UI runtime dependency',
      'does not establish business labels',
    ]) {
      expect(matrix).toContain(evidence)
    }
  })

  it('keeps shared UI presentation-only and free of upward imports', async () => {
    const names = (await readdir(sharedUiPath)).filter((name) => /\.(ts|vue)$/.test(name))
    const sources = await Promise.all(names.map((name) => readFile(new URL(name, sharedUiPath), 'utf8')))

    expect(names).toContain('types.ts')
    for (const source of sources) {
      expect(source).not.toMatch(/from\s+['"]@runtimes\//)
      expect(source).not.toMatch(/from\s+['"]@features\//)
      expect(source).not.toMatch(/from\s+['"]@adapters\//)
    }
  })

  it('keeps the shared information row readable for mixed long values', async () => {
    const tokens = await readFile(tokenPath, 'utf8')
    const informationRow = await readFile(uiPath('AppInformationRow.vue'), 'utf8')

    expect(tokens).toContain('overflow-wrap: anywhere')
    expect(tokens).toContain('word-break: break-word')
    expect(tokens).not.toContain('word-break: break-all')
    expect(informationRow).toContain('name="value"')
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
