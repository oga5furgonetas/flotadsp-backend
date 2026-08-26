# De dónde salen estos datos

`nomenclator_gal.json` es un índice derivado de **dos fuentes públicas**. Las dos
piden atribución o son de dominio público, y las dos se pueden volver a bajar y
regenerar: no hay nada aquí escrito a mano.

## 1. Nomenclátor de Galicia — Xunta de Galicia

Toponimia oficial de provincias, concellos, parroquias y **lugares**. Es la capa
que ningún geocodificador general tiene, y la que hace falta aquí: las
direcciones que fallan en Galicia no son calles con portal, son lugares
(`LUGAR BOA VISTA`, `ALDEA GRANDE`, `A VESADA-SERRES`).

- Edición aprobada el **30 de marzo de 2026**, 42.212 topónimos.
- Licencia **CC BY-SA 4.0** — atribución y compartir-igual.
- Ficha: <https://datos.gob.es/en/catalogo/a12002994-nomenclator-de-galicia>
- Descarga directa (CSV, 3,6 MB):
  <https://abertos.xunta.gal/catalogo/territorio-vivienda-transporte/-/dataset/0270/nomenclator-galicia/001/descarga-directa-ficheiro.csv>

**No trae coordenadas.** Se comprobó abriendo el fichero antes de construir nada
encima. Sirve para saber *en qué concello* buscar, no para dar el punto.

Trae los nombres de 2003 **y** los de 2025 en columnas separadas: de ahí salen
los 1.895 sinónimos viejo→nuevo, que es lo que permite encontrar una dirección
escrita con el nombre antiguo.

## 2. Códigos postales ⇄ municipios — INE

- Generado de los datos abiertos del INE, actualizado automáticamente.
- <https://github.com/regi-es/ds-codigos-postales-ine-es>
- Fichero: `data/codigos_postales_municipios.csv`

De aquí salen los 1.498 códigos postales gallegos. **101 de ellos se reparten
entre dos o más concellos**, así que el CP acota pero no siempre decide: por eso
`geo_nomenclator.situar()` devuelve `concello: None` cuando quedan varios en pie
en vez de elegir uno.

## Cómo regenerar el índice

Bajar los dos ficheros y volver a construir el JSON. El índice resultante son
1,9 MB con:

```
17.521 lugares · 3.101 parroquias · 313 concellos
1.895 sinónimos 2003→2025 · 1.498 códigos postales
```

Merece la pena rehacerlo cuando la Xunta publique una edición nueva del
Nomenclátor: la de 2026 cambió **2.531 denominaciones** de una tirada, y una
dirección escrita con el nombre viejo deja de encontrarse si no está el sinónimo.
