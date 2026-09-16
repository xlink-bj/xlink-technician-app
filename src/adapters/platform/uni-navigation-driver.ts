import type { NavigationDriver } from './platform-adapters'

export interface UniNavigateToOptions {
  readonly url: string
  readonly success?: () => void
  readonly fail?: (error: unknown) => void
}

export type UniNavigateTo = (options: UniNavigateToOptions) => unknown

export type UniNavigateBack = (options?: { readonly delta?: number; readonly success?: () => void; readonly fail?: (error: unknown) => void }) => unknown

function defaultNavigateTo(options: UniNavigateToOptions): unknown {
  if (typeof uni === 'undefined' || typeof uni.navigateTo !== 'function') {
    throw new Error('uni navigation is unavailable')
  }
  return uni.navigateTo(options)
}

/** Thin platform driver; navigation stays outside feature/page business logic. */
export function createUniNavigationDriver(
  navigateTo: UniNavigateTo = defaultNavigateTo,
  navigateBack: UniNavigateBack = (options = {}) => {
    if (typeof uni === 'undefined' || typeof uni.navigateBack !== 'function') {
      throw new Error('uni navigation back is unavailable')
    }
    return uni.navigateBack(options)
  },
): NavigationDriver {
  return {
    navigate(url): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          navigateTo({
            url,
            success: () => resolve(),
            fail: (error) => reject(error),
          })
        } catch (error) {
          reject(error)
        }
      })
    },
    back(): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          navigateBack({ delta: 1, success: () => resolve(), fail: (error) => reject(error) })
        } catch (error) {
          reject(error)
        }
      })
    },
  }
}
