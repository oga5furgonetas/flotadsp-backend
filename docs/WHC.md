# WHC — Working Hours Compliance

**Qué se puede afirmar de estos datos y qué no.** Léelo antes de tocar el módulo.

Todo lo de aquí está validado contra la **Semana 31 (26 jul – 1 ago 2026)** de
OGA5, la misma semana del informe de excepciones del scorecard, que marcó
exactamente **2 conductores con "Daily Limit Exceeded"** y **ninguno con
"Weekly Limit Exceeded"**.

---

## 1. El formato del portal, descifrado

```
NOMBRE DEL CONDUCTOR
Estándar
53h 34m / 54h 45m          <- TRABAJADO / PLANIFICADO
10:35am - 9:05pm
Standard Parcel
11 AM                       <- bloque SIN hora de fin (le sigue un tipo de ruta)
Standard Parcel
11 AM                       <- día VACÍO (no le sigue ningún tipo)
...
```

Las tres reglas, deducidas y comprobadas:

| Patrón | Significado |
|---|---|
| `HH:MMam - HH:MMpm` + tipo de ruta | Bloque con horas conocidas |
| hora suelta + tipo de ruta | **Bloque real** cuya hora de fin no se copió |
| hora suelta sin tipo de ruta | Día vacío, no cuenta |

**Cómo se descubrió la segunda regla:** los 5 bloques con hora de Belén Fernández
suman 44h 23m, pero su total trabajado es 53h 34m. Faltaban 9h 11m — justo su
entrada `11 AM + Standard Parcel`. Lo mismo en Pablo Otero: 41h 47m de bloques
con hora, total 51h 1m, diferencia 9h 14m = su bloque `11:30 Standard Parcel`.

**Validación:** de **61 conductores, cuadran 60**. El único que falla (Lara
Naveiro) se desvía **6 minutos**, que es redondeo del propio portal, no error del
modelo. Y los 7 bloques sin hora tienen duración implícita de **8h 59m – 9h 14m
(mediana 8h 59m)**: exactamente una ruta estándar de 9 h. El modelo es correcto.

---

## 2. Lo SEMANAL sí se puede afirmar

El total trabajado lo da el propio portal y el parser lo reconcilia con la suma
de los bloques. Comparar ese total con el límite del ciclo es aritmética, no
estimación.

En la Semana 31, con el límite de 55 h de ciclo 1:

| Conductor | Trabajado | Margen | |
|---|---|---|---|
| XAQUIN RIVADULLA FRANCO | 56h 30m | **−1h 30m** | Pasado |
| Roi Alfonso Tojo | 54h 55m | 0h 05m | Al límite |
| GERARDO PORTO PARDINAS | 54h 54m | 0h 06m | Al límite |

Tres personas al borde y una pasada, en una semana en la que el scorecard no
marcó ninguna excepción semanal. Eso es exactamente el valor del módulo: verlo
**con la semana abierta**, no cuando ya no se puede hacer nada.

---

## 3. Lo DIARIO **no** se puede afirmar — y por eso no se marca

Se probaron todos los umbrales de duración de bloque contra el caso etiquetado
(2 excepciones diarias reales, conocidas):

| Umbral | Conductores marcados | ¿Cuadra con 2? |
|---|---|---|
| > 9,0 h | 142 | No |
| > 10,0 h | 42 | No |
| > 10,5 h | 16 | No |
| > 11,0 h | 5 | No |
| > 11,5 h | 1 | No — y **no es Pablo** |

**El bloque más largo de Pablo Otero** (fallo confirmado, `A22ZR8MKALSDWD`) son
**10h 05m**, y hay **41 bloques más largos** de conductores que no fallaron.

No existe ningún umbral de duración de bloque que reproduzca el resultado real.

**La razón:** el plan da la hora **PLANIFICADA**; Amazon calcula la excepción
diaria sobre lo **FICHADO**. Son dos números distintos y el segundo no está en
esta vista.

Por eso los bloques de 10 h o más se muestran como **riesgo**, nunca como
incumplimiento. Marcarlos como incumplimiento mandaría al gestor a hablar con
42 conductores cuando fallaron 2.

### Qué haría falta para cerrar lo diario

Las horas **fichadas** por día y conductor. Si el portal las exporta, el módulo
las admite sin cambios de arquitectura: el motor ya trabaja por bloques.

---

## 4. Aviso sobre la identidad de los conductores

El informe de excepciones da IDs de Amazon, no nombres:

- `A22ZR8MKALSDWD` → **PABLO OTERO GENDRA** (confirmado contra `drivers`)
- `A2H4XH0AEQTVZY` → **sin ficha**. Se supuso que era Borja Blanco Guzmán, pero
  Borja tiene el `driver_id` vacío, así que **no está confirmado**.

Es uno de los 44 IDs sin emparejar. Se arregla desde la tarjeta de emparejado
del Scorecard.

---

## 5. Límites configurados

```python
_WHC_LIMITES = {"ciclo1": 55h, "ciclo2": 0, "ciclo3": 0}
```

Ciclo 1 (rutas estándar de ~9 h) son 55 h y lo confirma el DSP. **Los demás
están a 0 = sin límite hasta que alguien los confirme.** No se inventa un
número: un límite inventado marca a gente que no ha incumplido nada, y eso
hace que la pantalla se deje de abrir a la semana.

El límite es editable en la pantalla, así que cada DSP pone el suyo.
