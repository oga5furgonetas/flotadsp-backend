# LEE ESTO ANTES DE TOCAR NADA

Estás en el **LABORATORIO** de FlotaDSP, no en la aplicación real.

FlotaDSP está **en producción** en flotadsp.com con clientes de pago y con la
flota real de una empresa de reparto. Un error aquí no es un error de juguete.

---

## LAS TRES REGLAS

### 1. Trabajas SOLO en esta carpeta

```
C:\Users\Usuario\Downloads\flotadsp_lab     ← AQUÍ (rama lab)
C:\Users\Usuario\Downloads\flotadsp_work    ← PRODUCCIÓN. No entres.
```

Las dos carpetas son el mismo repositorio visto desde dos sitios. Cada una está
fija en su rama. **No ejecutes `git checkout main` ni cambies de rama**: dejarías
esta carpeta apuntando al código real.

### 2. NO DESPLIEGAS. Nunca. Ni a producción ni al LAB.

Esto es lo más importante del documento, porque las instrucciones no son un muro:
el fichero de configuración de producción (`backend/fly.toml`) está en este mismo
repositorio. Si ejecutas `fly deploy` a secas, **despliegas la aplicación real**.

Lo mismo con el frontend: `wrangler pages deploy dist --project-name flotadsp-v2`
sin `--branch lab` publica en **flotadsp.com**.

Prohibido, sin excepciones:

```
fly deploy                              ← despliega PRODUCCIÓN
fly secrets set -a flotadsp-backend     ← toca PRODUCCIÓN
npx wrangler pages deploy dist ...      ← publica en flotadsp.com
git push origin main                    ← empuja a la rama real
git merge lab                           ← mete el laboratorio en producción
```

Si un cambio necesita verse desplegado, **dilo y para**. Lo despliega otro.

### 3. Nada sale del LAB sin revisión humana

Tu trabajo termina cuando haces `commit` en la rama `lab`. El paso de LAB a
producción lo hace una persona, después de revisar el cambio y pasar los
comprobadores. No lo propongas como "ya está listo para producción": no te
corresponde decidirlo.

---

## Qué SÍ puedes hacer

- Escribir y modificar código en esta carpeta.
- Hacer `commit` en la rama `lab`, con mensajes claros de qué cambia y por qué.
- Ejecutar los comprobadores del proyecto (obligatorio antes de cada commit):

```bash
node scripts/check-routes.mjs
node scripts/check-i18n.mjs
node scripts/check-huerfanas.mjs
python scripts/check_contracts.py
python -m py_compile backend/server.py
```

- Compilar el frontend para comprobar que no rompes el build:

```bash
cd frontend-v2 && npm run build -- --mode lab --outDir dist-lab
```

---

## La base de datos: el riesgo que no se ve

El LAB escribe en `lab_flotadsp` y `lab_flotadsp_global`, separadas de las reales.
**Pero usa la misma llave de acceso que producción.** Esa llave abre todas las
bases del clúster.

Traducción: un script que recorra "todas las bases de datos" llegaría a los datos
reales de la empresa. Y hay un motivo concreto por el que alguien lo escribiría:
la base del cliente principal se llama `flotadsp`, no `dsp_<id>`, así que los
scripts que solo miran `dsp_*` dan falsos negativos y la tentación es recorrerlas
todas.

**No escribas scripts que recorran bases de datos.** Si tu experimento lo necesita,
para y dilo.

---

## Cosas del proyecto que te van a morder

Están todas documentadas en `CLAUDE.md` (en la raíz). Léelo. Las que más:

- **Las listas blancas de PATCH descartan campos EN SILENCIO.** Si añades un campo
  editable y no lo metes en la whitelist y en el modelo, se pierde sin error.
- **Un asset que no existe devuelve `index.html` con HTTP 200**, no un 404. Tras
  desplegar hay una ventana en la que un chunk puede quedar "envenenado" en la
  caché del navegador durante 4 horas y tumbar la aplicación entera.
- **Mongo omite la clave del `_id` en un `$group`** cuando el campo no existe en el
  documento. Usa siempre `.get()`.
- **`center` está guardado sucio** (`'OGA5'`, `'OGA5 '`, `'oga5'`…). Filtra por
  `$regex`, nunca por igualdad.

---

## Y lo más importante de todo: no inventes

Este proyecto se ha construido comprobando cada afirmación contra datos reales, y
tirando las hipótesis que no aguantaban. Hay resultados negativos documentados a
propósito (`docs/PREDICTOR_RESCATES.md` explica por qué NO se construye una
funcionalidad que parecía buena).

- Si no puedes demostrar algo, **dilo**. No lo maquilles.
- No presentes una estimación con la misma cara que un dato medido. La interfaz
  ya distingue lo demostrado de lo estimado, y hay que mantener esa distinción.
- Un falso positivo —decirle al usuario que algo va bien cuando no va bien— es
  peor que no decir nada. Aquí ya ha pasado y ha costado caro.
