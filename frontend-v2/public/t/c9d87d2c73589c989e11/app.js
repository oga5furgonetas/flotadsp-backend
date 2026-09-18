(function () {
  var API = "https://flotadsp-backend.fly.dev/api", TOKEN = "c9d87d2c73589c989e11";
  var NOMBRES = {"hoodie": "Hoodie FDs", "cortavientos": "Cortavientos FDs", "gorra": "Gorra FDs"};
  var datos = {};              // id de tarjeta -> lo que dice el backend
  var sel = {};                // id -> {talla, cant}
  var eur = function (n) { return n.toFixed(2).replace(".", ",") + " €"; };

  /* CUPON DE CAMPAÑA (candidatos): viaje por la URL (?cupon=...&exp=...), lo
     valida STRIPE al pagar (redeem_by), no esta pagina — si ya caducó o esta
     mal escrito, el backend reintenta la compra sin el en vez de bloquearla
     (ver tienda_publica_comprar). El "10 €" es el importe fijo que genera
     hoy la campaña (candidatos_campana_bienvenida): si algun dia cambia el
     importe alli, cambialo tambien aqui.
     LA CUENTA ATRAS ES INFORMATIVA, no la autoridad: cada persona tiene su
     propio cupon con su propio reloj (uno por candidato, gotcha 18-09-2026 —
     sin esto, con un solo cupon compartido no habia forma de saber cuanto le
     quedaba a CADA uno sin mezclarlo con el de otro). */
  var params = new URLSearchParams(location.search);
  var CUPON = params.get("cupon") || "";
  var CUPON_EUR = 10;      // mismo importe fijo que genera candidatos_campana_bienvenida
  var cuponVigente = !!CUPON;
  if (CUPON) {
    var banner = document.querySelector("[data-cupon]");
    banner.hidden = false;
    var expMs = params.get("exp") ? Date.parse(params.get("exp")) : NaN;
    var intervaloCupon;
    var pintaCupon = function () {
      if (isNaN(expMs)) {
        banner.innerHTML = "🎁 Tienes un <b>cupón de 10 € de bienvenida</b> aplicado — se descuenta al pagar, mientras siga vigente.";
        return;
      }
      var restante = expMs - Date.now();
      if (restante <= 0) {
        banner.innerHTML = "El cupón de bienvenida ya ha caducado. Puedes seguir comprando sin él.";
        banner.classList.add("cupon-caducado");
        clearInterval(intervaloCupon);
        if (cuponVigente) {
          // Deja de enseñar precios rebajados: el reloj de Stripe es el que
          // manda de verdad, pero mostrar un precio que ya no se va a aplicar
          // seria peor que no mostrar ninguno.
          cuponVigente = false;
          pintaTarjetas();
          document.querySelectorAll(".ficha:not([hidden])").forEach(function (f) { pintaFicha(f.id.slice(2)); });
        }
        return;
      }
      var h = Math.floor(restante / 3600000);
      var m = Math.floor((restante % 3600000) / 60000);
      var s = Math.floor((restante % 60000) / 1000);
      var falta = h > 0 ? (h + "h " + m + "min") : (m + "min " + s + "s");
      banner.innerHTML = "🎁 Tienes un <b>cupón de 10 € de bienvenida</b> — quedan <b>" + falta + "</b> para usarlo.";
    };
    pintaCupon();
    intervaloCupon = setInterval(pintaCupon, 1000);
  }

  /* EL PRECIO DE UNA TALLA LO DECIDE EL SERVIDOR. Que talla es grande y
     cuanto suma vienen en la respuesta: aqui solo se aplica. Con una lista
     propia, el dia que cambie se veria un precio y se cobraria otro. */
  function precioDe(d, talla) {
    if (!d) return 0;
    var extra = talla && (d.tallas_grandes || []).indexOf(talla) >= 0
      ? (d.recargo_talla || 0) : 0;
    return (d.precio || 0) + extra;
  }

  function pintaTarjetas() {
    document.querySelectorAll(".card").forEach(function (c) {
      var d = datos[c.dataset.prod];
      var p = c.querySelector("[data-precio]"), s = c.querySelector("[data-stock]");
      if (!d) { p.textContent = "—"; return; }
      var prefijo = d.recargo_talla > 0 ? "desde " : "";
      if (cuponVigente) {
        var rebajado = Math.max(0, d.precio - CUPON_EUR);
        p.innerHTML = prefijo + "<s style=\"color:var(--muted);font-weight:400\">" + eur(d.precio) + "</s> " + eur(rebajado);
      } else {
        p.textContent = prefijo + eur(d.precio);
      }
      s.className = "card-stock";
      if (d.quedan === null || d.quedan === undefined) { s.textContent = ""; }
      else if (d.quedan === 0) { s.textContent = "AGOTADO"; s.classList.add("cero"); }
      else if (d.quedan <= 5) { s.textContent = "QUEDAN " + d.quedan; s.classList.add("poco"); }
      else { s.textContent = d.quedan + " DISPONIBLES"; }
    });
  }

  function pintaFicha(id) {
    var f = document.getElementById("f-" + id), d = datos[id];
    var st = sel[id] || (sel[id] = { talla: "", cant: 1 });
    var cont = f.querySelector("[data-tallas]");
    if (!cont.dataset.hecho && d) {
      cont.innerHTML = "";
      (d.tallas || []).forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "talla";
        b.textContent = t === "U" ? "Única" : t;
        b.setAttribute("aria-pressed", "false");
        b.onclick = function () { st.talla = (st.talla === t ? "" : t); pintaFicha(id); };
        b.dataset.t = t;
        cont.appendChild(b);
      });
      cont.dataset.hecho = "1";
      if ((d.tallas || []).length === 1) { st.talla = d.tallas[0]; }
    }
    cont.querySelectorAll(".talla").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.t === st.talla ? "true" : "false");
    });
    var precio = precioDe(d, st.talla) * st.cant;
    // El cupon es un descuento FIJO sobre el TOTAL del pedido (asi lo aplica
    // Stripe, discounts[0][coupon] en la sesion), no por unidad: comprar 2 no
    // descuenta el doble.
    var precioFinal = cuponVigente ? Math.max(0, precio - CUPON_EUR) : precio;
    var cajaPrecio = f.querySelector(".precio");
    var tachado = cajaPrecio.querySelector("[data-precio-tachado]");
    if (cuponVigente && precio > 0) {
      if (!tachado) {
        tachado = document.createElement("s");
        tachado.setAttribute("data-precio-tachado", "");
        tachado.style.cssText = "font-family:var(--m);font-size:22px;color:var(--muted);margin-right:8px;font-weight:400";
        cajaPrecio.insertBefore(tachado, cajaPrecio.firstChild);
      }
      tachado.hidden = false;
      tachado.textContent = eur(precio);
    } else if (tachado) {
      tachado.hidden = true;
    }
    f.querySelector("[data-precio-grande]").textContent = d ? precioFinal.toFixed(2).replace(".", ",") : "—";
    f.querySelector("[data-cant]").textContent = st.cant;
    var nota = f.querySelector("[data-nota-talla]");
    var grande = d && st.talla && (d.tallas_grandes || []).indexOf(st.talla) >= 0;
    nota.textContent = (grande
      ? "Incluye " + eur(d.recargo_talla) + " de la talla " + st.talla + " · "
      : "") + (cuponVigente ? "10 € de cupón ya descontados · " : "") + "IVA y envío incluidos";
    var b = f.querySelector("[data-comprar]");
    var agotado = d && d.quedan === 0;
    b.disabled = !d || !st.talla || agotado || !abierta;
    b.textContent = agotado ? "Agotado"
      : !abierta ? "Aún no está a la venta"
      : !st.talla ? "Elige tu talla"
      : "Comprar · " + eur(precioFinal);
  }

  var abierta = false;

  function abrirFicha(id) {
    document.querySelectorAll(".ficha").forEach(function (f) { f.hidden = true; });
    document.getElementById("f-" + id).hidden = false;
    pintaFicha(id);
    document.getElementById("f-" + id).scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.querySelectorAll(".card").forEach(function (c) {
    c.onclick = function () { abrirFicha(c.dataset.prod); };
    c.onkeydown = function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirFicha(c.dataset.prod); }
    };
  });
  document.querySelectorAll(".volver").forEach(function (b) {
    b.onclick = function () {
      b.closest(".ficha").hidden = true;
      document.querySelector(".rejilla").scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
  document.querySelectorAll(".ficha").forEach(function (f) {
    var id = f.id.slice(2);
    f.querySelector("[data-menos]").onclick = function () {
      var s = sel[id] || (sel[id] = { talla: "", cant: 1 });
      s.cant = Math.max(1, s.cant - 1); pintaFicha(id);
    };
    f.querySelector("[data-mas]").onclick = function () {
      var s = sel[id] || (sel[id] = { talla: "", cant: 1 });
      var d = datos[id];
      var tope = Math.min(5, d && typeof d.quedan === "number" ? d.quedan : 5);
      s.cant = Math.min(Math.max(1, tope), s.cant + 1); pintaFicha(id);
    };
    f.querySelector("[data-comprar]").onclick = function () {
      comprar(id, f);
    };
  });

  function comprar(id, f) {
    var d = datos[id], s = sel[id];
    var b = f.querySelector("[data-comprar]"), av = f.querySelector("[data-aviso]");
    b.disabled = true; b.textContent = "Abriendo el pago…";
    av.className = "aviso"; av.textContent = "";
    var cuerpo = { prenda: d.id, talla: s.talla, cantidad: s.cant };
    if (CUPON) cuerpo.cupon = CUPON;
    fetch(API + "/tienda/publico/" + TOKEN + "/comprar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (x) {
      if (x.ok && x.j.url) { window.location.href = x.j.url; return; }
      av.className = "aviso mal";
      av.textContent = (x.j && x.j.detail) || "No se ha podido abrir el pago.";
      pintaFicha(id);
    }).catch(function () {
      av.className = "aviso mal";
      av.textContent = "No se ha podido conectar. Inténtalo en un minuto.";
      pintaFicha(id);
    });
  }

  /* El estado viene del backend al cargar: precios, cuantas quedan y si esta
     abierta. Asi el dia que se encienda la tienda, esta pagina se activa sola
     sin volver a publicarla. */
  fetch(API + "/tienda/publico/" + TOKEN).then(function (r) { return r.json(); })
    .then(function (d) {
      abierta = !!d.abierta;
      (d.prendas || []).forEach(function (p) {
        for (var k in NOMBRES) { if (NOMBRES[k] === p.nombre) datos[k] = p; }
      });
      pintaTarjetas();
      document.querySelectorAll(".ficha").forEach(function (f) { pintaFicha(f.id.slice(2)); });
    }).catch(function () { /* sin datos, la pagina se ve pero no vende */ });

  // el visor de fotos
  var visor = document.querySelector(".visor"), grande = visor.querySelector("img");
  if (visor.showModal) {
    document.querySelectorAll(".tira img").forEach(function (img) {
      img.tabIndex = 0; img.setAttribute("role", "button");
      img.onclick = function () { grande.src = img.currentSrc || img.src; grande.alt = img.alt; visor.showModal(); };
      img.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); img.onclick(); } };
    });
    visor.onclick = function () { visor.close(); };
    visor.addEventListener("close", function () { grande.removeAttribute("src"); });
  } else {
    document.querySelectorAll(".tira img").forEach(function (i) { i.style.cursor = "default"; });
  }

  // vuelta de Stripe
  var q = new URLSearchParams(location.search);
  if (q.get("pago") === "ok") {
    var m = document.createElement("div");
    m.className = "pedir";
    // La referencia viene de la URL, asi que se escribe como TEXTO, nunca
    // dentro de un innerHTML: `?ref=<img onerror=...>` es una cadena que
    // cualquiera puede fabricar y reenviar. La CSP de esta pagina ya lo
    // frenaria, pero una pagina no se defiende con una sola puerta.
    var h = document.createElement("h2"); h.textContent = "Pago recibido";
    var t = document.createElement("p"); t.style.cssText = "margin:0;font-size:14.5px";
    t.append("Gracias. Tu referencia es ");
    var ref = document.createElement("b"); ref.textContent = q.get("ref") || "";
    t.append(ref, ". Te escribimos en cuanto salga el pedido.");
    m.append(h, t);
    document.querySelector(".rejilla").before(m);
    history.replaceState({}, "", location.pathname);
  }
})();
