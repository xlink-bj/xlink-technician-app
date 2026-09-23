#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (path) => readFile(resolve(root, path), 'utf8')
const fail = (message) => { throw new Error(`G4-F quotation composition boundary check failed: ${message}`) }

const [pages, workspace, component, model, codec, catalog, catalogBrowser, compositionStore, genericForm, commandPort, reviewMain, reviewScenarios, reviewPage, playwrightConfig, viteConfig, browserTests, unitTests, packageSource] = await Promise.all([
  read('src/pages.json'),
  read('src/features/work-orders/action-workspace.ts'),
  read('src/features/work-orders/quotation/QuotationActionContent.vue'),
  read('src/features/work-orders/quotation/model.ts'),
  read('src/features/work-orders/quotation/draft-codec.ts'),
  read('src/features/work-orders/quotation/catalog.ts'),
  read('src/features/work-orders/quotation/catalog-browser-store.ts'),
  read('src/features/work-orders/quotation/composition-store.ts'),
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
if (!model.includes('workOrderId') || !model.includes('workflowNodeId') || !model.includes('draftVersion') || !model.includes('groups') || !model.includes('repairParts') || !model.includes('partDescription') || !model.includes('maintainAreaNum') || !model.includes('projPackages') || !model.includes('procedures') || !model.includes('materials') || !model.includes('measures')) {
  fail('quotation draft model must use R1-shaped repair-part groups and typed local selections')
}
if (model.includes('readonly lines:')) fail('new quotation drafts must not persist the legacy flat lines array')
if (!model.includes("QUOTATION_DIRECT_CATALOG_KINDS = ['procedure', 'material', 'measure']")) {
  fail('Phase 1F direct-selection kinds must remain an explicit three-kind allowlist')
}
if (!codec.includes("state: 'legacy_requires_action'") || !codec.includes('Array.isArray(draftValue.lines)')) {
  fail('legacy flat drafts must be recognized without automatic migration')
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
  fail('quotation-owned composition and catalog browser UI must be present')
}
if (component.includes('保存报价') || component.includes('提交报价') || component.includes('completeWorkflowNode') || component.includes('¥')) {
  fail('UI must not expose quote business writes, workflow completion, or prices')
}
if (!component.includes('quotation-add-group') || !component.includes('quotation-browse-') || !component.includes('quotation-package-detail-') || !component.includes('quotation-selection-quantity-') || !component.includes('quotation-selection-remove-') || !component.includes('quotation-draft-legacy')) {
  fail('group composition controls and explicit legacy-draft handling must remain testable')
}
if (component.includes('composition.addCatalogItem') || !component.includes('workspace.addQuotationCatalogSelection') || !component.includes('加入当前组')) {
  fail('direct catalog selection must pass through the Action Workspace bridge')
}
if (!component.includes("item.kind === 'package'") || !component.includes('查看套餐')) {
  fail('packages must remain read-only and expose details rather than a draft-selection action')
}
if (!workspace.includes('quotationCatalogBrowser.selectedCatalogItemFor(kind, catalogId)') || !workspace.includes('isDirectQuotationCatalogKind(kind)')) {
  fail('Action Workspace must accept only current successful reads of the explicit direct-selection kinds')
}
if (!catalogBrowser.includes('function selectedCatalogItemFor') || !catalogBrowser.includes("catalogStatesByKind.value[kind] !== 'succeeded'")) {
  fail('selection candidates must be resolved from a successful current catalog result')
}
if (!catalog.includes('synthetic-package-basic') || !component.includes('目标：')) {
  fail('catalog selection must remain scoped to an explicitly opened repair-part group')
}
if (!workspace.includes('quotationComposition.addCatalogReadItem(groupId, source)')) {
  fail('Action Workspace must bridge verified read records into local composition')
}
if (!compositionStore.includes('isDirectQuotationCatalogKind(source.kind)') || !compositionStore.includes('catalogId: source.id') || !compositionStore.includes('label: source.name')) {
  fail('composition must enforce its explicit kind allowlist and project provider identity into local draft fields')
}
if (/source\.(?:price|minimumPrice|guideUnitPrice|minimumGuideTotalPrice|cost|servicePrice|serviceCostPrice|storeCostPrice)/.test(compositionStore)) {
  fail('direct catalog selection must not copy commercial fields into the local draft')
}
if (!workspace.includes('quotationCatalogBrowser.configure') || !workspace.includes('catalogContext: read.data.quotationCatalogContext')) {
  fail('catalog browser must receive adapter-derived Work Order context')
}
if (workspace.includes('getQuotationActionContent')) {
  fail('Mock-only quotation content fixtures must not gate place_order workspace initialization')
}
for (const method of ['listPackages', 'listProcedures', 'listMaterials', 'listMeasures', 'getPackageDetail']) {
  if (!catalogBrowser.includes(`port.${method}`)) fail(`catalog browser must use read-only port method ${method}`)
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
if (!browserTests.includes('01-empty-draft.png') || !browserTests.includes('02-grouped-draft-direct-selections.png') || !browserTests.includes('03-catalog-detail-readonly.png') || !browserTests.includes('externalRequests') || !browserTests.includes('quotation-catalog-add-')) {
  fail('Playwright must prove direct allowed-kind selection, package read-only state, and network safety')
}
for (const token of ['autosaves grouped state only', 'restores the local quotation draft', 'different %s identity', 'malformed or incompatible', 'legacy flat v1 drafts']) {
  if (!unitTests.includes(token)) fail(`unit coverage missing: ${token}`)
}
for (const script of ['test:uni-h5-g4f-phase1b-review', 'check:g4f-phase1b']) {
  if (!packageJson.scripts?.[script]) fail(`missing package script: ${script}`)
}
if (!packageJson.scripts.verify.includes('check:g4f-phase1b')) fail('normal verify must include the Phase 1B guard')

console.log('G4-F Phase 1F boundary passed: only explicit Procedure/Material/Measure read selections bridge into the local grouped draft; Package remains read-only; no pricing or business mutation')
