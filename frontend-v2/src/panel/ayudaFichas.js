/* LA AYUDA DE CADA PANTALLA, EN UN SOLO SITIO
   (Se llama `ayudaFichas` y no `ayuda` a proposito: `Ayuda.jsx` es el
   componente, y dos ficheros que solo se diferencian en la mayuscula
   conviven mal — Windows no los distingue y el import se resolvia al que no
   era, con un error de build que no señala la causa.)
   ═══════════════════════════════════════════════════════════════════════
   Por qué existe: hay 30 pantallas y se siguen añadiendo. Quien entra nuevo
   —o quien lleva meses y se encuentra un módulo que no estaba— no tiene
   forma de saber para qué sirve cada cosa ni por dónde empezar.

   TRES REGLAS AL ESCRIBIR ESTO
   ────────────────────────────
   1. `que` se lee en dos segundos y dice PARA QUÉ, no qué es. "Ver
      vehículos" no vale; "saber si una furgoneta puede salir mañana" sí.
   2. `pasos` es lo que hace una persona un martes, en orden. No es una
      lista de funciones: es el camino corto.
   3. `ojo` es lo que confunde de verdad, y solo se pone si existe. Un
      campo vacío es mejor que una advertencia inventada: si cada pantalla
      tiene un aviso, se dejan de leer todos.

   Y una cuarta que es la que hace que esto no se pudra: `scripts/check-ayuda.mjs`
   falla en CI si una entrada del menú no tiene ficha aquí. Sin ese cerrojo,
   dentro de tres meses la mitad de las pantallas no tendrían ayuda — que es
   exactamente lo que ya pasó dos veces con los permisos (gotcha 27).

   IDIOMA: castellano, a propósito. El panel tiene seis idiomas y 1.805
   claves, pero traducir 30 fichas a seis idiomas es trabajo que se queda a
   medias y envejece mal. Cuando haya un cliente que lo necesite, la forma
   del fichero admite el cambio sin tocar los componentes.

   `estado` es opcional y solo se pone cuando es verdad: sirve para avisar
   de que una pantalla está construida pero hoy no se usa, y así quien entra
   no pierde media hora intentando entenderla.                             */

export const AYUDA = {
  // ── Hoy ────────────────────────────────────────────────────────────────
  dashboard: {
    que: 'La foto del día: qué se ha entregado, qué está parado y qué necesita a alguien.',
    pasos: [
      'Míralo al llegar por la mañana, antes de abrir nada más.',
      'Lo que salga en rojo o ámbar tiene una pantalla detrás: pulsa y te lleva.',
    ],
  },
  'mi-dia': {
    que: 'Lo tuyo, no lo de todos: lo que tienes asignado y lo que te falta hacer hoy.',
    pasos: ['Repásalo antes de salir de la oficina: lo que quede aquí, queda sin hacer.'],
  },
  actividad: {
    que: 'Quién ha tocado qué y cuándo. Sirve para reconstruir por qué algo cambió.',
    pasos: ['Filtra por persona o por fecha cuando alguien pregunte "¿quién ha hecho esto?".'],
  },

  // ── Operación diaria ───────────────────────────────────────────────────
  paquetes: {
    que: 'Los paquetes de Cortex, investigables uno a uno: dónde está cada uno y qué le pasó.',
    pasos: [
      'La primera vez: descarga la extensión desde esta pantalla, descomprímela y cárgala en Chrome desde chrome://extensions con el «Modo de desarrollador» activado.',
      'Pega en ella el token que sale aquí abajo. Es el de tu empresa y solo el tuyo: con el de otra, los datos se mezclarían.',
      'Luego entra en Cortex como siempre. Los datos llegan en unos minutos, sin hacer nada más.',
      'Busca por TBA cuando alguien reclame un paquete concreto.',
    ],
    ojo: 'La carpeta que descomprimes NO se puede borrar ni mover: Chrome carga la extensión desde ahí. Y solo se ve lo que la extensión haya capturado — si nadie tuvo Cortex abierto, de esas horas no hay nada.',
  },
  debrief: {
    que: 'Qué trae cada conductor de vuelta en la furgoneta, para comprobarlo con él delante.',
    pasos: [
      'Abre el conductor que llega y mira las cuatro listas de arriba.',
      'Marca "Lo trae" según te lo va dando. Lo que quede sin marcar es lo que se pierde.',
      'Al final, el resumen dice si has recogido todo o falta algo.',
    ],
    ojo: 'Lo que pone "sigue en la furgoneta" NO es un problema si el día no ha terminado: es reparto normal. Los cuatro cajones de arriba sí valen ya.',
  },
  asignacion: {
    que: 'Qué furgoneta lleva cada conductor hoy.',
    pasos: [
      'Asigna antes de que salgan las rutas.',
      'Una furgoneta en el taller no debería asignarse: mira Órdenes de taller si dudas.',
    ],
  },
  turnos: {
    que: 'El cuadrante: quién trabaja qué día, con los códigos y las horas.',
    pasos: [
      'Elige el rango de fechas arriba y pinta con el pincel de código.',
      'Los días aprobados salen en rosa y no se pueden mover sin el permiso correspondiente.',
      'Descarga a Excel cuando lo tengas cerrado.',
    ],
    ojo: 'Las preguntas del mes ("¿está esta persona en el cuadrante?") se contestan con el mes entero, no con lo que ves en pantalla.',
  },
  'checklist-operativo': {
    que: 'La lista de comprobación del turno, para que no se olvide nada al abrir o cerrar.',
    pasos: ['Ábrela al empezar el turno y ve marcando. Queda registrado quién y cuándo.'],
  },
  plantilla: {
    que: 'Genera la plantilla de personal a partir del cuadrante.',
    pasos: ['Elige la semana y descarga. Sale de lo que haya en Turnos, así que cierra el cuadrante antes.'],
  },
  chat: {
    que: 'Mensajes internos entre la oficina y el equipo.',
    pasos: ['Escribe y se envía. Los avisos importantes van por Telegram, no por aquí.'],
    estado: 'Poco usada: 8 mensajes en total y el último hace más de un mes.',
  },

  // ── Flota ──────────────────────────────────────────────────────────────
  vehiculos: {
    que: 'La ficha de cada furgoneta: estado, papeles, daños y su gemelo en 3D.',
    pasos: [
      'Busca por matrícula.',
      'La pestaña Documentación tiene seguro, ITV y contrato de renting.',
      'El visor 3D pinta los daños abiertos sobre la carrocería.',
    ],
    ojo: 'Las furgonetas de baja no salen en los listados. Están en su propia pestaña, y no cuentan en ningún contador.',
  },
  revision: {
    que: 'Validar lo que la IA ve en las fotos, para que aprenda. Es lo único que la hace mejorar.',
    pasos: [
      'Pulsa "Revisar en 5 segundos" y contesta con uno de los cuatro botones.',
      '"Sí, pero no ahí" es para cuando el daño existe y el recuadro está mal puesto.',
      '"No se ve" cuando la foto no permite juzgarlo. No es un fallo de la IA.',
    ],
    ojo: 'El recuadro se equivoca de sitio a menudo. Mira la furgoneta entera antes de contestar: hubo un retrovisor izquierdo marcado en la trasera.',
  },
  inspecciones: {
    que: 'Las inspecciones con foto que hacen los conductores al coger y dejar la furgoneta.',
    pasos: [
      'Filtra por fecha o furgoneta.',
      'Abre una para ver las fotos y lo que detectó la IA.',
    ],
  },
  incidencias: {
    que: 'Partes de golpes, averías y sucesos, con sus fotos.',
    pasos: [
      'Crea la incidencia con foto en cuanto pase algo.',
      'Desde ella se puede abrir una orden de taller sin volver a escribirlo todo.',
    ],
  },
  talleres: {
    que: 'La agenda de talleres: quién arregla qué, dónde y con qué teléfono.',
    pasos: [
      'Añade el teléfono de cada uno. Sin él no se les puede escribir ni por WhatsApp ni desde el parte, y hay que salir de la app para llamar.',
      'Si tienes su correo, ponlo también: es el único canal que funciona cuando WhatsApp falla.',
    ],
    ojo: 'Un taller sin teléfono ni correo no recibe nada. Al preparar un parte se proponen primero los que sí se pueden avisar.',
  },
  ordenes: {
    que: 'Mandar una furgoneta al taller y seguirla sin llamar por teléfono.',
    pasos: [
      'En «Furgonetas paradas», pulsa el «sin parte» rojo: el parte se abre con sus daños, sus fotos y el taller sugerido ya puestos.',
      'Manda el enlace al taller por WhatsApp desde el propio parte. Entra sin registrarse y desde el móvil.',
      'A partir de ahí la app pregunta sola cada pocos días. En «Canal con el taller» eliges cada cuánto, qué días y qué se les dice.',
      'Lo que ellos contesten aparece en «Lo que dicen los talleres», aunque no les hayamos preguntado.',
    ],
    ojo: 'El enlace es público: quien lo tenga entra. No lleva datos del conductor, solo la furgoneta y el problema. Y pon la fecha de salida cuando el taller la diga: sin ella no se puede prever con qué flota cuentas la semana que viene.',
  },
  aparcamiento: {
    que: 'Dónde está aparcada cada furgoneta en la nave.',
    pasos: ['Marca la plaza al aparcar para que el siguiente turno la encuentre.'],
    estado: 'Poco usada: 11 registros y el último hace más de un mes.',
  },
  vencimientos: {
    que: 'Qué caduca y cuándo: ITV, seguro, permisos. Para que no te pille ninguno.',
    pasos: [
      'El calendario enseña el mes; la lista, lo que vence antes.',
      'Lo que esté en rojo ya ha caducado.',
    ],
  },
  'avisos-itv': {
    que: 'Los avisos de ITV que se han mandado y a quién.',
    pasos: ['Comprueba aquí si un aviso llegó antes de volver a mandarlo.'],
  },
  importaciones: {
    que: 'Subir ficheros: furgonetas, conductores y datos que vienen de fuera.',
    pasos: ['Elige el tipo, arrastra el fichero y revisa la vista previa antes de confirmar.'],
    ojo: 'Importar dos veces el mismo fichero puede crear fichas duplicadas. Comprueba la vista previa.',
  },
  renting: {
    que: 'Los contratos de renting de las furgonetas.',
    pasos: ['Consulta aquí de quién es una furgoneta y hasta cuándo.'],
  },
  'casas-alquiler': {
    que: 'Las empresas a las que alquilas furgonetas de refuerzo.',
    pasos: ['Guarda contacto y condiciones para no buscarlos cuando haga falta una furgoneta ya.'],
    estado: 'Poco usada: última anotación hace casi dos meses.',
  },

  // ── Equipo ─────────────────────────────────────────────────────────────
  conductores: {
    que: 'La ficha de cada persona: contacto, centro, Transporter ID e historial.',
    pasos: [
      'Si empiezas: pulsa «Importar Excel» y sube la hoja que ya tengas. No hace falta ningún formato nuestro — vale con que haya una columna de nombre.',
      'Antes de guardar se enseña lo que se ha entendido: compruébalo ahí, no después.',
      'El Transporter ID es la llave con la que se reparten los DNR: si está mal, los fallos van a otra persona.',
      'Para entrar al portal no hay que hacer nada más: el conductor escribe su correo y ya está. '
        + 'Si prefieres que además haga falta contraseña, se la pones desde el aviso de arriba — pero entonces '
        + 'con el correo solo ya no les vale, así que hay que repartirlas el mismo día.',
    ],
    ojo: 'Importar da de alta lo que falta y nunca pisa una ficha que ya existe. Si alguien aparece con el historial corto, comprueba si tiene otra ficha con el mismo correo.',
  },
  scorecard: {
    que: 'El scorecard semanal de Amazon: en qué tier estás y qué métrica te baja.',
    pasos: [
      'Sube el PDF que manda Amazon cada miércoles.',
      'La app saca las métricas y las compara con los umbrales de Fantastic.',
      'Lo que salga en rojo es lo que hay que atacar esa semana.',
    ],
    ojo: 'Sin subir el PDF no hay scorecard: la app no lo puede descargar sola.',
  },
  diarios: {
    que: 'Los Daily Report de Cortex: DNR, devoluciones, POD y cumplimiento de llamada.',
    pasos: [
      'Arrastra los .html tal cual se bajan de Cortex, hasta 120 de golpe.',
      'La app los cruza con el historial y los reparte por conductor.',
    ],
    ojo: 'El bloque de DNR de un reporte es de DOS DÍAS ANTES, y la columna DSC se rellena tarde. Por eso conviene volver a subir un reporte viejo pasados unos días.',
  },
  whc: {
    que: 'Horas trabajadas y quién se ha pasado, antes de que lo diga Amazon.',
    pasos: [
      'Pega el cuadrante de la semana tal cual y pulsa analizar.',
      'Mira quién va justo de horas y avísale antes del viernes, que es cuando ya no se puede arreglar.',
    ],
    ojo: 'El límite son 54 h 30 min semanales y no se puede cambiar: lo fija Amazon, no cada nave. Si cada empresa pusiera el suyo, dos DSP con la misma plantilla saldrían con resultados distintos y el dato dejaría de servir para comparar.',
  },
  dsc: {
    que: 'Dónde se deja cada paquete. Es la métrica que más le cuesta a un DSP.',
    pasos: [
      'Revisa las direcciones que salen marcadas y corrige el punto si sabes cuál es.',
      'Una dirección corregida deja de fallar para siempre.',
    ],
    ojo: 'En 17 scorecards reales de OGA5, DSC salió como área de foco en 14 y fue la número 1 en 12. Es la pantalla con más recorrido de todas.',
  },
  contactos: {
    que: 'La agenda: talleres, proveedores, Amazon y quien haga falta.',
    pasos: ['Busca por nombre o por lo que hace.'],
  },

  // ── Sistema ────────────────────────────────────────────────────────────
  'origen-danos': {
    que: 'De cada golpe, la última foto en la que la furgoneta estaba limpia.',
    pasos: [
      'Dice quién la LLEVABA, no quién dio el golpe: pudo ser un tercero en un parking.',
      'Mira siempre las dos fotos antes de hablar con nadie.',
      'Solo se señala a una persona con un día de ventana y un único conductor.',
    ],
  },
  'ia-peritaje': {
    que: 'Peritaje técnico de daños con IA, para valorar un golpe.',
    pasos: ['Sube las fotos del daño y la IA propone una valoración.'],
    estado: 'Poco usada: 4 peritajes y el último hace tres meses.',
  },
  configuracion: {
    que: 'Ajustes de la cuenta, centros, avisos y quién recibe qué.',
    pasos: ['Los avisos de Telegram y los destinatarios se configuran aquí.'],
  },
  admin: {
    que: 'El negocio: cuentas, planes, cobros y la salud de la infraestructura.',
    pasos: [
      'La tarjeta de Salud avisa si la base de datos o el almacenamiento van justos.',
      'Aquí se ven las altas, los pagos y las reservas de la oferta fundador.',
    ],
    ojo: 'Solo la ve el super-admin. Es la pantalla de la empresa, no la de la operación diaria.',
  },
  bandeja: {
    que: 'Los mensajes que llegan del formulario de la web, sin que se pierda ninguno.',
    pasos: [
      'Cada envío del formulario entra aquí como un mensaje.',
      'Contesta desde tu correo: esta pantalla es para leer y no perderlos, no para responder.',
    ],
    ojo: 'Solo la ve el super-admin, y no avisa sola: hay que entrar. Los avisos van por Telegram.',
  },
  usuarios: {
    que: 'Quién entra a la app y qué puede ver cada uno.',
    pasos: [
      'Marca las casillas de los módulos que quieres que vea.',
      'El cambio se nota en su pantalla en menos de dos minutos, sin que tenga que volver a entrar.',
    ],
    ojo: 'Si alguien dice que "no le sale" una pantalla, es casi siempre una casilla sin marcar. No es caché.',
  },
}

/* LOS PRIMEROS PASOS.
   No es un tour de doce ventanas —esos se cierran sin leer—: son las cuatro
   pantallas que se usan de verdad todos los días, en el orden del día. Se
   filtran por lo que la persona puede ver, así que quien no tenga taller no
   ve el paso del taller y no se queda con la duda. */
export const PRIMEROS_PASOS = [
  { clave: 'dashboard', cuando: 'Al llegar', texto: 'Mira qué está parado o necesita a alguien.' },
  { clave: 'asignacion', cuando: 'Antes de las rutas', texto: 'Comprueba que cada conductor tiene furgoneta.' },
  { clave: 'debrief', cuando: 'Cuando vuelven', texto: 'Cuadra lo que trae cada uno antes de que se vaya.' },
  { clave: 'revision', cuando: 'Diez minutos sueltos', texto: 'Valida daños: es lo único que hace mejorar a la IA.' },
]
