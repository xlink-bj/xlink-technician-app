#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const fail = message => { throw new Error(`B2-X2 commercial UI parity FAIL: ${message}`) }
const template = path => read(path).split('<script setup')[0]

// Customer-facing surfaces must never expose fixture provenance or developer
// controls. QA-only pages and helpers intentionally have a separate scope.
const commercialViews = [
  'src/pages/index/index.vue',
  'src/pages/work-orders/work-orders.vue',
  'src/pages/work-orders/detail.vue',
  'src/pages/work-orders/action-workspace.vue',
  'src/pages/work-orders/signing-order-read.vue',
  'src/features/work-orders/R1LocalFormFieldEditor.vue',
  'src/features/work-orders/R1NodeFormsOverview.vue',
  'src/features/work-orders/R1SpecialMockTransactionPanel.vue',
  'src/features/work-orders/components/MockJourneyContextPanel.vue',
  'src/features/work-orders/components/SurveyCompleteConfirmation.vue',
  'src/features/work-orders/quotation/AStageMockQuoteOrderPanel.vue',
  'src/features/work-orders/quotation/Q01EntryScreen.vue',
  'src/features/work-orders/quotation/QuotationActionContent.vue',
  'src/features/work-orders/quotation/QuotationActionWorkspace.vue',
  'src/features/work-orders/quotation/QuotationOrderHub.vue',
  'src/shared/ui/ActionWorkspaceShell.vue',
]

const debugCopy = /体验数据|演示数据|测试数据|开发验收|开发核验|工程验收说明|模拟进入|未提交后台|本机订单示例|本机合同示例|DEV-SYNTHETIC|仅合成字典|生产服务器报价只读|后端已验证的报价单|Mock\s*[·：:]|DEV\s+Mock/g
const debugWidgets = /data-testid="(?:dev-review-tools|business-mode-provenance|signing-command-preflight|mock-commerce-handoff|mock-journey-workflow-state)"|<LocalDraftDiagnosticsPanel\b|<MockCommercialFlowLinks\b|<SyntheticOrderExtFieldReviewPanel\b/g

for (const view of commercialViews) {
  const content = template(view)
  for (const [label, pattern] of [['technical prose', debugCopy], ['QA-only widget', debugWidgets]]) {
    pattern.lastIndex = 0
    const found = pattern.exec(content)
    if (found) fail(`${view} contains ${label}: ${found[0]}`)
  }
}

const home = read('src/pages/index/index.vue')
const detail = read('src/pages/work-orders/detail.vue')
const qa = read('src/pages/dev/qa-console.vue')
const pages = read('src/pages.json')
const formatter = read('src/shared/ui/work-order-number-display.ts')
const numberTest = read('tests/g4ux/work-order-number-display.test.ts')
const mockSession = read('src/adapters/auth/dev-mock-ux-session.ts')

// Fixture-provided identity also renders on commercial surfaces. A clean page
// template is insufficient if the runtime user/role reveals the QA harness.
if (/本地仿真技术员|本地技术员|模拟账号|演示账号|测试技术员/.test(mockSession)) {
  fail('DEV Mock user/role identity must use ordinary commercial presentation')
}

if (/<navigator[^>]+\/pages\/dev\/qa-console/.test(home)) {
  fail('commercial Home must not offer a visible QA navigation link')
}
if (!home.includes("options?.devReview === '1'") || !home.includes('redirectToIsolatedQaConsole')) {
  fail('legacy explicit QA links must redirect away from Home')
}
if (detail.includes('detail-content--mock-qa')) {
  fail('WorkOrder layout must not vary according to synthetic fixture identity')
}
if (!pages.includes('"path": "pages/dev/qa-console"')) {
  fail('separate QA page missing from uni-app route table')
}
for (const marker of [
  'import.meta.env.DEV && isBusinessMockDeveloperModeAvailable()',
  'data-testid="qa-console"', 'data-testid="dev-review-tools"',
  'switchBusinessDataSource', 'LocalDraftDiagnosticsPanel',
  'MockCommercialFlowLinks', 'mockActionWorkspaceScenarios',
  '返回商业应用',
]) {
  if (!qa.includes(marker)) fail(`QA route missing: ${marker}`)
}
if (!formatter.includes('MOCK-') || !numberTest.includes('QA flag changes')) {
  fail('source-neutral WorkOrder number normalization lost coverage')
}

console.log(`B2-X2 commercial UI parity: PASS (${commercialViews.length} business templates; separate DEV QA gate)`)
