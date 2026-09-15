import type { NavigationDriver } from './platform-adapters'

export interface UniNavigateToOptions {
  readonly url: string
  readonly success?: () => void
  readonly fail?: (error: unknown) => void
}

export type UniNavigateTo = (options: UniNavigateToOptions) => unknown

function defaultNavigateTo(options: UniNavigateToOptions): unknown {
  if (typeof uni === 'undefined' || typeof uni.navigateTo !== 'function') {
    throw new Error('uni navigation is unavailable')
  }
  return uni.navigateTo(options)
}

/** Thin platform driver; navigation stays outside feature/page business logic. */
export function createUniNavigationDriver(
  navigateTo: UniNavigateTo = defaultNavigateTo,
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
  }
}
