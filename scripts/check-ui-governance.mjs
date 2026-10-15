#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

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
  read('__review/design-system-gallery.vue'),
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

console.log('UI governance check passed: shared UX contract, Gallery coverage, and delivery gates are intact')
