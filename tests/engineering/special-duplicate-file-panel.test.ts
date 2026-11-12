import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import { duplicateFileDefinition } from '@adapters/api/mock/duplicate-file-fixture'
import { projectR1LocalFields } from '@features/work-orders/r1-local-form-fields'
import { r1SpecialMockWritableTypes } from '@features/work-orders/r1-special-mock-form-fields'
import { asOpaqueId, isR1FileWireArray } from '@shared/types'

// Actual SFC method bodies with Vue refs, not a DOM/browser test.
function methods(bindings: Record<string, unknown>) {
  const source=readFileSync('src/features/work-orders/R1DevMockDynamicFormTransactionPanel.vue','utf8').split('<script setup lang="ts">')[1]!.split('</script>')[0]!
  const ast=ts.createSourceFile('panel.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const names=['setField','removeMediaValue']
  const body=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text??'')).map(n=>n.getText(ast)).join('\n')
  const js=ts.transpile(body,{target:ts.ScriptTarget.ES2022})
  return new Function(...Object.keys(bindings),js+';return {setField,removeMediaValue};')(...Object.values(bindings)) as {setField:(k:string,v:unknown)=>void;removeMediaValue:(k:string,i:number)=>Promise<void>}
}
function setup(reverse=false) {
  const definition=formDefinition(duplicateFileDefinition(reverse),asOpaqueId<'FormDefinitionId'>('mock-definition'))
  const draftValues=ref<Record<string,any>>({inspectionResult:'follow_up',inspectionNote:'old'}),busy=ref(false)
  const viewFields=computed(()=>projectR1LocalFields(definition,draftValues.value))
  const file={url:'https://synthetic.invalid/shared.jpg',name:'shared.jpg',extname:'jpg'}
  draftValues.value.inspectionFiles=[file]
  const mediaTasks=ref<any[]>([
    {taskId:'hidden',scope:{fieldId:'mock-file-safe',valueKey:'inspectionFiles'},uploadedRef:{url:file.url}},
    {taskId:'other-key',scope:{fieldId:'mock-file-follow-up',valueKey:'other'},uploadedRef:{url:file.url}},
    {taskId:'active',scope:{fieldId:'mock-file-follow-up',valueKey:'inspectionFiles'},uploadedRef:{url:file.url}},
  ])
  const discardMedia=vi.fn(async()=>true),persistLocalDraft=vi.fn()
  const m=methods({busy,restoringDraft:ref(false),viewState:ref({}),viewFields,editableFieldTypes:r1SpecialMockWritableTypes,isR1FileWireArray,draftValues,
    persistLocalDraft,mediaTasks,controller:{discardMedia},selectedFormDefinitionId:ref('mock-definition'),editingId:ref(null),
    operationFeedback:ref(''),mediaValues:(key:string)=>draftValues.value[key]??[],revision:1,editRevision:0})
  return {m,draftValues,mediaTasks,discardMedia,persistLocalDraft,busy}
}
describe('actual Special Mock SFC repeated-key methods',()=>{
  for(const reverse of [false,true]) {
    it(`sets and clears only the active scalar sibling (reverse ${reverse})`,()=>{
      const {m,draftValues}=setup(reverse)
      m.setField('inspectionNote','new');expect(draftValues.value.inspectionNote).toBe('new')
      m.setField('inspectionNote','');expect(draftValues.value.inspectionNote).toBeUndefined()
    })
    it(`removes the active queue task, not a same-URL sibling (reverse ${reverse})`,async()=>{
      const {m,draftValues,discardMedia,mediaTasks}=setup(reverse)
      await m.removeMediaValue('inspectionFiles',0)
      expect(discardMedia).toHaveBeenCalledTimes(1)
      expect(discardMedia).toHaveBeenCalledWith('mock-definition','active',undefined)
      expect(mediaTasks.value.map(t=>t.taskId)).toEqual(['hidden','other-key'])
      expect(draftValues.value.inspectionFiles).toBeUndefined()
    })
  }
  it('does not discard a file task while the field has no active row',async()=>{
    const {m,draftValues,discardMedia}=setup();draftValues.value.inspectionResult='unknown'
    await m.removeMediaValue('inspectionFiles',0)
    expect(discardMedia).not.toHaveBeenCalled();expect(draftValues.value.inspectionFiles).toHaveLength(1)
  })
  it('does not mutate a locked editor',async()=>{
    const {m,draftValues,discardMedia,busy}=setup();busy.value=true
    m.setField('inspectionNote','tampered');await m.removeMediaValue('inspectionFiles',0)
    expect(discardMedia).not.toHaveBeenCalled();expect(draftValues.value.inspectionNote).toBe('old')
  })
})
