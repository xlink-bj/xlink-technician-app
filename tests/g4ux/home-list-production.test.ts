import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const homePage = readFileSync(new URL('../../src/pages/index/index.vue', import.meta.url), 'utf8')
const homeTemplate = homePage.slice(
  homePage.indexOf('<view v-else-if="showHome"'),
  homePage.indexOf('<view v-else class="login-page">'),
)
const listPage = readFileSync(new URL('../../src/pages/work-orders/work-orders.vue', import.meta.url), 'utf8')
const listTemplate = listPage.split('<script setup')[0]
const pagesConfig = readFileSync(new URL('../../src/pages.json', import.meta.url), 'utf8')

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

  it('uses product-facing navigation titles for the authenticated surfaces', () => {
    expect(pagesConfig).toContain('"navigationBarTitleText": "修链"')
    expect(pagesConfig).toContain('"navigationBarTitleText": "工单"')
    expect(pagesConfig).not.toContain('"navigationBarTitleText": "XLink Technician"')
    expect(pagesConfig).not.toContain('"navigationBarTitleText": "Role-visible Work Orders"')
  })
})

describe('G4-UX Phase B2 Work Order List', () => {
  it('uses production Chinese copy and preserves the single semantic list', () => {
    expect(listTemplate).toContain('当前暂无工单')
    expect(listTemplate).toContain('当前范围内暂时没有可处理的工单，可稍后刷新再试。')
    expect(listTemplate).toContain('正在加载工单')
    expect(listTemplate).toContain('重新加载')
    expect(listTemplate).toContain('工单加载失败')
    expect(listTemplate).toContain('刷新工单')
    expect(listTemplate).not.toContain('工作台')
    expect(listTemplate).not.toContain('选择一项查看详情')
    expect(listTemplate).not.toContain('查看当前范围内可见的工单信息')
    expect(listTemplate).not.toContain('Role-visible Work Orders')
    expect(listTemplate).not.toContain('Default list for the current role')
    expect(listTemplate).not.toContain('class="page-title"')
    expect(listTemplate).not.toContain('class="page-subtitle"')
    expect(listTemplate).not.toMatch(/\b(tabs?|counts?|filters?|sort(?:ing)?)\b/i)
  })

  it('does not render raw adapter errors or WorkOrderId values', () => {
    expect(listTemplate).not.toContain('workOrders.error?.message')
    expect(listTemplate).not.toContain('{{ item.id }}')
    expect(listTemplate).not.toContain('{{ String(item.id) }}')
    expect(listTemplate).toContain('v-if="item.displayNumber" class="row-meta"')
    expect(listTemplate).toContain('{{ item.customerName || \'工单\' }}')
    expect(listTemplate).toContain('v-if="item.serviceAddress" class="row-address"')
    expect(listTemplate).not.toContain('查看工单详情')
  })

  it('keeps session guard and semantic detail navigation intact', () => {
    expect(listTemplate).toContain('!canAccess')
    expect(listTemplate).toContain(':url="workOrderDetailRouteFor(item.id)"')
    expect(listPage).toContain('session.status')
  })

  it('uses a compact R2-style card hierarchy without duplicating native navigation', () => {
    expect(listTemplate).toContain('class="content-refresh"')
    expect(listTemplate).toContain('class="work-order-row"')
    expect(listTemplate).toContain('class="row-meta"')
    expect(listTemplate).toContain('class="row-title"')
    expect(listTemplate).toContain('class="row-address"')
    expect(listTemplate).not.toContain('‹ 返回首页')
  })
})
