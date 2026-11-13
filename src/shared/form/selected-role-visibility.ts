/** Reader/composition-issued current selected-role context, never a FormData
 * value, all-role list or write grant. Serialized/copied tokens have no source. */
export interface SelectedRoleVisibilityContext { readonly kind: 'selected-role-visibility' }
interface RoleSource { readonly sessionKey: string; readonly roleId: string }
const sources = new WeakMap<object, () => string | undefined>()
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
  sources.set(context, () => {
    if (revoked || !original) return undefined
    try {
      const now = read()
      if (now && now.sessionKey === original.sessionKey && now.roleId === original.roleId) return now.roleId
    } catch { /* fail closed */ }
    revoked = true
    return undefined
  })
  return context
}
export function selectedRoleForVisibility(context: SelectedRoleVisibilityContext | undefined): string | undefined {
  return context && typeof context === 'object' ? sources.get(context)?.() : undefined
}
