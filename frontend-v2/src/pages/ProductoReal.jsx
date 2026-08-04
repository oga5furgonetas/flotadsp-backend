import { useState } from 'react'

/* ────────────────────────────────────────────────────────────────────────────
   El producto, no una promesa.

   Por qué existe: la landing contaba mucho y enseñaba poco. Explicaba la IA en
   tres pasos, listaba 21 paneles de carrocería… y no había ni una imagen del
   producto. Cartrack —el competidor grande del sector— pone un vídeo del
   producto funcionando en el primer scroll, y por eso su página parece de una
   empresa. Un DSP que va a meter su flota dentro quiere ver la pantalla antes
   de dar su email.

   Las imágenes NO están dibujadas a mano en CSS: las genera Playwright contra
   la aplicación de verdad (`e2e/capturas.spec.js`). Si mañana cambia una
   pantalla se relanza y se actualizan solas, en vez de quedarse obsoletas como
   se quedan siempre las maquetas hechas a mano.
   ──────────────────────────────────────────────────────────────────────────── */

const PANTALLAS = [
  {
    img: '/capturas/scorecard.png',
    t: { es: 'Scorecard en vivo', en: 'Live scorecard', fr: 'Scorecard en direct', de: 'Live-Scorecard', it: 'Scorecard dal vivo', pt: 'Scorecard ao vivo' },
    d: {
      es: 'Amazon te da el scorecard el viernes de la semana que ya cerró. Aquí lo tienes el martes, con la semana todavía abierta: cuántos fallos más aguantas antes de bajar de tier, y quién se está llevando ese margen.',
      en: 'Amazon gives you the scorecard on Friday for a week that already closed. Here you have it on Tuesday, with the week still open: how many more failures you can afford before dropping a tier, and who is eating that margin.',
      fr: 'Amazon vous donne la scorecard le vendredi pour une semaine déjà close. Ici vous l’avez le mardi, la semaine encore ouverte : combien d’échecs vous pouvez encore vous permettre, et qui consomme cette marge.',
      de: 'Amazon liefert die Scorecard freitags für eine bereits abgeschlossene Woche. Hier hast du sie dienstags, bei noch offener Woche: wie viele Fehler du dir noch leisten kannst und wer den Spielraum aufbraucht.',
      it: 'Amazon ti dà la scorecard il venerdì di una settimana già chiusa. Qui ce l’hai il martedì, con la settimana ancora aperta: quanti errori puoi ancora permetterti e chi si sta mangiando quel margine.',
      pt: 'A Amazon dá-te a scorecard à sexta, de uma semana já fechada. Aqui tens na terça, com a semana ainda aberta: quantas falhas ainda aguentas e quem está a consumir essa margem.',
    },
  },
  {
    img: '/capturas/revision-ia.png',
    t: { es: 'Revisión de daños con IA', en: 'AI damage review', fr: 'Revue des dommages par IA', de: 'KI-Schadensprüfung', it: 'Revisione danni con IA', pt: 'Revisão de danos com IA' },
    d: {
      es: 'El conductor hace la foto desde el móvil y la IA marca cada daño con su contorno y su pieza exacta. Tu equipo confirma o corrige en un clic — y cada corrección entrena el modelo con tu propia flota.',
      en: 'The driver takes the photo from their phone and the AI outlines every damage and its exact panel. Your team confirms or corrects in one click — and every correction trains the model on your own fleet.',
      fr: 'Le chauffeur prend la photo depuis son mobile et l’IA détoure chaque dommage et sa pièce exacte. Votre équipe valide ou corrige en un clic — chaque correction entraîne le modèle sur votre flotte.',
      de: 'Der Fahrer macht das Foto mit dem Handy, die KI umreißt jeden Schaden und das genaue Bauteil. Dein Team bestätigt oder korrigiert mit einem Klick — jede Korrektur trainiert das Modell mit deiner Flotte.',
      it: 'L’autista scatta la foto dal telefono e l’IA delinea ogni danno e il pezzo esatto. Il tuo team conferma o corregge in un clic — e ogni correzione allena il modello sulla tua flotta.',
      pt: 'O condutor tira a foto do telemóvel e a IA marca cada dano e a peça exata. A tua equipa confirma ou corrige num clique — e cada correção treina o modelo com a tua frota.',
    },
  },
  {
    img: '/capturas/paquetes.png',
    t: { es: 'Paquetes e incidencias', en: 'Packages & incidents', fr: 'Colis et incidents', de: 'Pakete & Vorfälle', it: 'Pacchi e incidenti', pt: 'Pacotes e incidentes' },
    d: {
      es: 'Cada ruta del día, con su conductor, lo que lleva entregado y los portales que fallan una y otra vez. Lo que un conductor aprendió a base de fallar le llega al siguiente antes de que vuelva a pasar.',
      en: 'Every route of the day with its driver, what is delivered, and the addresses that fail again and again. What one driver learned the hard way reaches the next one before it happens again.',
      fr: 'Chaque tournée du jour avec son chauffeur, ce qui est livré et les adresses qui échouent sans cesse. Ce qu’un chauffeur a appris en échouant parvient au suivant avant que cela se reproduise.',
      de: 'Jede Tour des Tages mit Fahrer, Zustellstand und den Adressen, die immer wieder scheitern. Was ein Fahrer mühsam gelernt hat, erreicht den nächsten, bevor es erneut passiert.',
      it: 'Ogni giro della giornata con il suo autista, quanto è consegnato e gli indirizzi che falliscono di continuo. Ciò che un autista ha imparato sbagliando arriva al successivo prima che riaccada.',
      pt: 'Cada rota do dia com o seu condutor, o que já entregou e as moradas que falham vezes sem conta. O que um condutor aprendeu a falhar chega ao seguinte antes de voltar a acontecer.',
    },
  },
  {
    img: '/capturas/flota.png',
    t: { es: 'Tu flota entera', en: 'Your whole fleet', fr: 'Toute votre flotte', de: 'Deine ganze Flotte', it: 'Tutta la tua flotta', pt: 'A tua frota inteira' },
    d: {
      es: 'Cada furgoneta con su ITV, su mantenimiento, sus daños abiertos y quién la lleva hoy. Sin hojas de cálculo y sin preguntar por el grupo de WhatsApp.',
      en: 'Every van with its MOT, maintenance, open damages and who is driving it today. No spreadsheets and no asking in the WhatsApp group.',
      fr: 'Chaque véhicule avec son contrôle technique, son entretien, ses dommages ouverts et qui le conduit aujourd’hui. Sans tableurs ni questions sur le groupe WhatsApp.',
      de: 'Jedes Fahrzeug mit TÜV, Wartung, offenen Schäden und wer es heute fährt. Ohne Tabellen und ohne Nachfragen in der WhatsApp-Gruppe.',
      it: 'Ogni furgone con revisione, manutenzione, danni aperti e chi lo guida oggi. Senza fogli di calcolo e senza chiedere nel gruppo WhatsApp.',
      pt: 'Cada carrinha com a sua inspeção, manutenção, danos abertos e quem a leva hoje. Sem folhas de cálculo e sem perguntar no grupo de WhatsApp.',
    },
  },
]

export default function ProductoReal({ lang = 'es', titulo, sub }) {
  const [i, setI] = useState(0)
  const p = PANTALLAS[i]
  const txt = (o) => o[lang] || o.es

  return (
    <section style={{ background: 'var(--ld-surface)', borderTop: '1px solid var(--ld-fill)', borderBottom: '1px solid var(--ld-fill)', padding: '64px 20px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <h2 style={{ fontSize: 'clamp(24px,3.2vw,36px)', fontWeight: 900, margin: '0 0 10px', letterSpacing: '-.02em', color: 'var(--ld-text)' }}>
            {titulo}
          </h2>
          <p style={{ fontSize: 15, color: 'var(--ld-dim)', margin: 0, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            {sub}
          </p>
        </div>

        {/* Pestañas: nombres cortos, sin iconos. La imagen es la protagonista. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
          {PANTALLAS.map((s, n) => (
            <button key={s.img} onClick={() => setI(n)}
              style={{
                padding: '8px 16px', borderRadius: 99, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                border: n === i ? '1px solid var(--ld-accent)' : '1px solid var(--ld-border-strong)',
                background: n === i ? 'var(--ld-accent)' : 'transparent',
                color: n === i ? '#fff' : 'var(--ld-dim)', transition: 'all .18s',
              }}>
              {txt(s.t)}
            </button>
          ))}
        </div>

        {/* Marco de navegador: enmarcar la captura la hace leer como "una app
            de verdad abierta ahora mismo" y no como una imagen suelta. */}
        <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--ld-border-strong)', background: '#0a0c10', boxShadow: '0 24px 70px rgba(0,0,0,.45)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', background: 'var(--ld-surface2)', borderBottom: '1px solid var(--ld-fill)' }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
              <span key={c} style={{ width: 10, height: 10, borderRadius: 99, background: c, display: 'inline-block' }} />
            ))}
            <span style={{ marginLeft: 10, fontSize: 11.5, color: 'var(--ld-dim)', fontFamily: 'ui-monospace,monospace' }}>
              flotadsp.com/panel
            </span>
          </div>
          <img key={p.img} src={p.img} alt={txt(p.t)} width={1440} height={900} loading="lazy"
            style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>

        <p style={{ maxWidth: 720, margin: '20px auto 0', fontSize: 14.5, lineHeight: 1.7, color: 'var(--ld-dim)', textAlign: 'center' }}>
          {txt(p.d)}
        </p>
      </div>
    </section>
  )
}
