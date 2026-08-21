// Auth del panel de administración (modelo nuevo).
// Reusa el mismo storage que ya usa la app para convivir durante la migración.
const TOKEN_KEY = 'flotadsp_token'
const ADMIN_KEY = 'flotadsp_admin'

/* Lo ultimo que el SERVIDOR ha dicho sobre el acceso de este usuario.

   Existe porque los permisos viajaban solo dentro del JWT, que dura 72 h: se le
   quitaba un modulo a alguien, la pantalla decia "guardado", y esa persona
   seguia viendolo hasta que cerraba sesion. Ahora el panel pregunta a
   /auth/me al abrir y lo que conteste manda.

   Se guarda con el id del usuario dentro y solo se usa si coincide con el del
   token en curso: asi un blob del usuario anterior en el mismo ordenador no
   puede colarse. Y solo se escribe con una respuesta completa del servidor,
   nunca a medias — que fue lo que rompio el localStorage la otra vez. */
const ACCESO_KEY = 'flotadsp_acceso'

function accesoFresco() {
  try {
    const a = JSON.parse(localStorage.getItem(ACCESO_KEY))
    if (!a || !a.id) return null
    return a.id === decodeToken()?.sub ? a : null
  } catch { return null }
}

// Devuelve true si algo ha cambiado respecto a lo que ya teniamos guardado
// (el panel lo usa para re-pintarse solo cuando hace falta).
export function guardarAccesoFresco(me) {
  if (!me || !me.id || me.id !== decodeToken()?.sub) return false
  // Si la respuesta no trae el campo —backend viejo todavia en produccion, o un
  // despliegue a medias— NO se guarda nada. Guardar `permissions: null` aqui
  // significa "sin restriccion", o sea abrirle el panel entero justo a quien lo
  // tiene recortado. Ante la duda, mandan el JWT y el blob de siempre.
  if (!('permissions' in me)) return false
  const nuevo = {
    id: me.id,
    permissions: Array.isArray(me.permissions) ? me.permissions : null,
    admin_role: me.admin_role ?? null,
    allowed_centers: Array.isArray(me.allowed_centers) ? me.allowed_centers : null,
  }
  const antes = localStorage.getItem(ACCESO_KEY)
  const ahora = JSON.stringify(nuevo)
  localStorage.setItem(ACCESO_KEY, ahora)
  return antes !== ahora
}

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
// El JWT manda sobre el blob de localStorage: el token lo firma el servidor en
// cada login, mientras que el blob lo puede haber dejado escrito a medias una
// pantalla de login vieja (pasó: /login guardaba solo name/role/id y el panel
// se quedaba sin permisos, sin centros y sin rol).
export function getPermissions() {
  // 1) Lo que dijo el servidor hace un momento. 2) El JWT. 3) El blob viejo.
  const fresco = accesoFresco()
  if (fresco) return fresco.permissions
  const p = decodeToken()
  if (Array.isArray(p?.permissions)) return p.permissions
  const a = getAdmin()
  return Array.isArray(a?.permissions) ? a.permissions : null
}

/* Centros que este usuario VE, en orden de la organización.

   Sale del JWT siempre que se pueda, porque es lo único que no se puede quedar
   a medias. Y el cruce entre los centros de la org y los del usuario se hace
   con la misma tolerancia que el backend (`_user_can_see_center`): en BD los
   centros están sucios ('OGA5', 'oga5 ', 'AMZL OGA5 SANTIAGO XPT'), así que
   comparar con `includes` exacto dejaba la lista VACÍA y el panel se quedaba
   con un único botón "Todos" — que para chat, checklist y scorecard significa
   literalmente pedir el centro llamado "Todos" y no ver nada. */
const _norm = (s) => String(s || '').trim().toUpperCase()

export function getVisibleCenters() {
  const p = decodeToken() || {}
  const a = getAdmin() || {}
  const todos = (Array.isArray(p.centers) && p.centers.length ? p.centers
    : Array.isArray(a.centers) ? a.centers : []).filter(Boolean)
  // Los centros propios, con la misma preferencia que los permisos: primero lo
  // que acaba de decir el servidor. En el JWT del login no viajan (create_token
  // no los recibe alli), asi que sin esto se dependia del blob de localStorage.
  const fresco = accesoFresco()
  const mios = (fresco && Array.isArray(fresco.allowed_centers) && fresco.allowed_centers.length
    ? fresco.allowed_centers
    : Array.isArray(p.allowed_centers) && p.allowed_centers.length ? p.allowed_centers
    : Array.isArray(a.allowed_centers) ? a.allowed_centers : null)
  if (!mios || !mios.length) return todos            // sin restricción: los de la org
  const cruce = todos.filter((c) => mios.some((m) => _norm(c).includes(_norm(m)) || _norm(m).includes(_norm(c))))
  // Si la org no los lista (datos viejos), mejor los suyos que ninguno.
  return cruce.length ? cruce : mios.filter(Boolean)
}

/* Módulos de la operación diaria que ve cualquier admin pase lo que pase, aunque
   arrastre una lista de permisos vieja que no los contemple.

   Vive AQUÍ, en un solo sitio, porque antes eran dos listas separadas —una en el
   menú del panel y otra en el guardián de ruta— y no coincidían:
     · 'asignacion' salía en el menú y al pulsarla te expulsaba;
     · 'mi-dia' desaparecía del menú pero seguía abriéndose escribiendo la URL,
       y encima su casilla en Usuarios parecía que hacía algo.
   La pantalla de Usuarios también saca de aquí las etiquetas "·siempre", así que
   lo que se le promete al que reparte permisos es exactamente lo que ocurre. */
export const SIEMPRE_VISIBLES = new Set([
  'asignacion', 'checklist-operativo', 'chat', 'plantilla', 'aparcamiento',
])

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
  // Un login recien hecho manda sobre cualquier acceso guardado antes: si no,
  // un resto de la sesion anterior del mismo usuario ganaria al token nuevo
  // hasta que /auth/me contestara.
  localStorage.removeItem(ACCESO_KEY)
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
  // "center_manager" | "dispatcher" | null. El servidor manda: el rol no viaja
  // en el JWT y el blob de localStorage se queda viejo en cuanto se lo cambian.
  const fresco = accesoFresco()
  if (fresco) return fresco.admin_role
  return getAdmin()?.admin_role ?? null
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
  localStorage.removeItem(ACCESO_KEY)
}
