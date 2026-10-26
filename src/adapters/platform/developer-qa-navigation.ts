/** Explicit developer-only deep link; the QA route independently checks DEV. */
export function redirectToIsolatedQaConsole(): void {
  uni.redirectTo({ url: '/pages/dev/qa-console' })
}
