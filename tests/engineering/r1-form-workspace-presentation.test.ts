import {describe,it,expect} from 'vitest'
import {r1FormFieldGroups} from '@features/work-orders/r1-form-workspace-presentation'
import {asOpaqueId} from '@shared/types'
import type {FormDefinitionRead,FormFieldRead} from '@shared/ports'
const definition=(fields:FormFieldRead[]):FormDefinitionRead=>({id:asOpaqueId<'FormDefinitionId'>('e'),fields})
const field=(fieldId:string,type:FormFieldRead['type']='text',group?:string):FormFieldRead=>({fieldId,valueKey:'same',label:fieldId,type,required:false,readOnly:false,...(group?{presentation:{group}}:{})})
describe('normal form presentation preserves source rows',()=>{
 it('pairs only adjacent numeric source rows and retains duplicate value keys',()=>{
  const fields=[field('a','digit'),field('b','number'),field('c'),field('d','digit')]
  const rows=fields.map(f=>({fieldId:f.fieldId,text:f.fieldId}))
  const groups=r1FormFieldGroups(definition(fields),rows)
  expect(groups.map(g=>g.fields.map(f=>f.fieldId))).toEqual([['a','b'],['c'],['d']])
  expect(groups.flatMap(g=>g.fields)).toEqual(rows)
 })
 it('never bridges hidden source rows or moves a later same-name group',()=>{
  const fields=[field('a','digit','现场'),field('hidden','text'),field('b','digit','现场'),field('c','text','说明'),field('d','text','现场')]
  const rows=fields.filter(f=>f.fieldId!=='hidden').map(f=>({fieldId:f.fieldId}))
  const groups=r1FormFieldGroups(definition(fields),rows)
  expect(groups.map(g=>g.fields.map(f=>f.fieldId))).toEqual([['a'],['b'],['c'],['d']])
  expect(groups.map(g=>g.title)).toEqual(['现场','现场','说明','现场'])
 })
 it('uses source explicit grouping without conflating record values or fabricating rows',()=>{
  const fields=[field('a','text','资料'),field('b','file','资料'),field('c','file')]
  const groups=r1FormFieldGroups(definition(fields),[{fieldId:'a'},{fieldId:'b'},{fieldId:'c'}])
  expect(groups.map(g=>g.fields.map(f=>f.fieldId))).toEqual([['a','b'],['c']])
  expect(r1FormFieldGroups(definition(fields),[])).toEqual([])
 })
})
