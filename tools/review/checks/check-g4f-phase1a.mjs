#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const read = (path) => readFile(resolve(root, path), 'utf8')
const fail = (message) => { throw new Error(`G4-F Phase 1A check failed: ${message}`) }

const [pages, actionTypes, projection, workspace, adapter, mockRouter, commandPort, quotationUi, reviewPages, reviewMain, reviewConfig, reviewPage, reviewWorkspace, packageSource] = await Promise.all([
  read('src/pages.json'),
  read('src/runtimes/action/types.ts'),
  read('src/runtimes/workflow/detail-projection.ts'),
  read('src/features/work-orders/action-workspace.ts'),
  read('src/adapters/api/technician-api.ts'),
  read('src/adapters/api/mock/router.ts'),
  read('src/shared/ports/commands.ts'),
  read('src/features/work-orders/quotation/QuotationActionContent.vue'),
  read('tools/review/quotation-demo/pages.json'),
  read('tools/review/quotation-demo/main.ts'),
  read('config/vite/uni-h5-g4f-review.config.ts'),
  read('tools/review/quotation-demo/pages/quotation/index.vue'),
  read('src/features/work-orders/quotation/QuotationActionWorkspace.vue'),
  read('package.json'),
])
// Ownership rules now live independently of the stateful Mock response router.
const mockOwnership = await read('src/adapters/api/mock/ownership.ts')
const packageJson = JSON.parse(packageSource)

if (pages.includes('__review') || pages.includes('g4f-phase1a') || pages.includes('quotation-review')) {
  fail('production pages.json must not expose review routes')
}
if (!actionTypes.includes("case 'place_order':") || !actionTypes.includes("return 'quotation'")) {
  fail('place_order must map to quotation Action Content')
}
if (!projection.includes("candidate.actionIntent === 'place_order'")) {
  fail('place_order execution must be Workflow-policy-owned, not formDefinitionId-gated')
}
if (!projection.includes('Boolean(candidate.node.formDefinitionId)')) {
  fail('generic form execution must retain the formDefinitionId requirement')
}
if (
  !workspace.includes('quotationContentState')
  || !workspace.includes('quotationComposition.initialize')
  || !workspace.includes('quotationCatalogBrowser.configure')
  || workspace.includes('getQuotationActionContent')
) {
  fail('place_order Workspace must initialize local composition/catalog without gating on the Mock-only quotation fixture')
}
if (!adapter.includes("path: '__mock/quotation/action-content'")) {
  fail('quotation foundation must use the synthetic-only Adapter route')
}
if (!mockRouter.includes("export { isMockOwnedRead, isMockOwnedCommand } from './ownership'")
  || !mockOwnership.includes("route === '__mock/quotation/action-content') return true")
  || !mockOwnership.includes("export function isMockOwnedRead(")) {
  fail('quotation foundation route must stay Mock-owned even when Mock is disabled')
}
if (/createQuotation|updateQuotation|sendQuotation|convertQuotation/.test(commandPort)) {
  fail('quotation business mutation APIs are out of scope')
}
if (/<AppButton[^>]*>\s*(?:保存报价|提交报价|完成报价)/.test(quotationUi) || quotationUi.includes('completeWorkflowNode')) {
  fail('quotation foundation UI must not expose business write/complete semantics')
}
if (!reviewPages.includes('pages/quotation/index') || reviewMain.includes('createDefaultAuthSessionPort')) {
  fail('uni-app review input must be isolated and use only its synthetic session')
}
if (!reviewConfig.includes('port: 5175') || !reviewConfig.includes("VITE_XLINK_ENABLE_REAL_WRITES': JSON.stringify('false')")) {
  fail('uni-app review configuration must remain separate and real writes disabled')
}
if (!reviewPage.includes('QuotationActionWorkspace') || !reviewWorkspace.includes('QuotationActionContent') || !reviewPage.includes('MOCK_PRODUCT_REVIEW')) {
  fail('review page must mount the shared product quotation workspace/content and label Mock evidence')
}
for (const script of ['dev:uni-h5-g4f-review', 'test:uni-h5-g4f-review', 'build:uni-h5-g4f-review', 'check:g4f-phase1a']) {
  if (!packageJson.scripts?.[script]) fail(`missing package script: ${script}`)
}

console.log('G4-F Phase 1A boundary passed: placeOrder routing, synthetic-only read, no production review route, no quote writes')
