import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

import { longActionContentFixture } from './long-action-content.fixture'

const shellPath = new URL('../../src/shared/ui/ActionWorkspaceShell.vue', import.meta.url)
const pagePaths = [
  new URL('../../src/pages/work-orders/action-workspace.vue', import.meta.url),
  new URL('../../src/pages/work-orders/action-time.vue', import.meta.url),
  new URL('../../src/pages/work-orders/action-confirmation.vue', import.meta.url),
]

function count(source: string, value: string): number {
  return source.split(value).length - 1
}

describe('Action Workspace Shell structural contract', () => {
  it('keeps scrollable content and the persistent footer as separate regions', async () => {
    const shell = await readFile(shellPath, 'utf8')
    const scrollStart = shell.indexOf('<scroll-view class="action-workspace-scroll"')
    const scrollEnd = shell.indexOf('</scroll-view>')
    const footerStart = shell.indexOf('class="action-workspace-footer"')

    expect(scrollStart).toBeGreaterThanOrEqual(0)
    expect(scrollEnd).toBeGreaterThan(scrollStart)
    expect(footerStart).toBeGreaterThan(scrollEnd)
    expect(shell).toContain('scroll-y enable-flex')
    expect(shell).toContain('flex-shrink: 0')
    expect(shell).toContain('safe-area-inset-bottom')
    expect(shell).toContain('padding-left: var(--app-action-bar-padding-x)')
    expect(shell).toContain('padding-right: var(--app-action-bar-padding-x)')
    expect(shell).not.toContain('position: sticky')
  })

  it('owns each draft status message exactly once', async () => {
    const shell = await readFile(shellPath, 'utf8')
    const pages = await Promise.all(pagePaths.map((path) => readFile(path, 'utf8')))

    expect(shell).toContain('draftStatus === \'saved_local\'')
    expect(shell).toContain('draftStatus === \'restore_available\'')
    expect(shell).toContain('draftStatus === \'save_failed\'')
    expect(count(shell, '已自动保存')).toBe(1)
    expect(count(shell, '已恢复本地草稿')).toBe(1)
    expect(count(shell, '本地草稿保存失败')).toBe(1)
    expect(shell).not.toContain('draftStatus === \'dirty\'')
    for (const page of pages) {
      expect(page).not.toContain('draftMessage')
      expect(page).not.toContain('action-workspace-draft-message')
      expect(page).not.toContain('已自动保存')
      expect(page).not.toContain('已恢复本地草稿')
      expect(page).not.toContain('本地草稿保存失败')
      expect(page).not.toContain('position: sticky')
      expect(page).not.toContain('safe-area-inset-bottom')
    }
  })

  it('routes business feedback through the Shell while content supplies actions', async () => {
    const shell = await readFile(shellPath, 'utf8')
    const pages = await Promise.all(pagePaths.map((path) => readFile(path, 'utf8')))
    const workspace = pages[0]
    const time = pages[1]
    const confirmation = pages[2]

    expect(shell).toContain('businessFeedback')
    expect(workspace).toContain(':business-feedback="feedback"')
    expect(time).toContain(':business-feedback="feedback"')
    expect(confirmation).toContain(':business-feedback="isSuccess ? \'\' : feedback"')
    expect(workspace).toContain('@submit="continueToConfirmation"')
    expect(time).toContain('<template #actions>')
    expect(confirmation).toContain('<template #actions v-if="!isSuccess">')
    expect(confirmation).toContain('<template #success-actions>')
  })

  it('places the single draft strip before Action Content and suppresses it after success', async () => {
    const shell = await readFile(shellPath, 'utf8')
    const draftStatusIndex = shell.indexOf('draftStatus === \'saving\'')
    const actionSlotIndex = shell.indexOf('<slot />')
    const successBranchIndex = shell.indexOf('<template v-else>')

    expect(draftStatusIndex).toBeGreaterThanOrEqual(0)
    expect(actionSlotIndex).toBeGreaterThan(draftStatusIndex)
    expect(successBranchIndex).toBeGreaterThan(actionSlotIndex)
    expect(shell).toContain('lifecycle !== \'succeeded\' && draftStatus === \'saving\'')
    expect(shell).toContain('lifecycle !== \'succeeded\' && draftStatus === \'saved_local\'')
    expect(shell).toContain('lifecycle !== \'succeeded\' && draftStatus === \'restore_available\'')
    expect(shell).toContain('lifecycle !== \'succeeded\' && draftStatus === \'save_failed\'')
  })

  it('provides a deterministic long-content fixture for independent shell checks', () => {
    expect(longActionContentFixture).toHaveLength(36)
    expect(longActionContentFixture[0]).toEqual({ key: 'long-content-1', label: 'Long content item 1' })
    expect(longActionContentFixture.at(-1)).toEqual({ key: 'long-content-36', label: 'Long content item 36' })
  })

  it('keeps Action Content independent from storage and footer geometry', async () => {
    const pages = await Promise.all(pagePaths.map((path) => readFile(path, 'utf8')))
    for (const page of pages) {
      expect(page).not.toMatch(/storage\.|StoragePort|uni\.setStorage|uni\.removeStorage/)
      expect(page).not.toMatch(/footer|safe-area-inset-bottom|position:\s*sticky/)
    }
  })
})
