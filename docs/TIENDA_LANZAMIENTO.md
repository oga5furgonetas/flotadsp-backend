# Lanzar la tienda FDs — lo que queda por hacer

Estado a 07-09-2026. Todo lo que no aparece aquí ya está hecho y desplegado.

La tienda está **apagada**: ningún conductor la ve. Se enciende desde
`/panel/tienda`, con el interruptor «Abierta para los conductores».

---

## Lo que ya está montado

- Los 8 productos, con los **costes reales del catálogo de Printful** y precios
  de venta que dejan entre un 35% y un 44% **limpio** (ya descontados IVA,
  envío y comisión de la pasarela).
- **Drops**: cada prenda tiene unidades limitadas. Cuando quedan 5 o menos, el
  conductor lo ve. Al agotarse deja de venderse sola.
- El recargo de las tallas XXL y 3XL (**+3 €**), que se avisa antes de añadir
  al carrito. Printful cobra +1,57 € de esas tallas en adelante.
- **Stripe**, montado y apagado. Se enciende poniendo dos claves, sin tocar
  código.
- Cuenta de tienda propia para cada conductor (su correo, su contraseña),
  aparte de la del trabajo.

---

## PASO 1 — Printful (una tarde)

### 1.1 Crea la cuenta y sube el logo

En **printful.com**, con el correo de FlotaDSP. En *Product templates* o
directamente al diseñar, sube el logo en **SVG o PNG con fondo transparente**.

El logo bueno es el **monograma geométrico** (el número 1 de tu tablero), en
**cian sobre negro**. Es el único que, junto al sello y al escudo, aguanta el
bordado de la gorra: el manuscrito y la línea continua tienen el trazo
demasiado fino y en hilo se pierden.

### 1.2 Monta los 7 productos que van con impresión

Para cada uno: abrir el enlace → *Start designing* → subir el logo → colocarlo
en **pecho izquierdo, 8 cm de ancho** → guardar como plantilla.

| # | Producto en Printful | Tu prenda en la app | Coste |
|---|---|---|---|
| 1 | [Gildan 5000](https://www.printful.com/es/personalizables/hombre/camisetas/camiseta-clasica-unisex-5000) · negra | Camiseta FDs negra | 7,72 € |
| 2 | [Gildan 64000 softstyle](https://www.printful.com/es/personalizables/hombre/camisetas/camiseta-basica-softstyle-unisex-gildan-64000) · negra | Camiseta FDs entallada | 7,72 € |
| 3 | [Gildan 18000](https://www.printful.com/es/personalizables/hombre/sudaderas/sudadera-unisex-gildan-18000) · antracita | Sudadera FDs | 17,90 € |
| 4 | [Gildan 18500](https://www.printful.com/es/personalizables/hombre/sudaderas/sudadera-invierno-con-capucha-unisex-gildan-18500) · negra | Hoodie FDs | 23,39 € |
| 5 | [SOL'S 32000](https://www.printful.com/es/personalizables/hombre/chaquetas/cortavientos-basico-unisex-sols-32000) · marino | Cortavientos FDs | 22,16 € |
| 6 | [Yupoong 6245CM](https://www.printful.com/es/personalizables/bordadas/gorras/gorra-beisbol-yupoong-6245cm) · negra | Gorra FDs | 16,65 € |
| 7 | [Yupoong 1501KC](https://www.printful.com/es/personalizables/bordadas/gorras/gorro-invierno-yupoong-1501kc) · negro | Gorro de invierno FDs | 14,18 € |

**Las dos camisetas son distintas a propósito**: la 5000 es la clásica gruesa
y de corte recto; la 64000 softstyle es más fina y entallada, de calle. Mismo
precio las dos. No hay referencia «de mujer»: se descartó la Gildan 64000L
porque tiene 3,5 estrellas, y la softstyle unisex tiene 4,5 con 3.673
opiniones. Es lo que hace casi todo el streetwear — una sola referencia de la
S a la 3XL y cada uno coge su talla.

Los dos últimos son **bordado**, no impresión. Es lo que se espera en una
gorra: una gorra serigrafiada se ve barata.

### 1.3 El chándal, aparte

El [pantalón de chándal](https://www.printful.com/es/personalizables/hombre/pantalones-bajos/pantalon-chandal-all-over-unisex)
(32,06 €) es el único que Printful sirve a España, y es de **estampado
completo**: se imprime la prenda entera, no un logo al pecho. Necesita un
diseño distinto —el logo repetido, o una banda lateral— y queda diferente al
resto de la línea.

**Déjalo para después.** Lanza con los siete primeros y añádelo cuando veas
que se vende lo demás.

### 1.4 Baja las imágenes — esto es importante

Cuando colocas el logo, Printful genera el **mockup**: la foto del producto con
tu diseño puesto. Descárgala.

**Esa es la foto que va en la tienda**, y es honesta: es exactamente la prenda
que va a recibir quien compre. Súbela en `/panel/tienda` → *Tus prendas* →
Editar → **Subir foto**.

Ahora mismo se ve un dibujo. Con un dibujo no compra nadie.

### 1.5 Pídete una muestra

*New order* → **Sample order** (lleva 20% de descuento). La camiseta negra.
Pruébatela y **lávala cinco veces** mirando costuras y estampado.

Es lo único que te dice si la tela aguanta antes de venderle a 140 personas.

---

## PASO 2 — Stripe

> Esto lo tienes que hacer tú: no puedo crear cuentas ni manejar tus claves.

### 2.1 Crea la cuenta

En **stripe.com**, con los datos de la SL cuando exista. Mientras tanto puedes
crearla y trabajar en **modo prueba** (las claves empiezan por `sk_test_`), que
funciona igual pero no cobra de verdad.

**Sin sociedad no puedes cobrar en real.** Stripe pide NIF y cuenta bancaria a
nombre de quien factura.

### 2.2 El webhook

En Stripe → *Developers* → *Webhooks* → *Add endpoint*:

- **URL**: `https://flotadsp-backend.fly.dev/api/tienda/stripe/webhook`
- **Evento**: `checkout.session.completed` (solo ese)

Copia el *Signing secret* que te da (empieza por `whsec_`).

### 2.3 Enciéndelo

Dos comandos, desde la carpeta `backend`:

```bash
fly secrets set STRIPE_SECRET_KEY=sk_live_loquesea
```

```bash
fly secrets set STRIPE_WEBHOOK_SECRET=whsec_loquesea
```

Con eso se enciende solo: en «Mis pedidos» aparece el botón **Pagar**, y cuando
alguien paga, el pedido pasa a *Pagado* sin que nadie toque nada.

Hasta entonces, los pedidos se quedan en *Pendiente de pago* y los marcas tú
desde el panel cuando cobres por Bizum o transferencia. **La tienda funciona
igual sin Stripe** — solo cambia quién marca el cobro.

---

## PASO 3 — Lanzar

1. Sube las **fotos** de los 7 productos.
2. Ajusta las **unidades de cada drop** si quieres (están en 25/12/15/15/10/20/20).
   Vacío = sin límite.
3. Enciende el interruptor en `/panel/tienda`.
4. Avisa por el grupo. Sin foto y sin aviso no vende nadie.

### Cuando entre el primer pedido

- Te llega a `/panel/tienda`, en «Pedidos».
- Cobras (Stripe o a mano) y lo marcas como **Pagado**.
- Entras en Printful, *New order*, eliges la plantilla, pones la talla y
  **la dirección de la nave**.
- Cuando llega, lo repartes y lo marcas **Entregado**.

**Junta los pedidos y pide una vez por semana.** No por el precio de la prenda
—Printful cobra igual por una que por veinte— sino por el **envío**, que va por
pedido: veinte prendas en un envío a la nave en vez de veinte envíos.

---

## Lo que no está resuelto

- **Sin sociedad no hay factura.** Lo que emite la app es un **justificante**, y
  lo dice claramente. El día que exista la SL pasa a llevar serie, NIF e IVA
  desglosado.
- **Sin NIF, Printful te cobra el IVA.** Cada prenda te cuesta hoy un 21% más
  que el día que tengas la SL. Los márgenes de la app ya cuentan con eso, así
  que ese día suben solos.
