# 🧪 LAB FlotaDSP — guía sencilla del laboratorio

El LAB es una **copia separada** de FlotaDSP para experimentar sin romper nada.
Producción (tu app real en `flotadsp.com` y `flotadsp-backend.fly.dev`)
**nunca se toca** desde el LAB.

---

## Cómo está montado

| Pieza | Producción (real) | LAB (experimento) |
|---|---|---|
| Página web | flotadsp.com | **lab.flotadsp-v2.pages.dev** |
| Cerebro (backend) | flotadsp-backend.fly.dev | **flotadsp-backend-lab.fly.dev** |
| Base de datos | `flotadsp`, `dsp_*` | **`lab_flotadsp`, `lab_flotadsp_global`** |
| Rama de Git | main | **lab** |
| Pagos / Telegram / Gemini | activos | **apagados a propósito** |

---

## Cómo abrir el LAB en el navegador

Escribe esta dirección:

```
https://lab.flotadsp-v2.pages.dev
```

Entrará con el usuario de administración del LAB.

---

## Cómo saber que estás en el LAB y NO en producción

1. **La barra de direcciones** muestra `lab.flotadsp-v2.pages.dev`
   (nunca `flotadsp.com`).
2. **Los datos son de laboratorio**: vehículos y conductores ficticios,
   no tu flota real. Si ves tus furgonetas de verdad, es que algo se
   configuró mal — avísame.
3. El backend responde en `flotadsp-backend-lab.fly.dev` (comprobable
   abriendo `https://flotadsp-backend-lab.fly.dev/api/health`).

---

## Desplegar cambios en el LAB (botones)

- **Backend LAB** (doble clic o PowerShell):
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\lab-deploy-backend.ps1
  ```
- **Frontend LAB**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\lab-deploy-frontend.ps1
  ```

Ninguno de los dos toca producción.

---

## Volver a producción (siempre posible)

- En Git: `git checkout main` → vuelves al código de producción.
- El LAB queda parado solo (cuesta 0 €). Para eliminarlo del todo
  cuando ya no lo necesites:
  ```
  fly apps destroy flotadsp-backend-lab
  ```

---

## Promocionar una función del LAB a producción

Solo cuando **tú lo apruebes explícitamente**:

```
git checkout main
git merge lab
# CI automático pasa los tests
cd backend && fly deploy
cd frontend-v2 && npm run build && npx wrangler pages deploy dist --project-name flotadsp-v2
```

---

## Cosas que el LAB NO tiene (a propósito)

- ❌ No envía Telegram.
- ❌ No procesa pagos (webhook apagado).
- ❌ No llama a Gemini por defecto.
- ❌ No comparte base de datos con producción.
- ❌ Sin credenciales de producción.