#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (path) => readFile(resolve(root, path), 'utf8')
const fail = (message) => { throw new Error(`G4-F synthetic ExtField review boundary failed: ${message}`) }

const [pages, workspace, content, panel, feature, reviewMain, reviewScenarios, reviewPage, codec, packageSource, unitTests, browserTests, docs] = await Promise.all([
  read('src/pages.json'),
  read('src/features/work-orders/quotation/QuotationActionWorkspace.vue'),
  read('src/features/work-orders/quotation/QuotationActionContent.vue'),
  read('src/features/work-orders/quotation/SyntheticOrderExtFieldReviewPanel.vue'),
  read('src/features/work-orders/quotation/synthetic-extfield-review.ts'),
  read('review-app-g4f/main.ts'),
  read('review-app-g4f/quotation-scenarios.ts'),
  read('review-app-g4f/pages/quotation/index.vue'),
  read('src/features/work-orders/quotation/draft-codec.ts'),
  read('package.json'),
  read('tests/g4f/synthetic-order-extfield-review.test.ts'),
  read('tests/h5-review/g4f-quotation-synthetic-fields.spec.ts'),
  read('docs/verification/G4F_SYNTHETIC_DYNAMIC_FORM_UX.md'),
])
const packageJson = JSON.parse(packageSource)

if (pages.includes('__review') || pages.includes('g4f')) fail('production pages must not expose the review route')
if (workspace.includes('SyntheticOrderExtFieldReviewPanel.vue') || content.includes('SyntheticOrderExtFieldReviewPanel.vue')) {
  fail('production Action Workspace must not statically import the review panel')
}
if (!workspace.includes('import.meta.env.DEV')
  || !workspace.includes('modeBlocked: productionReadOnly || productReviewOnly.value || syntheticReviewEnabled.value')
  || !workspace.includes(':can-submit="canOpenSubmit"')
  || !workspace.includes('v-if="canOpenSubmit && quotationConfirmOpen"')
  || !workspace.includes('if (!quotationConfirmOpen.value || !canOpenSubmit.value) return')
  || !workspace.includes('if (!canOpenSubmit.value) return')
  || !workspace.includes('watch(() => composition.draft?.draftVersion')
  || !workspace.includes("evaluateQuotationSubmitGuard")) {
  fail('review activation must be development-only and suppress both submit affordances, confirmation and command handlers')
}
if (!content.includes('<slot name="synthetic-review-panel"') || !content.includes('import.meta.env.DEV')
  || !content.includes('syntheticReviewValidateSelection') || !content.includes('syntheticReviewFocusFirstError')) {
  fail('synthetic integration must use the actual first repair-part step and require its explicit dev-gated validation bridge')
}
if (!reviewPage.includes('SyntheticOrderExtFieldReviewPanel.vue') || !reviewPage.includes("scenario === SYNTHETIC_ORDER_EXTFIELD_SCENARIO")
  || !reviewPage.includes('SYNTHETIC_ORDER_EXTFIELD_FIXTURE_VERSION')) {
  fail('only the development review route may mount the panel with scenario/fixture-scoped identity')
}
if (!reviewScenarios.includes('createG4fSyntheticReviewStorage') || !reviewScenarios.includes('g4f-synthetic-review:v1:')
  || !reviewScenarios.includes('window.localStorage')) {
  fail('synthetic draft storage must use its own browser-local namespace')
}
if (!reviewMain.includes("scenario === 'dynamic-fields'") || !reviewMain.includes('reviewBlockedCommandCalls')
  || !reviewMain.includes('workflow command is disabled in synthetic-field review')
  || !reviewMain.includes('order command is disabled in synthetic-field review')) {
  fail('dynamic-fields review scenario must inject a fail-closed order/workflow command port')
}
// Synthetic ExtField review must not mutate the quotation draft schema itself.
// V4 adds a separate R1 local-only SKU intent, while the v3 Package record
// stays decodable and all synthetic-command isolation checks remain mandatory.
if (!/QUOTATION_DRAFT_SCHEMA_VERSION = (3|4)/.test(codec)
  || (codec.includes('QUOTATION_DRAFT_SCHEMA_VERSION = 4') && !codec.includes('values.schemaVersion !== 3'))) {
  fail('synthetic preview must retain v3 Package quotation draft readback after v4 local-only extension')
}
if (!feature.includes('createOrderExtFieldEffectivePlan') || !feature.includes('normalizeSubmission')
  || !feature.includes('normalizeFieldValue') || !feature.includes('SYNTHETIC_ORDER_EXTFIELD_FIXTURE_VERSION')) {
  fail('synthetic UX must exercise the accepted mapper and shared Dynamic Form Runtime')
}
if (/fetch\s*\(|axios|biz\/extField\/query|basic\/order\/upsert|workflow\/process|uploadFile/.test(feature)) {
  fail('synthetic fixture/repository must not issue network, order, workflow, or media commands')
}
if (!unitTests.includes('identity-mismatched records') || !unitTests.includes('__proto__')
  || !unitTests.includes('late in-flight write scoped') || !unitTests.includes('pending debounced write')
  || !browserTests.includes('corrupt synthetic localStorage')
  || !browserTests.includes('expectNoBusinessCommands')) {
  fail('identity, corrupt record, race, H5 integration, and zero-command regressions are required')
}
if (!docs.includes('MOCK_PRODUCT_REVIEW') || !docs.includes('H5_VISUAL_PROXY')
  || !docs.includes('QuotationDraft` V3') || !docs.includes('No production/Beta API')) {
  fail('verification evidence must state synthetic provenance and non-production limitations')
}
for (const script of ['test:uni-h5-g4f-review', 'check:g4f-synthetic-extfield-review']) {
  if (!packageJson.scripts?.[script]) fail(`missing package script: ${script}`)
}
if (!packageJson.scripts.verify.includes('check:g4f-synthetic-extfield-review')) fail('normal verify must include this review isolation guard')

console.log('G4-F synthetic ExtField review boundary passed: actual workspace integration is dev-only, identity-scoped, local-only, and business-command fail-closed')
