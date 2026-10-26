#!/usr/bin/env node
/** Validate emitted WXSS, not just source CSS: WeChat DevTools rejects tag
 * and attribute selectors inside components even when H5 renders correctly.
 * Keep this bounded to the nine files proven by Mac native QA on PR #217. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('dist/build/mp-weixin')
const componentFiles = [
  'shared/ui/AppWorkOrderSkeleton.wxss',
  'shared/ui/AppSearchBar.wxss',
  'features/work-orders/WorkOrderTaskFocus.wxss',
  'features/work-orders/components/SurveyLeakageCauseExperience.wxss',
  'features/work-orders/components/SurveyPartPicker.wxss',
  'features/work-orders/quotation/QuotationOrderHub.wxss',
  'features/work-orders/quotation/Q01EntryScreen.wxss',
  'features/work-orders/quotation/QuotationActionContent.wxss',
  'features/work-orders/quotation/QuotationActionWorkspace.wxss',
]

for (const path of componentFiles) {
  const css = readFileSync(resolve(root, path), 'utf8')
  const selectors = [...css.matchAll(/(?:^|\})\s*([^{}]+?)\s*\{/g)].map((match) => match[1].trim())
  const unsupported = selectors.filter((selector) =>
    /\[[^\]]+\]|:not\(/.test(selector)
    || /(?:^|[\s>+~,])(?:view|text|button|input|image)(?=\b|[:.\[])/.test(selector))
  if (unsupported.length) {
    throw new Error(`MP component WXSS unsupported selector in ${path}: ${unsupported.slice(0, 5).join(' | ')}`)
  }
}

const pageCss = readFileSync(resolve(root, 'pages/work-orders/detail.wxss'), 'utf8')
const pageWxml = readFileSync(resolve(root, 'pages/work-orders/detail.wxml'), 'utf8')
if (!/\.summary-card\s*\{[^}]*box-sizing:border-box;[^}]*padding:0/.test(pageCss)
  || !/\.summary-card__content\s*\{[^}]*box-sizing:border-box;[^}]*padding:28rpx 28rpx 24rpx/.test(pageCss)
  || !pageWxml.includes('class="summary-card__content"')) {
  throw new Error('MP WorkOrder cards must share the same border-box host/slot layout for Real and Mock')
}

process.stdout.write(`Stage A MP emitted WXSS guard PASS: ${componentFiles.length} components, all WorkOrder card host/slot box model\n`)
