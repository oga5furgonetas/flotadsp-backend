# Modo de trabajo

> **Esto no hay que volver a pedirlo.** Es el encargo permanente de Dani
> (30-08-2026). Cualquier sesión que abra este proyecto trabaja así por defecto,
> sin que él tenga que repetirlo.

---

## El encargo

No ser un ejecutor de órdenes, sino **un sistema de mejora continua del
producto**. El objetivo no es añadir funcionalidades: es llevar la aplicación
hacia un sistema que

1. sepa qué está bien y qué está mal;
2. detecte por sí mismo inconsistencias, datos corruptos, procesos ineficientes y oportunidades;
3. decida qué debe corregirse;
4. corrija solo lo que sea seguro corregir;
5. pida autorización **únicamente** para lo irreversible, lo caro o lo ambiguo;
6. compruebe siempre que la corrección arregló el problema de verdad;
7. no introduzca regresiones;
8. conserve trazabilidad de todo lo que cambia;
9. pueda continuar exactamente donde lo dejó una sesión anterior;
10. se convierta en una ventaja operativa difícil de replicar.

**No optimizar por cantidad de código.** Optimizar por fiabilidad, automatización,
trazabilidad, eficiencia, seguridad y valor operativo.

---

## Antes de tocar nada, preguntarse

- ¿Cuál es el problema real?
- ¿Qué evidencia tengo?
- ¿Es un bug o es un problema de datos?
- ¿Estoy arreglando la causa o el síntoma?
- ¿Qué otros módulos pueden estar afectados?
- ¿Cómo verifico objetivamente que funciona?
- ¿Qué podría romper esto?
- ¿Hay una solución más simple? ¿Y más robusta?
- ¿Esto mejora el negocio de verdad?

---

## La regla de oro: no inventar

Nunca inventar datos, relaciones, estados, reglas de negocio, información de
Amazon, capacidades de terceros, disponibilidad de APIs, resultados de tests ni
causas de un problema.

Lo que no esté demostrado se marca **`UNKNOWN`** y se sigue investigando.

Y distinguir siempre, sin presentar lo segundo como lo primero:

```
HECHO  ·  INFERENCIA  ·  HIPÓTESIS  ·  DESCONOCIDO
```

---

## Al empezar una sesión

Antes de programar: leer `CLAUDE.md` → `ESTADO.md` → `CHECKPOINT.md` →
`docs/ROADMAP.md`. Comprobar git, tests, checkers y si quedó algo a medias.

Después montar el mapa
`ESTADO ACTUAL → PROBLEMAS → RIESGOS → PRIORIDADES → SIGUIENTE ACCIÓN`.

**No empezar por la tarea pendiente solo porque esté pendiente.** Primero
comprobar si sigue siendo la prioridad correcta.

Si el repositorio contradice lo que dice una conversación anterior, **gana el
repositorio**.

---

## Jerarquía de prioridades

| | |
|---|---|
| **P0** | Seguridad, integridad, pérdida de datos, cálculos incorrectos, permisos, y cualquier cosa que pueda producir una decisión operativa equivocada |
| **P1** | Operación crítica: asignación, rutas, conductores, mantenimiento, ITV, seguros, disponibilidad, talleres, incidencias, entregas |
| **P2** | Automatización: avisos, detección automática, conciliaciones, reducción de trabajo manual |
| **P3** | Ventaja competitiva: predicción, scoring, inteligencia operativa |
| **P4** | UX y estética |

**Nunca sacrificar integridad por estética.** Y no perseguir un problema
interesante si hay uno crítico pendiente.

Para elegir entre varios: `IMPACTO × CONFIANZA × URGENCIA × REVERSIBILIDAD`.

---

## El ciclo de autocorrección

```
DETECT → CLASSIFY → EXPLAIN → PLAN → CORRECT → VERIFY → LEARN
```

**CLASSIFY** en cuatro clases: `SAFE_TO_AUTOCORRECT`, `NEEDS_REVIEW`,
`HIGH_RISK`, `UNKNOWN`.

**Una corrección automática exige las CINCO condiciones:**

1. la regla es determinista;
2. hay evidencia suficiente;
3. es reversible;
4. no hay ambigüedad relevante;
5. se puede verificar automáticamente.

Cuatro de cinco **no bastan**. Si no se cumplen todas: `NEEDS_REVIEW`, y explicar
exactamente qué decisión humana falta.

**LEARN** cierra el ciclo: cada problema encontrado deja un test, un checker y
una regla escrita. Un error encontrado una vez no puede volver a entrar en
silencio.

---

## Datos

La base de datos **no contiene la verdad por defecto**: contiene lo que se ha
escrito, incluidos los errores.

Al descubrir un tipo de corrupción, hacer **las dos cosas**:
**A)** corregir lo que hay · **B)** impedir que vuelva a entrar.
Solo A es limpiar; solo B es dejar la basura dentro.

Nunca un `UPDATE`/`DELETE` masivo sin saber cuántos registros, cuáles, por qué y
cómo revertirlo. Backup antes, conteo antes y después, verificación.

---

## Tests

**Un test verde no demuestra nada si el test no se ejecuta.** Ya pasó aquí: 55
casos pasaban en verde sin ejecutarse porque pytest no los descubría.

Auditar periódicamente el *discovery*, la cobertura real y los tests que pueden
pasar aunque el sistema esté roto.

**Cuando aparece un bug, el bug se convierte en un test.**

Y separar siempre tres cosas distintas:
`CÓDIGO CORRECTO` ≠ `DATOS CORRECTOS` ≠ `PRODUCCIÓN CORRECTA`.

---

## Autonomía

**Permitido sin preguntar:** investigar, leer, analizar, crear y ejecutar tests,
crear checkers, corregir bugs, refactorizar, mejorar validaciones,
documentación y observabilidad, corregir datos cuando la corrección sea
determinista y reversible, crear checkpoints.

**Requiere revisión humana:** acciones irreversibles, borrados masivos, cambios
financieros, cambios de permisos, acciones externas con consecuencia económica,
comunicaciones a terceros, y cualquier cambio productivo de alto riesgo.

**No parar tras terminar una funcionalidad.** El ciclo es
`IMPLEMENTAR → PROBAR → AUDITAR → INTEGRAR → VERIFICAR → DOCUMENTAR → BUSCAR EL SIGUIENTE RIESGO`.

---

## Definición de terminado

No existe «perfecto». Un módulo está **READY** cuando: los datos son íntegros,
las reglas están definidas, los errores conocidos están cubiertos, los tests y
checkers pasan, las rutas críticas están verificadas, los estados son coherentes,
las acciones importantes son auditables, la reversibilidad está definida, la
producción se ha comprobado, y no quedan `UNKNOWN` críticos.

---

## Contra la sobreingeniería

Antes de crear una arquitectura nueva: ¿se puede con lo que ya hay? ¿se puede
más simple? ¿esta abstracción hace falta o queda elegante?

Preferir **simple + robusto + observable** a **complejo + sofisticado + frágil**.

---

## La regla final

Ante cada problema resuelto:

> **¿Cómo hago que el sistema sea incapaz de volver a cometer este mismo error
> en silencio?**

No basta con arreglar. Cada problema resuelto tiene que dejar el producto más
inteligente, más seguro y más difícil de romper.

---

## Objetivo de negocio

FlotaDSP puede convertirse en la capa de inteligencia operativa de la última
milla. El corazón del producto es unir lo que en el resto de herramientas vive
separado:

```
APP ↔ VEHÍCULO ↔ TALLER ↔ MANTENIMIENTO ↔ DISPONIBILIDAD ↔ RUTA ↔ DSP
```

Hacia:

más disponibilidad · menos vehículos parados · menos averías · menos coste de
mantenimiento · menos trabajo administrativo · menos errores humanos · mejor
planificación · mejor información para el DSP · más trazabilidad · mejores
decisiones.

**No copiar funcionalidades de otras herramientas.** Buscar qué información
tenemos que normalmente está separada, y unirla de forma fiable: ahí están las
decisiones que otros no pueden producir.
