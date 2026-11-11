import {createHash} from 'node:crypto'
import type {Plugin} from 'vite'

/** Compatibility for the exact frozen Uni H5 runtime, not a general SDK patch.
 * No module on disk is modified. Unknown source fails the H5 build explicitly.
 * Keep SDK animation durations and DOM behavior; own only this picker's timers. */
export const UNI_H5_PICKER_SOURCE_SHA256='fa31f5346dc825357fcb59e38a384786af2f2fe5c86d69693422f4a69c14b389'
export function repairUniH5PickerLifecycle(source:string):string {
 if(createHash('sha256').update(source).digest('hex')!==UNI_H5_PICKER_SOURCE_SHA256)throw Error('Uni H5 picker compatibility source changed; review required')
 const once=(text:string,from:string,to:string)=>{
  if(text.split(from).length!==2)throw Error('Uni H5 picker compatibility seam changed')
  return text.replace(from,to)
 }
 let code=once(source,'function usePickerMethods(props2, state2, trigger, rootRef, pickerRef, selectRef, inputRef) {',`function usePickerMethods(props2, state2, trigger, rootRef, pickerRef, selectRef, inputRef) {
  let __xlinkPickerOpen, __xlinkPickerClose;
  let __xlinkPickerDisposed = false, __xlinkPickerEpoch = 0;
  onBeforeUnmount(() => {
    __xlinkPickerDisposed = true;
    ++__xlinkPickerEpoch;
    clearTimeout(__xlinkPickerOpen);
    clearTimeout(__xlinkPickerClose);
  });`)
 code=once(code,`  function _show(event) {
    if (props2.disabled) {
      return;
    }
    state2.valueChangeSource = "";
    let $picker = pickerRef.value;`, `  function _show(event) {
    if (props2.disabled || __xlinkPickerDisposed) {
      return;
    }
    clearTimeout(__xlinkPickerOpen);
    clearTimeout(__xlinkPickerClose);
    const __xlinkEpoch = ++__xlinkPickerEpoch;
    state2.valueChangeSource = "";
    let $picker = pickerRef.value;
    const __xlinkRoot = rootRef.value;
    if (!$picker || !__xlinkRoot) return;`)
 code=once(code,`    setTimeout(() => {
      state2.visible = true;
    }, 20);`, `    __xlinkPickerOpen = setTimeout(() => {
      if (!__xlinkPickerDisposed && __xlinkEpoch === __xlinkPickerEpoch
        && pickerRef.value === $picker && rootRef.value === __xlinkRoot) state2.visible = true;
    }, 20);`)
 code=once(code,`  function _close() {
    state2.visible = false;
    setTimeout(() => {
      let $picker = pickerRef.value;
      $picker.remove();
      rootRef.value.prepend($picker);
      $picker.style.display = "none";
    }, 260);
  }`, `  function _close() {
    if (__xlinkPickerDisposed) return;
    clearTimeout(__xlinkPickerOpen);
    clearTimeout(__xlinkPickerClose);
    const __xlinkEpoch = ++__xlinkPickerEpoch;
    state2.visible = false;
    const $picker = pickerRef.value, __xlinkRoot = rootRef.value;
    if (!$picker || !__xlinkRoot) return;
    __xlinkPickerClose = setTimeout(() => {
      if (__xlinkPickerDisposed || __xlinkEpoch !== __xlinkPickerEpoch
        || pickerRef.value !== $picker || rootRef.value !== __xlinkRoot) return;
      $picker.remove();
      __xlinkRoot.prepend($picker);
      $picker.style.display = "none";
    }, 260);
  }`)
 return code
}
export function uniH5PickerLifecycle():Plugin {
 let applied=false
 return {name:'xlink-pinned-uni-h5-picker-lifecycle',enforce:'pre',
  apply:()=>process.env.UNI_PLATFORM==='h5',
  transform(source,id){
   if(!id.split('?')[0]!.replace(/\\/g,'/').endsWith('/@dcloudio/uni-h5/dist/uni-h5.es.js'))return null
   const code=repairUniH5PickerLifecycle(source);applied=true;return {code,map:null}
  },
  generateBundle(){if(!applied)throw Error('Pinned Uni H5 picker lifecycle compatibility was not applied')},
 }
}
