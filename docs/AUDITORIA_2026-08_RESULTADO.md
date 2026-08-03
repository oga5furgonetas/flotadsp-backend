# Auditoría total — resultado

**Fecha:** 2-3 de agosto de 2026
**Alcance:** `backend/server.py` (19.200 líneas, 266 rutas) + `frontend-v2` (76 componentes)
**Método:** barrido por clases de fallo, verificación contra staging y contra los
datos reales de producción. Nada se da por bueno sin comprobarlo.

Este documento es el resultado. El plan y el inventario están en
`AUDITORIA_COMPLETA.md` y `docs/MAPA_FUNCIONAL.md`.

---

## 1. Lo que se ha corregido

### Seguridad y facturación

| Qué | Cómo se encontró | Estado |
|---|---|---|
| **Cualquier admin podía subirse de plan gratis.** `/org/change-plan` escribía el plan que le pidieras sin mirar ningún pago, pese a que su docstring decía lo contrario. | Revisando rutas sin UI | Corregido. Bajar de plan sigue siendo self-service; subir da 402 y lo activa el webhook de Lemon Squeezy. Verificado explotable antes y cerrado después. |
| **Trampa del arreglo anterior:** `enterprise` y `owner` cuestan 0 €, así que comparando precios pasaban por bajada de plan y se colaban igual. | Al escribir el fix | El orden va por lo que desbloquea cada plan, no por lo que cuesta. |
| **La restricción por centro no restringía nada.** `allowed_centers` venía del JWT y `create_token` no lo metía: la comprobación leía `None` y devolvía "sí" siempre. 7 de 12 admins de producción están limitados a un centro, en una organización con tres. | Cruzando permisos con las rutas de datos | Corregido en vehículos, conductores, inspecciones, incidencias y alertas, incluidas las puertas de atrás por `vehicle_id`. |
| La vía de soporte del super-admin no funcionaba (`role == "sa"` en vez del flag `sa`). | Smoke de producción | Corregido, con test. |

### Datos que se corrompían o se perdían

| Qué | Estado |
|---|---|
| `r.data \|\| []` no garantiza una lista: un objeto se cuela y el siguiente `.map()` tumba la pantalla entera. Estaba repetido **26 veces en 16 ficheros**. | Todos pasan por `lib/lista.js`. |
| `actual_cost` entraba crudo del cliente y podía guardarse como texto, dejando el cálculo de euros roto para siempre. | Validado al escribir, tolerante al leer. |
| `try: float(x) except: pass` sobre datos del usuario: respondía 200 y descartaba el valor. El disparador más probable era la coma decimal (`99,5`). | 400 con el motivo, y la coma se acepta. |

### Funcionalidad que existía y nadie podía usar

- **Turnos**: ocho endpoints, incluido un generador de cuadrantes que usa el ritmo
  real de reparto, el scorecard y el tipo de contrato. La pantalla solo leía la
  cobertura y no había forma de crear un turno. Ahora tiene cuadrante editable,
  demanda de rutas, generación automática, import de Excel y bandeja de
  solicitudes; y el conductor tiene "Mis turnos" con petición de día.
- **Métricas**: listaba informes sin ninguna forma de subir uno. Ahora sube plan de
  rutas, daily de Cortex e informes de Amazon, y muestra el acumulado semanal.

### Bugs de pantalla

- Scorecard reventaba al pulsar las flechas de semana sin semanas cargadas.
- Cinco llamadas al portapapeles sin `.catch()` dejaban promesas rechazadas sueltas.
- `/inspections?center=X` consultaba un campo que no existe en ningún documento y
  devolvía **siempre vacío**. Lo usa Asignación diaria.
- 8 textos en duro en el flujo del conductor, pese a haberlo dado por traducido.

### Cupo de Gemini

Una inspección gasta **4 llamadas**: orientación (1), daños (1) y cuentakilómetros
(2, la doble lectura que garantiza que no haya falsos positivos). El veto por cupo
agotado vivía solo en memoria, así que cada despliegue lo olvidaba y volvía a
quemar llamadas para redescubrir que no había cupo. Ahora se persiste.

---

## 2. Negativos verificados

Mirados y descartados con pruebas, no ignorados:

- **Rendimiento**: medido en producción con datos reales. El endpoint más lento es
  `/scoring/drivers` con 387 ms; el resto por debajo de 120 ms. No hay nada que
  arreglar.
- **Corrutinas sin `await`**: ninguna. Las cuatro sospechas eran listas para `gather`.
- **Rutas sin UI**: ninguna de las 61 está sin autenticación.
- **`update_many({})` de alertas**: correcto, las alertas son de toda la organización.
- **`estimated_cost`**: pasa por Pydantic tipado a `float`; el dashboard de euros
  está a salvo.
- **Bucle de auto-recuperación**: ya se pausaba con el cupo agotado, no había
  espiral de reintentos.

---

## 3. Lo que impide que vuelva a pasar

- `scripts/check-huerfanas.mjs` — rutas que no llama ningún cliente, con trinquete
  (tolera el backlog actual, falla si aparece una nueva). En CI.
- `e2e/botones.spec.js` — pulsa cada botón de cada pantalla del panel y falla si
  alguno lanza una excepción.
- 6 tests de API nuevos contra Mongo real: flujo completo de turnos, subida de plan
  sin pagar, vía del super-admin, restricción por centro y números mal escritos.
- Dos gotchas nuevos en `CLAUDE.md`: el nombre real de la BD de producción y los
  valores sucios de `center`.

---

## 4. Estado de la verificación

| Comprobación | Resultado |
|---|---|
| ESLint | 0 errores |
| Checker i18n | 1.380 claves, 0 problemas |
| Checker rutas duplicadas | 266 rutas, 0 duplicados |
| Checker rutas huérfanas | backlog conocido (30), ninguna nueva |
| Contratos backend↔frontend | OK |
| E2E (escritorio + móvil) | 138/138 |
| Tests de API contra Mongo real | 18/18 |
| Smoke de producción (12 rutas tocadas) | 0 fallos |

---

## 5. Lo que queda

**Backlog conocido, no urgente**

- 30 rutas sin UI de menor calado: plantilla compartida (5), extras de scorecard
  (5), bolsas de vehículo (2), peritaje IA (2), import de asignación (2) y varias
  sueltas. Ninguna es un agujero; están todas autenticadas.
- Las respuestas del panel son grandes para móvil: `/inspections/review-queue`
  devuelve 319 KB y `/vehicles` 255 KB. No es un bug, pero se nota con datos.
- `route_history` no tiene índices. Con 363 documentos da igual; crecerá.

**Depende de Dani**

- **Facturación de Gemini.** Con el cupo gratuito y 4 llamadas por inspección, la
  IA se muere a diario. Es el techo real del producto ahora mismo.
- **Contraseña obligatoria para conductores.** Hoy 117 cuentas entran solo con el
  email. Es una decisión de producto, no un bug.
