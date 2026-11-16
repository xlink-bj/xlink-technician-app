import { confirmUniLogout } from '@adapters/platform/uni-logout-confirmation'

/** Composition boundary for the account confirmation UI. */
export function confirmLogout(): Promise<boolean> {
  return confirmUniLogout()
}
