import { useState, useEffect, useRef } from 'react'
import { useT, LANGS } from '../i18n'
import {
  Zap, Shield, Bell, Trophy, Clock, CheckCircle, ChevronRight,
  Camera, Truck, Users, BarChart3, Star, ArrowRight, Globe, Lock,
} from 'lucide-react'

/* ─── i18n adicional solo para la Landing ─── */
const LD = {
  'ld.demo.title':   { es: 'Así funciona en la vida real', en: 'This is how it works in real life', fr: 'Voici comment ça marche vraiment', de: 'So funktioniert es im Alltag', it: 'Così funziona nella vita reale', pt: 'É assim que funciona na vida real' },
  'ld.demo.sub':     { es: 'El conductor sube las fotos desde el móvil. La IA analiza al instante. Tú lo ves todo desde el panel.', en: 'The driver uploads photos from their phone. AI analyses instantly. You see everything from the dashboard.', fr: "Le chauffeur envoie les photos depuis son mobile. L'IA analyse instantanément. Vous voyez tout depuis le tableau de bord.", de: 'Der Fahrer lädt Fotos vom Handy. Die KI analysiert sofort. Du siehst alles im Dashboard.', it: "L'autista invia le foto dal cellulare. L'IA analizza all'istante. Tu vedi tutto dal pannello.", pt: 'O motorista envia fotos do telemóvel. A IA analisa na hora. Vês tudo no painel.' },
  'ld.demo.s1':      { es: 'Inspección IA en 30s', en: 'AI inspection in 30s', fr: 'Inspection IA en 30s', de: 'KI-Inspektion in 30s', it: 'Ispezione IA in 30s', pt: 'Inspeção IA em 30s' },
  'ld.demo.s2':      { es: 'Panel de control en vivo', en: 'Live control dashboard', fr: 'Tableau de bord en direct', de: 'Live-Dashboard', it: 'Pannello di controllo live', pt: 'Painel de controlo ao vivo' },
  'ld.demo.s3':      { es: 'Scorecard Amazon DSP', en: 'Amazon DSP Scorecard', fr: 'Scorecard Amazon DSP', de: 'Amazon DSP Scorecard', it: 'Scorecard Amazon DSP', pt: 'Scorecard Amazon DSP' },
  'ld.demo.s4':      { es: 'Asignación diaria', en: 'Daily assignment', fr: 'Affectation quotidienne', de: 'Tägliche Zuweisung', it: 'Assegnazione giornaliera', pt: 'Atribuição diária' },
  'ld.demo.scanning':{ es: 'Analizando con IA…', en: 'Analysing with AI…', fr: 'Analyse IA en cours…', de: 'KI analysiert…', it: 'Analisi IA in corso…', pt: 'A analisar com IA…' },
  'ld.demo.dmg':     { es: 'Daño detectado · 94%', en: 'Damage detected · 94%', fr: 'Dégât détecté · 94%', de: 'Schaden erkannt · 94%', it: 'Danno rilevato · 94%', pt: 'Dano detetado · 94%' },
  'ld.demo.alert':   { es: '⚠ Nueva inspección con daño', en: '⚠ New inspection with damage', fr: '⚠ Nouvelle inspection avec dommage', de: '⚠ Neue Inspektion mit Schaden', it: '⚠ Nuova ispezione con danno', pt: '⚠ Nova inspeção com dano' },
  'ld.demo.sev':     { es: 'Severidad: Moderado', en: 'Severity: Moderate', fr: 'Sévérité : Modéré', de: 'Schwere: Mittel', it: 'Gravità: Moderata', pt: 'Severidade: Moderado' },
  'ld.trust.t':      { es: 'Diseñado para Amazon DSPs', en: 'Built for Amazon DSPs', fr: 'Conçu pour les DSP Amazon', de: 'Für Amazon-DSPs entwickelt', it: 'Progettato per i DSP Amazon', pt: 'Criado para DSPs da Amazon' },
  'ld.trust.d':      { es: 'Cada DSP tiene su propio espacio aislado, sus conductores y su enlace. Sin mezclar datos con nadie.', en: 'Each DSP has its own isolated space, drivers and link. Data never mixed with anyone.', fr: 'Chaque DSP a son espace isolé, ses chauffeurs et son lien. Données jamais mélangées.', de: 'Jedes DSP hat seinen eigenen isolierten Bereich. Daten werden nie gemischt.', it: 'Ogni DSP ha il proprio spazio isolato. I dati non si mescolano mai.', pt: 'Cada DSP tem o seu espaço isolado. Os dados nunca se misturam.' },
  'ld.n1':           { es: 'Inspecciones diarias con foto', en: 'Daily photo inspections', fr: 'Inspections photo quotidiennes', de: 'Tägliche Foto-Inspektionen', it: 'Ispezioni giornaliere con foto', pt: 'Inspeções diárias com foto' },
  'ld.n2':           { es: 'Análisis IA de daños', en: 'AI damage analysis', fr: 'Analyse IA des dommages', de: 'KI-Schadensanalyse', it: 'Analisi IA dei danni', pt: 'Análise de danos por IA' },
  'ld.n3':           { es: 'Scorecard Amazon integrado', en: 'Amazon Scorecard integrated', fr: 'Scorecard Amazon intégré', de: 'Amazon Scorecard integriert', it: 'Scorecard Amazon integrata', pt: 'Scorecard Amazon integrado' },
  'ld.n4':           { es: 'Avisos de ITV automáticos', en: 'Automatic MOT alerts', fr: 'Alertes révision automatiques', de: 'Automatische TÜV-Warnungen', it: 'Avvisi revisione automatici', pt: 'Alertas de inspeção automáticos' },
  'ld.n5':           { es: 'Chat interno por estación', en: 'Internal chat per station', fr: 'Chat interne par dépôt', de: 'Interner Chat je Station', it: 'Chat interno per sede', pt: 'Chat interno por estação' },
  'ld.n6':           { es: 'Asignación diaria conductor↔furgoneta', en: 'Daily driver↔van assignment', fr: 'Affectation quotidienne chauffeur↔camionnette', de: 'Tägliche Fahrer↔Transporter-Zuweisung', it: 'Assegnazione giornaliera autista↔furgone', pt: 'Atribuição diária motorista↔carrinha' },
  'ld.n7':           { es: 'Gestión de incidencias', en: 'Incident management', fr: 'Gestion des incidents', de: 'Vorfallverwaltung', it: 'Gestione incidenti', pt: 'Gestão de incidências' },
  'ld.n8':           { es: 'Portal conductor en móvil', en: 'Mobile driver portal', fr: 'Portail chauffeur mobile', de: 'Mobiles Fahrer-Portal', it: 'Portale autista mobile', pt: 'Portal motorista no telemóvel' },
  'ld.stat.1n':      { es: '< 30s', en: '< 30s', fr: '< 30s', de: '< 30s', it: '< 30s', pt: '< 30s' },
  'ld.stat.1l':      { es: 'para subir una inspección', en: 'to submit an inspection', fr: 'pour envoyer une inspection', de: 'für eine Inspektion', it: 'per inviare un\'ispezione', pt: 'para enviar uma inspeção' },
  'ld.stat.2n':      { es: '300–1.500€', en: '€300–1,500', fr: '300–1 500 €', de: '300–1.500 €', it: '300–1.500 €', pt: '300–1.500 €' },
  'ld.stat.2l':      { es: 'ahorrados por daño documentado', en: 'saved per documented damage', fr: 'économisés par dommage documenté', de: 'gespart pro dokumentiertem Schaden', it: 'risparmiati per danno documentato', pt: 'poupados por dano documentado' },
  'ld.stat.3n':      { es: '6 idiomas', en: '6 languages', fr: '6 langues', de: '6 Sprachen', it: '6 lingue', pt: '6 idiomas' },
  'ld.stat.3l':      { es: 'panel y app del conductor', en: 'dashboard and driver app', fr: 'tableau de bord et app chauffeur', de: 'Dashboard und Fahrer-App', it: 'pannello e app autista', pt: 'painel e app motorista' },
  'ld.plan.try':     { es: 'Empieza con 14 días gratis', en: 'Start with 14 days free', fr: 'Commencez avec 14 jours gratuits', de: 'Starte mit 14 Tagen gratis', it: 'Inizia con 14 giorni gratis', pt: 'Começa com 14 dias grátis' },
  'ld.plan.sub':     { es: 'Sin tarjeta durante la prueba. Sin permanencia. Cancela cuando quieras.', en: 'No card during trial. No commitment. Cancel any time.', fr: 'Sans carte pendant l\'essai. Sans engagement. Annulez à tout moment.', de: 'Keine Karte während des Tests. Keine Bindung. Jederzeit kündigen.', it: 'Senza carta durante la prova. Senza vincoli. Cancella quando vuoi.', pt: 'Sem cartão durante o teste. Sem fidelização. Cancela quando quiseres.' },
}

function useLD() {
  const { lang } = useT()
  return (key) => {
    const e = LD[key]
    if (!e) return key
    return e[lang] || e.en || key
  }
}

/* ─── Componente demo animado ─── */
// steps: 0=upload idle, 1=scanning, 2=detected, 3=panel, 4=scorecard, 5=asignación
// DEMO_NAV: qué step activa cada label clickable
const DEMO_NAV = [0, 3, 4, 5]
// ACTIVE_LABEL: qué label se ilumina para cada step
const STEP_TO_LABEL = [0, 0, 0, 1, 2, 3]

function LiveDemo() {
  const { lang } = useT()
  const tl = useLD()
  const [step, setStep] = useState(0)
  const [scanPct, setScanPct] = useState(0)
  const timer = useRef(null)

  useEffect(() => {
    timer.current = setInterval(() => {
      setStep(s => {
        if (s === 0) { setScanPct(0); return 1 }
        if (s === 1) return 2
        if (s === 2) return 3
        if (s === 3) return 4
        if (s === 4) return 5
        return 0
      })
    }, 2400)
    return () => clearInterval(timer.current)
  }, [])

  useEffect(() => {
    if (step === 1) {
      setScanPct(0)
      let v = 0
      const iv = setInterval(() => { v += 5; setScanPct(v); if (v >= 100) clearInterval(iv) }, 100)
      return () => clearInterval(iv)
    }
  }, [step])

  const activeLabel = STEP_TO_LABEL[step] ?? 0
  const labels = [tl('ld.demo.s1'), tl('ld.demo.s2'), tl('ld.demo.s3'), tl('ld.demo.s4')]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 40, alignItems: 'center' }}>
      {/* Teléfono */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 230, height: 460, background: '#0e1116', borderRadius: 36, border: '3px solid rgba(255,255,255,.12)', boxShadow: '0 40px 80px -20px rgba(0,0,0,.9)', overflow: 'hidden' }}>
          {/* Notch */}
          <div style={{ width: 80, height: 22, background: '#0e1116', borderRadius: '0 0 14px 14px', margin: '0 auto', position: 'relative', zIndex: 2 }} />
          {/* Screen content */}
          <div style={{ margin: '0 10px', borderRadius: 20, overflow: 'hidden', height: 400, position: 'relative', background: '#13161b' }}>
            {/* Van photo background */}
            <img src="/van.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: step === 0 ? 0.4 : 0.85, transition: 'opacity .6s' }} />

            {/* Step 0: idle — upload hint */}
            {step === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(14,165,233,.25)', border: '2px solid rgba(14,165,233,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={24} color="#38bdf8" />
                </div>
                <span style={{ color: '#38bdf8', fontSize: 12, fontWeight: 700 }}>{tl('ld.demo.s1')}</span>
              </div>
            )}

            {/* Step 1: scanning */}
            {step === 1 && (
              <div style={{ position: 'absolute', inset: 0 }}>
                {/* Scan line animation */}
                <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,#0ea5e9,transparent)', top: `${scanPct}%`, transition: 'top .1s', boxShadow: '0 0 12px #0ea5e9' }} />
                <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,233,.9)', borderRadius: 20, padding: '5px 14px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'pulse 1s infinite' }} />
                    <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{tl('ld.demo.scanning')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: detected */}
            {step === 2 && (
              <div style={{ position: 'absolute', inset: 0 }}>
                {/* Detection box */}
                <div style={{ position: 'absolute', left: '38%', top: '48%', width: '38%', height: '8%', border: '2.5px solid #f59e0b', borderRadius: 6, boxShadow: '0 0 10px rgba(245,158,11,.5)' }} />
                <div style={{ position: 'absolute', left: '38%', top: '42%', background: '#f59e0b', color: '#000', fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>{tl('ld.demo.dmg')}</div>
                <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(239,68,68,.9)', borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 800, color: '#fff' }}>GRAVE</div>
                <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10 }}>
                  <div style={{ background: 'rgba(0,0,0,.7)', borderRadius: 10, padding: '8px 10px', backdropFilter: 'blur(8px)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>{tl('ld.demo.sev')}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>3 {lang === 'es' ? 'zonas afectadas' : lang === 'en' ? 'areas affected' : lang === 'fr' ? 'zones affectées' : lang === 'de' ? 'betroffene Bereiche' : lang === 'it' ? 'zone interessate' : 'zonas afetadas'}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: panel notification */}
            {step === 3 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: '#0b0d10' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>FlotaDSP Panel</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['48', lang === 'es' ? 'Furgonetas' : 'Vans', '#38bdf8'],
                    ['96%', 'Score', '#34d399'],
                    ['2', lang === 'es' ? 'Alertas' : 'Alerts', '#f59e0b']].map(([v, l, c]) => (
                    <div key={l} style={{ flex: 1, background: '#13161b', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: c }}>{v}</div>
                      <div style={{ fontSize: 8, color: '#64748b' }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#f87171' }}>{tl('ld.demo.alert')}</div>
                  <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 3 }}>VAN-8742 · {tl('ld.demo.sev')}</div>
                </div>
                <div style={{ background: '#13161b', borderRadius: 8, padding: '8px 8px 4px', flex: 1 }}>
                  <div style={{ fontSize: 8, color: '#64748b', marginBottom: 6 }}>{lang === 'es' ? 'Inspecciones / semana' : 'Inspections / week'}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
                    {[55, 80, 65, 90, 70, 95, 85].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 2, background: i === 5 ? '#0ea5e9' : 'rgba(14,165,233,.3)' }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Scorecard Amazon DSP */}
            {step === 4 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 7, padding: 12, background: '#0b0d10' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>Scorecard Amazon</div>
                  <div style={{ fontSize: 8, background: 'rgba(52,211,153,.15)', color: '#34d399', padding: '2px 7px', borderRadius: 99, fontWeight: 800 }}>Semana 23</div>
                </div>
                {/* Score global */}
                <div style={{ background: 'linear-gradient(135deg,rgba(52,211,153,.12),rgba(52,211,153,.04))', border: '1px solid rgba(52,211,153,.25)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#34d399' }}>Fantastic+</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#34d399' }}>96%</div>
                  </div>
                  <div style={{ height: 5, background: 'rgba(52,211,153,.2)', borderRadius: 99 }}>
                    <div style={{ width: '96%', height: '100%', background: '#34d399', borderRadius: 99 }} />
                  </div>
                </div>
                {/* Métricas */}
                {[['DCR', '99.2%', '#34d399'], ['POD', '98.8%', '#34d399'], ['DPMO', '1.2', '#34d399'], ['CC', '0', '#34d399']].map(([k, v, c]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#13161b', borderRadius: 7, padding: '6px 10px' }}>
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>{k}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: c }}>{v}</div>
                      <div style={{ fontSize: 10, color: '#34d399' }}>✓</div>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 8, color: '#64748b', textAlign: 'center', marginTop: 2 }}>
                  🏆 {lang === 'es' ? 'Top conductor: Juan G.' : 'Top driver: Juan G.'}
                </div>
              </div>
            )}

            {/* Step 5: Asignación diaria */}
            {step === 5 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: 12, background: '#0b0d10' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>{lang === 'es' ? 'Asignación del día' : 'Daily assignment'}</div>
                  <div style={{ fontSize: 8, color: '#8b94a3' }}>Lun 28 Jun</div>
                </div>
                {[
                  { name: 'Juan García', van: 'VAN-142', ok: true },
                  { name: 'María López', van: 'VAN-089', ok: true },
                  { name: 'Pedro Ruiz', van: '—', ok: false },
                  { name: 'Ana Martín', van: 'VAN-231', ok: true },
                  { name: 'Luis Sánchez', van: 'VAN-007', ok: true },
                ].map((d) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#13161b', borderRadius: 8, padding: '7px 9px', border: d.ok ? '1px solid rgba(52,211,153,.1)' : '1px solid rgba(245,158,11,.2)' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: d.ok ? '#34d399' : '#f59e0b', flexShrink: 0 }} />
                    <div style={{ fontSize: 9, color: '#cbd3e0', flex: 1, fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 9, color: d.ok ? '#38bdf8' : '#f59e0b', fontWeight: 800 }}>{d.van}</div>
                  </div>
                ))}
                <div style={{ fontSize: 8, color: '#64748b', textAlign: 'center', marginTop: 2 }}>
                  4/5 {lang === 'es' ? 'asignados · 1 pendiente' : 'assigned · 1 pending'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Steps text */}
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,233,.1)', border: '1px solid rgba(14,165,233,.25)', borderRadius: 99, padding: '4px 14px', fontSize: 11, fontWeight: 700, color: '#38bdf8', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 16 }}>
          🎬 Demo
        </div>
        <h2 style={{ fontSize: 'clamp(22px,3vw,32px)', fontWeight: 900, margin: '0 0 10px', lineHeight: 1.15 }}>{tl('ld.demo.title')}</h2>
        <p style={{ color: '#8b94a3', fontSize: 15, lineHeight: 1.65, margin: '0 0 28px' }}>{tl('ld.demo.sub')}</p>

        {labels.map((label, i) => {
          const active = activeLabel === i
          const subs = [
            { es: 'Foto del conductor · IA analiza al instante', en: 'Driver photo · AI analyses instantly', fr: 'Photo du chauffeur · IA analyse instantanément', de: 'Foto des Fahrers · KI analysiert sofort', it: "Foto autista · IA analizza istantaneamente", pt: 'Foto motorista · IA analisa na hora' },
            { es: 'Alertas, historial, stats de tu flota', en: 'Alerts, history, fleet stats', fr: 'Alertes, historique, stats de votre flotte', de: 'Warnungen, Verlauf, Flottenstatistiken', it: 'Avvisi, storico, statistiche flotta', pt: 'Alertas, histórico, estatísticas frota' },
            { es: 'Métricas Amazon en tiempo real · ranking conductores', en: 'Amazon metrics real-time · driver ranking', fr: 'Métriques Amazon temps réel · classement', de: 'Amazon-Metriken Echtzeit · Ranking', it: 'Metriche Amazon in tempo reale · classifica', pt: 'Métricas Amazon em tempo real · ranking' },
            { es: 'Quién conduce qué furgoneta · 1 clic', en: 'Who drives which van · 1 click', fr: 'Qui conduit quelle camionnette · 1 clic', de: 'Wer fährt welchen Transporter · 1 Klick', it: 'Chi guida quale furgone · 1 clic', pt: 'Quem conduz qual carrinha · 1 clique' },
          ]
          return (
            <div key={i} onClick={() => { clearInterval(timer.current); setStep(DEMO_NAV[i]) }} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16, cursor: 'pointer', opacity: active ? 1 : 0.45, transition: 'opacity .3s' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: active ? 'linear-gradient(135deg,#0ea5e9,#0369a1)' : '#13161b', border: active ? 'none' : '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, flexShrink: 0, transition: 'background .3s', color: '#fff' }}>{i + 1}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: active ? '#eef1f6' : '#8b94a3' }}>{label}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{subs[i][lang] || subs[i].en}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Feature pill ─── */
function FeatPill({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: '#13161b', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, fontSize: 13, color: '#cbd3e0', fontWeight: 500 }}>
      <CheckCircle size={14} color="#34d399" style={{ flexShrink: 0 }} />
      {children}
    </div>
  )
}

/* ─── Stat card ─── */
function StatCard({ n, label, accent }) {
  return (
    <div style={{ textAlign: 'center', padding: '28px 16px', background: '#13161b', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18 }}>
      <div style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, color: accent, marginBottom: 6 }}>{n}</div>
      <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>{label}</div>
    </div>
  )
}

/* ─── ROI row ─── */
function RoiRow({ icon: Icon, big, title, desc, accent }) {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', padding: '20px 24px', background: '#13161b', border: '1px solid rgba(255,255,255,.07)', borderRadius: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}18`, border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} color={accent} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: accent }}>{big}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#eef1f6' }}>{title}</span>
        </div>
        <p style={{ margin: 0, color: '#8b94a3', fontSize: 13.5, lineHeight: 1.55 }}>{desc}</p>
      </div>
    </div>
  )
}

export default function Landing() {
  const { t, lang } = useT()
  const tl = useLD()
  const { setLang } = useT()

  return (
    <div style={{ background: '#080a0e', color: '#eef1f6', fontFamily: 'Inter,system-ui,sans-serif', overflowX: 'hidden' }}>

      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(8,10,14,.85)', backdropFilter: 'blur(16px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: '#eef1f6' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#fb923c,#ea6800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={17} color="white" />
            </div>
            <b style={{ fontSize: 16 }}>FlotaDSP</b>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select value={lang} onChange={e => setLang(e.target.value)} style={{ background: 'transparent', color: '#8b94a3', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
              {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k} style={{ background: '#13161b' }}>{v}</option>)}
            </select>
            <a href="/planes" style={{ color: '#8b94a3', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>{t('nav.plans')}</a>
            <a href="/panel/login" style={{ color: '#8b94a3', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>{t('nav.login')}</a>
            <a href="/registro" style={{ background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', color: '#fff', textDecoration: 'none', padding: '7px 16px', borderRadius: 9, fontSize: 13, fontWeight: 800 }}>{t('nav.try')}</a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Background glow */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 800px 500px at 60% -10%, rgba(14,165,233,.14), transparent), radial-gradient(ellipse 500px 400px at 90% 60%, rgba(56,189,248,.06), transparent)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 20px 70px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 50, alignItems: 'center', position: 'relative' }}>
          <div>
            {/* Badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.3)', borderRadius: 99, padding: '5px 14px', fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 22 }}>
              🚀 {t('hero.badge')}
            </div>
            <h1 style={{ fontSize: 'clamp(32px,5vw,54px)', lineHeight: 1.06, margin: '0 0 18px', fontWeight: 950, letterSpacing: '-.03em' }}>
              {t('hero.title1')}<br />
              <span style={{ background: 'linear-gradient(120deg,#38bdf8 20%,#818cf8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t('hero.title2')}</span>.
            </h1>
            <p style={{ fontSize: 16.5, color: '#94a3b8', maxWidth: 500, margin: '0 0 30px', lineHeight: 1.65 }}>{t('hero.sub')}</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <a href="/registro" style={{ background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', color: '#fff', textDecoration: 'none', padding: '14px 24px', borderRadius: 12, fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {t('hero.ctaTry')} <ArrowRight size={16} />
              </a>
              <a href="/planes" style={{ background: 'rgba(255,255,255,.05)', color: '#eef1f6', textDecoration: 'none', padding: '14px 24px', borderRadius: 12, fontSize: 15, fontWeight: 700, border: '1px solid rgba(255,255,255,.1)' }}>
                {t('hero.ctaPlans')}
              </a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
              {[t('hero.mini').split('·').filter(Boolean)].flat().map((s, i) => (
                <span key={i} style={{ fontSize: 12.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle size={12} color="#34d399" /> {s.trim()}
                </span>
              ))}
            </div>
          </div>

          {/* Hero visual — dashboard mockup */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', inset: -40, background: 'radial-gradient(ellipse at center, rgba(14,165,233,.1), transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ background: '#0e1116', border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px -30px rgba(0,0,0,.9)', position: 'relative' }}>
              {/* Title bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                {['#ef4444','#f59e0b','#22c55e'].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />)}
                <span style={{ marginLeft: 8, fontSize: 11, color: '#475569', fontWeight: 600 }}>FlotaDSP — Panel</span>
              </div>
              <div style={{ padding: 16 }}>
                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                  {[['89', lang === 'es' ? 'Furgonetas' : lang === 'en' ? 'Vans' : lang === 'de' ? 'Transporter' : lang === 'fr' ? 'Camionnettes' : lang === 'it' ? 'Furgoni' : 'Carrinhas', '#38bdf8'],
                    ['95', lang === 'es' ? 'Conductores' : lang === 'en' ? 'Drivers' : lang === 'de' ? 'Fahrer' : lang === 'fr' ? 'Chauffeurs' : lang === 'it' ? 'Autisti' : 'Motoristas', '#a78bfa'],
                    ['4.8★', 'Score', '#34d399']].map(([v, l, c]) => (
                    <div key={l} style={{ background: '#080a0e', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{v}</div>
                      <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{l}</div>
                    </div>
                  ))}
                </div>
                {/* Chart */}
                <div style={{ background: '#080a0e', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#475569', marginBottom: 8, fontWeight: 600 }}>{lang === 'es' ? 'Inspecciones · 7 días' : lang === 'en' ? 'Inspections · 7 days' : lang === 'de' ? 'Inspektionen · 7 Tage' : lang === 'fr' ? 'Inspections · 7 jours' : lang === 'it' ? 'Ispezioni · 7 giorni' : 'Inspeções · 7 dias'}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 70 }}>
                    {[50,70,55,88,62,95,78].map((h,i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0', background: i === 5 ? 'linear-gradient(180deg,#38bdf8,#0369a1)' : 'rgba(14,165,233,.25)' }} />
                    ))}
                  </div>
                </div>
                {/* Alert row */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#f87171' }}>⚠ {lang === 'es' ? 'ITV próxima' : lang === 'en' ? 'MOT due' : lang === 'de' ? 'TÜV fällig' : lang === 'fr' ? 'CT à venir' : lang === 'it' ? 'Revisione' : 'Inspeção'}</div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>VAN-4421 · 5d</div>
                  </div>
                  <div style={{ flex: 1, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24' }}>📸 {lang === 'es' ? 'Daño detectado' : lang === 'en' ? 'Damage found' : lang === 'de' ? 'Schaden erkannt' : lang === 'fr' ? 'Dommage trouvé' : lang === 'it' ? 'Danno rilevato' : 'Dano detetado'}</div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>VAN-8742 · 2min</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── STATS BAR ── */}
      <div style={{ background: '#0e1116', borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          {[
            [tl('ld.stat.1n'), tl('ld.stat.1l'), '#38bdf8'],
            [tl('ld.stat.2n'), tl('ld.stat.2l'), '#34d399'],
            [tl('ld.stat.3n'), tl('ld.stat.3l'), '#a78bfa'],
          ].map(([n, l, c]) => (
            <div key={n} style={{ padding: '22px 20px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,.05)' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{n}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DEMO ANIMADO ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 20px' }}>
        <LiveDemo />
      </section>

      {/* ── ROI ── */}
      <section style={{ background: '#0e1116', borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 style={{ fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900, margin: '0 0 10px' }}>💸 {t('roi.t')}</h2>
            <p style={{ color: '#8b94a3', fontSize: 15, margin: 0 }}>{t('roi.sub')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
            <RoiRow icon={Shield} big="300–1.500€" title={t('roi.1t')} desc={t('roi.1d')} accent="#34d399" />
            <RoiRow icon={Bell} big="0€" title={t('roi.2t')} desc={t('roi.2d')} accent="#38bdf8" />
            <RoiRow icon={Trophy} big="−30%" title={t('roi.3t')} desc={t('roi.3d')} accent="#a78bfa" />
            <RoiRow icon={Clock} big="2h→5min" title={t('roi.4t')} desc={t('roi.4d')} accent="#fb923c" />
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h2 style={{ fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900, margin: '0 0 10px' }}>{t('how.t')}</h2>
          <p style={{ color: '#8b94a3', fontSize: 15, margin: 0 }}>{tl('ld.trust.d')}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
          {[
            tl('ld.n1'), tl('ld.n2'), tl('ld.n3'), tl('ld.n4'),
            tl('ld.n5'), tl('ld.n6'), tl('ld.n7'), tl('ld.n8'),
          ].map(f => <FeatPill key={f}>{f}</FeatPill>)}
        </div>
      </section>

      {/* ── CÓMO FUNCIONA (steps) ── */}
      <section style={{ background: '#0e1116', borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 32 }}>
          {[
            [Camera, t('how.1t'), t('how.1d'), '#38bdf8'],
            [Zap, t('how.2t'), t('how.2d'), '#a78bfa'],
            [BarChart3, t('how.3t'), t('how.3d'), '#34d399'],
          ].map(([Icon, title, desc, color], i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Icon size={24} color={color} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                {lang === 'es' ? `Paso ${i+1}` : lang === 'en' ? `Step ${i+1}` : lang === 'de' ? `Schritt ${i+1}` : lang === 'fr' ? `Étape ${i+1}` : lang === 'it' ? `Passo ${i+1}` : `Passo ${i+1}`}
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>{title}</h3>
              <p style={{ margin: 0, color: '#8b94a3', fontSize: 14, lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRUST: seguridad y multi-idioma ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
          <div style={{ background: 'linear-gradient(135deg,rgba(56,189,248,.07),rgba(14,165,233,.03))', border: '1px solid rgba(56,189,248,.2)', borderRadius: 18, padding: '28px 24px' }}>
            <Lock size={24} color="#38bdf8" style={{ marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>{tl('ld.trust.t')}</h3>
            <p style={{ margin: 0, color: '#8b94a3', fontSize: 14, lineHeight: 1.6 }}>{tl('ld.trust.d')}</p>
          </div>
          <div style={{ background: 'linear-gradient(135deg,rgba(167,139,250,.07),rgba(139,92,246,.03))', border: '1px solid rgba(167,139,250,.2)', borderRadius: 18, padding: '28px 24px' }}>
            <Globe size={24} color="#a78bfa" style={{ marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>{tl('ld.stat.3n')}</h3>
            <p style={{ margin: 0, color: '#8b94a3', fontSize: 14, lineHeight: 1.6 }}>
              {lang === 'es' ? 'El panel y la app del conductor están disponibles en español, inglés, francés, alemán, italiano y portugués. Cada usuario ve la app en su idioma.' :
               lang === 'en' ? 'The dashboard and driver app are available in Spanish, English, French, German, Italian and Portuguese. Each user sees the app in their language.' :
               lang === 'fr' ? 'Le tableau de bord et l\'app chauffeur sont disponibles en espagnol, anglais, français, allemand, italien et portugais.' :
               lang === 'de' ? 'Dashboard und Fahrer-App sind auf Spanisch, Englisch, Französisch, Deutsch, Italienisch und Portugiesisch verfügbar.' :
               lang === 'it' ? 'Il pannello e l\'app autista sono disponibili in spagnolo, inglese, francese, tedesco, italiano e portoghese.' :
               'O painel e a app motorista estão disponíveis em espanhol, inglês, francês, alemão, italiano e português.'}
            </p>
          </div>
          <div style={{ background: 'linear-gradient(135deg,rgba(52,211,153,.07),rgba(16,185,129,.03))', border: '1px solid rgba(52,211,153,.2)', borderRadius: 18, padding: '28px 24px' }}>
            <Star size={24} color="#34d399" style={{ marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>{t('found.t')}</h3>
            <p style={{ margin: 0, color: '#8b94a3', fontSize: 14, lineHeight: 1.6 }}>{t('found.d')}</p>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ background: '#0e1116', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,233,.1)', border: '1px solid rgba(14,165,233,.25)', borderRadius: 99, padding: '5px 16px', fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 20 }}>
            ✨ {tl('ld.plan.try')}
          </div>
          <h2 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 950, margin: '0 0 14px', letterSpacing: '-.025em', lineHeight: 1.1 }}>{t('cta.t')}</h2>
          <p style={{ color: '#8b94a3', margin: '0 0 32px', fontSize: 16, lineHeight: 1.6 }}>{tl('ld.plan.sub')}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/registro" style={{ background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', color: '#fff', textDecoration: 'none', padding: '15px 32px', borderRadius: 12, fontSize: 16, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {t('hero.ctaTry')} <ArrowRight size={18} />
            </a>
            <a href="/planes" style={{ background: 'rgba(255,255,255,.05)', color: '#eef1f6', textDecoration: 'none', padding: '15px 28px', borderRadius: 12, fontSize: 15, fontWeight: 700, border: '1px solid rgba(255,255,255,.1)' }}>
              {t('nav.plans')}
            </a>
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[t('cta.d').split('·').filter(Boolean)].flat().map((s, i) => (
              <span key={i} style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={13} color="#34d399" /> {s.trim()}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,.05)', padding: '36px 20px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#fb923c,#ea6800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={14} color="white" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700 }}>FlotaDSP</span>
            <span style={{ color: '#475569', fontSize: 13 }}>© {new Date().getFullYear()}</span>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[['Privacidad','/privacidad'],['Términos','/terminos'],['Cookies','/cookies'],['Aviso legal','/aviso-legal'],['Contacto','/contacto']].map(([l, h]) => (
              <a key={h} href={h} style={{ color: '#475569', textDecoration: 'none', fontSize: 13 }}>{l}</a>
            ))}
          </div>
          <a href="/panel/login" style={{ color: '#38bdf8', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>{t('foot.have')} {t('foot.login')} →</a>
        </div>
      </footer>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </div>
  )
}
