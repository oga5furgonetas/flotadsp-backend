# FlotaDSP AI — encargos para más tarde y preasignación de furgonetas

El chat decía *"no tengo memoria ni procesos de fondo"*. Ya no es verdad: los
encargos se guardan en la base de datos y un bucle del backend los ejecuta solo.

Todo vive en **`tareas_ia.py`** (mismo fichero en la raíz y en `backend/`, como
el resto del proyecto). El server solo lo engancha al final de `server.py`.

## Qué puede hacer ya

| Lo que escribe el dispatcher | Lo que pasa |
|---|---|
| «Monta la plantilla de DGA1 mañana cuando salgan las rutas en Cortex» | Queda programado. El bucle mira cada 10 min y la monta **sola** en cuanto las rutas de ese día están subidas. Avisa por Telegram. |
| «Estas son las furgonetas de mañana: JUAN PEREZ - 1234ABC…» | Se guardan los pares conductor→matrícula **de esa fecha**. Cada día va por separado: nada se arrastra. |
| «¿Qué tienes programado?» | Lista los encargos pendientes y cuántas furgonetas hay apuntadas para cada uno. |
| «Cancela la plantilla de mañana» | La cancela. |
| Cualquier otra cosa | Lo dice claro y queda registrado en `/api/ia/peticiones` para añadirlo. |

## Cómo sale la plantilla

Por cada conductor que Cortex saca ese día: **primero su ruta, después la
furgoneta que le toca**.

```
PLANTILLA DGA1 — sábado 19/09/2026
4 conductores · 4 rutas · 3 con furgoneta · 1 sin furgoneta

MARIA LOPEZ RUIZ     CX101 (165 par.)  →  5678 DEF  (preasignada)
JUAN PEREZ GARCIA    CX102 (180 par.)  →  1234 ABC  (preasignada)
PEDRO SANCHEZ MOURE  CX103 (90 par.)   →  0001 AAA  (de su ficha)
SONIA VEIGA          CX104 (150 par.)  →  SIN FURGONETA — dime cuál le pones

Preasignadas que hoy no salen en Cortex:
  · ANA GIL → 9999 ZZZ
```

La furgoneta sale **siempre de un dato real**, en este orden:

1. La preasignación que el dispatcher dio para **ese día**.
2. Si no la hay, la furgoneta fija de la ficha del conductor.
3. Si no hay ninguna de las dos: «sin furgoneta». **Nunca se inventa una
   matrícula**, y si dos personas encajan con el mismo nombre no elige: lo marca
   para que lo resuelva una persona.

## Endpoints (`/api/ia`, requieren admin)

| Método | Ruta | Para qué |
|---|---|---|
| POST | `/api/ia/comando` | Entrada única del chat: `{"texto": "…"}`. Devuelve `respuesta` ya redactada en castellano. |
| GET | `/api/ia/plantilla?centro=&fecha=` | La plantilla de ese día (la monta al vuelo). |
| GET/POST | `/api/ia/tareas` | Ver o crear encargos. |
| POST | `/api/ia/tareas/{id}/ejecutar` | Forzar el intento ahora. |
| DELETE | `/api/ia/tareas/{id}` | Cancelar. |
| GET/POST/DELETE | `/api/ia/preasignacion?centro=&fecha=` | Las furgonetas del día. |
| GET | `/api/ia/peticiones` | Lo que se pidió y aún no sabe hacer. |
| GET | `/api/ia/capacidades` | Texto listo para meter en el prompt del chat. |

## Enganchar el chat

El chat solo tiene que hacer dos cosas:

1. Meter en su prompt el texto de `GET /api/ia/capacidades`, para que sepa que
   **sí** puede aceptar encargos para mañana (antes lo rechazaba).
2. Mandar el mensaje del dispatcher a `POST /api/ia/comando` y soltar el campo
   `respuesta` tal cual.

## Límites, a propósito

- Solo datos de la propia organización y de **los centros del usuario**
  (`403` si pide otro centro).
- Si falta el día o el centro, **pregunta** en vez de suponer.
- Lo que no sabe hacer, lo dice y lo registra. No finge.

## Pruebas

```bash
python3 tests/test_tareas_ia.py   # lógica (no necesita mongo)
python3 tests/test_api_ia.py      # endpoints (necesita fastapi)
```
