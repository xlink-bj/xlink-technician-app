/** Reader/composition-issued current selected-role context, never a FormData
 * value, all-role list or write grant. Serialized/copied tokens have no source. */
export interface SelectedRoleVisibilityContext { readonly kind: 'selected-role-visibility' }
interface RoleSource { readonly sessionKey: string; readonly roleId: string }
const sources = new WeakMap<object, { read: () => string | undefined; revoke: () => void; listeners: Set<() => void> }>()
const valid = (v: unknown, max = 4096): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
  && v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v)

/** Bounded root roleIds metadata, with no coercion or implicit empty-list rule. */
export function isRoleVisibilityList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 200
    && value.every(role => valid(role, 256)) && new Set(value).size === value.length
}

/** The trusted caller supplies live session identity and reader-generation
 * checks. An observed withdrawal permanently revokes this context. */
export function createSelectedRoleVisibilityContext(read: () => RoleSource | null): SelectedRoleVisibilityContext {
  const context = Object.freeze({ kind: 'selected-role-visibility' as const })
  let original: RoleSource | null = null, revoked = false
  try { const source = read(); if (source && valid(source.roleId) && valid(source.sessionKey)) original = { ...source } } catch { /* unavailable */ }
  const listeners = new Set<() => void>()
  const revoke = () => {
    if (revoked) return
    revoked = true
    for (const listener of listeners) { try { listener() } catch { /* withdrawal must still complete */ } }
    listeners.clear()
  }
  sources.set(context, { revoke, listeners, read: () => {
    if (revoked || !original) return undefined
    try {
      const now = read()
      if (now && now.sessionKey === original.sessionKey && now.roleId === original.roleId) return now.roleId
    } catch { /* fail closed */ }
    revoke()
    return undefined
  } })
  return context
}
export function selectedRoleForVisibility(context: SelectedRoleVisibilityContext | undefined): string | undefined {
  return context && typeof context === 'object' ? sources.get(context)?.read() : undefined
}

/** A reader can withdraw an issued read generation without waiting for a render. */
export function revokeSelectedRoleVisibilityContext(context: SelectedRoleVisibilityContext | undefined): void {
  if (context && typeof context === 'object') sources.get(context)?.revoke()
}
/** UI subscribers observe withdrawal only; subscribing never grants a role. */
export function onSelectedRoleVisibilityRevoked(context: SelectedRoleVisibilityContext | undefined, listener: () => void): () => void {
  const source = context && typeof context === 'object' ? sources.get(context) : undefined
  if (!source || !source.read()) { listener(); return () => {} }
  source.listeners.add(listener)
  return () => { source.listeners.delete(listener) }
}
