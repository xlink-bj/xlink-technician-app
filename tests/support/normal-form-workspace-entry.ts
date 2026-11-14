import { expect, type Page } from '@playwright/test'
/** Normal UI navigation only. No detail-side Panel or caller-issued grants. */
export async function enterNormalFormWorkspace(page: Page): Promise<void> {
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
  await expect(page.getByTestId('r1-normal-form-read')).toHaveCount(0)
  await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
  await expect(page.locator('textarea')).toHaveCount(0)
  const action=page.getByTestId('task-focus-action')
  await expect(action).toBeEnabled()
  await action.click()
  await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
  await expect(page.getByTestId('normal-form-workspace-content')).toBeVisible()
  await expect(page.getByTestId('action-workspace-shell')).toHaveCount(1)
}
/** The explicit Workspace Back first flushes the normal controller's queue. */
export async function leaveNormalFormForList(page: Page): Promise<void> {
  await page.getByTestId('normal-form-workspace-back').click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
  await page.goBack()
  await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
}
