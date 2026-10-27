import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { workOrderCardIconFor, workOrderCardToneFor } from '@features/work-orders/card'

const homePage = readFileSync(new URL('../../src/pages/index/index.vue', import.meta.url), 'utf8')
const homeTemplate = homePage.slice(
  homePage.indexOf('<view v-else-if="showHome"'),
  homePage.indexOf('<view v-else class="login-page">'),
)
const listPage = readFileSync(new URL('../../src/pages/work-orders/work-orders.vue', import.meta.url), 'utf8')
const listTemplate = listPage.split('<script setup')[0]
const pagesConfig = readFileSync(new URL('../../src/pages.json', import.meta.url), 'utf8')
// DS07 moved display-only ownership to components. Verify both the component
// and its actual business-page use; never keep asserting deleted page-owned CSS.
const emptyStateSource = readFileSync(new URL('../../src/shared/ui/AppWorkOrderEmptyState.vue', import.meta.url), 'utf8')
const skeletonSource = readFileSync(new URL('../../src/shared/ui/AppWorkOrderSkeleton.vue', import.meta.url), 'utf8')
const searchBarSource = readFileSync(new URL('../../src/shared/ui/AppSearchBar.vue', import.meta.url), 'utf8')
const feedbackSource = readFileSync(new URL('../../src/shared/ui/AppFeedbackState.vue', import.meta.url), 'utf8')

describe('G4-UX Phase B2 Home', () => {
  it('keeps an authenticated, task-first work entry without fabricating task data', () => {
    expect(homeTemplate).toContain('class="home-page"')
    expect(homeTemplate).toContain(':url="workOrdersRoute"')
    expect(homeTemplate).toContain('今日任务')
    expect(homeTemplate).toContain('全部任务')
    expect(homeTemplate).toContain('查看当前可见工单')
    expect(homeTemplate).toContain('从当前可见的工单开始今天的工作')
    expect(homeTemplate).not.toContain('Technician Home')
    expect(homeTemplate).not.toContain('XLink Technician')
    expect(homeTemplate).not.toContain('Role-visible Work Orders')
    expect(homeTemplate).not.toMatch(/\b(count|counts|metric|metrics|SLA|trend|overdue)\b/i)
    expect(homePage).not.toContain('result.error?.message')
  })

  it('keeps account exit secondary to the work entry', () => {
    expect(homeTemplate).toContain('退出登录')
    expect(homeTemplate).toContain('class="home-footer"')
    expect(homeTemplate).toContain('class="work-orders-entry"')
  })

  it('exposes local draft diagnostics only through the non-production developer surface', () => {
    const qaConsole = readFileSync('src/pages/dev/qa-console.vue', 'utf8')
    expect(homeTemplate).not.toContain('LocalDraftDiagnosticsPanel')
    expect(homeTemplate).not.toContain('mock-source-indicator')
    expect(homeTemplate).not.toContain('dev-review-tools')
    expect(qaConsole).toContain('LocalDraftDiagnosticsPanel')
    expect(qaConsole).toContain('isBusinessMockDeveloperModeAvailable')
    expect(qaConsole).toContain('import.meta.env.DEV')
    expect(homePage).not.toContain('uni.getStorage')
    expect(homePage).not.toContain('uni.setStorage')
  })

  it('uses product-facing navigation titles for the authenticated surfaces', () => {
    expect(pagesConfig).toContain('"navigationBarTitleText": "修链"')
    expect(pagesConfig).toContain('"navigationBarTitleText": "工单"')
    expect(pagesConfig).not.toContain('"navigationBarTitleText": "XLink Technician"')
    expect(pagesConfig).not.toContain('"navigationBarTitleText": "Role-visible Work Orders"')
  })
})

describe('G4-UX Work Order List card', () => {
  it('uses production Chinese copy and preserves the single semantic list', () => {
    expect(emptyStateSource).toContain('当前暂无工单')
    expect(emptyStateSource).toContain('当前角色暂时没有可处理的工单，可稍后刷新再试。')
    expect(emptyStateSource).toContain('class="empty-state-card"')
    expect(emptyStateSource).toContain('class="empty-illustration"')
    expect(emptyStateSource).toContain('class="empty-state-title"')
    expect(emptyStateSource).toContain('class="empty-state-detail"')
    expect(emptyStateSource).toContain('name="refresh"')
    expect(skeletonSource).toContain('aria-label="正在加载工单"')
    expect(listTemplate).toContain('v-if="showLoadingSkeleton"')
    expect(listTemplate).toContain('isRefreshing')
    expect(listPage).toContain('appLoadingSkeletonDelayMs')
    expect(listPage).toContain('}, appLoadingSkeletonDelayMs)')
    expect(skeletonSource).toContain('skeleton-card-main')
    expect(skeletonSource).toContain('skeleton-card-footer')
    expect(listTemplate).not.toContain('<text class="state-title">正在加载工单</text>')
    expect(listTemplate).toContain('重新加载')
    expect(listTemplate).toContain('工单加载失败')
    expect(emptyStateSource).toContain('刷新工单')
    expect(listTemplate).toContain('搜索任务、客户、地址')
    expect(listTemplate).not.toContain('当前角色可见工单')
    expect(listTemplate).not.toContain('Role-visible Work Orders')
    expect(listTemplate).not.toContain('Default list for the current role')
    expect(listTemplate).not.toContain('class="page-title"')
    expect(listTemplate).not.toContain('class="page-subtitle"')
    // The compact item indicator represents the current returned page only;
    // it must never imply a backend total, SLA metric or fabricated counter.
    expect(listTemplate).toContain('{{ workOrders.items.length }} 条')
    expect(listTemplate).not.toContain('已加载 {{ workOrders.items.length }} 条')
    expect(listTemplate.replace(/list-loaded-count/g, '')).not.toMatch(/\b(tabs?|counts?|filters?|sort(?:ing)?)\b/i)
    expect(listTemplate).not.toContain('工作范围')
    expect(listTemplate).not.toContain('当前可见工单</text>')
    expect(listTemplate).toContain('appearance="search-empty"')
    expect(feedbackSource).toContain('class="app-feedback-state__search-illustration"')
    expect(listTemplate).toContain('<AppFeedbackState')
    expect(listTemplate).toContain('<AppWorkOrderEmptyState')
    expect(listTemplate).toContain('<AppWorkOrderSkeleton v-if="showLoadingSkeleton" variant="list" />')
  })

  it('renders bounded semantic card fields without raw adapter values', () => {
    expect(listTemplate).not.toContain('workOrders.error?.message')
    expect(listTemplate).not.toContain('{{ item.id }}')
    expect(listTemplate).not.toContain('{{ String(item.id) }}')
    expect(listTemplate).toContain('v-if="item.taskLabel" class="card-task"')
    expect(listTemplate).toContain('v-if="item.servicePartLabel" class="card-part-badge"')
    expect(listTemplate).toContain('v-if="item.customerName" class="card-customer"')
    expect(listTemplate).toContain('v-if="item.displayNumber" class="card-number"')
    expect(listTemplate).toContain('v-if="item.serviceDistrict" class="location-district"')
    expect(listTemplate).toContain('v-if="item.serviceAddress" class="location-address"')
    expect(listTemplate).toContain('v-if="item.distanceText" class="location-distance"')
    expect(listTemplate).toContain('v-if="item.communityOrderCount !== undefined"')
    expect(listTemplate).toContain('tone="info"')
    expect(listTemplate).toContain('item.communityOrderCount')
    expect(listTemplate).toContain('class="card-phone-button"')
    expect(listTemplate).toContain('@tap.stop="dialContact(item)"')
    expect(listTemplate).not.toContain('查看工单详情')
  })

  it('keeps session guard and semantic detail navigation intact', () => {
    expect(listTemplate).toContain('!canAccess')
    expect(listTemplate).not.toContain("workOrderDetailRouteFor(item.id) : ''")
    expect(listTemplate).toContain('@tap="openDetailIfAccessible(item)"')
    expect(listPage).toContain('if (!listActionFor(item).detailAccessible) return')
    expect(listTemplate).toContain('listActionFor(item).acceptOrder')
    expect(listPage).toContain('await workOrders.navigateTo(workOrderDetailRouteFor(item.id))')
    expect(listPage).toContain('session.status')
  })

  it('uses a compact R2-style card hierarchy without duplicating native navigation', () => {
    expect(searchBarSource).toContain('class="search-band"')
    expect(searchBarSource).toContain('class="search-input-shell"')
    expect(searchBarSource).toContain('class="search-button"')
    expect(searchBarSource).toContain('margin: 12rpx 8rpx 0;')
    expect(listPage).toContain('margin: 10px 0 0;')
    expect(listPage).toContain('padding: 12px 15px 22px;')
    expect(listTemplate).toContain('class="card-customer-row"')
    expect(listTemplate).toContain('<AppRecordCard')
    expect(listTemplate).toContain('<AppMetaTag')
    expect(listTemplate).toContain('<AppSectionHeading')
    expect(emptyStateSource).toContain('margin: 32rpx 8rpx 0;')
    expect(searchBarSource).toContain('flex: 0 0 128rpx;')
    expect(listTemplate).not.toContain('当前角色可见工单')
    expect(listTemplate).not.toContain('class="list-context"')
    expect(listPage).not.toContain('.context-refresh')
    expect(listTemplate).toContain('class="work-order-card"')
    expect(listTemplate).toContain('<AppRecordMark')
    expect(listTemplate).toContain(':icon="workOrderCardIconFor(item.taskLabel)"')
    expect(listTemplate).toContain('class="card-location"')
    expect(listTemplate).not.toContain('class="content-caption"')
    expect(listTemplate).not.toContain('class="content-refresh"')
    expect(listTemplate).not.toContain('class="bottom-nav"')
    expect(listTemplate).not.toContain('‹ 返回首页')
  })

  it('keeps R2 card icon and color semantics behind normalized task labels', () => {
    expect(workOrderCardToneFor('跟进签约')).toBe('orange')
    expect(workOrderCardToneFor('验收回款')).toBe('green')
    expect(workOrderCardToneFor('待接单')).toBe('blue')
    expect(workOrderCardToneFor('待预约')).toBe('orange')
    expect(workOrderCardToneFor('联系客户')).toBe('red')
    expect(workOrderCardToneFor('暂不上门')).toBe('gray')
    expect(workOrderCardToneFor('待下单')).toBe('purple')
    expect(workOrderCardToneFor('跟进方案')).toBe('purple')
    expect(workOrderCardToneFor('待评价')).toBe('green')
    expect(workOrderCardIconFor('跟进签约')).not.toBe(workOrderCardIconFor('待接单'))
  })
})
