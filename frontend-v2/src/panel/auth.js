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

export function isSuperAdmin() {
  const a = getAdmin()
  return !!(a && (a.super_admin || a.account_type === 'owner'))
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
      centers: j.centers || [],
    }),
  )
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ADMIN_KEY)
}
