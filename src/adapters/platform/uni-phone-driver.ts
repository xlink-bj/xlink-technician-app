import type { PhoneDriver, PlatformDriverResult } from './platform-adapters'

export type UniMakePhoneCall = (options: UniNamespace.MakePhoneCallOptions) => unknown

export interface UniPhoneDriverOptions {
  readonly makePhoneCall?: UniMakePhoneCall
}

function failureResult(error: unknown): PlatformDriverResult {
  const message =
    typeof error === 'object' && error !== null && 'errMsg' in error && typeof error.errMsg === 'string'
      ? error.errMsg.toLowerCase()
      : ''

  if (message.includes('cancel')) return { state: 'cancelled', reason: 'Phone contact was cancelled' }
  if (message.includes('not support') || message.includes('unsupported')) {
    return { state: 'unsupported_platform', reason: 'Phone contact is unsupported on this platform' }
  }
  if (message.includes('unavailable') || message.includes('no phone')) {
    return { state: 'unavailable', reason: 'Phone contact is unavailable' }
  }
  return { state: 'error_retryable', reason: 'Phone contact failed and can be retried' }
}

function defaultMakePhoneCall(options: UniNamespace.MakePhoneCallOptions): unknown {
  if (typeof uni === 'undefined' || typeof uni.makePhoneCall !== 'function') {
    throw new Error('uni phone contact capability is unavailable')
  }
  return uni.makePhoneCall(options)
}

/** Thin platform driver; the PhonePort remains the feature-facing boundary. */
export function createUniPhoneDriver(options: UniPhoneDriverOptions = {}): PhoneDriver {
  const makePhoneCall = options.makePhoneCall ?? defaultMakePhoneCall

  return {
    dial(input): Promise<PlatformDriverResult> {
      return new Promise((resolve) => {
        try {
          makePhoneCall({
            phoneNumber: input.normalizedPhone,
            success: () => resolve({ state: 'granted' }),
            fail: (error) => resolve(failureResult(error)),
          })
        } catch (error) {
          resolve(failureResult(error))
        }
      })
    },
  }
}
