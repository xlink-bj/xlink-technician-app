import {test,expect} from '@playwright/test'
import {searchMockWorkOrder} from '../support/search-mock-work-order'
for(const scene of ['single','multiple','direct','references','empty','failed','denied','unknown'] as const){
 test(`completed appointment ${scene}: offline actual App archive`,async({page,baseURL},info)=>{
  const network:string[]=[],errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin===baseURL&&request.method()==='GET')return route.continue();network.push(request.method()+' '+url.pathname);return route.abort('blockedbyclient')})
  await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL!).host)socket.connectToServer();else{network.push('WS');socket.close()}})
  await page.goto('/#/pages/index/index');await expect(page.locator('.home-page')).toBeVisible()
  await page.evaluate(async scene=>{const modulePath='/src/adapters/api/mock/appointment-archive-read.ts';const fixture=await import(/* @vite-ignore */modulePath);fixture.setAppointmentArchiveMockScene(scene)},scene)
  await page.locator('.work-orders-entry').click();await(await searchMockWorkOrder(page,{orderNum:'19017',customer:'邓先生'})).click()
  await expect(page.getByTestId('appointment-archive')).toBeVisible()
  if(['failed','denied','unknown'].includes(scene)){
   await expect(page.getByTestId('appointment-archive-error')).toBeVisible();await expect(page.getByTestId('appointment-archive-empty')).toHaveCount(0)
  }else if(scene==='empty'){
   await expect(page.getByTestId('appointment-archive-empty')).toBeVisible();await expect(page.getByTestId('appointment-archive-open')).toHaveCount(0)
  }else{
   await page.getByTestId('appointment-archive-open').click()
   if(['multiple','references'].includes(scene)){
    await expect(page.getByTestId('appointment-record-appointment-history-a')).toBeVisible()
    await page.getByTestId('appointment-record-appointment-history-b').click();await expect(page.getByTestId('appointment-record-detail')).toContainText('15:25')
    await page.getByTestId('appointment-archive-open').click();await page.getByTestId('appointment-record-appointment-history-a').click()
   }
   await expect(page.getByTestId('appointment-record-detail')).toContainText('10:37');await expect(page.getByTestId('appointment-record-detail')).not.toContainText('10:37:42')
   await expect(page.getByTestId('appointment-read-only')).toBeVisible();await expect(page.getByTestId('appointment-modify')).toHaveCount(0)
   await page.screenshot({path:info.outputPath('completed-appointment-detail-430x932.png'),fullPage:true})
   if(scene==='single'){await page.reload();await expect(page.getByTestId('appointment-record-detail')).toContainText('10:37');await expect(page.getByTestId('appointment-modify')).toHaveCount(0)}
  }
  await page.screenshot({path:info.outputPath('completed-appointment-final-430x932.png'),fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);expect(network).toEqual([])
  await info.attach('offline-history-ledger',{body:JSON.stringify({scene,network,errors,realBackend:'NOT_RUN',writes:0,offlineMockOnly:true}),contentType:'application/json'})
 })
}
