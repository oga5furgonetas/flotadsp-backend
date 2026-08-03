# Estructura comercial — agosto 2026

Lo que se ha cambiado en el código y lo que hay que hacer fuera de él.

---

## 1. Por qué se cambió la tarifa

La anterior tenía tres problemas, y ninguno era "es cara":

| Problema | Consecuencia |
|---|---|
| El plan de entrada (99 €) tenía la **IA apagada** | Quien probaba el producto veía justo la versión que no se diferencia de una hoja de cálculo |
| Saltos de 99 → 229 € (+130 %) | Un DSP de 25 furgonetas pagaba lo mismo que uno de 75 |
| Tarifa plana ilimitada | Una flota de 154 furgonetas pagaba 399 €: los que más valor sacan, los que menos pagaban en proporción |

**El precio no era el problema.** Un DSP de 40 furgonetas factura del orden de
1,5–3 M€ al año; 399 €/mes es el 0,2 % de eso. Y con cero clientes no hay un
solo dato que diga que el precio esté mal: nadie ha dicho "me interesa pero es
caro". Bajarlo sin esa señal es regalar margen sin aprender nada.

## 2. La tarifa nueva

| Plan | Precio | Mínimo | Para |
|---|---|---|---|
| **Operación** | 5 €/furgoneta/mes | 20 furgonetas (100 €) | Un centro |
| **Completo** | 8 €/furgoneta/mes | 20 furgonetas (160 €) | Varios centros |
| **Holding** | a medida | — | Cinco estaciones o más |

Anual: se pagan 10 meses, dos gratis.

Ejemplos: 25 furgonetas → 125/200 € · 40 → 200/320 € · 120 → 600/960 €.

Qué cambia respecto a antes:

- **La IA va en todos los planes.** Es lo único que diferencia al producto.
- **Sin topes de flota.** Crecer no se castiga, se factura.
- **Escala suave.** Sin saltos que obliguen a justificar un +130 %.
- **Argumento directo:** "8 € por furgoneta al mes; un solo golpe detectado a
  tiempo lo paga todo el año."

Los planes antiguos siguen funcionando por alias, así que nada se rompe.

## 3. Lo que hay que hacer en Lemon Squeezy (no lo puedo hacer yo)

1. Crear dos productos con **precio por unidad y cantidad variable**, donde la
   cantidad es el número de furgonetas:
   - `Operación` — 5 €/unidad/mes y su variante anual (50 €/unidad/año)
   - `Completo` — 8 €/unidad/mes y su variante anual (80 €/unidad/año)
2. Poner los secretos en Fly:
   `LS_CHECKOUT_OPERACION`, `LS_CHECKOUT_COMPLETO`,
   `LS_CHECKOUT_OPERACION_ANNUAL`, `LS_CHECKOUT_COMPLETO_ANNUAL`.
3. Hasta entonces se cobra con los productos antiguos; el webhook los sigue
   reconociendo.

El webhook ya entiende los nombres nuevos. Si le llega un producto que no
reconoce, activa Completo y **deja un aviso en el log** — nunca menos permisos
de los pagados, pero que se vea.

## 4. Lo que de verdad falta (y no es el precio)

**Prueba.** Hasta hoy no se podía decir "esto te ahorra X €", porque ni en el
propio DSP se registraba lo que cuesta una reparación: 45 talleres dados de
alta, cero daños asignados, cero costes reales. Por eso se cerró el bucle del
daño antes de tocar los precios. Ahora se puede: taller → coste real →
reparado, y el dashboard distingue estimado de real.

**El número que falta:** un mes usando el bucle en el DSP propio. Con eso se
sale a vender con "en mi flota detectamos y cerramos X € en daños que antes se
perdían" en vez de con una demo.

**Distribución.** Es lo que falta de verdad. Y la ventaja aquí no la tiene
ningún competidor: eres operador de DSP en tres estaciones y conoces
personalmente a otros dueños. Un dueño de DSP compra de otro dueño de DSP que
le enseña la app en el móvil en el parking, no de una landing.

**Tamaño del mercado.** Del orden de 200–400 DSPs en España (a validar). Con
ese tamaño no se puede vivir de autoservicio barato: hace falta ticket alto y
venta directa. 50 clientes a 400 € son 20.000 €/mes — un negocio excelente para
una persona, pero son 50 conversaciones, no 50 registros online.

## 5. Orden recomendado

1. Usar el bucle del daño un mes en el DSP propio. Sale un número real.
2. Montar los productos en Lemon Squeezy (punto 3).
3. Enseñárselo a 10 DSPs conocidos. No una landing: tú, con el móvil, con tu
   propia flota funcionando. Objetivo: 3 pilotos de 60 días a cambio de poder
   contar sus números.
4. Con esos 3, hay caso real y precio validado. **Entonces** se decide si
   5 €/furgoneta está bien.

Lo que no toca ahora: bajar precios, añadir funciones o pulir la web. Ninguna
de las tres trae el primer cliente.
