import { decodeR1ScopedJson } from './r1-scoped-json'
import type { FormFieldOptionRead, FormFieldRead } from '@shared/ports'
import type { ApiReadTransport } from './technician-api'

type Row = Record<string, unknown>
type ProviderKind = 'code' | 'cascade' | 'proj-package'
interface FieldBinding {
  readonly tenantId: string
  readonly definitionId: string
  readonly fieldId: string
  readonly fieldType: string
  readonly providerId: string
  readonly kind: ProviderKind
  readonly params?: Readonly<Record<string,string|number>>
}

// Safety ceilings, not claims about any live provider's size or contents.
const MAX_OPTIONS = 5000
const MAX_DEPTH = 20
const fail = (): never => { throw Error('R1 field option binding or provider response is unverified') }
const row = (v: unknown): Row => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail()
  const prototype = Object.getPrototypeOf(v)
  return prototype === Object.prototype || prototype === null ? v as Row : fail()
}
const text = (v: unknown, max = 256): string => typeof v === 'string'
  && v.length > 0 && v.length <= max && v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v) ? v : fail()
const providerId = (v: unknown): string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : fail()

/** An empty historical calculation shell has no executable rules. */
export function isR1EmptyCalculationConfig(value:unknown):boolean {
  if(value==null||value==='')return true
  try{return Object.keys(row(decodeR1ScopedJson(value))).length===0}catch{return false}
}

/** Bind before transport, using raw ExtField evidence rather than the lenient
 * mapper's coerced aliases. Code/Cascade and the bounded type0 projPackage
 * mapping are supported; arbitrary URLs and pricing providers are not.
 * The caller has already checked the role-listed node and raw Ext ownership. */
export function bindR1ScopedFieldOptions(input: {
  readonly rawField: unknown
  readonly field: FormFieldRead
  readonly tenantId: string
  readonly definitionId: string
  readonly sourceType?: unknown
}): FieldBinding | null {
  const raw = row(input.rawField), field = input.field
  const tenantId = text(input.tenantId), definitionId = text(input.definitionId)
  if (raw.tenantId !== tenantId || raw.extId !== definitionId || raw.state !== 1
    || text(raw._id) !== field.fieldId || text(raw.name) !== field.valueKey || text(raw.type) !== field.type) fail()
  const aliases: ReadonlyArray<readonly [readonly string[], string]> = [
    [['id', 'fieldId'], field.fieldId], [['formDefId', 'definitionId'], definitionId],
    [['key', 'fieldName'], field.valueKey], [['fieldType'], field.type],
  ]
  for (const [keys, expected] of aliases) {
    for (const key of keys) if (key in raw && raw[key] !== expected) fail()
  }
  const hasReference = raw.valueOption !== undefined && raw.valueOption !== null && raw.valueOption !== ''
  if (!hasReference) {
    if (field.valueOption !== undefined) fail()
    return null
  }
  const reference = providerId(raw.valueOption)
  if(field.type==='bizSelect'){
    // Source-fixed R1 business selector; no arbitrary URL or pricing-provider
    // substitution. This binds reading only, never record/field edit authority.
    if(input.sourceType!=='0'||reference!=='projPackage'||reference!==field.valueOption
      ||raw.options!==undefined||raw.items!==undefined||!isR1EmptyCalculationConfig(raw.calculateConfig)||raw.router)fail()
    const cfg=row(decodeR1ScopedJson(raw.frontEndConfig))
    if(Object.keys(cfg).some(k=>!['url','params','label','value','placeholder','errorMsg','sortField','sortOrder'].includes(k))
      ||cfg.url!=='biz/projPackage/query.do'||cfg.label!=='name'||cfg.value!=='_id'
      ||cfg.placeholder!==undefined&&typeof cfg.placeholder!=='string'
      ||['errorMsg','sortField','sortOrder'].some(k=>cfg[k]!==undefined&&(typeof cfg[k]!=='string'||(cfg[k] as string).length>4000)))fail()
    const params=row(decodeR1ScopedJson(cfg.params))
    if(!Object.hasOwn(params,'_all')||![1,'1'].includes(params._all as string|number)
      ||Object.keys(params).some(k=>!['_all','in:serviceType|array#and'].includes(k)))fail()
    const filter=params['in:serviceType|array#and']
    if(filter!==undefined&&(typeof filter!=='string'||!filter||filter.length>512
      ||filter.split(',').some(v=>!/^[A-Za-z0-9_-]{1,128}$/.test(v))))fail()
    return Object.freeze({tenantId,definitionId,fieldId:field.fieldId,fieldType:field.type,
      providerId:reference,kind:'proj-package',params:Object.freeze({...params}) as Readonly<Record<string,string|number>>})
  }
  if (reference !== field.valueOption || !['radio', 'select', 'checkbox', 'cascade'].includes(field.type)) fail()
  return Object.freeze({ tenantId, definitionId, fieldId: field.fieldId,
    fieldType: field.type, providerId: reference, kind: field.type === 'cascade' ? 'cascade' : 'code' })
}

/** Source-backed envelopes only: the one requested Code group echoes codeId
 * and eleid and owns an options map; Cascade owns type + children. No fallback
 * envelope, first match, invalid-row filtering, or global value flattening. */
export function parseR1ScopedFieldOptions(raw: unknown, binding: Pick<FieldBinding, 'kind' | 'providerId' | 'tenantId'>): readonly FormFieldOptionRead[] {
  const expected = providerId(binding.providerId), tenantId = text(binding.tenantId)
  if(binding.kind==='proj-package'){
    if(expected!=='projPackage')return fail()
    const envelope=row(decodeR1ScopedJson(raw))
    if(!Array.isArray(envelope.data)||!Number.isSafeInteger(envelope.total)||envelope.total!==envelope.data.length
      ||envelope.data.length>MAX_OPTIONS||envelope.page!==undefined&&envelope.page!==1)return fail()
    const seen=new Set<string>()
    return envelope.data.map(rawItem=>{
      const item=row(rawItem),value=text(item._id),label=text(item.name,512)
      if(item.tenantId!==tenantId||item.state!==1||seen.has(value)
        ||Object.hasOwn(item,'id')&&item.id!==value)return fail()
      seen.add(value);return {value,label}
    })
  }
  if (binding.kind !== 'code' && binding.kind !== 'cascade') return fail()
  const groups = binding.kind === 'code' ? decodeR1ScopedJson(raw) : raw
  if (!Array.isArray(groups) || groups.length !== 1) return fail()
  const group = row(groups[0])
  if (group.tenantId !== undefined && group.tenantId !== tenantId) fail()
  if (binding.kind === 'code') {
    if (group.codeId !== expected || group.eleid !== expected) return fail()
    // These are the only keys emitted for our exact non-Java request.
    if (Object.keys(group).some(key => !['codeId', 'eleid', 'options'].includes(key))) return fail()
    const entries = Object.entries(row(group.options))
    if (entries.length > MAX_OPTIONS) return fail()
    return entries.map(([value, label]) => ({ value: text(value), label: text(label, 512) }))
  }
  if (group.type !== expected) return fail()
  let count = 0
  const identities = new Set<string>()
  const groupId = group._id === undefined ? undefined : text(group._id)
  if (groupId) identities.add(groupId)
  const tree = (rawChildren: unknown, depth: number, parentId?: string): readonly FormFieldOptionRead[] => {
    if (!Array.isArray(rawChildren) || rawChildren.length > MAX_OPTIONS || (rawChildren.length > 0 && depth > MAX_DEPTH)) return fail()
    const siblings = new Set<string>()
    return rawChildren.map(rawChild => {
      const child = row(rawChild), value = text(child.value), label = text(child.name, 512)
      if (++count > MAX_OPTIONS || siblings.has(value)) return fail()
      siblings.add(value)
      if ((child.type !== undefined && child.type !== expected)
        || (child.tenantId !== undefined && child.tenantId !== tenantId)) fail()
      const childId = child._id === undefined ? undefined : text(child._id)
      if (childId) {
        if (identities.has(childId)) fail()
        identities.add(childId)
      }
      if (child.parentId !== undefined && (text(child.parentId) !== parentId)) fail()
      // Code.getChildren() serializes [] even for leaves. Missing is unverified.
      const children = tree(child.children, depth + 1, childId)
      return { value, label, children }
    })
  }
  return tree(group.children, 1, groupId)
}

/** No cache or ambient tenant. The application's guarded raw transport checks
 * actor, generation and role-list membership before/after this provider await. */
export async function readR1ScopedFieldOptions(binding: FieldBinding, transport: ApiReadTransport): Promise<readonly FormFieldOptionRead[]> {
  if(binding.kind==='proj-package'){
    const raw=await transport.execute({method:'POST',path:'biz/projPackage/query.do',body:{...binding.params,
      tenantId:binding.tenantId,'is:state|integer#and':1}})
    return parseR1ScopedFieldOptions(raw,binding)
  }
  const raw = await transport.execute(binding.kind === 'code'
    ? { method: 'POST', path: 'i/code/selectCode.do', body: {
      jsonPara: JSON.stringify([{ codeId: binding.providerId, eleid: binding.providerId }]), tenantId: binding.tenantId,
    } }
    : { method: 'POST', path: 'i/code/selectMultistageCode.do', body: { types: binding.providerId, tenantId: binding.tenantId } })
  return parseR1ScopedFieldOptions(raw, binding)
}
