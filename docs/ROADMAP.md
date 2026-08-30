# Roadmap

> Ordenado por `IMPACTO × CONFIANZA × URGENCIA × REVERSIBILIDAD`, no por lo que
> apetece construir. Un problema crítico pendiente manda sobre uno interesante.
>
> Revisado 2026-08-30.

---

## Ahora mismo

### 0 · Contrastar la primera foto buena del día — P0

El 30-08 se empezó a congelar el cierre de cada día (`cortex_day_snapshots`),
porque el estado de los paquetes se sobrescribe y a los tres días se había
borrado el 97 % de las devoluciones. La ventana de congelación abre a las 17:00,
así que **el primer día capturado desde su propia tarde es el domingo 30**, que
todavía estaba en curso cuando se desplegó — no el 31, como se anotó primero.

Qué hace falta: la captura de Cortex de OGA5 del **domingo 30**, tomada cuando el
día ya haya cerrado (esa noche tarde o el lunes a primera hora), y contrastar
«Devuelto a la estación» contra lo que guardó la foto. Si cuadra, el P0 queda
cerrado del todo; si no, el desvío dice qué falta y con un día bien capturado se
puede razonar — con cuatro reconstruidos, no.

El bucle deja **latido** en `app_meta.congelar_latido`, que sale en
`GET /cortex/dias-congelados`: si `hace_min` pasa de 30, el bucle está muerto y
ese día se va a perder. Es la comprobación que hay que hacer ANTES de esperar el
dato, no después.

Es una sola pantalla y cierra el número que Amazon contrastaría primero.

### 1 · Poner fecha de entrada a las 13 furgonetas paradas — P1

**441 días-furgoneta** parados sin trazabilidad. La fecha es recuperable de la
incidencia de entrada. Sin esto no se puede medir nada del ciclo de taller.

`SAFE_TO_AUTOCORRECT`, con el matiz de buscar la incidencia **de entrada a
taller**, no la última (una furgoneta tiene otra más reciente).

### 2 · Que una furgoneta no pueda estar en `taller` sin respaldo — P1

Hoy el estado se pone a mano y no obliga a nada. Es el agujero por donde se
escapa la operación de taller entera.

### 3 · Preguntar a Dani por qué se anularon las dos órdenes — P1

Es la información más valiosa que falta y **solo él la tiene**. Sin ella,
cualquier cosa que se añada al módulo de talleres es a ciegas.

---

## Después

### 4 · Tests para las reglas que hoy no tienen ninguno — P0 de prevención

27 de 38 reglas de negocio no tienen test. Es lo más barato que existe y lo que
más protege: el gotcha 20 (cambiar lo que guarda una estructura sin mirar quién
la lee) ya costó marcar «0 personas trabajando» con 39 trabajando.

### 5 · Módulo de disponibilidad — P1

Sacar a un sitio las reglas que deciden si una furgoneta **puede salir**: ITV,
taller, baja, daño crítico. Hoy están repartidas y ninguna bloquea de verdad la
asignación — una ITV vencida solo avisa.

Es la regla que más caro sale equivocada: 200 € de multa, inmovilización en
ruta, y la aseguradora repitiendo lo que pague si hay accidente.

### 6 · Recuperar los `BUSINESS_CLOSED` — P2

438 paquetes en 90 días. Medido: hora media 15:24, con pico a las 17:00, cuando
a esa hora solo se entrega el 9% del volumen. **Hipótesis, no hecho:** son
paradas de negocio que se visitan tarde. Contrastarlo antes de tocar nada
operativo.

### 7 · Perfil operativo de cada taller — P3

Tiempo de respuesta, coste medio, desviación del presupuesto, reparaciones
repetidas. **Bloqueado por el punto 3**: con 2 órdenes no hay con qué medir.

### 8 · Mantenimiento predictivo — P3

El ritmo km/día ya sale bien para 85 furgonetas tras sanear el histórico.
**Bloqueado por** el km del último cambio de aceite (falta en 109 de 124). La
herramienta para rellenarlo está hecha.

Cuando se haga: medir `PREDICCIÓN → RESULTADO REAL`. Una predicción que nadie
comprueba después es una opinión con decimales.

---

## Bloqueado por terceros

| | Bloqueado por |
|---|---|
| WhatsApp | Meta tiene la cuenta de Dani en bloqueo antispam |
| Verificación de negocio | Dani no tiene la empresa constituida |
| Scorecard automática | No hay API; se sube el PDF a mano |
| Recorte de cada golpe | El servicio de visión no devuelve las cajas al backend |

---

## Descartado, y por qué

| | Por qué no |
|---|---|
| Bot que conteste a los conductores | En cuanto contestas una cosa esperan que contestes todo. Sin nadie mirando esa bandeja, un mensaje ignorado es peor que no abrir el canal. |
| Copiar el peritaje de PAVE (medida en mm, método de reparación) | Es su negocio y lo hacen mejor. La diferenciación está en el ciclo completo, que ellos no tocan. |
| Predecir el scorecard con un modelo | Con 5 semanas de histórico, cualquier predicción es ruido presentado como dato. Se cuenta lo que ya pasó. |
| Motor central de reglas ahora | Antes de tener tests, sería una abstracción por elegancia. Primero tests, luego el módulo de disponibilidad, luego el motor. |
| Mandar el resumen del día a todos | Repartido a 200 personas es ruido que nadie lee, y el día que llegue uno importante tampoco lo leerán. |

---

## Cómo se decide qué entra

Antes de construir algo, tiene que responder que sí a alguna de estas:

- ¿ahorra tiempo humano medible?
- ¿evita un error que ya ha pasado?
- ¿reduce coste o días de furgoneta parada?
- ¿acelera una decisión que hoy se toma tarde o a ciegas?

Si no responde a ninguna, es prioridad baja por bonito que quede.
