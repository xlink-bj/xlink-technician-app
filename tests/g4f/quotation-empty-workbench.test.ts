import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  isFirstQuotationRepairPartStep,
  isInitialQuotationWorkbenchEmpty,
} from '../../src/features/work-orders/quotation/empty-workbench-state'

describe('G4-F first-use quotation workbench', () => {
  it('shows the approved empty state only for a ready, non-editing, fresh, zero-group draft', () => {
    expect(isInitialQuotationWorkbenchEmpty({
      contentState: 'ready', editState: 'none', draftState: 'fresh', groupCount: 0, catalogOpen: false,
    })).toBe(true)
  })

  it.each(['loading', 'blocked', 'failed_retryable', 'failed_terminal'] as const)(
    'does not misclassify %s Action content as an empty draft',
    (contentState) => {
      expect(isInitialQuotationWorkbenchEmpty({
        contentState, editState: 'none', draftState: 'fresh', groupCount: 0, catalogOpen: false,
      })).toBe(false)
    },
  )

  it.each(['idle', 'loading', 'restored', 'dirty', 'saving', 'saved_local', 'save_failed', 'legacy_requires_action', 'invalid', 'unavailable'] as const)(
    'does not replace the %s local-draft state with the first-use empty presentation',
    (draftState) => {
      expect(isInitialQuotationWorkbenchEmpty({
        contentState: 'ready', editState: 'none', draftState, groupCount: 0, catalogOpen: false,
      })).toBe(false)
    },
  )

  it.each(['loading', 'ready', 'blocked'] as const)(
    'does not present a new blank workbench while an existing-order edit state is %s',
    (editState) => {
      expect(isInitialQuotationWorkbenchEmpty({
        contentState: 'ready', editState, draftState: 'fresh', groupCount: 0, catalogOpen: false,
      })).toBe(false)
    },
  )

  it('keeps a non-empty draft and an open catalog outside the first-use empty presentation', () => {
    expect(isInitialQuotationWorkbenchEmpty({
      contentState: 'ready', editState: 'none', draftState: 'fresh', groupCount: 1, catalogOpen: false,
    })).toBe(false)
    expect(isInitialQuotationWorkbenchEmpty({
      contentState: 'ready', editState: 'none', draftState: 'fresh', groupCount: 0, catalogOpen: true,
    })).toBe(false)
  })
})

describe('G4-F first repair-part step presentation guard', () => {
  const eligible = {
    contentState: 'ready' as const,
    editState: 'none' as const,
    draftState: 'dirty' as const,
    groupCount: 1,
    selectionCount: 0,
    catalogOpen: false,
  }

  it('shows the focused editor for one editable empty group, including a restored draft', () => {
    expect(isFirstQuotationRepairPartStep(eligible)).toBe(true)
    expect(isFirstQuotationRepairPartStep({ ...eligible, draftState: 'restored' })).toBe(true)
  })

  it.each([
    ['loading content', { contentState: 'loading' as const }],
    ['failed content', { contentState: 'failed_retryable' as const }],
    ['server-order edit', { editState: 'ready' as const }],
    ['two groups', { groupCount: 2 }],
    ['selected item', { selectionCount: 1 }],
    ['open catalog', { catalogOpen: true }],
    ['legacy draft', { draftState: 'legacy_requires_action' as const }],
    ['invalid draft', { draftState: 'invalid' as const }],
    ['unavailable draft', { draftState: 'unavailable' as const }],
  ] as const)('keeps %s in the existing presentation', (_reason, override) => {
    expect(isFirstQuotationRepairPartStep({ ...eligible, ...override })).toBe(false)
  })
})

describe('Action Workspace context ownership', () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
  const shell = source('src/shared/ui/ActionWorkspaceShell.vue')
  const appointmentAndSurveyWorkspace = source('src/pages/work-orders/action-workspace.vue')
  const quotationWorkspace = source('src/features/work-orders/quotation/QuotationActionWorkspace.vue')
  const quotationContent = source('src/features/work-orders/quotation/QuotationActionContent.vue')

  it('uses the exact same shared context shell for Appointment, Survey, and Quotation', () => {
    const sharedImport = "import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'"
    expect(appointmentAndSurveyWorkspace).toContain(sharedImport)
    expect(quotationWorkspace).toContain(sharedImport)
    expect(appointmentAndSurveyWorkspace).toContain('<ActionWorkspaceShell')
    expect(quotationWorkspace).toContain('<ActionWorkspaceShell')
    expect(shell.match(/data-testid="action-workspace-context"/g)).toHaveLength(1)
    expect(shell).toContain('customerName || \'工单\'')
    expect(shell).toContain('displayNumber')
    expect(quotationContent).not.toMatch(/action-workspace-context|customerName|displayNumber/)
  })

  it('renders every approved initial-state module without changing the action boundary', () => {
    expect(quotationContent).toContain('data-testid="quotation-draft-notice"')
    expect(quotationContent).toContain('data-testid="quotation-empty-illustration"')
    expect(quotationContent).toContain('data-testid="quotation-quote-process"')
    expect(quotationContent).toContain('@tap="createRepairGroup()"')
    expect(quotationContent).not.toContain('quotation-content__initial-empty-mark')
  })

  it('keeps the repair-part step inside the existing content and shared selector contracts', () => {
    expect(quotationContent).toContain('data-testid="quotation-first-repair-part-step"')
    expect(quotationContent).toContain('data-testid="quotation-first-step-repair-parts"')
    expect(quotationContent).toContain('data-testid="quotation-first-step-description"')
    expect(quotationContent).toContain('data-testid="quotation-first-step-quantity"')
    expect(quotationContent).toContain('data-testid="quotation-first-step-select-products"')
    expect(quotationContent).toContain(':options="composition.repairPartOptions"')
    expect(quotationContent).toContain('composition.updateGroupContext(groupId, { partDescription: eventValue(event) })')
    expect(quotationContent).toContain('composition.updateGroupContext(groupId, { maintainAreaNum: eventValue(event) })')
    expect(quotationContent).toContain("openCatalog(group.groupId, 'package')")
    expect(quotationContent).not.toContain('action-workspace-context')
    expect(quotationWorkspace).toContain('<ActionWorkspaceShell')
  })
})
