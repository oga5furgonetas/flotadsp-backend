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

import asyncio, os, io as _io, base64, collections
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image
import httpx
AI = "https://flotadsp-ai.fly.dev"

def foto_bytes_o_url(v):
    if not isinstance(v, str): v = (v or {}).get("url") or ""
    if not v: return None
    if v.startswith("http"): return ("url", v)
    try: return ("bytes", base64.b64decode(v.split(",",1)[-1]))
    except Exception: return None

async def main():
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"]); db = cli["flotadsp"]
    porv = collections.defaultdict(list)
    async for f in db.ai_feedback.find(
            {"verdict": {"$in": ["correct","corrected","wrong"]}},
            {"verdict":1,"damage":1,"inspection_id":1}).limit(5000):
        d = f.get("damage") or {}
        b, pi = d.get("box_2d"), d.get("photo_index")
        if isinstance(b, list) and len(b)==4 and pi is not None:
            porv[f["verdict"]].append((b, pi, f.get("inspection_id")))
    muestra = [(v,)+x for v in ("correct","corrected","wrong") for x in porv[v][:25]]
    print("muestra:", {v: min(25,len(porv[v])) for v in porv})

    tab = collections.defaultdict(lambda: collections.Counter())
    async with httpx.AsyncClient(timeout=90) as c:
        for ver, b, pi, insp in muestra:
            try:
                doc = await db.inspections.find_one({"id": insp}, {"photos":1})
                fotos = (doc or {}).get("photos") or []
                if pi >= len(fotos): tab[ver]["sin foto"] += 1; continue
                src = foto_bytes_o_url(fotos[pi])
                if not src: tab[ver]["sin foto"] += 1; continue
                raw = src[1] if src[0]=="bytes" else (await c.get(src[1])).content
                im = Image.open(_io.BytesIO(raw)).convert("RGB")
                W,H = im.size
                y0,x0,y1,x1 = [v/1000.0 for v in b]
                mw,mh = (x1-x0)*0.3, (y1-y0)*0.3
                crop = im.crop((int(max(0,x0-mw)*W), int(max(0,y0-mh)*H),
                                int(min(1,x1+mw)*W), int(min(1,y1+mh)*H)))
                if crop.width < 32 or crop.height < 32: tab[ver]["muy pequeño"] += 1; continue
                e = max(1, int(832/max(crop.width, crop.height)))
                if e > 1: crop = crop.resize((crop.width*e, crop.height*e))
                buf = _io.BytesIO(); crop.save(buf,"JPEG",quality=90)
                r = await c.post(AI+"/detect", json={
                    "inspection_id":"verif","photo_index":0,
                    "image_b64": base64.b64encode(buf.getvalue()).decode()})
                if r.status_code != 200: tab[ver]["HTTP %d"%r.status_code] += 1; continue
                n = len(r.json().get("detections") or [])
                tab[ver]["ve" if n else "no ve"] += 1
            except Exception as ex:
                tab[ver][type(ex).__name__] += 1

    print("\n=== ¿ve daño el detector al hacer zoom? ===")
    print("%-11s %7s %7s %8s   %s" % ("HUMANO","ve","no ve","otros","lectura"))
    for v in ("correct","corrected","wrong"):
        c = tab[v]; t = c["ve"]+c["no ve"]
        otros = sum(n for k,n in c.items() if k not in ("ve","no ve"))
        print("%-11s %7d %7d %8d   %s" % (v, c["ve"], c["no ve"], otros,
              ("%.0f%% ve algo" % (100.0*c["ve"]/t)) if t else "sin datos"))
        if otros: print("            (%s)" % dict((k,n) for k,n in c.items() if k not in ("ve","no ve")))
    cli.close()

asyncio.run(main())
