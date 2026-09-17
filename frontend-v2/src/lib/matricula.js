/* Matrícula para ENSEÑAR: «5995LYF» y «5995 LYF» son la misma y en una lista
   no pueden verse distintas. Solo cambia la forma española moderna (4 cifras
   + 3 letras); cualquier otra se deja tal cual. El dato guardado no se toca:
   con él se cruzan inspecciones, órdenes y la plantilla. */
export function verMatricula(p) {
  const s = String(p ?? '').trim()
  const m = /^(\d{4})[\s-]*([A-Za-z]{3})$/.exec(s)
  return m ? `${m[1]} ${m[2].toUpperCase()}` : s
}
