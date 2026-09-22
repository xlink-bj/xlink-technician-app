#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (path) => readFile(resolve(root, path), 'utf8')
const fail = (message) => { throw new Error(`G4-F Phase 1B check failed: ${message}`) }

const [pages, workspace, component, model, codec, catalog, genericForm, commandPort, reviewMain, reviewScenarios, reviewPage, playwrightConfig, viteConfig, browserTests, unitTests, packageSource] = await Promise.all([
  read('src/pages.json'),
  read('src/features/work-orders/action-workspace.ts'),
  read('src/features/work-orders/quotation/QuotationActionContent.vue'),
  read('src/features/work-orders/quotation/model.ts'),
  read('src/features/work-orders/quotation/draft-codec.ts'),
  read('src/features/work-orders/quotation/catalog.ts'),
  read('src/features/work-orders/dynamic-form-action.ts'),
  read('src/shared/ports/commands.ts'),
  read('review-app-g4f/main.ts'),
  read('review-app-g4f/quotation-scenarios.ts'),
  read('review-app-g4f/pages/quotation/index.vue'),
  read('playwright.uni-h5-g4f-review.config.ts'),
  read('vite.uni-h5-g4f-review.config.ts'),
  read('tests/h5-review/g4f-quotation-phase1b.spec.ts'),
  read('tests/g4f/quotation-composition.test.ts'),
  read('package.json'),
])
const packageJson = JSON.parse(packageSource)

if (pages.includes('__review') || pages.includes('g4f-phase1b')) fail('production pages.json must not expose the review route')
if (!workspace.includes('useQuotationCompositionStore') || !workspace.includes('quotationComposition.initialize') || !workspace.includes('quotationComposition.flushDraft')) {
  fail('Action Workspace must orchestrate quotation-local restore and flush')
}
if (!codec.includes('actionDraftIdentityMatches') || !codec.includes("expectedIdentity.actionIntent !== 'place_order'") || !codec.includes("expectedIdentity.contentKind !== 'quotation'")) {
  fail('quotation codec must enforce action/work-order/node identity and local schema')
}
if (!model.includes('workOrderId') || !model.includes('workflowNodeId') || !model.includes('draftVersion') || !model.includes('quantity')) {
  fail('quotation draft model must preserve only scoped composition semantics')
}
if (/price|subtotal|discount|tax|serverRevision|quoteId/i.test(model + codec + catalog)) {
  fail('composition model, codec, or synthetic catalog must not introduce pricing authority')
}
if (!catalog.includes('synthetic-package-basic') || !catalog.includes('synthetic-procedure-base') || !catalog.includes('synthetic-material-demo') || !catalog.includes('synthetic-measure-area')) {
  fail('all four synthetic catalog categories must be represented')
}
if (genericForm.includes('quotationDraft') || genericForm.includes('QuotationLine')) fail('quotation semantics must not leak into generic Dynamic Form Runtime')
if (/createQuotation|updateQuotation|sendQuotation|convertQuotation/.test(commandPort)) fail('quotation mutation APIs remain out of scope')
if (!component.includes('服务方案 / 报价明细') || !component.includes('quotation-draft-empty') || !component.includes('quotation-catalog-sheet')) {
  fail('quotation-owned composition and catalog selection UI must be present')
}
if (component.includes('保存报价') || component.includes('提交报价') || component.includes('completeWorkflowNode') || component.includes('¥')) {
  fail('UI must not expose quote business writes, workflow completion, or prices')
}
if (!component.includes('quotation-add-item') || !component.includes('quotation-line-quantity-') || !component.includes('quotation-line-remove-')) {
  fail('composition controls must remain testable at stable semantic boundaries')
}
if (!reviewMain.includes('setBusinessMockMode(\'data\')') || !reviewMain.includes('createG4fReviewStorage')) {
  fail('H5 review entry must use deterministic local Mock and review-only storage')
}
if (!reviewScenarios.includes("'empty'") || !reviewScenarios.includes("'populated'") || !reviewScenarios.includes("'restored'") || !reviewScenarios.includes("'invalid'")) {
  fail('review harness must model fresh, composed, restored, and malformed scenarios')
}
if (!reviewPage.includes('H5_VISUAL_PROXY') || !reviewPage.includes('MOCK_PRODUCT_REVIEW')) {
  fail('visual-review labels must remain in review infrastructure')
}
if (!playwrightConfig.includes('http://127.0.0.1:5175') || !viteConfig.includes("VITE_XLINK_ENABLE_REAL_WRITES': JSON.stringify('false')")) {
  fail('review server must be isolated and real writes disabled')
}
if (!browserTests.includes('01-empty-draft.png') || !browserTests.includes('02-composed-draft.png') || !browserTests.includes('03-catalog-selection.png') || !browserTests.includes('externalRequests')) {
  fail('Playwright must capture the three review states and enforce network safety')
}
for (const token of ['autosaves semantic state', 'restores the local quotation draft', 'different %s identity', 'malformed or incompatible']) {
  if (!unitTests.includes(token)) fail(`unit coverage missing: ${token}`)
}
for (const script of ['test:uni-h5-g4f-phase1b-review', 'check:g4f-phase1b']) {
  if (!packageJson.scripts?.[script]) fail(`missing package script: ${script}`)
}
if (!packageJson.scripts.verify.includes('check:g4f-phase1b')) fail('normal verify must include the Phase 1B guard')

console.log('G4-F Phase 1B boundary passed: local quotation composition, strict draft scope, synthetic catalog, no pricing or business mutation')
