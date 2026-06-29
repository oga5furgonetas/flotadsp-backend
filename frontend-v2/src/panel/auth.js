// Auth del panel de administración (modelo nuevo).
// Reusa el mismo storage que ya usa la app para convivir durante la migración.
const TOKEN_KEY = 'flotadsp_token'
const ADMIN_KEY = 'flotadsp_admin'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getAdmin() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_KEY)) || null
  } catch {
    return null
  }
}

export function isAuthed() {
  const t = getToken()
  if (!t) return false
  // Verificar expiración del JWT sin validar firma (la firma la valida el backend)
  try {
    const b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
    const payload = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0))
    ))
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      // Token expirado: limpiar sesión automáticamente
      logout()
      return false
    }
  } catch { return false }
  return true
}

// Decodifica el payload del JWT (sin verificar firma — solo lectura cliente).
// El backend pone aquí: sub, role, name, exp, sa, org_id, db_name, account_type, centers, permissions.
export function decodeToken() {
  try {
    const t = getToken()
    if (!t) return null
    const b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
    return JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0))
    ))
  } catch { return null }
}

// org_id real de la organización (no es lo mismo que admin.id, que es el id del usuario).
export function getOrgId() {
  return decodeToken()?.org_id || null
}

export function isSuperAdmin() {
  // Lee del token JWT (más fiable que localStorage que puede ser manipulado por el usuario)
  const payload = decodeToken()
  return !!(payload && payload.sa)
}

// Permisos por usuario: array de claves de módulo, o null = sin restricción (ve todo).
export function getPermissions() {
  const a = getAdmin()
  return Array.isArray(a?.permissions) ? a.permissions : null
}

// ¿Puede ver este módulo? Super-admin ve todo. Sin permisos definidos = ve todo
// (salvo lo que sea exclusivo de super-admin, que se filtra aparte).
export function canSee(moduleKey) {
  if (isSuperAdmin()) return true
  const perms = getPermissions()
  if (!perms) return true
  return perms.includes(moduleKey)
}

export function saveSession(j) {
  if (j?.access_token) localStorage.setItem(TOKEN_KEY, j.access_token)
  localStorage.setItem(
    ADMIN_KEY,
    JSON.stringify({
      name: j.name,
      role: j.role,
      id: j.id,
      account_type: j.account_type,
      slug: j.slug,
      super_admin: j.super_admin,
      permissions: j.permissions ?? null,
      allowed_centers: j.allowed_centers ?? null,
      centers: j.centers || [],
      admin_role: j.admin_role ?? null,
    }),
  )
}

export function getAdminRole() {
  return getAdmin()?.admin_role ?? null   // "center_manager" | "dispatcher" | null
}

export function isCenterManager() {
  return getAdminRole() === 'center_manager' && !isSuperAdmin()
}

export function isDispatcher() {
  return getAdminRole() === 'dispatcher'
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ADMIN_KEY)
}
