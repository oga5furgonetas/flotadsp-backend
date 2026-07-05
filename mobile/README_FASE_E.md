# Fase E — Detalle de inspección (fotos + daños)

Continuidad de FlotaDSP Admin, feature-first + Riverpod + go_router,
respetando el estilo de las Fases A-D.

## Estructura del ZIP

Cópialo tal cual sobre `C:\Users\Usuario\Downloads\flotadsp_work\mobile\`
(mantiene la misma estructura de carpetas, sobrescribe los archivos ya existentes).

```
lib/core/providers.dart                                 ← modificado (+authHeadersProvider)
lib/core/router/app_router.dart                         ← modificado (ruta /inspection/:id)
lib/core/util/url.dart                                  ← NUEVO
lib/core/widgets/authed_image.dart                      ← NUEVO
lib/features/inspections/domain/inspection_detail.dart  ← NUEVO
lib/features/inspections/data/inspection_repository.dart← modificado (byId, annotatedPhotoUrls)
lib/features/inspections/presentation/inspection_providers.dart      ← modificado
lib/features/inspections/presentation/inspection_detail_screen.dart  ← NUEVO
lib/features/fleet/presentation/vehicle_detail_screen.dart           ← modificado (_InspectionTile navegable)
test/inspection_detail_test.dart                        ← NUEVO
```

## Qué añade

- **Nueva pantalla** `InspectionDetailScreen` accesible con `context.push('/inspection/:id')`
  desde la tarjeta de inspección en la ficha del vehículo (chevron incluido).
- **Cabecera**: fecha con hora, conductor, matrícula, centro, contadores de fotos y
  daños, badge de severidad y estado revisada / pendiente.
- **Galería de fotos**: `PageView` con dots indicador, contador `n / total`, badge
  con la posición de la foto y botón de zoom. Tap → visor a pantalla completa con
  `InteractiveViewer` (pinch-to-zoom, min 1x max 5x) y `PageView` para deslizar.
  Transición Hero desde la miniatura.
- **Toggle "Anotadas"**: si el endpoint `/inspections/:id/annotated` devuelve URLs,
  aparece un `Switch` para alternar entre originales y anotadas. Si no hay
  anotaciones o el endpoint falla, el toggle se oculta silenciosamente.
- **Lista de daños**: card por daño con color de severidad (misma paleta que
  `SeverityStyle`), etiqueta, posición, % de confianza si viene del análisis,
  marca "Preexistente" si `is_new = false`, y notas.
- **Estados**: skeleton loading (Shimmer), ErrorView con reintento, pull-to-refresh
  que invalida detail + annotated a la vez.
- **Fotos autenticadas**: `AuthedImage` inyecta el token Bearer del usuario en la
  cabecera HTTP; si el backend sirve las fotos abiertamente el header simplemente
  se ignora. Placeholder mientras carga y `broken_image` en fallo.

## Endpoints consumidos

- `GET /inspections/{id}` — detalle completo. Parser tolerante:
  - `photos` puede ser lista de strings o de objetos `{url, label, ...}`.
  - `analysis.new_damages` (preferido) o `analysis.damages` o `damages` a nivel raíz.
  - Campos de daño acepta `label|type|name|damage_type`, `position|location|zone|part`,
    `confidence|score|probability`, `is_new` opcional.
- `GET /inspections/{id}/annotated` — lista opcional de URLs anotadas. Devuelve
  lista vacía si el endpoint no existe (no crashea).

Si tu backend usa nombres distintos, la mayoría ya están cubiertos por los alias
del parser. Si no, pásame el JSON real de un `/inspections/{id}` y adapto en
minutos.

## Validación esperada

En Windows, dentro de `mobile\`:

```powershell
flutter pub get
flutter analyze     # DEBE dar 0 issues
flutter test        # 3 files, 5 previos + 5 nuevos = 10 verdes
flutter build apk --release
copy build\app\outputs\flutter-apk\app-release.apk C:\Users\Usuario\Downloads\FlotaDSP-admin.apk
```

## Commit sugerido

```
feat(mobile): fase E - detalle de inspección con fotos y daños

- Nueva pantalla InspectionDetailScreen con galería (PageView + zoom fullscreen)
- Toggle Original/Anotada usando /inspections/:id/annotated
- Lista de daños con severidad y confianza
- AuthedImage: Image.network con Bearer token cacheado (authHeadersProvider)
- resolveImageUrl para URLs relativas del backend
- Ruta /inspection/:id + navegación desde _InspectionTile con context.push
- 5 tests nuevos: parser (3) + widget (2)
```

## Gotchas / notas

1. **Switch sin `activeThumbColor`**: dejamos el color por defecto del tema
   (que ya usa `AppTheme.brand` como primary), evitando cualquier problema de
   compatibilidad entre versiones de Flutter.
2. **`context.push`** (no `go`) para que la ficha del vehículo quede en la pila
   y el usuario pueda volver atrás con el gesto o la flecha del AppBar.
3. **`Hero` tag** incluye el índice y la URL para evitar colisiones cuando
   varias fotos comparten host.
4. **Sin dependencias nuevas** en `pubspec.yaml`: todo se construye con lo que
   ya tenías (dio, riverpod, go_router, flutter_secure_storage).
