import { expect, type Page } from '@playwright/test'
/** DEV synthetic special controller only; a route is never a write grant. */
export async function enterDevMockDynamicFormWorkspace(page:Page):Promise<void>{
 await expect(page).toHaveURL(/pages\/work-orders\/detail/)
 await expect(page.getByTestId('a-stage-special-panel')).toHaveCount(0)
 const recovery=page.getByTestId('special-receipt-workspace-entry')
 const completed=page.getByTestId('special-completed-workspace-entry')
 if(await recovery.count())await recovery.click()
 else if(await completed.count())await completed.click()
 else{await expect(page.getByTestId('task-focus-action')).toBeEnabled();await page.getByTestId('task-focus-action').click()}
 await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
 await expect(page.getByTestId('action-workspace-shell')).toHaveCount(1)
 await expect(page.getByTestId('special-form-workspace-content')).toBeVisible()
 await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
}
