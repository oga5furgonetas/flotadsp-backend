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
  return !!getToken()
}

// Decodifica el payload del JWT (sin verificar firma — solo lectura cliente).
// El backend pone aquí: sub, role, name, exp, sa, org_id, db_name, account_type, centers, permissions.
export function decodeToken() {
  try {
    const t = getToken()
    if (!t) return null
    const b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
    return JSON.parse(decodeURIComponent(escape(atob(b64 + pad))))
  } catch { return null }
}

// org_id real de la organización (no es lo mismo que admin.id, que es el id del usuario).
export function getOrgId() {
  return decodeToken()?.org_id || null
}

export function isSuperAdmin() {
  const a = getAdmin()
  return !!(a && (a.super_admin || a.account_type === 'owner'))
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
      centers: j.centers || [],
    }),
  )
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ADMIN_KEY)
}
