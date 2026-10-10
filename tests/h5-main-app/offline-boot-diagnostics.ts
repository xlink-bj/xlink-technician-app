import type { Page } from '@playwright/test'

/**
 * Local browser bootstrap evidence only. Never capture credentials, request
 * bodies, response bodies, headers, query strings, DOM text or cookies.
 */
export interface OfflineBootSignals {
  readonly path: string
  readonly route: string
  readonly documentState: string
  readonly appPresent: boolean
  readonly appChildren: number
  readonly loginPageCount: number
  readonly launchActionCount: number
  readonly methodStageCount: number
  readonly pageErrors: number
  readonly consoleErrors: number
  readonly externalIntents: readonly string[]
  readonly localHttpFailures: readonly string[]
  readonly failedLocalRequests: readonly string[]
}

export function collectOfflineBrowserSignals(page: Page) {
  const externalIntents: string[] = []
  const localHttpFailures: string[] = []
  const failedLocalRequests: string[] = []
  let pageErrors = 0
  let consoleErrors = 0

  page.on('pageerror', () => { pageErrors += 1 })
  page.on('console', (event) => { if (event.type() === 'error') consoleErrors += 1 })
  page.on('response', (response) => {
    if (response.status() < 400) return
    const url = new URL(response.url())
    if (url.origin === 'http://localhost:5173') {
      localHttpFailures.push(`${response.status()} ${url.pathname}`)
    }
  })
  page.on('requestfailed', (request) => {
    const url = new URL(request.url())
    if (url.origin === 'http://localhost:5173') {
      failedLocalRequests.push(`${request.method()} ${url.pathname}`)
    }
  })

  return {
    externalIntents,
    async snapshot(): Promise<OfflineBootSignals> {
      const info = await page.evaluate(() => {
        const app = document.querySelector('#app')
        return {
          documentState: document.readyState,
          appPresent: Boolean(app),
          appChildren: app?.children.length ?? 0,
          loginPageCount: document.querySelectorAll('.login-page').length,
          launchActionCount: document.querySelectorAll('.login-page .launch-stage .launch-cta').length,
          methodStageCount: document.querySelectorAll('.login-page .methods-stage').length,
        }
      })
      const url = new URL(page.url())
      return {
        path: url.pathname,
        route: url.hash.split('?')[0].slice(0, 120),
        ...info,
        pageErrors,
        consoleErrors,
        externalIntents: externalIntents.slice(0, 5),
        localHttpFailures: localHttpFailures.slice(0, 8),
        failedLocalRequests: failedLocalRequests.slice(0, 8),
      }
    },
  }
}
