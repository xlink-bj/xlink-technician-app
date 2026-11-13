import { isR1NormalImageWireArray } from './r1-normal-image-contract'
import type { R1FileWireValue } from '../types'

/** Plain JSON carried by an already-saved file Map. This shape is not an
 * upload receipt, field authority, or permission to fetch its URL. */
export type R1RetainedFileValue = R1FileWireValue & Readonly<Record<string, unknown>>
const plain = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object'
  && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v))
const stable = (v: unknown): string => JSON.stringify(v, (_key, x) => plain(x)
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x)

export function isR1RetainedFileArray(value: unknown): value is readonly R1RetainedFileValue[] {
  if (!Array.isArray(value) || value.length > 10 || Object.keys(value).length !== value.length
    || Object.keys(value).some((key,i)=>key!==String(i))
    || !value.every(plain) || !isR1NormalImageWireArray(value.map(v => ({ url: v.url, name: v.name, extname: v.extname })))) return false
  let nodes = 0
  const json = (v: unknown, depth: number): boolean => {
    if (++nodes > 5000 || depth > 20) return false
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return true
    if (typeof v === 'number') return Number.isFinite(v) && (!Number.isInteger(v) || Number.isSafeInteger(v))
    if (Array.isArray(v)) return Object.keys(v).length === v.length && Object.keys(v).every((key,i)=>key===String(i)) && v.every(x => json(x, depth + 1))
    return plain(v) && Object.entries(v).every(([key, x]) => !['__proto__', 'prototype', 'constructor'].includes(key) && json(x, depth + 1))
  }
  return json(value, 0) && JSON.stringify(value).length <= 200000
}

/** Full objects, monotone original positions, no duplication or reordering.
 * Only the normal controller can establish that original is reader-issued. */
export function isR1RetainedFileSubset(original: unknown, candidate: unknown): candidate is readonly R1RetainedFileValue[] {
  if (!isR1RetainedFileArray(original) || !isR1RetainedFileArray(candidate)) return false
  let cursor = 0
  return candidate.every(item => {
    while (cursor < original.length && stable(original[cursor]) !== stable(item)) cursor++
    return cursor++ < original.length
  })
}
