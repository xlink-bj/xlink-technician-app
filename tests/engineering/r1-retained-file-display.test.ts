import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import {parse,compileScript} from '@vue/compiler-sfc'
import * as Vue from 'vue'
import {it,expect,vi} from 'vitest'
import * as retained from '@shared/form/r1-retained-file-values'
import * as imageContract from '@shared/form/r1-normal-image-contract'

type Host={type:string;props:Record<string,any>;text:string;children:Host[];parent:Host|null}
const node=(type:string,text=''):Host=>({type,text,props:{},children:[],parent:null})
const renderer=Vue.createRenderer<Host,Host>({
  patchProp:(el,key,_old,value)=>{el.props[key]=value},
  insert(el,parent){if(el.parent)el.parent.children.splice(el.parent.children.indexOf(el),1);el.parent=parent;parent.children.push(el)},
  remove(el){if(el.parent)el.parent.children.splice(el.parent.children.indexOf(el),1)},
  createElement:tag=>node(tag),createText:text=>node('#text',text),createComment:text=>node('#comment',text),
  setText:(el,text)=>{el.text=text},setElementText:(el,text)=>{el.children=[];el.text=text},
  parentNode:el=>el.parent,nextSibling:el=>el.parent?.children[el.parent.children.indexOf(el)+1]??null,
})
const all=(n:Host):Host[]=>[n,...n.children.flatMap(all)]
const text=(n:Host):string=>n.text+n.children.map(text).join('')
function component(){
  const filename=path.resolve('src/features/work-orders/R1NormalFileField.vue')
  const {descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename})
  const source=compileScript(descriptor,{id:'retained-file-display',inlineTemplate:true}).content
    .replaceAll('import.meta.env',JSON.stringify({VITE_XLINK_MEDIA_DOWNLOAD_BASE_URL:'https://media.example.test/assets'}))
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const Button=Vue.defineComponent({props:['disabled'],emits:['tap'],setup:(p,c)=>()=>Vue.h('button',{...c.attrs,disabled:p.disabled,onTap:()=>c.emit('tap')},c.slots.default?.())})
  const modules:Record<string,unknown>={vue:Vue,'@shared/form/r1-retained-file-values':retained,'@shared/form/r1-normal-image-contract':imageContract,'@shared/ui/AppButton.vue':{default:Button}}
  const module={exports:{} as {default:Vue.Component}}
  new Function('require','module','exports',js)((key:string)=>{if(!(key in modules))throw Error('Unmapped '+key);return modules[key]},module,module.exports)
  return module.exports.default
}
async function mounted(retain:boolean,url:string,remove=false){
  const item={url,name:'recognizable-photo.jpg',extname:'jpg',...(retain?{rotation:0,sourceInfo:{keep:'original'}}:{})}
  const root=node('root'),changed=vi.fn(),File=component()
  const app=renderer.createApp({render:()=>Vue.h(File,{field:{fieldId:'f',valueKey:'photos'},modelValue:[item],retained:retain,allowRetainedRemoval:remove,'onUpdate:modelValue':changed})})
  app.mount(root);await Vue.nextTick();return{app,root,item,changed}
}
it.each([false,true])('safe preview URL policy stays available for retained=%s',async retain=>{
  const h=await mounted(retain,'https://media.example.test/assets/photo.jpg?signature=synthetic')
  try{const images=all(h.root).filter(n=>n.type==='image');expect(images).toHaveLength(1);expect(images[0].props.src).toBe(h.item.url);expect(all(h.root).filter(n=>n.type==='button')).toHaveLength(0)}finally{h.app.unmount()}
})
it('cross-origin retained file keeps its recognizable filename without a remote image',async()=>{
  const h=await mounted(true,'https://other.example.test/photo.jpg')
  try{expect(all(h.root).filter(n=>n.type==='image')).toHaveLength(0);expect(text(h.root)).toContain('recognizable-photo.jpg')}finally{h.app.unmount()}
})
it('retained remove is explicit and does not mutate the saved metadata object',async()=>{
  const h=await mounted(true,'https://media.example.test/assets/photo.jpg',true),before=structuredClone(h.item)
  try{const button=all(h.root).find(n=>n.props['data-testid']==='r1-normal-file-remove-photos-0')!;button.props.onTap();await Vue.nextTick();expect(h.changed).toHaveBeenCalledWith([]);expect(h.item).toEqual(before)}finally{h.app.unmount()}
})
