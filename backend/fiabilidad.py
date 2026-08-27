# -*- coding: utf-8 -*-
"""La IA juzgandose a si misma: cuanta confianza merece cada dano que reporta.

EL PROBLEMA QUE RESUELVE. El aprendizaje solo se alimentaba de `ai_feedback`,
que es revision HUMANA, y en 30 dias se revisa el 2,8 % de las inspecciones
(44 de 1.571). Con eso el bucle no se cierra nunca: la IA no aprende, y nadie
sabe de que fiarse. Lo que hace este modulo es puntuar cada dano ANTES de que
lo vea nadie, con lo que la propia IA ya emite.

QUE SE PROBO Y QUE SE DESCARTO (medido, no supuesto)

  · Persistencia por ZONA — que un dano reaparezca en las fotos de otros
    conductores. **Descartado.** La precision se queda en ~25 % tanto con cero
    conductores apoyando como con seis; la tasa base es 24,7 %. No informa nada,
    porque casi toda furgoneta tiene algo reportado en casi toda zona: la senal
    esta siempre encendida.
  · Persistencia por PIEZA exacta. **Descartado.** Sale invertida (60,8 % reales
    cuando la pieza NO aparece en mas inspecciones) porque esta contaminada: las
    piezas que salen en todas las inspecciones son justo las que mas alucina.
    Lo que mide de verdad es la frecuencia de la pieza, que ya es un rasgo.
  · Palabras de la descripcion ("superficial", "abolladura", "rotura").
    **Descartado.** AUC 0,763 con ellas y 0,762 sin ellas: no aportan.

QUE SI FUNCIONA. Cuatro rasgos que emite la propia IA, mas sus interacciones:

    gravedad     leve 18 % real  ->  moderado 43 %  ->  grave 65 %
    cuantos ve   5+ danos 24,6 % ->  1-2 danos 62 %
    posicion     el 5.o y siguientes 18,6 %  ->  el primero 46,6 %
    pieza        paragolpes trasero 11 %  ->  panel lateral izq 54 %

En cristiano: cuando suelta una lista larga de danos leves, del cuarto en
adelante se los esta inventando.

RENDIMIENTO, VALIDADO FUERA DE MUESTRA (5 pliegues, 1.423 revisiones):

    AUC 0,762
    puntuacion < 0,15  ->  91,6 % son inventados de verdad
    puntuacion >= 0,75 ->  89,3 % son reales de verdad

Por eso los umbrales son esos y no otros, y por eso el medio NO se decide solo:
entre 0,15 y 0,75 la IA no sabe, y decir "no se" es la respuesta correcta.

LO QUE ESTO NO ES. No mira la foto. El techo de 0,762 es el de juzgar a la IA
por como habla, no por lo que se ve; subir de ahi es trabajo del detector de
vision, que es otra via. Y `descartado` NO significa borrado: el dano se sigue
guardando y se sigue pudiendo ver, porque lo que desaparece sin dejar rastro es
lo que acaba costando dinero.
"""
import ast
import collections
import math
import random

try:
    import piezas
except ImportError:  # cuando se importa como paquete
    from . import piezas

# Umbrales elegidos sobre la medicion de arriba, no a ojo.
UMBRAL_DESCARTE = 0.15
UMBRAL_CONFIRMA = 0.75

COLECCION = "ai_modelo_fiabilidad"
_MIN_APARICIONES = 8      # un rasgo visto menos veces no se aprende, se ignora
_MIN_MUESTRAS = 200       # por debajo de esto no se entrena: se diria cualquier cosa


# ── Rasgos ───────────────────────────────────────────────────────────────────
def rasgos(dano: dict, total_danos, indice: int) -> list:
    """Los rasgos de UN dano. Todo sale de lo que la IA ya escribio."""
    t = total_danos or 0
    cn = piezas.canon((dano or {}).get("part"))
    sev = str((dano or {}).get("severity") or "?").strip().lower()
    n = "1-2" if t <= 2 else "3-4" if t <= 4 else "5+"
    pos = "0" if indice == 0 else "1-2" if indice <= 2 else "3+"
    pz = cn[0][0] if cn else "?"
    return ["sev=" + sev, "n=" + n, "pos=" + pos, "pz=" + pz,
            "sev*n=" + sev + "|" + n, "sev*pos=" + sev + "|" + pos,
            "pz*sev=" + pz + "|" + sev, "n*pos=" + n + "|" + pos]


# ── Regresion logistica, a mano ──────────────────────────────────────────────
# A mano y a proposito: son treinta lineas que se pueden leer, y este numero
# decide si a alguien se le reclama una abolladura. Una caja negra que nadie
# puede auditar no vale para eso.
def _ajusta(muestras, columnas, iters=400, lr=0.35, l2=0.02):
    idx = {c: i for i, c in enumerate(columnas)}
    w = [0.0] * (len(columnas) + 1)
    X = [[idx[f] for f in fs if f in idx] for fs, _ in muestras]
    Y = [1.0 if y else 0.0 for _, y in muestras]
    n = max(len(X), 1)
    for _ in range(iters):
        g = [0.0] * len(w)
        for xi, yi in zip(X, Y):
            z = w[-1] + sum(w[j] for j in xi)
            d = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, z)))) - yi
            for j in xi:
                g[j] += d
            g[-1] += d
        for j in range(len(w)):
            reg = l2 * w[j] if j < len(w) - 1 else 0.0
            w[j] -= lr * (g[j] / n + reg)
    return w, idx


def _predice(pesos, indice, fs) -> float:
    z = pesos[-1] + sum(pesos[indice[f]] for f in fs if f in indice)
    return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, z))))


def _auc(puntos) -> float:
    pos = [s for s, y in puntos if y]
    neg = [s for s, y in puntos if not y]
    if not pos or not neg:
        return 0.5
    pos.sort()
    total = 0.0
    for s in neg:
        lo, hi = 0, len(pos)
        while lo < hi:
            m = (lo + hi) // 2
            if pos[m] <= s:
                lo = m + 1
            else:
                hi = m
        iguales = 0
        j = lo - 1
        while j >= 0 and pos[j] == s:
            iguales += 1
            j -= 1
        total += (len(pos) - lo) + 0.5 * iguales
    return total / (len(pos) * len(neg))


# ── Muestras de entrenamiento ────────────────────────────────────────────────
async def _muestras(db) -> list:
    """(rasgos, es_real) de cada revision humana.

    `corrected` cuenta como REAL: la persona movio el recuadro, o sea que el
    dano existe y lo que fallo fue el sitio. Son dos preguntas distintas y
    mezclarlas fue un error que ya se pago una vez — aqui se responde solo la
    primera, que es la que decide si hay que reclamar algo.
    """
    totales = {}
    cur = db.inspections.find({"analysis_status": "ok"},
                              {"_id": 0, "id": 1, "analysis.total_damages_count": 1})
    async for d in cur:
        totales[d.get("id")] = ((d.get("analysis") or {}).get("total_damages_count"))

    fuera = []
    cur = db.ai_feedback.find(
        {"verdict": {"$in": ["correct", "corrected", "wrong"]}},
        {"_id": 0, "verdict": 1, "damage": 1, "inspection_id": 1, "damage_index": 1})
    async for f in cur:
        dmg = f.get("damage")
        if isinstance(dmg, str):
            try:
                dmg = ast.literal_eval(dmg)
            except (ValueError, SyntaxError):
                continue
        if not isinstance(dmg, dict):
            continue
        try:
            ix = int(f.get("damage_index") or 0)
        except (TypeError, ValueError):
            ix = 0
        fuera.append((rasgos(dmg, totales.get(f.get("inspection_id")), ix),
                      f["verdict"] in ("correct", "corrected")))
    return fuera


async def entrenar(db) -> dict:
    """Entrena, se mide a si mismo FUERA DE MUESTRA y se guarda.

    La medicion es de validacion cruzada, nunca del propio entrenamiento: un
    modelo puntuandose con los datos que ya vio da un numero bonito y falso, y
    ese numero acabaria en una pantalla delante de alguien que decide con el.
    """
    datos = await _muestras(db)
    if len(datos) < _MIN_MUESTRAS:
        return {"ok": False, "motivo": "pocas_muestras", "muestras": len(datos),
                "hacen_falta": _MIN_MUESTRAS}

    orden = list(datos)
    random.Random(7).shuffle(orden)
    K = 5
    cortes = [i * len(orden) // K for i in range(K + 1)]
    puntos = []
    for k in range(K):
        tr = orden[:cortes[k]] + orden[cortes[k + 1]:]
        freq = collections.Counter(f for fs, _ in tr for f in fs)
        cols = [c for c, v in freq.items() if v >= _MIN_APARICIONES]
        w, ix = _ajusta(tr, cols)
        for fs, y in orden[cortes[k]:cortes[k + 1]]:
            puntos.append((_predice(w, ix, fs), y))

    reales = sum(1 for _, y in puntos if y)
    bajos = [y for s, y in puntos if s < UMBRAL_DESCARTE]
    altos = [y for s, y in puntos if s >= UMBRAL_CONFIRMA]
    metricas = {
        "muestras": len(datos),
        "base_reales_pct": round(100.0 * reales / len(puntos), 1),
        "auc": round(_auc(puntos), 3),
        "descartados": len(bajos),
        "descarte_acierto_pct": round(100.0 * (len(bajos) - sum(bajos)) / len(bajos), 1) if bajos else None,
        "confirmados": len(altos),
        "confirma_acierto_pct": round(100.0 * sum(altos) / len(altos), 1) if altos else None,
        "umbral_descarte": UMBRAL_DESCARTE,
        "umbral_confirma": UMBRAL_CONFIRMA,
    }

    # El modelo que se guarda se entrena con TODO, ya medido aparte.
    freq = collections.Counter(f for fs, _ in datos for f in fs)
    cols = [c for c, v in freq.items() if v >= _MIN_APARICIONES]
    w, ix = _ajusta(datos, cols)
    doc = {"_id": "activo", "columnas": cols, "pesos": w, "metricas": metricas}
    await db[COLECCION].replace_one({"_id": "activo"}, doc, upsert=True)
    return {"ok": True, **metricas}


async def cargar(db):
    """(pesos, indice, metricas) o None si todavia no hay modelo."""
    doc = await db[COLECCION].find_one({"_id": "activo"})
    if not doc or not doc.get("columnas"):
        return None
    return doc["pesos"], {c: i for i, c in enumerate(doc["columnas"])}, doc.get("metricas") or {}


def puntuar(modelo, dano: dict, total_danos, indice: int):
    """Probabilidad de que el dano sea real. None si no hay modelo todavia.

    None, no 0,5: sin modelo no hay opinion, y fingir una del monton haria que
    todo cayera en 'dudoso' como si el sistema hubiera decidido algo.
    """
    if not modelo:
        return None
    pesos, indice_cols, _ = modelo
    return round(_predice(pesos, indice_cols, rasgos(dano, total_danos, indice)), 3)


def veredicto(p):
    """confirmado / dudoso / descartado / None."""
    if p is None:
        return None
    if p >= UMBRAL_CONFIRMA:
        return "confirmado"
    if p < UMBRAL_DESCARTE:
        return "descartado"
    return "dudoso"


def incertidumbre(p):
    """Cuanto ensena revisar esto: maxima justo en la frontera de la duda.

    La cola de revision se ordena por esto y no por fecha. Con 44 revisiones en
    30 dias, gastarlas en casos donde el modelo ya lo tiene claro es tirarlas:
    lo que ensena es lo que no sabe.
    """
    if p is None:
        return 0.0
    return round(1.0 - 2.0 * abs(p - 0.5), 3)
