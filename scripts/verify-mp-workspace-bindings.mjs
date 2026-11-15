import { readFileSync } from 'node:fs'

// Uni MP treats .vue imports as components and can erase their named exports.
// Check the actual artifact so a successful build cannot hide this setup crash.
const page = readFileSync('dist/build/mp-weixin/pages/work-orders/action-workspace.js', 'utf8')
if (!page.includes('survey-complete-confirmation.js') || /(?:^|[^\w$.])useSurveyCompleteConfirmation\s*\(/.test(page)) {
  throw new Error('MP ActionWorkspace must import completion state from its TS module, with no unresolved SFC named call')
}
console.log('MP Workspace binding guard PASS: completion state imported from a platform-neutral TS module')
