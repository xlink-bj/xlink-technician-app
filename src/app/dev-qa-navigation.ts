import { redirectToIsolatedQaConsole as redirect } from '@adapters/platform/developer-qa-navigation'

/** A route adapter separate from the customer-facing Home composition. */
export function redirectToIsolatedQaConsole(): void {
  if (import.meta.env.DEV) redirect()
}
