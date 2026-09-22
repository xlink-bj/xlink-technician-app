#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (path) => readFile(resolve(root, path), 'utf8')
const fail = (message) => { throw new Error(`G4-F Phase 1A check failed: ${message}`) }

const [pages, actionTypes, projection, workspace, adapter, mockRouter, commandPort, quotationUi, reviewPages, reviewMain, reviewConfig, reviewPage, packageSource] = await Promise.all([
  read('src/pages.json'),
  read('src/runtimes/action/types.ts'),
  read('src/runtimes/workflow/detail-projection.ts'),
  read('src/features/work-orders/action-workspace.ts'),
  read('src/adapters/api/technician-api.ts'),
  read('src/adapters/api/mock/router.ts'),
  read('src/shared/ports/commands.ts'),
  read('src/features/work-orders/quotation/QuotationActionContent.vue'),
  read('review-app-g4f/pages.json'),
  read('review-app-g4f/main.ts'),
  read('vite.uni-h5-g4f-review.config.ts'),
  read('review-app-g4f/pages/quotation/index.vue'),
  read('package.json'),
])
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
if (!workspace.includes('getQuotationActionContent') || !workspace.includes('quotationContentState')) {
  fail('Action Workspace must own the quotation content read and state')
}
if (!adapter.includes("path: '__mock/quotation/action-content'")) {
  fail('quotation foundation must use the synthetic-only Adapter route')
}
if (!mockRouter.includes("route === '__mock/quotation/action-content') return true")) {
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
if (!reviewPage.includes('QuotationActionContent') || !reviewPage.includes('MOCK_PRODUCT_REVIEW')) {
  fail('review page must mount the real quotation content and label Mock evidence')
}
for (const script of ['dev:uni-h5-g4f-review', 'test:uni-h5-g4f-review', 'build:uni-h5-g4f-review', 'check:g4f-phase1a']) {
  if (!packageJson.scripts?.[script]) fail(`missing package script: ${script}`)
}

console.log('G4-F Phase 1A boundary passed: placeOrder routing, synthetic-only read, no production review route, no quote writes')
