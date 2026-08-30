# Operación: el ciclo del vehículo

> El núcleo del producto es esta cadena. Aquí está **qué etapas existen de
> verdad hoy**, cuáles están vacías y qué falta para cerrarla.
>
> Medido a 2026-08-30. Los números salen de producción.

---

## El ciclo completo

```
VEHÍCULO
  → necesidad detectada        ✅ inspección diaria con foto (1.570/mes)
  → diagnóstico                ✅ IA sobre la foto + revisión humana (43%)
  → decisión de mandarlo       ⚠️  a mano, sin criterio escrito
  → parte para el taller       ✅ sale solo con las fotos del golpe
  → solicitud al taller        ⚠️  enlace que se copia a mano
  → presupuesto                ✅ existe en el portal · ❌ nunca usado
  → aprobación                 ✅ existe en el portal · ❌ nunca usada
  → cita                       ❌ no existe
  → entrada al taller          ⚠️  se marca a mano, sin fecha (13 casos)
  → reparación                 ✅ 5 estados que pone el taller · ❌ sin usar
  → piezas                     ❌ no existe
  → mano de obra               ❌ no existe
  → coste                      ✅ campo · ❌ 0 órdenes con importe
  → salida                     ✅ cierra la orden y devuelve la furgoneta
  → kilometraje                ✅ se lee solo de la foto del odómetro
  → próxima revisión           ⚠️  bloqueado: falta el km del último cambio
  → documentación              ✅ 140 documentos · ⚠️ nada desde hace 38 días
  → disponibilidad operativa   ⚠️  el estado existe, no bloquea la asignación
```

---

## El agujero real

**El módulo de órdenes existe entero y no se usa.** Dos órdenes en total, las
dos anuladas. Mientras tanto:

| | |
|---|---|
| Daños abiertos en el libro | 213, en 123 de 129 furgonetas |
| Incidencias abiertas | 43 · 11 graves |
| Furgonetas paradas en `taller` | 13, **sin ninguna orden** |
| Días-furgoneta acumulados parados | **441** |

Es decir: **la operación de taller ocurre, pero fuera de la app**. Las furgonetas
entran y salen del taller, y lo único que queda es un `status: "taller"` puesto a
mano y una incidencia.

`UNKNOWN`: **por qué** no se usa. Las dos órdenes que se crearon se anularon, y
esa es la pista más valiosa que hay — pero solo Dani puede decir por qué.

Hipótesis a contrastar con él, **no verificadas**:

1. Crear la orden cuesta más que llamar por teléfono
2. El taller no quiere entrar en un enlace
3. El flujo no encaja con cómo se manda una furgoneta de verdad
4. Nadie sabe que existe

Hasta saberlo, **no tiene sentido añadir funciones al módulo**: sería construir
sobre un flujo que nadie anda.

---

## Lo que ya reduce trabajo hoy

| | Qué ahorra |
|---|---|
| El parte sale con las fotos del golpe | La llamada de «¿dónde está el golpe?» |
| Recordatorio automático tras 3 días de silencio | Perseguir al taller |
| Al entregar, los daños se cierran solos | Que el libro deje de significar nada |
| El odómetro se lee de la foto | Teclear el km de 124 furgonetas |
| Rellenar ITV y datos en lote | 56 fichas × 2 minutos |

---

## Perfil operativo del taller — pendiente

Con suficientes órdenes se podría construir, y sería diferenciación real:

- tiempo hasta la primera respuesta
- tiempo hasta la cita
- tiempo de reparación por tipo
- coste medio y **desviación sobre el presupuesto**
- tasa de reparaciones repetidas de la misma pieza
- marcas y modelos que atiende bien

Y con eso: `VEHÍCULO + PROBLEMA + URGENCIA + UBICACIÓN` → **mejor taller para
este caso**, optimizando coste + tiempo + calidad + distancia, no solo precio.

**Bloqueado por:** 2 órdenes. No hay con qué medir. Este es el ejemplo más claro
de por qué la integridad y el uso van antes que la inteligencia.

---

## Qué haría falta para cerrar el ciclo, por orden

1. **Saber por qué no se usa el módulo.** Una conversación con Dani vale más que
   cualquier funcionalidad que se pueda añadir a ciegas.
2. **Poner fecha de entrada a las 13 paradas.** Sin eso no se puede medir nada
   de lo de arriba, ni siquiera cuánto tiempo lleva parada la flota.
3. **Que una furgoneta no pueda estar en `taller` sin orden**, o al menos que
   salte. Un estado sin respaldo es un agujero por donde se escapa la operación.
4. **Cita y piezas**, que son las dos etapas que hoy no existen y que el taller
   sí gestiona por su cuenta.
