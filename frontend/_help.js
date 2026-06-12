const fs = require('fs');
let h = fs.readFileSync('index.html', 'utf8');
const anchor = '  <!-- FlotaDSP — Ficha del conductor: ver + editar + foto (con tema adaptativo) -->';
if (!h.includes(anchor)) { console.log('FAIL anchor'); process.exit(1); }

const block = `  <!-- FlotaDSP — Ayuda contextual por sección (botón ?) -->
  <script>
  (function(){
    var HELP = {
      '/': ['Dashboard', 'Tu vista general del día.\\n\\n• El panel "Tu atención hoy" te dice qué necesita acción AHORA: furgonetas sin inspeccionar, inspecciones por revisar, incidentes abiertos y análisis fallidos. Cada tarjeta es un botón que te lleva directo.\\n• "Daños este mes" suma en € los daños NUEVOS detectados por la IA, comparado con el mes anterior.\\n• Abajo: actividad de la semana, severidad de las inspecciones y las últimas recibidas.'],
      '/cuadrante': ['Cuadrante diario', 'Aquí asignas cada furgoneta a su conductor del día.\\n\\n• "📋 Copiar ayer" trae las asignaciones del día anterior — revisa y guarda.\\n• "Importar texto": copia la tabla del roster de Amazon TAL CUAL y pégala — la IA entiende cualquier formato y empareja matrículas y nombres automáticamente.\\n• La columna ✅/⏳ indica si esa furgoneta ya tiene inspección hoy.\\n• El conductor asignado verá SU furgoneta destacada al entrar al portal.\\n• ¡Guarda siempre al terminar!'],
      '/revision': ['Revisión rápida', 'Revisa las inspecciones pendientes una a una, como pasar páginas.\\n\\n• Foto grande + miniaturas para cambiar de ángulo.\\n• Panel rojo "DAÑO NUEVO": daños que NO estaban en la inspección anterior. Toca uno y la foto salta a la zona exacta con una chincheta 📍.\\n• "🧽 Sucia X/10": la IA fue prudente porque la furgoneta estaba sucia.\\n• ⛔ Matrícula no coincide = posible furgoneta equivocada.\\n• "✓ Revisada" la archiva y pasa a la siguiente. "Saltar" la deja para luego.'],
      '/inspecciones': ['Inspecciones', 'Las inspecciones de los últimos 7 días.\\n\\n• Clic en cualquiera para ver fotos, daños con coordenadas, análisis IA y PDF.\\n• "📚 Ver histórico completo" muestra todas las antiguas (nada se borra nunca).\\n• Si una quedó SIN ANÁLISIS, dentro tendrás el botón "🤖 Reanalizar IA".\\n• En la pestaña Daños, los marcados "⚠️ dudoso" tienen confianza baja de la IA — verifícalos en las fotos.'],
      '/vehiculos': ['Vehículos', 'Toda tu flota.\\n\\n• Clic en una furgoneta → su ficha completa (km, mantenimientos, documentos, histórico).\\n• El lápiz ✏️ (arriba a la derecha de cada tarjeta) edita matrícula, marca, centro, etc.\\n• En la ficha puedes registrar cambio de aceite, ruedas y pastillas — la app te avisará por Telegram cuando toque el siguiente por km.\\n• Documentos: sube ITV, seguro, ficha técnica… queda todo guardado por furgoneta.\\n• Al marcar una furgoneta "En taller" se crea su incidencia automáticamente.'],
      '/conductores': ['Conductores', 'Tu plantilla.\\n\\n• Clic en un conductor → ficha completa: edita sus datos, súbele foto (aparecerá en el cuadrante y en su portal) y guarda. Todo en un solo panel.\\n• El campo Login y Driver ID son los de Amazon.\\n• La papelera desactiva al conductor (no borra su histórico).'],
      '/scoring': ['Scoring de Conductores', 'Ranking mensual automático (solo lo ves tú).\\n\\nCinco pilares (100 pts):\\n📋 Cumplimiento (30): inspecciones hechas vs días asignados\\n⏰ Puntualidad (15): subida antes de las 20:45\\n📸 Evidencia (15): fotos completas y nítidas\\n🔍 Honestidad (15): si hay daños, ¿los declaró?\\n🛡️ Conservación (25): se resta si aparecen daños NUEVOS en sus turnos\\n\\n• Mínimo 3 inspecciones en el mes para puntuar.\\n• Clic en cualquier fila para el desglose completo.\\n• La barra de colores muestra los 5 pilares de un vistazo.'],
      '/incidencias': ['Incidencias', 'Seguimiento de problemas de la flota.\\n\\n• Se crean a mano o automáticamente (cuando marcas una furgoneta "En taller").\\n• "Resolver" la cierra; "↩ Reabrir" la reactiva sin crear otra — el histórico se conserva siempre.'],
      '/alertas': ['Alertas', 'Avisos automáticos del sistema: cambios de aceite/ruedas/pastillas próximos o vencidos, ITV, etc. Márcalas como leídas cuando las gestiones.'],
      '/talleres': ['Talleres', 'Tu red de talleres por centro y especialidad.\\n\\n• Cuando una inspección detecta un daño, la app sugiere talleres SOLO de ese centro, priorizando los del convenio del renting (Kinto→Toyota oficial, etc.).\\n• Teléfono con un toque y enlace a Maps.'],
      '/avisos-itv': ['Avisos ITV', 'Furgonetas con la ITV próxima a caducar (30 días) o ya caducada. Actualiza la fecha en la ficha del vehículo cuando pases la inspección.'],
      '/renting': ['Renting', 'Contratos de renting por furgoneta: proveedor, fechas y condiciones. Úsalo para controlar vencimientos y devoluciones.'],
      '/ia-peritaje': ['IA Peritaje', 'Peritaje manual: sube fotos de cualquier vehículo y la IA analiza daños al momento, sin necesidad de que sea una inspección de conductor. Útil para tasaciones puntuales o segundas opiniones.'],
      '/importar': ['Importaciones', 'Carga masiva de datos: el Excel de Amazon Fleet (vehículos) o listados de conductores. Sigue el formato indicado en cada sección.'],
      '/configuracion': ['Configuración', '• Cambia TU contraseña (necesitas la actual).\\n• Accesos a Telegram Bot (canal de avisos) y Centros.\\n• Exporta todos los datos en JSON como copia manual.\\n• Los backups automáticos de la base de datos se hacen solos cada noche a las 04:00.'],
      '/portal-conductor': ['Portal del Conductor', '1. Entra con tu email.\\n2. Tu furgoneta del día aparece destacada — tócala.\\n3. Haz las 4 fotos (frontal, trasera, laterales). La IA comprueba cada una: si está borrosa o es la zona equivocada, te pedirá repetirla.\\n4. Marca el checklist. Puedes añadir foto a cualquier punto.\\n5. Revisa el resumen y envía. ¡Listo en 3 minutos!']
    };

    function currentHelp(){
      var p = location.pathname;
      if (HELP[p]) return HELP[p];
      // rutas con id: /vehiculos/xxx, /inspecciones/xxx
      var base = '/' + (p.split('/')[1]||'');
      return HELP[base] || null;
    }

    function isLightTheme(){ return document.body.classList.contains('mery-theme'); }

    var btn = document.createElement('button');
    btn.id = 'fdsp-help-btn';
    btn.textContent = '?';
    btn.title = 'Cómo funciona esta sección';
    btn.style.cssText = 'position:fixed;bottom:14px;left:50%;transform:translateX(-50%);width:34px;height:34px;border-radius:50%;border:1px solid rgba(150,150,170,.35);background:rgba(20,22,30,.85);color:#9aa3b5;font-size:16px;font-weight:800;cursor:pointer;z-index:9000;backdrop-filter:blur(8px);box-shadow:0 4px 14px rgba(0,0,0,.35);transition:transform .15s';
    btn.addEventListener('mouseenter', function(){ btn.style.transform='translateX(-50%) scale(1.15)'; });
    btn.addEventListener('mouseleave', function(){ btn.style.transform='translateX(-50%)'; });

    btn.addEventListener('click', function(){
      var info = currentHelp();
      if (!info) return;
      var old = document.getElementById('fdsp-help-modal');
      if (old) { old.remove(); return; }
      var light = isLightTheme();
      var ov = document.createElement('div');
      ov.id = 'fdsp-help-modal';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(5px);z-index:9500;display:flex;align-items:center;justify-content:center;padding:18px';
      ov.addEventListener('click', function(e){ if (e.target===ov) ov.remove(); });
      var card = document.createElement('div');
      card.style.cssText = 'background:'+(light?'#fdf6fb':'#14161d')+';border:1px solid '+(light?'rgba(200,120,180,.35)':'rgba(255,255,255,.14)')+';border-radius:18px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.5)';
      card.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'+
        '<h3 style="margin:0;font-size:16px;font-weight:800;color:'+(light?'#1a5c8a':'#f4f5f8')+'">💡 '+info[0]+'</h3>'+
        '<button id="fdsp-help-x" style="background:none;border:none;font-size:20px;cursor:pointer;color:'+(light?'#5298c4':'#8892a4')+'">×</button></div>'+
        '<div style="font-size:13.5px;line-height:1.65;color:'+(light?'#2d5f8a':'#c4c9d4')+';white-space:pre-line">'+info[1]+'</div>';
      ov.appendChild(card);
      document.body.appendChild(ov);
      document.getElementById('fdsp-help-x').addEventListener('click', function(){ ov.remove(); });
    });

    function sync(){
      var has = !!currentHelp();
      btn.style.display = has ? 'block' : 'none';
    }
    document.addEventListener('DOMContentLoaded', function(){
      document.body.appendChild(btn);
      sync();
    });
    if (document.readyState !== 'loading') { document.body.appendChild(btn); sync(); }
    var _push = history.pushState;
    history.pushState = function(){ _push.apply(this, arguments); setTimeout(sync, 100); };
    window.addEventListener('popstate', function(){ setTimeout(sync, 100); });
  })();
  <\/script>
` + anchor;
h = h.replace(anchor, block);
fs.writeFileSync('index.html', h, 'utf8');
console.log('OK help system');
