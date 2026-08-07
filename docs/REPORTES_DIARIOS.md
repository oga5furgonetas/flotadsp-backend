# Reportes diarios de Cortex — qué traen y cómo se usan

Fecha: 2026-08-08. Complementa a [SCORECARD_AUDITORIA.md](SCORECARD_AUDITORIA.md).

El *Daily Report* que se descarga de Cortex es un HTML con cinco tablas. Es la
única vía para saber cómo va la semana **antes** de que llegue la scorecard del
martes. Este documento recoge lo que está comprobado y las tres trampas que
tiene, que no son evidentes y arruinan el cálculo en silencio.

## El ecosistema

```bash
python scripts/extraer_scorecards.py    # PDFs   -> docs/scorecards.json
```

```bash
python scripts/ingerir_diarios.py       # HTMLs  -> docs/diarios.json
```

```bash
python scripts/scorecard_analisis.py    # tiers, cortes, Overall, backtesting
```

```bash
python scripts/conciliar_diarios.py     # diarios vs scorecard semanal
```

`scripts/scorecard_lib.py` guarda el calendario de Amazon, que usan los dos
últimos.

## Qué hay en cada reporte

| Tabla | Contenido | Sirve para |
|---|---|---|
| resumen | por conductor: RTS, DNR, POD Fails, CC Fails | reparto por conductor |
| RTS | un paquete devuelto por fila, con motivo | **DCR** |
| DNR | una concesión por fila, con columna **`DSC` = Y/N** | **DSC** |
| POD audit | un fallo de foto por fila | POD |
| CC | un fallo de contacto por fila | Contact Compliance |

Las cuatro tablas de detalle cuadran exactamente con los totales de la tabla
resumen (RTS 68=68, DNR 8=8, POD 54=54, CC 14=14 en el reporte del 05/08).

**No hay que inferir qué es DSC: Amazon lo etiqueta.** La columna `DSC` es el
"Non DSC" del que se habla en operaciones — cuando vale `N`, la concesión no se
imputa a la DSP.

## Trampa 1 — el reporte va 2 días por detrás

El reporte de la fecha F contiene el bloque DNR de **F−2**. Verificado en
**131 de 131** reportes, sin una sola excepción. Las otras tablas no llevan
fecha propia.

## Trampa 2 — la columna DSC se rellena DESPUÉS

Si se descarga el reporte el día que sale, la columna `DSC` puede venir entera
a `N` y el conteo da cero. Al volver a descargar **el mismo día de reporte**
unos días más tarde, vuelven **las mismas filas** con sus `Y` puestas.

Demostrado con los días que están descargados dos veces:

| Reporte | Descarga temprana | Descarga posterior |
|---|---|---|
| 2026-06-21 | 2 filas, **0** con DSC=Y | las mismas 2, **2** con DSC=Y |
| 2026-07-12 | 10 filas, **0** con DSC=Y | las mismas 10, **7** con DSC=Y |
| 2026-07-15 | 5 filas, **0** con DSC=Y | las mismas 5, **4** con DSC=Y |

Los tracking IDs son idénticos entre las dos descargas: no es que aparezcan
paquetes nuevos, es que **Amazon reescribe el mismo reporte**. Un tracking ID
nunca se repite entre días distintos (0 repetidos en 587 concesiones), así que
sumar días distintos es seguro; lo que no se puede es acumular descargas del
mismo día. `ingerir_diarios.py` indexa por tracking ID y se queda con la
versión más informativa.

Los tres casos son reales, no un fallo de parseo: los ficheros tienen md5
distinto y el HTML crudo contiene literalmente más `>Y<` en la copia tardía
(4→6, 34→41 y 76→80 apariciones).

### Pero la ventana se cierra — corrección del 2026-08-08

Se volvieron a descargar 6 reportes viejos que estaban enteros a `N`
(2026-06-09, 06-17, 07-29, 07-30, 08-01 y 08-02). **Ninguno cambió.** Cuatro de
ellos son **byte a byte idénticos** al fichero de hace hasta dos meses; el del
02/08 sí tiene md5 distinto, pero su columna DSC sigue entera a `N`.

Los tres flips que sí ocurrieron fueron todos con **1-2 días** entre descargas,
recién publicado el reporte. Los que se dejaron pasar no se recuperan.

**Consecuencia práctica, corregida:**

- **Sirve hacia delante:** descargar el reporte el día que sale (RTS, POD y CC
  vienen completos) y **otra vez 1-3 días después**, para pillar la columna DSC
  ya clasificada.
- **No sirve hacia atrás:** un día que quedó entero a `N` está perdido. No se
  recupera re-descargándolo.

Por eso los días sin clasificar del histórico son un agujero permanente, no algo
que se pueda arreglar bajando ficheros.

Aviso honesto: hay días con 0 defectos que son 0 de verdad — la semana 24 tenía
un día marcado como dudoso y aun así cuadró exacta. El flag
`dsc_sin_clasificar` marca de más a propósito.

## Trampa 3 — la semana va de domingo a sábado

Y el número de semana no se supone: se **derivó** del informe *Inactive DA
off-boarding* de la semana 30, donde las 7 filas dan la misma fecha de
referencia al sumar `Last Route Date` + `Days Inactive`: **2026-07-26**, domingo.

> **Semana 31 de 2026 = domingo 26/07 a sábado 01/08.**
> Semana 1 de 2026 = domingo 28/12/2025.

Efecto secundario que hay que tener presente: **el reporte del lunes, aunque ya
es de la semana nueva, trae DNR del sábado, que es de la semana anterior.** Para
cubrir la semana W hacen falta los reportes del **martes de W al lunes de W+1**.

## La regla del DSC semanal

```
defectos DSC de la semana W = filas DNR con DSC='Y' cuya fecha de concesión
                              (= fecha del reporte − 2) cae en la semana W
DSC DPMO = defectos × 1.000.000 / paquetes entregados
```

Resultado sobre las 4 semanas de OGA5 con los 7 días descargados:

| Semana | Días dudosos | Diarios | Scorecard | Diferencia |
|---|---|---|---|---|
| 23 | **0** | 28 | 28 | **0** |
| 24 | 1 | 21 | 21 | **0** |
| 25 | 1 | 20 | 25 | −5 |
| 31 | 4 | 11 | 29 | −18 |

Se asigna por **fecha de concesión**, no de entrega: la regla alternativa falla
en las 4 (0 exactas, error medio 9 defectos). Y el error nunca es positivo —
solo se pierden defectos, nunca sobran, que es justo lo que se espera si faltan
clasificaciones.

**Estado: prometedor, no demostrado.** Dos semanas exactas de dos limpias está
bien, pero dos no es una demostración. Para cerrarlo hay que volver a descargar
reportes viejos y conseguir más semanas sin días dudosos.

## Lo que falta

1. **La regla `DSC = Y/N` por fila.** Hay 552 filas limpias (307 Y, 245 N). El
   tipo de scan no basta:

   | Delivery Scan | N | Y | % Y |
   |---|---|---|---|
   | HOUSEHOLD_MEMBER | 46 | 166 | 78 % |
   | DOORSTEP | 113 | 74 | 40 % |
   | RECEPTIONIST | 5 | 34 | 87 % |
   | MAIL_SLOT | 34 | 4 | 11 % |
   | SAFE_LOCATION | 16 | 12 | 43 % |
   | GARDEN | 18 | 1 | 5 % |
   | NEIGHBOR | 6 | 10 | 62 % |

   Ninguno es 0 % ni 100 %, así que **el scan por sí solo no decide**: hacen
   falta las otras columnas (≥25 m, PHR, contacto, excepción, buzón…). Ojo:
   el PDF de la scorecard lista "entregado a más de 25 m" como causa de DSC y
   hay filas con ≥25 m = Y marcadas como **N**, así que la documentación
   oficial tampoco es literal.
2. **Codificación de mayo.** 12 reportes de mayo/2026 traen la columna DSC
   como `1` / `-` en vez de `Y` / `N`, y cada fichero usa una sola codificación.
   Lo más probable es `1`=Y y `-`=N, pero no hay ninguna semana de cobertura
   completa en mayo para comprobarlo, así que esas 35 filas se dejan como
   **desconocidas**. No se adivina.
3. **DCR y LoR desde los diarios.** La tabla RTS da los devueltos por día y por
   motivo; falta cruzarla con los cancelados antes de salir (están en Cortex)
   para cerrar el denominador, que hoy queda con un sesgo del +0,25 %.
