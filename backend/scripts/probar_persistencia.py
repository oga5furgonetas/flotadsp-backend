# -*- coding: utf-8 -*-
"""ANTES DE CREER UN AUTO-VALIDADOR, MEDIRLO CONTRA LAS PERSONAS.

Dani pidio que la IA se validara a si misma y llenara sola el dataset. La
idea es correcta, pero tiene una trampa que arruina el proyecto entero: si
el modelo valida su propia respuesta a la MISMA pregunta, no aprende — se da
la razon. Los porcentajes subirian al 95 % y el modelo iria a peor, sin que
nadie se enterara hasta enseñarselo a un cliente.

Asi que cualquier señal candidata a auto-validar se mide ANTES contra los
veredictos humanos que ya hay. Si la señal no separa "existe" de "inventado",
no vale, por buena que suene.

DOS CANDIDATAS PROBADAS EL 26-08-2026, LAS DOS DESCARTADAS:

1. PERSISTENCIA (probar_persistencia.py) — "un daño real no se cura solo,
   asi que si aparece en varias inspecciones, existe".

       aparece 1 vez ....  348 veredictos   26,7 % existen
       aparece 2 veces ..  145 veredictos   20,0 %
       aparece 3-4 .....   206 veredictos   22,3 %
       aparece 5+ ......   537 veredictos   24,4 %

   PLANA. No predice nada. Porque los inventos del modelo NO son aleatorios:
   se inventa el mismo rozon del mismo paragolpes cada vez, porque ese
   paragolpes siempre tiene el mismo aspecto. Repetir refuerza el error en
   vez de filtrarlo.

2. RE-DETECCION SOBRE EL RECORTE (este fichero) — "haz zoom en la caja y
   preguntale otra vez; un invento no sobrevive al zoom".

       humano dijo "existe" ......  11 % ve algo
       humano dijo "existe" (mal
         situado) ................  12 % ve algo
       humano dijo "inventado" ...  10 % ve algo

   PLANA TAMBIEN. Y de paso destapa otra cosa: el detector propio
   (model_v2.pt) solo dispara en el 11 % de los recortes donde una persona
   CONFIRMO que hay daño. Es un hilo del que tirar aparte.

Los dos scripts se dejan aqui para volver a lanzarlos cuando el dataset
crezca: una señal que hoy no separa nada puede separarlo con mas datos, y
sin este arnes no habria forma de saberlo salvo desplegando y esperando.

Se lanzan desde la maquina de Fly, que tiene MONGO_URL y salida a la red:
    fly ssh console -a flotadsp-backend
    python /app/scripts/probar_autovalidacion.py
"""

# -*- coding: utf-8 -*-
import asyncio, os, collections, unicodedata
from motor.motor_asyncio import AsyncIOMotorClient

def norm(s):
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    return " ".join("".join(c for c in s if unicodedata.category(c) != "Mn").split())

async def main():
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"]); db = cli["flotadsp"]

    # 1. Cuantas veces se ha reportado cada (furgoneta, pieza) en el historico
    veces = collections.Counter()
    async for i in db.inspections.find({}, {"vehicle_id":1,"analysis.damages":1}):
        v = i.get("vehicle_id")
        vistas = set()
        for d in ((i.get("analysis") or {}).get("damages") or []):
            p = norm(d.get("part"))
            if p: vistas.add(p)
        for p in vistas: veces[(v, p)] += 1

    # 2. Contrastar con lo que dijeron las personas
    tab = collections.defaultdict(lambda: collections.Counter())
    n = 0
    async for f in db.ai_feedback.find({}, {"vehicle_id":1,"damage.part":1,"verdict":1}):
        v = f.get("vehicle_id"); p = norm((f.get("damage") or {}).get("part"))
        ver = f.get("verdict")
        if not v or not p or ver not in ("correct","corrected","wrong"): continue
        k = veces.get((v,p), 0)
        cubo = "1 vez" if k <= 1 else "2 veces" if k == 2 else "3-4 veces" if k <= 4 else "5+ veces"
        tab[cubo][ver] += 1; n += 1

    print("=== ¿predice la persistencia que el daño sea real? (%d veredictos) ===" % n)
    print("%-12s %8s %10s %9s %12s" % ("APARECE","total","existe","inventa","% EXISTE"))
    for cubo in ("1 vez","2 veces","3-4 veces","5+ veces"):
        c = tab[cubo]; t = sum(c.values())
        if not t: continue
        ex = c["correct"] + c["corrected"]
        print("%-12s %8d %10d %9d %11.1f%%" % (cubo, t, ex, c["wrong"], 100.0*ex/t))
    cli.close()

asyncio.run(main())
