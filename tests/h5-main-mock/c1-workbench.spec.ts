import { test, expect, type Page } from '@playwright/test'
const brand = process.env.VITE_XLINK_BRAND === 'yuhong' ? 'yuhong' : 'xlink'
async function ready(page:Page) { await expect(page.locator('.c1-next')).toBeVisible(); await expect(page.locator('.c1-demo')).toHaveText('演示数据') }
async function home(page:Page) { await page.getByTestId('main-tab-home').click(); await ready(page) }
async function capture(page:Page, name:string) {
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
 await page.screenshot({path:`.review/c1/${brand}-${name}.png`,fullPage:true})
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
 await page.screenshot({path:`.review/c1/${brand}-${name}-lower.png`})
 await page.evaluate(()=>window.scrollTo(0,0))
}
test.beforeEach(async ({page,baseURL})=>{
 await page.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort('blockedbyclient'))
})
for (const width of [430,360]) test(`C1 real task journeys, four todos and four work selections at ${width}`,async({page})=>{
 test.setTimeout(180_000)
 await page.setViewportSize({width,height:932}); const warnings:string[]=[]
 page.on('pageerror',e=>warnings.push(e.message));page.on('console',m=>{if(/Extraneous non-props attributes/.test(m.text()))warnings.push(m.text())})
 await page.goto('/#/pages/index/index');await ready(page)
 await expect(page.locator('.c1-todo .c1-count')).toHaveText(['1','0','1','2'])
 await expect(page.locator('.c1-schedule-row')).toHaveCount(2)
 await page.screenshot({path:`.review/c1/${brand}-final-first-${width}.png`});await capture(page,`final-full-${width}`)
 const initialDepth=await page.evaluate(()=>getCurrentPages().length)
 for (const [key,count] of [['to_accept',1],['need_contact',0],['onsite',1],['following',2]] as const) {
  await page.getByTestId(`home-todo-${key}`).click();await expect(page.getByTestId(`work-order-category-${key}`)).toHaveAttribute('aria-selected','true')
  await expect(page.locator('.card-customer')).toHaveCount(count)
  if(key==='onsite') await expect(page.locator('.card-customer')).toHaveText(['邓先生'])
  expect(await page.evaluate(()=>getCurrentPages().length)).toBe(initialDepth); await home(page)
 }
 await page.getByTestId('home-next').dblclick();await expect(page).toHaveURL(/detail\?id=mock-work-order-017-survey-success/)
 await expect(page.locator('.detail-page')).toContainText('邓先生');expect(await page.evaluate(()=>getCurrentPages().length)).toBe(initialDepth+1)
 await page.goBack();await ready(page)
 for (const id of ['mock-work-order-017-survey-success','mock-work-order-002']) {
  await page.getByTestId(`home-schedule-${id}`).click();await expect(page).toHaveURL(new RegExp(`detail\\?id=${id}`));await expect(page.locator('.detail-page')).toBeVisible()
  if(id.endsWith('002')) {await page.getByTestId('construction-read-entry').click();await expect(page).toHaveURL(/construction-read/);await expect(page.getByText('清理女儿墙根部浮灰，检查基层裂缝。')).toBeVisible();await page.goBack()}
  await page.goBack();await ready(page)
 }
 for(const kind of ['all','survey','construction','acceptance']) {
  await page.getByTestId(`home-work-${kind}`).click();await expect(page.locator('.work-order-card').first()).toBeVisible()
  if(kind==='survey')await expect(page.locator('.card-customer')).toHaveText(['邓先生'])
  if(kind==='construction'||kind==='acceptance')await expect(page.locator('.card-customer')).toHaveText(['陈女士（东坝国际商贸中心业主）'])
  await page.locator('.work-order-card').first().click();await expect(page.locator('.detail-page')).toBeVisible();await page.goBack();await home(page)
 }
 expect(warnings).toEqual([])
})
test('long identity, address and title wrap without hiding touch controls at 360',async({page})=>{
 await page.setViewportSize({width:360,height:932});await page.goto('/#/pages/index/index');await ready(page)
 await page.evaluate(async()=>{
  const statePath='/src/shared/state/index.ts', boardPath='/src/features/home/workbench.ts'
  const session=(await import(statePath)).useSessionStore(),board=(await import(boardPath)).useWorkbenchStore()
  session.session.user.displayName='王师傅·防水维修与客户现场服务负责人'
  board.next.title='防水维修与交付现场情况复核——超长事项标题和附加服务说明'
  board.next.order.serviceAddress='示例市示例区示例街道示例小区北区三号楼一单元十八层东侧房间外墙及屋面连接处'
  board.tasks[0]=board.next
 })
 await expect(page.locator('.c1-greeting')).toContainText('客户现场服务负责人');await capture(page,'long-360')
 for(const selector of ['.c1-primary','.c1-todo','.c1-shortcut','.c1-schedule-row'])for(const element of await page.locator(selector).all()){const b=await element.boundingBox();expect(b?.height).toBeGreaterThanOrEqual(44)}
})
test('failed, missing, empty and real-source unavailable states never reuse demo facts',async({page})=>{
 await page.goto('/#/pages/index/index');await ready(page)
 async function change(mode:'error'|'empty'|'missing'|'real') {
  await page.evaluate(async mode=>{
   const statePath='/src/shared/state/index.ts',boardPath='/src/features/home/workbench.ts',mockPath='/src/app/business-mock.ts'
   const session=(await import(statePath)).useSessionStore(),board=(await import(boardPath)).useWorkbenchStore(),mock=await import(mockPath)
   const demo=mode==='empty'?{date:'2026-11-16',appointments:[],completedIds:[]}:null
   if(mode==='real')mock.setBusinessMockMode('off')
   board.configure({listWorkOrders:async()=>mode==='error'?{state:'failed_retryable',error:{category:'network_retryable'}}:{state:'succeeded',data:{items:mode==='empty'?[]:[{id:'synthetic-state-order',taskLabel:mode==='missing'?undefined:'当前可见事项'}],totalCount:mode==='empty'?0:100}}},()=>session.session,()=>demo,()=>session.endSession())
   await board.refresh()
  },mode)
 }
 await change('error');await expect(page.getByText('工作事项加载失败',{exact:true})).toBeVisible();await expect(page.locator('.c1-schedule-row')).toHaveCount(0);await expect(page.locator('.c1-month-value')).toHaveText('暂不可用');await capture(page,'error-430')
 await change('empty');await expect(page.getByText('暂无可查看的工单',{exact:true})).toBeVisible();await expect(page.locator('.c1-todo .c1-count')).toHaveText(['0','0','0','0']);await capture(page,'empty-430')
 await change('missing');await expect(page.locator('.c1-next')).toContainText('客户与地点待确认');await expect(page.locator('.c1-month-value')).toHaveText('未接入');await capture(page,'missing-430')
 await change('real');await expect(page.locator('.c1-demo')).toHaveCount(0);await expect(page.locator('.c1-schedule-row')).toHaveCount(0);await expect(page.locator('.c1-todo .c1-count')).toHaveText(['—','—','—','—']);await expect(page.locator('.c1-next')).not.toContainText('10:00');await capture(page,'nonmock-unavailable-430')
})
test('role change clears a held response, and returning roots reloads the current scope',async({page})=>{
 await page.goto('/#/pages/index/index');await ready(page)
 await page.evaluate(async()=>{
  const boardPath='/src/features/home/workbench.ts',statePath='/src/shared/state/index.ts'
  const board=(await import(boardPath)).useWorkbenchStore(),session=(await import(statePath)).useSessionStore()
  let release:(r:unknown)=>void=()=>{}
  board.configure({listWorkOrders:()=>new Promise(resolve=>{release=resolve})},()=>session.session,()=>null,()=>session.endSession())
  void board.refresh();const oldRelease=release;session.session.roleVersion='c1-new-role-version'
  oldRelease({state:'succeeded',data:{items:[{id:'old-role-order',customerName:'旧身份客户'}]}})
 })
 await expect(page.getByText('旧身份客户')).toHaveCount(0);await expect(page.locator('.c1-schedule-row')).toHaveCount(0);await expect(page.locator('.c1-demo')).toHaveCount(0)
 await page.getByTestId('main-tab-me').click();await page.locator('.main-logout').click();await page.locator('.uni-modal__btn').filter({hasText:'取消'}).click();await expect(page.locator('.me-page')).toBeVisible()
 await page.locator('.main-logout').click();await page.locator('.uni-modal__btn').filter({hasText:'退出登录'}).click();await expect(page.locator('.login-page')).toBeVisible();await expect(page.locator('.c1-workbench')).toHaveCount(0)
 await page.reload();await ready(page)
})
