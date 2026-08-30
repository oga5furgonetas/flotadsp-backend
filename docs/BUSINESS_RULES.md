# Reglas de negocio

> Las reglas que deciden cosas están hoy repartidas por el código. Este fichero
> es el **inventario** de las que existen y dónde viven, para poder auditarlas
> sin leerse 31.000 líneas — y el paso previo a centralizarlas.
>
> Una regla que no está escrita aquí y decide algo en producción es deuda:
> nadie puede comprobarla ni discutirla.

---

## Cómo se lee este fichero

| Marca | Significado |
|---|---|
| ✅ | Implementada y con test que la cubre |
| ⚠️ | Implementada, **sin test**: si alguien la cambia, nadie se entera |
| 📄 | Escrita aquí pero **no implementada** todavía |

---

## Vehículo

| Regla | Dónde | |
|---|---|---|
| Una matrícula no puede estar dada de alta dos veces entre las vivas (comparada normalizada) | `create_vehicle` | ⚠️ |
| Una furgoneta `baja` está devuelta: no cuenta en ninguna lista ni contador | `get_vehicles` y todas las consultas | ⚠️ |
| Al crear una orden de taller, la furgoneta pasa a `taller` y se guarda su estado anterior | `crear_orden` | ⚠️ |
| Al cerrar la orden, vuelve a ese estado — **solo si sigue en `taller`** | `editar_orden` | ⚠️ |
| El cuentakilómetros **no baja** | `_odo_validar` | ✅ |
| Tope de 500 km/día para una lectura nueva | `_odo_validar` (`ODO_MAX_KM_DIA`) | ✅ |
| Una lectura que no encaja con la serie se descarta, no se borra | `_odo_sospechosas` | ✅ |
| El km del último cambio de aceite no puede ser posterior al km actual | `vehiculos_rellenar_lote` | ⚠️ |

### Estados de vehículo

```
activo ⇄ taller ⇄ activo        (la orden de taller lo mueve)
activo → baja                   (devuelta al renting; puede volver)
cualquiera → deleted            (borrado lógico; nunca se borra de verdad)
```

**Incoherencia conocida:** hoy hay 13 furgonetas en `taller` **sin orden
abierta**, marcadas a mano. La transición existe pero no obliga a que haya
orden. Ver `docs/DATA_INTEGRITY.md`.

---

## ITV y vencimientos

| Regla | Dónde | |
|---|---|---|
| Sin fecha de ITV **no** es lo mismo que estar en regla: sale como `sin_fecha`, nunca como correcta | `/alerts/itv` | ⚠️ |
| La ventana de aviso es de 60 días, no 30 | `_ITV_AVISO_DIAS` | ⚠️ |
| La siguiente ITV cae el mismo día del mes: al año, o a los **6 meses** si el vehículo pasa de 10 años | `_itv_siguiente` | ⚠️ |
| Una fecha a más de 3 años vista o 5 atrás se rechaza (dedazo en el año) | `vehiculos_rellenar_lote` | ⚠️ |

📄 **No implementada:** una ITV vencida debería **bloquear la asignación** de esa
furgoneta a una ruta. Hoy solo avisa.

---

## Daños

| Regla | Dónde | |
|---|---|---|
| Un daño se atribuye a una persona **solo** con ventana ≤1 día, un único conductor y gravedad por encima de leve | `_atr_certeza` | ⚠️ |
| Sin foto previa sin el golpe, no se atribuye | `danos_atribucion` | ⚠️ |
| Al entregar una orden, sus daños pasan a `repaired`; al anularla, vuelven a `open` | `_ot_cerrar_danos` | ⚠️ |
| `repaired` y `archived` son distintos: archivado significa «no era nada» | `_ot_cerrar_danos` | ⚠️ |

---

## Taller

| Regla | Dónde | |
|---|---|---|
| El taller puede poner 5 estados; `entregado` y `anulada` las pone la oficina | `OT_ESTADOS_TALLER` | ⚠️ |
| Una orden parada 4 días o más sale en «furgonetas paradas» | `OT_DIAS_PARADA` | ⚠️ |
| El recordatorio sale tras 3 días de silencio del taller | `OT_DIAS_TOQUE` | ✅ |
| Una orden en `listo` **no** recibe recordatorio: ahí nos toca movernos a nosotros | `seguimiento_talleres` | ✅ |
| Máximo 4 recordatorios: a partir de ahí es una conversación humana | `OT_TOQUES_MAX` | ✅ |
| Nunca de noche ni en fin de semana | `seguimiento_talleres` | ✅ |

---

## Cortex y entregas

| Regla | Dónde | |
|---|---|---|
| `DELIVERED` es lo único que cuenta como entregado | `_CX_OK` | ✅ |
| En vuelo (`PICKED_UP`, `YOU_ARE_NEXT`…) **no** es un fallo: es una jornada sin terminar | `_CX_EN_VUELO` | ✅ |
| No despachado (`UNCOLLECTED`, `NOT_READY`) no entra en el denominador del DCR | `_CX_NO_DESPACHADO` | ✅ |
| Cualquier otro estado al cierre del día es fallo imputable | por defecto | ✅ |
| Un día con paquetes aún en la calle no se juzga | `scorecard_en_vivo` | ⚠️ |
| Una semana con menos de 300 paquetes no vale como referencia | `scorecard_en_vivo` | ⚠️ |
| El aviso de caída usa la **mediana** de 14 días, no la media | `revisar_dcr_diario` | ⚠️ |
| Hacen falta 1,5 puntos de caída **y** 40 paquetes fallados | `DCR_CAIDA_MIN`, `DCR_FALLOS_MIN` | ⚠️ |

---

## Direcciones

| Regla | Dónde | |
|---|---|---|
| Dos escrituras de la misma dirección son una sola clave; dos portales distintos nunca se juntan | `_dir_clave` | ✅ |
| El orden pesa el **motivo**, no el volumen: «cliente ausente» no se arregla con nada | `_DIR_ACCIONABLE` | ⚠️ |
| Solo se sugiere algo si el motivo domina (≥50%) y hay horas suficientes | `_dir_sugerencia` | ⚠️ |

---

## Conductores

| Regla | Dónde | |
|---|---|---|
| Dos fichas se fusionan **solo** con el mismo correo, nunca por nombre | `drivers_fusionar` | ⚠️ |
| Al emparejar persona con cuadrante, comparar contra el **conjunto** de sus ids | `_fichas_misma_persona` | ⚠️ |

---

## Deuda: reglas sin centralizar

Hoy no existe un motor de reglas. Están repartidas por `server.py` y algunas
duplicadas en el frontend. Consecuencia real ya vivida (gotcha 20): la rejilla
del cuadrante cambió lo que guardaba y `cobertura` siguió comparando el valor
viejo — marcaba 0 con 39 personas trabajando, sin error ninguno.

**Lo que haría falta**, por orden de rentabilidad:

1. Que cada regla tenga **su test**, aunque siga donde está. Es lo más barato y
   lo que más protege: hoy 27 de 38 reglas no tienen ninguno.
2. Sacar a un módulo las que deciden **disponibilidad** de un vehículo (ITV,
   taller, baja, daño crítico), que es donde más duele equivocarse.
3. Solo después, un motor central. Antes sería una abstracción por elegancia.
