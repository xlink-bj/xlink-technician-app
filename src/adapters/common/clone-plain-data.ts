/** Preserve wire values without requiring structuredClone in native JS engines.
 * Unsupported object kinds fail explicitly; no JSON/UTC/number conversion. */
export function clonePlainData<T>(value:T):T {
  if(typeof structuredClone==='function')return structuredClone(value)
  const copy=(input:unknown):unknown=>{
    if(input===null||['undefined','string','boolean','number','bigint'].includes(typeof input))return input
    if(Array.isArray(input))return input.map(copy)
    if(input instanceof Date)return new Date(input.getTime())
    if(typeof input==='object'&&(Object.getPrototypeOf(input)===Object.prototype||Object.getPrototypeOf(input)===null))
      return Object.fromEntries(Object.entries(input as Record<string,unknown>).map(([key,item])=>[key,copy(item)]))
    throw Error('Unsupported wire object cannot be cloned safely')
  }
  return copy(value) as T
}
