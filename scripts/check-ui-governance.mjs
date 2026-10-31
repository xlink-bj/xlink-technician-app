#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

async function read(relativePath) {
  return readFile(resolve(root, relativePath), 'utf8')
}

function fail(message) {
  throw new Error(`UI governance check failed: ${message}`)
}

const [
  packageJsonSource,
  standard,
  workflow,
  pages,
  dynamicFormContent,
  textarea,
  formActions,
  gallery,
  commercialButton,
  actionBar,
  workspace,
  commercialTokens,
] = await Promise.all([
  read('package.json'),
  read('docs/design-system/ACTION_WORKSPACE_UX_STANDARD.md'),
  read('docs/design-system/UI_DELIVERY_WORKFLOW.md'),
  read('src/pages.json'),
  read('src/features/work-orders/components/GenericDynamicFormActionContent.vue'),
  read('src/shared/ui/AppTextarea.vue'),
  read('src/shared/ui/ActionWorkspaceFormActions.vue'),
  read('tools/review/harness/design-system-gallery.vue'),
  read('src/shared/ui/AppButton.vue'),
  read('src/shared/ui/AppActionBar.vue'),
  read('src/shared/ui/ActionWorkspaceShell.vue'),
  read('src/shared/ui/design-system.scss'),
])

const packageJson = JSON.parse(packageJsonSource)

if (pages.includes('__review') || pages.includes('design-system')) {
  fail('production pages.json must not expose review/gallery routes')
}

if (dynamicFormContent.includes('dynamic-form-save') || dynamicFormContent.includes('保存表单')) {
  fail('dynamic form content must not own the Workspace-level business Save action')
}

if (!textarea.includes('<textarea') || !textarea.includes(':auto-height="autoHeight"')) {
  fail('AppTextarea must preserve the shared native multiline/auto-height contract')
}

if (
  !formActions.includes("saveState === 'saved'")
  || !formActions.includes('data-testid="dynamic-form-save"')
  || !formActions.includes(':disabled=')
) {
  fail('ActionWorkspaceFormActions must preserve a passive saved business-Save state')
}

const governedGalleryComponents = [
  'AppButton',
  'AppActionBar',
  'AppField',
  'AppInput',
  'AppTextarea',
  'AppSelector',
  'AppChoiceGroup',
  'AppMultiChoiceGroup',
  'AppCascadeSelector',
  'AppStatus',
  'AppInformationRow',
  'AppTreeMultiChoiceGroup',
  'ActionWorkspaceFormActions',
]

for (const component of governedGalleryComponents) {
  if (!gallery.includes(component)) {
    fail(`Design System Gallery must cover governed shared UI: ${component}`)
  }
}

for (const requiredRule of [
  'R1 Mobile UX Baseline',
  'Workspace actions always belong to the persistent bottom Action Bar',
  'SHARED_PATTERN',
  'BUSINESS_EXPERIENCE',
  'uni-app H5 Design System Review',
]) {
  if (!standard.includes(requiredRule)) {
    fail(`Action Workspace UX Standard is missing rule: ${requiredRule}`)
  }
}

for (const requiredWorkflowRule of [
  'Reuse before invention',
  'MP calibration trigger matrix',
  'second verified consumer',
  'check:ui-governance',
]) {
  if (!workflow.includes(requiredWorkflowRule)) {
    fail(`UI Delivery Workflow is missing rule: ${requiredWorkflowRule}`)
  }
}

if (packageJson.scripts?.['check:ui-governance'] !== 'node scripts/check-ui-governance.mjs') {
  fail('package.json must expose check:ui-governance')
}

if (!packageJson.scripts?.verify?.includes('check:ui-governance')) {
  fail('pnpm run verify must include UI governance')
}

// The XLink commercial-quality skill must be available offline to future
// agents; external repos/plugins are never a runtime requirement.
const [commercialSkill, pinnedRedesign, pinnedMinimalist, license, agentRules] = await Promise.all([
  read('skills/xlink-s2-commercial-taste/SKILL.md'),
  read('skills/taste-redesign/SKILL.md'),
  read('skills/taste-minimalist/SKILL.md'),
  read('skills/taste-license/LICENSE'),
  read('AGENTS.md'),
])
if (!commercialSkill.includes('a60a36dc2bb3bb77ccf17f2f62041f5ca8a458b9')
  || !commercialSkill.includes('COMMERCIAL_UI_ACCEPTED')
  || !pinnedRedesign.includes('Scan') || !pinnedRedesign.includes('Diagnose')
  || !pinnedMinimalist.includes('Premium Utilitarian Minimalism')
  || !license.includes('Copyright (c) 2026 Leonxlnx')
  || !agentRules.includes('skills/xlink-s2-commercial-taste/SKILL.md')
  || !workflow.includes('CODE_PASS and PNG-sheet generation are NOT commercial visual acceptance')) {
  fail('pinned Taste Skill and commercial UI Owner gate must remain available')
}

// DS-01: mechanically enforce the shared component API and its real Workspace
// integration. Visual checks run separately on compiled uni-app H5.
if (
  !commercialButton.includes("size?: 'compact' | 'regular' | 'large'")
  || !commercialButton.includes('if (props.disabled || props.loading) return')
  || !actionBar.includes('class="app-action-bar"')
  || !workspace.includes('<AppActionBar class="action-workspace-footer"')
  || !commercialTokens.includes('--app-button-height-regular')
  || !commercialTokens.includes('--app-action-bar-background')
  || !gallery.includes('ds01-button-matrix')
  || !gallery.includes('ds01-action-dual')
) {
  fail('DS-01 Button/ActionBar shared contracts, real Workspace integration or Gallery evidence missing')
}

// DS-01 no-regression migration budget. Existing business-side AppButton
// selectors predate DS-01 and are debt; freezes their exact source-local count.
// Newly added feature files start at zero. Reductions are encouraged.
// A business author may consume AppButton through props, not redraw its CSS.
const existingVisualOverrideBudget = {
  'src/features/work-orders/components/MockJourneyContextPanel.vue': 2,
  'src/features/work-orders/components/SurveyCompleteConfirmation.vue': 1,
  'src/features/work-orders/quotation/QuotationActionContent.vue': 12,
  'src/features/work-orders/quotation/QuotationActionWorkspace.vue': 1,
  'src/features/work-orders/quotation/QuotationOrderHub.vue': 2,
  'src/pages/work-orders/material-sku-mock-review.vue': 1,
  'src/pages/work-orders/signing-mock-review.vue': 2,
}

async function walkPresentationSources(dir) {
  const found = []
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name).replace(/\\/g, '/')
    if (entry.isDirectory()) found.push(...await walkPresentationSources(path))
    else if (/\.(vue|scss)$/.test(entry.name)) found.push(path)
  }
  return found
}

for (const file of [
  ...await walkPresentationSources('src/features'),
  ...await walkPresentationSources('src/pages'),
]) {
  const source = await read(file)
  const style = file.endsWith('.vue') ? source.slice(source.indexOf('<style') < 0 ? source.length : source.indexOf('<style')) : source
  const buttonOverrides = (style.match(/\.app-button\b/g) ?? []).length
  const permitted = existingVisualOverrideBudget[file] ?? 0
  if (buttonOverrides > permitted) {
    fail(`DS-01: ${file} defines ${buttonOverrides} AppButton style references (legacy allowance ${permitted}); reuse shared component props instead`)
  }
}

// DS-01.1: mature visual matrix and passive feedback may not disappear.
// Keep user-facing variant semantics centralized in the shared component.
const passiveFeedback = await read('src/shared/ui/AppActionFeedback.vue')
if (!commercialButton.includes("'tertiary' | 'ghost'") || !commercialButton.includes("shape?: 'rounded' | 'pill'")
  || !actionBar.includes("'split' | 'trailing'") || !gallery.includes('ds011-button-master')
  || !gallery.includes('ds011-action-split') || !gallery.includes('ds011-feedback-master')
  || !passiveFeedback.includes("state === 'success'") || !passiveFeedback.includes('aria-live')) {
  fail('DS-01.1 commercial hierarchy, composed Action Bar or passive status rendering missing')
}

// DS-02.B: each shared content primitive must have two real consumers;
 // no Workflow decision, business writes or inferred status in shared UI.
const [listView, detailView, recordCard, metaTag, sectionHeading] = await Promise.all([
  read('src/pages/work-orders/work-orders.vue'),
  read('src/pages/work-orders/detail.vue'),
  read('src/shared/ui/AppRecordCard.vue'),
  read('src/shared/ui/AppMetaTag.vue'),
  read('src/shared/ui/AppSectionHeading.vue'),
])
for (const consumer of [listView, detailView]) {
  for (const name of ['AppRecordCard', 'AppMetaTag', 'AppSectionHeading']) {
    if (!consumer.includes(`<${name}`)) fail(`DS-02.B: missing ${name} in actual list/detail consumer`)
  }
}
for (const [name, source] of [['RecordCard', recordCard], ['MetaTag', metaTag], ['SectionHeading', sectionHeading]]) {
  if (/fetch\(|axios|useWorkOrder|submitOrder|placeOrder|WorkflowRuntime|@tap=|@click=/.test(source)) {
    fail(`DS-02.B: ${name} may only present caller-supplied data`)
  }
}
if (!commercialTokens.includes('--app-content-card-radius') || !commercialTokens.includes('--app-tag-info-ink')) {
  fail('DS-02.B: semantic card/tag token contract missing')
}

// DS-03: quotation and signing must use the same presentation-only grammar.
// Business status, authorization, amounts and quotation mutations stay caller-owned.
const [quoteHub, signingRead, quotationFooter, amountValue] = await Promise.all([
  read('src/features/work-orders/quotation/QuotationOrderHub.vue'),
  read('src/pages/work-orders/signing-order-read.vue'),
  read('src/features/work-orders/quotation/QuotationActionWorkspace.vue'),
  read('src/shared/ui/AppAmountValue.vue'),
])
for (const [surface, source] of [['Q00', quoteHub], ['Signing', signingRead]]) {
  for (const component of ['AppRecordCard', 'AppSectionHeading', 'AppMetaTag', 'AppAmountValue']) {
    if (!source.includes(`<${component}`)) fail(`DS-03: ${surface} must reuse ${component}`)
  }
  if (!source.includes('app-transaction-page')) fail(`DS-03: ${surface} misses transaction surface contract`)
}
if (quoteHub.includes('--q-') || !quotationFooter.includes('<AppAmountValue')
  || !commercialTokens.includes('--app-transaction-card-padding')
  || !commercialTokens.includes('.app-amount-value--prominent')) {
  fail('DS-03: legacy Q00 page palette or common financial typography contract has regressed')
}
if (/useWorkOrder|Workflow|submitOrder|calculate|fetch|axios|@tap=|@click=/.test(amountValue)) {
  fail('DS-03: amount primitive must only display caller-provided, already-formatted values')
}

// DS-04: one-page Design-to-Code architecture is a permanent engineering gate.
// Never return the Q01 first-stage view to a 3000-line CSS/business component.
const [q01Entry, q01Controller, q01Spec] = await Promise.all([
  read('src/features/work-orders/quotation/Q01EntryScreen.vue'),
  read('src/features/work-orders/quotation/QuotationActionContent.vue'),
  read('docs/design-system/DS04_Q01_DESIGN_FIRST_SPEC.md'),
])
if (!q01Controller.includes('<Q01EntryScreen') || q01Controller.includes('Q01FirstStep.css')
  || !q01Entry.includes('defineProps') || !q01Entry.includes('defineEmits')
  || !q01Entry.includes('quotation-first-step-quantity')
  || !q01Spec.includes('390 × 844')) {
  fail('DS-04: independent real-Q01 design/presentation contract has regressed')
}
if (/useQuotationCompositionStore|useActionWorkspaceStore|useQuotationCatalogBrowserStore|fetch|axios|quotationEngine|submitOrder|WorkflowRuntime/.test(q01Entry)) {
  fail('DS-04: Q01 visual component may not own quotation stores, pricing, networking or workflow')
}

// DS-07: immutable old-page style baseline + canonical root-token ownership.
// Included in every existing pnpm run check:ui-governance, not optional manual work.
await import('./check-ui-style-ownership.mjs')

// DS-07.B: shared Craft must remain an opt-in component visual contract.
// These checks prevent silently moving presentation CSS back into pages or
// replacing real App* components with showcase-specific mock controls.
const [craftScope, craftStyles, craftGallery, craftFixture, craftStateSpec] = await Promise.all([
  read('src/shared/ui/AppVisualScope.vue'),
  read('src/shared/ui/component-craft.scss'),
  read('tools/review/harness/design-system-craft-matrix.vue'),
  read('tools/review/harness/design-system-gallery-fixtures.ts'),
  read('docs/design-system/DS07B_SHARED_COMPONENT_STATE_STANDARD.md'),
])
if (!craftScope.includes("mode === 'craft'") || !craftScope.includes("mode: 'standard'")
  || !commercialTokens.includes("component-craft.scss")
  || !craftFixture.includes('09-shared-craft-components')
  || !craftFixture.includes('09-shared-craft-state-matrix.png')
  || !craftStateSpec.includes('AppActionBar')) {
  fail('DS-07.B: shared opt-in Craft scope, canonical import, gallery or contract missing')
}
for (const component of [
  'AppVisualScope', 'AppButton', 'AppField', 'AppInput', 'AppTextarea',
  'AppSelector', 'AppStatus', 'AppRecordCard', 'AppActionBar',
]) {
  if (!craftGallery.includes(`<${component}`)) {
    fail(`DS-07.B: review matrix must use real shared ${component} component`)
  }
}
for (const selector of [
  '.app-button--primary', '.app-input--focused', '.app-textarea--error',
  '.app-selector--selected', '.app-status--strip', '.app-record-card',
  '.app-action-bar',
]) {
  if (!craftStyles.includes(selector)) fail('DS-07.B: missing shared state visual rule ' + selector)
}
if (/\bfetch\s*\(|axios|submitOrder|useWorkOrder|WorkflowRuntime|readContracts/.test(craftGallery)) {
  fail('DS-07.B: review-only shared components must remain independent of business data')
}

// DS-07.C2: the current-task visual contract has one authority only.
// New task chrome belongs to WorkOrderTaskFocus, never duplicate page CSS.
const detailFile = await read('src/pages/work-orders/detail.vue')
const detailCSS = detailFile.split('<style>')[1]?.split('</style>')[0] ?? ''
const taskPresentation = await read('src/features/work-orders/WorkOrderTaskFocus.vue')
if (detailCSS.includes('.current-task-card {')
  || detailCSS.includes('.primary-task-action {')
  || detailCSS.includes('.task-eyebrow--')
  || !detailFile.includes('<WorkOrderTaskFocus')
  || !taskPresentation.includes('task-focus-panel__action')) {
  fail('DS-07.C2: Work Order Detail must not reintroduce competing current-task visual styles')
}

// DS-07.C3: both active business pages compose the same reviewed state
// primitives; visual material cannot creep back into page-local CSS.
const listBusiness = await read('src/pages/work-orders/work-orders.vue')
const workOrderStateUI = await Promise.all([
  read('src/shared/ui/AppSearchBar.vue'),
  read('src/shared/ui/AppFeedbackState.vue'),
  read('src/shared/ui/AppWorkOrderSkeleton.vue'),
  read('src/shared/ui/AppWorkOrderEmptyState.vue'),
])
const feedbackGallery = await read('tools/review/harness/work-order-state-matrix.vue')
for (const [component, source] of [
  ['AppSearchBar', workOrderStateUI[0]],
  ['AppFeedbackState', workOrderStateUI[1]],
  ['AppWorkOrderSkeleton', workOrderStateUI[2]],
  ['AppWorkOrderEmptyState', workOrderStateUI[3]],
]) {
  if (!listBusiness.includes(`<${component}`)) fail('DS-07.C3: list must use shared '+component)
  if (!feedbackGallery.includes(`<${component}`)) fail('DS-07.C3: actual H5 Gallery missing '+component)
  if (['fetch(', 'axios', 'submitOrder', 'useWorkOrderListStore', 'WorkflowRuntime']
    .some(forbidden => source.includes(forbidden))) {
    fail('DS-07.C3: shared feedback/search components must remain presentation-only')
  }
}
for (const component of ['AppFeedbackState', 'AppWorkOrderSkeleton']) {
  if (!detailFile.includes(`<${component}`)) fail('DS-07.C3: detail must use shared '+component)
}
const listBusinessCSS = listBusiness.split('<style>')[1]?.split('</style>')[0] ?? ''
for (const stale of ['.search-band {', '.skeleton-list {', '.empty-state-card {',
  '.state-icon-error {', '.state-illustration-search {']) {
  if (listBusinessCSS.includes(stale)) fail('DS-07.C3: list reintroduced old component CSS '+stale)
}
for (const stale of ['.detail-skeleton {', '.skeleton-surface {', '.state-icon--retry {', '.state-title {']) {
  if (detailCSS.includes(stale)) fail('DS-07.C3: detail reintroduced old component CSS '+stale)
}
if (!listBusiness.includes('@search="submitSearch"')
  || !listBusiness.includes('@action="retry"')
  || !listBusiness.includes('@action="clearSearch"')
  || !listBusiness.includes('@action="refresh"')
  || !detailFile.includes('@action="retry"')) {
  fail('DS-07.C3: existing business-search, retry and refresh handlers must remain caller-owned')
}

console.log('UI governance check passed: shared UX contract, Gallery coverage, and delivery gates are intact')
