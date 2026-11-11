import {readFileSync} from 'node:fs'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {repairUniH5PickerLifecycle,uniH5PickerLifecycle} from '../../config/vite/uni-h5-picker-lifecycle'
const source=readFileSync('node_modules/@dcloudio/uni-h5/dist/uni-h5.es.js','utf8')
function method(code:string,name:string){const start=code.indexOf('  function '+name+'('),open=code.indexOf('{',start);if(start<0)throw Error('missing actual SDK method');let depth=1,i=open+1;for(;depth;i++){if(code[i]==='{')depth++;if(code[i]==='}')depth--}return code.slice(start,i)}
function instance(code:string){
 const hooks:(()=>void)[]=[],picker={remove:vi.fn(),style:{display:'none'}},root={prepend:vi.fn()},host={appendChild:vi.fn()},state:any={visible:false},props={disabled:false}
 const rootRef:any={value:root},pickerRef:any={value:picker}
 const begin=code.indexOf('function usePickerMethods('),headEnd=code.indexOf('  const isiPad',begin)
 const initialization=code.slice(code.indexOf('{',begin)+1,headEnd)
 const fn=new Function('props2','state2','rootRef','pickerRef','document','onBeforeUnmount',initialization+method(code.slice(begin),'_show')+method(code.slice(begin),'_close')+';return {show:_show,close:_close}')
 const actions=fn(props,state,rootRef,pickerRef,{querySelector:()=>host},(f:()=>void)=>hooks.push(f))
 return{...actions,state,props,picker,root,rootRef,pickerRef,showEvent:{currentTarget:{getBoundingClientRect:()=>({top:0,left:0,width:100,height:40})}},unmount(){hooks.forEach(f=>f());rootRef.value=null;pickerRef.value=null}}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})
describe('pinned actual Uni H5 picker compatibility',()=>{
 it('retains the actual baseline null.remove failure as a source characterization',()=>{vi.useFakeTimers();const h=instance(source);h.close();h.unmount();expect(()=>vi.runAllTimers()).toThrow(/remove/)})
 it('cancels owned close on unmount and cannot revive after refs are restored',()=>{vi.useFakeTimers();const h=instance(repairUniH5PickerLifecycle(source));h.close();expect(vi.getTimerCount()).toBe(1);h.unmount();h.rootRef.value=h.root;h.pickerRef.value=h.picker;expect(()=>vi.runAllTimers()).not.toThrow();expect(h.root.prepend).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0)})
 it('cancels pending show on unmount',()=>{vi.useFakeTimers();const h=instance(repairUniH5PickerLifecycle(source));h.show(h.showEvent);h.unmount();vi.runAllTimers();expect(h.state.visible).toBe(false);expect(h.root.prepend).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0)})
 it('reopening cancels the earlier close; only the new close reparents the picker',()=>{vi.useFakeTimers();const h=instance(repairUniH5PickerLifecycle(source));h.show(h.showEvent);vi.runAllTimers();h.close();h.show(h.showEvent);vi.runAllTimers();expect(h.state.visible).toBe(true);expect(h.picker.style.display).toBe('block');expect(h.root.prepend).not.toHaveBeenCalled();h.close();vi.runAllTimers();expect(h.picker.style.display).toBe('none');expect(h.root.prepend).toHaveBeenCalledTimes(1)})
 it('stale show/close handlers after disposal schedule nothing',()=>{vi.useFakeTimers();const h=instance(repairUniH5PickerLifecycle(source));h.unmount();h.show(h.showEvent);h.close();vi.runAllTimers();expect(h.picker.remove).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0)})
 it('disabled show remains inert and guards missing live refs',()=>{vi.useFakeTimers();const h=instance(repairUniH5PickerLifecycle(source));h.props.disabled=true;h.show(h.showEvent);expect(vi.getTimerCount()).toBe(0);h.props.disabled=false;h.pickerRef.value=null;h.show(h.showEvent);h.close();expect(vi.getTimerCount()).toBe(0)})
 it('unknown SDK bytes fail rather than silently skipping the compatibility fix',()=>{expect(()=>repairUniH5PickerLifecycle(source+'\n')).toThrow(/source changed/)})
 it('applies only to H5 and the exact SDK target, with a release application check',()=>{
  const plugin=uniH5PickerLifecycle();vi.stubEnv('UNI_PLATFORM','mp-weixin');expect((plugin.apply as any)()).toBe(false);vi.stubEnv('UNI_PLATFORM','h5');expect((plugin.apply as any)()).toBe(true)
  expect((plugin.transform as any)('unrelated','/src/other.js')).toBeNull();expect(()=> (plugin.generateBundle as any)()).toThrow(/not applied/)
  const out=(plugin.transform as any)(source,'/node_modules/@dcloudio/uni-h5/dist/uni-h5.es.js');expect(out.code).toContain('__xlinkPickerDisposed');expect(()=> (plugin.generateBundle as any)()).not.toThrow()
 })
})
