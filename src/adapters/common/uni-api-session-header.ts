import type { SessionRef } from '@shared/types'

/** H5 cookies belong to the browser, which forbids an explicit Cookie header.
 * Keep native session transport unchanged and do not widen H5 credential mode. */
export function uniApiSessionHeader(sessionRef: SessionRef): Record<string, string> {
  // Uni's compiler defines this constant; UNI_PLATFORM is not exposed through
  // Vite import.meta.env in the actual H5 build.
  return process.env.UNI_PLATFORM === 'h5'
    ? {}
    : { Cookie: `JSESSIONID=${sessionRef}` }
}
