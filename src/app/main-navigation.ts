/** Four root destinations replace one another; business detail pages stay on the page stack. */
import { currentPlatformPageRoute, redirectPlatformRoot } from '@adapters/platform/main-route-navigation'
export const mainRoutes = {
  home: '/pages/index/index',
  workOrders: '/pages/work-orders/work-orders',
  notices: '/pages/notices/notices',
  me: '/pages/me/me',
} as const

export type MainRoute = keyof typeof mainRoutes
let changing = false

export function openMainRoute(route: MainRoute): Promise<boolean> {
  if (changing) return Promise.resolve(false)
  const target = mainRoutes[route]
  const current = currentPlatformPageRoute()
  if (current === target.slice(1)) return Promise.resolve(false)
  changing = true
  return redirectPlatformRoot(target).finally(() => { changing = false })
}
