import {test,expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'
import {rootPath} from '../../config/paths'
import {normalWorkspaceFixture} from '../support/normal-workspace-fixture'
const shot=(name:string)=>rootPath(`.review/S01-真实App/after-mock-${name}.png`)
for(const viewport of [{width:430,height:932},{width:390,height:844},{width:375,height:667}])
test('S01 '+viewport.width+' normal host preserves configured order and inline numeric fields; save stays separate from Workflow',async({page,baseURL})=>{
 await page.setViewportSize(viewport)
 const f=await normalWorkspaceFixture(page,baseURL!)
 Object.assign(f.workOrder,{address:'示例路 18 号 · 现场服务中心 2 栋 1203 室'});f.workOrder.name='王女士';f.workOrder.orderNum='26019';f.node.nodeDef.name='现场记录'
 const specs=[{name:'area',type:'digit',nameDisp:'测量面积（㎡）',required:'1',group:'现场测量'},
  {name:'length',type:'number',nameDisp:'测量长度（m）',required:'0',group:'现场测量'},
  {name:'note',type:'textarea',nameDisp:'现场说明',required:'0',group:'现场记录'}]
 f.fields.forEach((field,index)=>{Object.assign(field,specs[index],{multiple:false,frontEndConfig:'{}'});delete field.valueOption;delete field.group})
 await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click()
 await expect(page.getByTestId('r1-normal-form-read')).toHaveCount(0)
 await page.getByTestId('task-focus-action').click();await expect(page).toHaveURL(/action-workspace/)
 await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
 const field=(key:string)=>page.getByTestId('r1-normal-input-'+key)
 await expect(field('area')).toBeVisible();await expect(page.getByTestId('work-order-summary-address')).toContainText('示例路');
 const overflow=await page.getByTestId('action-workspace-context').evaluate(el=>el.scrollWidth>el.clientWidth);expect(overflow).toBe(false);
 mkdirSync(rootPath('.review/S01-真实App'),{recursive:true});await page.screenshot({path:shot('empty'+(viewport.width===430?'':'-'+viewport.width)),fullPage:false})
 await field('area').locator('input,textarea').fill('18.75');await field('length').locator('input,textarea').fill('3');await field('note').locator('input,textarea').fill('已核对现场尺寸，待确认后续处理。')
 await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false')
 {await expect(page.getByTestId('s01-normal-form')).toBeVisible();await expect(page.getByTestId('s01-source-group').first()).toContainText('数值信息');
  const save=page.getByTestId('r1-normal-save');expect(await save.evaluate(el=>Boolean(el.closest('[data-testid="app-action-bar"]')))).toBe(true)
  const box=await save.boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height)
  await expect(page.getByTestId('r1-normal-complete-unavailable')).toHaveAttribute('aria-disabled','true')}
 await field('note').locator('input,textarea').blur();await page.screenshot({path:shot('filled'+(viewport.width===430?'':'-'+viewport.width)),fullPage:false})
 await page.getByTestId('r1-normal-save').click();await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('当前节点尚未完成')
 expect(f.state.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n']);expect(f.state.payloads[0]).toMatchObject({area:18.75,length:3,note:'已核对现场尺寸，待确认后续处理。'});expect(f.state.unexpected).toEqual([]);expect(f.state.errors).toEqual([])
})

test('uncertain save remains protected across real H5 reload and cannot replay from the footer',async({page,baseURL})=>{
 const f=await normalWorkspaceFixture(page,baseURL!);let saves=0
 await page.route('**/xlink/wm/biz/extForm/upsert/e',route=>{saves++;return route.abort('failed')})
 await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click()
 await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
 await page.getByTestId('task-focus-action').click()
 const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'})
 await read().click();await page.getByTestId('r1-normal-input-memo').locator('input,textarea').fill('结果待核对')
 await page.getByTestId('r1-normal-save').click()
 await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成或结果尚未核实')
 await expect(page.getByTestId('r1-normal-save')).toHaveCount(0);expect(saves).toBe(1)
 mkdirSync(rootPath('.review/S01-真实App'),{recursive:true});await page.screenshot({path:shot('uncertain'),fullPage:false})
 await page.reload();await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
 await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await page.getByTestId('task-focus-action').click();await read().click()
 await expect(page.getByTestId('r1-normal-draft-status')).toContainText('上次保存结果尚未核实')
 await expect(page.getByTestId('r1-normal-draft-restore')).toHaveCount(0)
 await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
 expect(saves).toBe(1);expect(f.state.writes).toEqual([]);expect(f.state.unexpected).toEqual([]);expect(f.state.errors).toEqual([])
})
