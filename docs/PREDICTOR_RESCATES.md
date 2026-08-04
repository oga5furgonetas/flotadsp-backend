# Predictor de rescates: por qué NO existe

**Fecha:** 2026-08-04 · **Veredicto: no construible con los datos actuales.**

Este documento existe para que nadie —incluido yo dentro de seis meses— vuelva a
gastar un día en esto creyendo que es fácil. Es un resultado negativo, y guardarlo
vale tanto como guardar uno positivo.

## La idea que parecía obvia

`cortex_events` tiene 159.189 documentos con el sello de hora de cada cambio de
estado de cada paquete, y **no los lee nadie**. La mediana de LOADED→DELIVERED
son 341 minutos y el p90 472. Parece evidente: a las 14:00 se debería poder saber
quién no termina a las 20:00, y mandar el rescate barato en vez del caro.

## Lo que se probó

Validación retrospectiva sobre **702 rutas de 25 días**, con exclusión del día
evaluado al entrenar (sin fuga de datos). `cortex_packages.updated_at` es la hora
de entrega real: comprobado contra `cortex_events` sobre 400 paquetes, desviación
mediana **0 segundos**.

| Método | Precisión | Cobertura |
|---|---|---|
| Ritmo lineal desde la primera entrega | 48 – 55 % | 27 – 35 % |
| Curva típica de la jornada (no lineal) | 30 – 39 % | 35 – 45 % |
| Umbral de % de avance a las 14:00 | 4 – 11 % | 10 – 55 % |
| Parón ≥120 min con ≥15 pendientes | 41 % | **70 %** |

## Por qué falla

El dato mata la idea de un plumazo:

> Las rutas que acabaron **muy tarde** iban al **60 %** a las 14:00.
> Las que acabaron **bien** iban al **62 %**.

Son indistinguibles. Lo que hace que una ruta acabe tarde no está en el ritmo de
media mañana: pasa después (tráfico, una zona densa al final, reintentos).

El método lineal además tiene un sesgo sistemático de **−49 min** (predice antes
de lo real) porque el ritmo no es constante: al principio las entregas están
juntas y al final se dispersan.

## Lo que sí dicen los datos

- Acabar tarde **casi no pasa**: p90 de hora de fin = 18:30 UTC, y solo el **4 %**
  de las rutas pasa de las 19:00. El "rescate por acabar tarde" es un problema
  mucho más pequeño de lo que parecía.
- El dolor real es otro: **97 rutas (14 %) terminan con ≥5 paquetes sin entregar**,
  30 (4 %) con ≥20, y una con 114. Eso sí cuesta dinero y sí sale en el DCR.
- El **parón** (minutos sin entregar) caza el 70 % de esas rutas malas. Pero con
  un 41 % de precisión no puede ser una alerta automática: mandaría al gestor a
  rescatar rutas sanas más de la mitad de las veces.

## Qué se hizo en su lugar

Mostrar `min_sin_entregar` y `pendientes` como **dato en la fila de cada ruta**,
no como alerta. Es un hecho medido, no una profecía: el gestor lo ve con la ruta
delante y decide. Cero falsos positivos porque no afirma nada sobre el futuro.

## Qué haría falta para que fuera posible

- Posición GPS de la furgoneta en tiempo real (Cortex no la da; solo da la
  coordenada del paquete).
- Secuencia planificada de paradas, para saber qué queda y dónde.
- La ventana de entrega comprometida por paquete.

Sin al menos lo primero, cualquier "predictor" es un generador de ruido con
gráfico bonito.
