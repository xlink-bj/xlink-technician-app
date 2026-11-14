import * as workspacePresentation from '@features/work-orders/r1-form-workspace-presentation'
import * as inputValidity from '@shared/ui/form-input-validity'
import * as normalDraftPort from '@features/work-orders/r1-normal-form-drafts'
import * as normalFileValues from '@features/work-orders/r1-normal-file-values'
import * as retainedFileValues from '@shared/form/r1-retained-file-values'
import * as configuredFileRead from '@shared/form/r1-configured-file-read-evidence'
import fs from 'node:fs'
import * as appointmentCodec from '@features/work-orders/r1-repeat-appointment-edit'
import * as appointmentTime from '@features/work-orders/appointment-time'
import * as causeRead from '@features/work-orders/survey-leakage-cause-read'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'

import { formDefinition } from '@adapters/api/read-models/form'
import { createR1ScopedFormReader } from '@adapters/api/r1-scoped-form-read'
import { createSurveyReadOnlyMediaCodec } from '@adapters/api/survey-readonly-media-codec'
import * as repeatForm from '@features/work-orders/r1-repeat-form'
import * as recordReadFields from '@features/work-orders/r1-record-read-fields'
import * as readerPort from '@features/work-orders/r1-node-forms-read'
import * as actionPort from '@features/work-orders/r1-repeat-actions-port'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { asOpaqueId } from '@shared/types'

// Mount the actual SFC script + template in Vue's custom renderer. Only the
// visual primitives are test controls; no DOM/browser, API, auth or writes.
interface Host { type: string; props: Record<string, any>; text: string; children: Host[]; parent: Host | null }
export const node = (type: string, text = ''): Host => ({ type, text, props: {}, children: [], parent: null })
export const renderer = Vue.createRenderer<Host, Host>({
  patchProp: (el, key, _prev, value) => { el.props[key] = value },
  insert(el, parent, anchor = null) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = parent; const i = anchor ? parent.children.indexOf(anchor) : -1; if (i < 0) parent.children.push(el); else parent.children.splice(i, 0, el) },
  remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
  createElement: tag => node(tag), createText: text => node('#text', text), createComment: text => node('#comment', text),
  setText: (el, text) => { el.text = text }, setElementText: (el, text) => { el.children = []; el.text = text },
  parentNode: el => el.parent, nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
})
const Button = Vue.defineComponent({ inheritAttrs: false, props: ['disabled', 'loading'], emits: ['tap'], setup: (props, ctx) => () => Vue.h('button', { ...ctx.attrs, disabled: props.disabled, onTap: () => ctx.emit('tap') }, ctx.slots.default?.()) })
const Field = Vue.defineComponent({ inheritAttrs: false, setup: (_, ctx) => () => Vue.h('field', ctx.attrs, ctx.slots.default?.()) })
const Control = Vue.defineComponent({ props: ['field', 'modelValue', 'disabled'], emits: ['update:modelValue'], setup: (props, ctx) => () => Vue.h('input', { 'data-key': props.field.valueKey, value: props.modelValue, disabled: props.disabled, onInput: (value: unknown) => ctx.emit('update:modelValue', value) }) })
export function component(file:string, panel?:Vue.Component) {
 const filename=path.resolve('src/features/work-orders/'+file+'.vue'),{descriptor}=parse(readSfc(filename),{filename})
 const source=compileScript(descriptor,{id:'normal-forms-count-'+file,inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:(tag:string)=>tag==='picker'}}}).content.replaceAll('import.meta.env','({DEV:false})')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 const modules:Record<string,unknown>={'./r1-form-workspace-presentation':workspacePresentation,'@shared/ui/AppTaskSectionHeading.vue':{__esModule:true,default:Field},'./r1-repeat-appointment-edit':appointmentCodec,'./survey-leakage-cause-read':causeRead,'../appointment-time':appointmentTime,'../R1FormFieldControl.vue':{__esModule:true,default:Control},'./components/NormalAppointmentEditExperience.vue':{__esModule:true,get default(){return component('components/NormalAppointmentEditExperience')}},'./AppointmentTimeSelectionContent.vue':{__esModule:true,get default(){return component('components/AppointmentTimeSelectionContent')}},'./components/SurveyLeakageCauseExperience.vue':{__esModule:true,default:Field},'@shared/ui/ActionWorkspaceShell.vue':{__esModule:true,default:Field},'@shared/ui/AppActionContentHeading.vue':{__esModule:true,default:Field},'@shared/ui/AppSelector.vue':{__esModule:true,default:Button},'@shared/ui/AppInformationRow.vue':{__esModule:true,default:Field},'@shared/ui/AppIcon.vue':{__esModule:true,default:Field},vue:Vue,'@shared/ui/form-input-validity':inputValidity,'./r1-normal-form-drafts':normalDraftPort,'./r1-normal-file-values':normalFileValues,'./R1NormalFileField.vue':{__esModule:true,default:Vue.defineComponent({render:()=>Vue.h('file-field')})},'./r1-repeat-form':repeatForm,'./r1-record-read-fields':recordReadFields,'./r1-repeat-actions-port':actionPort,'./r1-node-forms-read':readerPort,
 '@shared/form/r1-retained-file-values':retainedFileValues,'@shared/form/r1-configured-file-read-evidence':configuredFileRead,
 './R1NodeFormsReadPanel.vue':{__esModule:true,default:panel},'@shared/ui/AppButton.vue':{__esModule:true,default:Button},'@shared/ui/AppField.vue':{__esModule:true,default:Field},'./R1FormFieldControl.vue':{__esModule:true,default:Control},'@shared/ui/AppInput.vue':{__esModule:true,default:Field},'./R1LocalFormFieldEditor.vue':{__esModule:true,default:Field}}
 const module={exports:{} as {default:Vue.Component}};new Function('require','module','exports',js)((key:string)=>{if(!(key in modules))throw Error('Unstubbed '+key);return modules[key]},module,module.exports);return module.exports.default
}

function readSfc(filename:string):string{return fs.readFileSync(filename,'utf8')}
export function find(root:Host,predicate:(n:Host)=>boolean):Host|undefined{if(predicate(root))return root;for(const c of root.children){const f=find(c,predicate);if(f)return f}}
export function all(root:Host,predicate:(n:Host)=>boolean):Host[]{return[...(predicate(root)?[root]:[]),...root.children.flatMap(c=>all(c,predicate))]}
export function text(root:Host):string{return root.type==='#comment'?'':root.text+root.children.map(text).join('')}
export async function settle(){for(let i=0;i<120;i++){await Promise.resolve();await Vue.nextTick()}}
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve}}
