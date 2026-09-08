(function () {
  var API = "https://flotadsp-backend.fly.dev/api", TOKEN = "c9d87d2c73589c989e11";
  var NOMBRES = {"hoodie": "Hoodie FDs", "cortavientos": "Cortavientos FDs", "gorra": "Gorra FDs"};
  var datos = {};              // id de tarjeta -> lo que dice el backend
  var sel = {};                // id -> {talla, cant}
  var eur = function (n) { return n.toFixed(2).replace(".", ",") + " €"; };

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
      p.textContent = (d.recargo_talla > 0 ? "desde " : "") + eur(d.precio);
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
    f.querySelector("[data-precio-grande]").textContent = d ? precio.toFixed(2).replace(".", ",") : "—";
    f.querySelector("[data-cant]").textContent = st.cant;
    var nota = f.querySelector("[data-nota-talla]");
    var grande = d && st.talla && (d.tallas_grandes || []).indexOf(st.talla) >= 0;
    nota.textContent = grande
      ? "Incluye " + eur(d.recargo_talla) + " de la talla " + st.talla + " · IVA y envío incluidos"
      : "IVA incluido · envío incluido";
    var b = f.querySelector("[data-comprar]");
    var agotado = d && d.quedan === 0;
    b.disabled = !d || !st.talla || agotado || !abierta;
    b.textContent = agotado ? "Agotado"
      : !abierta ? "Aún no está a la venta"
      : !st.talla ? "Elige tu talla"
      : "Comprar · " + eur(precio);
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
    fetch(API + "/tienda/publico/" + TOKEN + "/comprar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prenda: d.id, talla: s.talla, cantidad: s.cant })
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
