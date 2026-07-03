import { useState, useEffect, useRef } from 'react'
import { useT, LANGS } from '../i18n'
import { API_BASE } from '../lib/apiBase'
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
  'ld.sh.title':     { es: 'Todo lo que necesita tu flota', en: 'Everything your fleet needs', fr: 'Tout ce dont votre flotte a besoin', de: 'Alles was deine Flotte braucht', it: 'Tutto ciò di cui ha bisogno la tua flotta', pt: 'Tudo o que a tua frota precisa' },
  'ld.sh.sub':       { es: 'Desde la inspección hasta la ITV, pasando por el scorecard y el chat interno. Una sola app.', en: 'From inspection to MOT, scorecard and internal chat. One single app.', fr: 'De l\'inspection au CT, scorecard et chat interne. Une seule app.', de: 'Von der Inspektion bis zum TÜV, Scorecard und internem Chat. Eine App.', it: 'Dall\'ispezione alla revisione, scorecard e chat. Un\'unica app.', pt: 'Da inspeção à inspeção periódica, scorecard e chat. Uma só app.' },
  'ld.sh.t1':        { es: 'Alertas ITV', en: 'MOT Alerts', fr: 'Alertes CT', de: 'TÜV-Warnungen', it: 'Allerte revisione', pt: 'Alertas IPO' },
  'ld.sh.t2':        { es: 'Chat interno', en: 'Internal chat', fr: 'Chat interne', de: 'Interner Chat', it: 'Chat interno', pt: 'Chat interno' },
  'ld.sh.t3':        { es: 'Estado de flota', en: 'Fleet health', fr: 'État de la flotte', de: 'Flottenstand', it: 'Stato flotta', pt: 'Estado da frota' },
  'ld.sh.t4':        { es: 'Revisión IA', en: 'AI Review', fr: 'Révision IA', de: 'KI-Prüfung', it: 'Revisione IA', pt: 'Revisão IA' },
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

/* ─── Dual Demo (phone + browser side by side) ─── */
function DualDemo() {
  const { lang } = useT()
  const tl = useLD()

  /* ── LiveDemo state ── */
  const [step, setStep] = useState(0)
  const [scanPct, setScanPct] = useState(0)
  const phoneTimer = useRef(null)

  useEffect(() => {
    phoneTimer.current = setInterval(() => {
      setStep(s => {
        if (s === 0) { setScanPct(0); return 1 }
        if (s === 5) return 0
        return s + 1
      })
    }, 2400)
    return () => clearInterval(phoneTimer.current)
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
  const demoLabels = [tl('ld.demo.s1'), tl('ld.demo.s2'), tl('ld.demo.s3'), tl('ld.demo.s4')]
  const demoSubs = [
    { es:'Foto del conductor · IA analiza al instante', en:'Driver photo · AI analyses instantly', fr:'Photo du chauffeur · IA analyse instantanément', de:'Foto des Fahrers · KI analysiert sofort', it:"Foto autista · IA analizza", pt:'Foto motorista · IA analisa' },
    { es:'Alertas, historial, stats de tu flota', en:'Alerts, history, fleet stats', fr:'Alertes, historique, stats', de:'Warnungen, Verlauf, Statistiken', it:'Avvisi, storico, statistiche', pt:'Alertas, histórico, estatísticas' },
    { es:'Métricas Amazon · ranking conductores', en:'Amazon metrics · driver ranking', fr:'Métriques Amazon · classement', de:'Amazon-Metriken · Ranking', it:'Metriche Amazon · classifica', pt:'Métricas Amazon · ranking' },
    { es:'Quién conduce qué furgoneta · 1 clic', en:'Who drives which van · 1 click', fr:'Qui conduit quelle camionnette', de:'Wer fährt welchen Transporter', it:'Chi guida quale furgone', pt:'Quem conduz qual carrinha' },
  ]

  /* ── FeatureShowcase state ── */
  const [tab, setTab] = useState(0)
  const browserTimer = useRef(null)

  const FEATURES = [
    { icon:'🔔', accent:'#ef4444', accentLight:'rgba(239,68,68,.12)', accentBorder:'rgba(239,68,68,.3)', label:tl('ld.sh.t1'), sub:lang==='es'?'Nunca más una multa por ITV vencida':lang==='en'?'Never miss an MOT deadline':lang==='fr'?'Plus jamais de CT manqué':lang==='de'?'Nie wieder TÜV verpassen':lang==='it'?'Mai più revisione scaduta':'Nunca perder uma inspeção' },
    { icon:'💬', accent:'#38bdf8', accentLight:'rgba(56,189,248,.1)', accentBorder:'rgba(56,189,248,.25)', label:tl('ld.sh.t2'), sub:lang==='es'?'Tu equipo coordinado en tiempo real':lang==='en'?'Your team coordinated in real time':lang==='fr'?'Votre équipe en temps réel':lang==='de'?'Dein Team in Echtzeit':lang==='it'?'Il tuo team in tempo reale':'A tua equipa em tempo real' },
    { icon:'🚛', accent:'#a78bfa', accentLight:'rgba(167,139,250,.1)', accentBorder:'rgba(167,139,250,.25)', label:tl('ld.sh.t3'), sub:lang==='es'?'El estado real de cada furgoneta':lang==='en'?'The real state of every van':lang==='fr'?'L\'état réel de chaque camionnette':lang==='de'?'Der echte Zustand jedes Transporters':lang==='it'?'Lo stato reale di ogni furgone':'O estado real de cada carrinha' },
    { icon:'🤖', accent:'#34d399', accentLight:'rgba(52,211,153,.1)', accentBorder:'rgba(52,211,153,.25)', label:tl('ld.sh.t4'), sub:lang==='es'?'Una IA que aprende de tu flota':lang==='en'?'An AI that learns from your fleet':lang==='fr'?'Une IA qui apprend de votre flotte':lang==='de'?'Eine KI die von deiner Flotte lernt':lang==='it'?'Una IA che impara dalla tua flotta':'Uma IA que aprende com a tua frota' },
  ]

  useEffect(() => {
    browserTimer.current = setInterval(() => setTab(t => (t + 1) % 4), 3800)
    return () => clearInterval(browserTimer.current)
  }, [])

  const f = FEATURES[tab]

  /* ── Browser screens ── */
  const browserScreens = [
    <div style={{ padding:'18px 16px', display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:2 }}>{lang==='es'?'Alertas ITV próximas':lang==='en'?'Upcoming MOT alerts':lang==='fr'?'Alertes CT à venir':lang==='de'?'TÜV-Warnungen':'Allerte revisione'}</div>
      {[{p:'2866 NGX',d:-3,c:'OGA5'},{p:'1304 NJS',d:-1,c:'DGA1'},{p:'5804 MVN',d:12,c:'OGA5'},{p:'3301 MKL',d:18,c:'DGA2'},{p:'7712 BPR',d:29,c:'DGA1'}].map(v => {
        const exp=v.d<0, urg=v.d>=0&&v.d<=14
        const col=exp?'#ef4444':urg?'#f59e0b':'#34d399'
        return (
          <div key={v.p} style={{ display:'flex', alignItems:'center', gap:9, background:exp?'rgba(239,68,68,.07)':urg?'rgba(245,158,11,.06)':'rgba(52,211,153,.05)', border:`1px solid ${exp?'rgba(239,68,68,.22)':urg?'rgba(245,158,11,.18)':'rgba(52,211,153,.12)'}`, borderRadius:9, padding:'8px 12px' }}>
            <span style={{ fontSize:14 }}>🛡</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#eef1f6' }}>{v.p}</div>
              <div style={{ fontSize:10, color:'#64748b' }}>{v.c}</div>
            </div>
            <div style={{ fontSize:11, fontWeight:800, color:col, background:`${col}18`, padding:'2px 9px', borderRadius:99 }}>{exp?(lang==='es'?'Vencida':lang==='en'?'Expired':lang==='fr'?'Expirée':lang==='de'?'Abgelaufen':'Scaduta'):`${v.d}d`}</div>
          </div>
        )
      })}
    </div>,
    <div style={{ padding:'14px', display:'flex', flexDirection:'column', gap:7 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 11px', background:'#13161b', borderRadius:9, marginBottom:2 }}>
        <div style={{ width:7,height:7,borderRadius:'50%',background:'#34d399' }} />
        <span style={{ fontSize:10, fontWeight:700, color:'#64748b' }}>Chat · OGA5</span>
      </div>
      {[
        {who:'Dani',msg:lang==='es'?'¿Alguien vio el parte de VAN-142?':lang==='en'?'Anyone seen VAN-142 report?':'Hat jemand VAN-142 gesehen?',me:false,t:'09:14'},
        {who:'Laura',msg:lang==='es'?'Sí, daño leve en lateral. En revisión.':lang==='en'?'Yes, minor side damage. In review.':'Ja, leichter Schaden. In Prüfung.',me:true,t:'09:15'},
        {who:'Dani',msg:lang==='es'?'👍 Perfecto, lo gestiono':lang==='en'?'👍 Perfect, I\'ll handle it':'👍 Perfekt, danke',me:false,t:'09:15'},
        {who:'Laura',msg:lang==='es'?'✅ VAN-089 tiene ITV en 5 días':lang==='en'?'✅ VAN-089 has MOT in 5 days':'✅ VAN-089 hat TÜV in 5 Tagen',me:true,t:'09:16'},
      ].map((m,i) => (
        <div key={i} style={{ display:'flex', flexDirection:m.me?'row-reverse':'row', gap:6, alignItems:'flex-end' }}>
          {!m.me && <div style={{ width:24,height:24,borderRadius:'50%',background:'rgba(14,165,233,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color:'#38bdf8',flexShrink:0 }}>{m.who[0]}</div>}
          <div style={{ maxWidth:'74%',background:m.me?'rgba(14,165,233,.14)':'#1e2330',border:m.me?'1px solid rgba(14,165,233,.22)':'1px solid rgba(255,255,255,.06)',borderRadius:m.me?'12px 12px 3px 12px':'12px 12px 12px 3px',padding:'6px 10px' }}>
            {!m.me && <div style={{ fontSize:8,fontWeight:800,color:'#38bdf8',marginBottom:2 }}>{m.who}</div>}
            <div style={{ fontSize:11,color:'#cbd3e0',lineHeight:1.4 }}>{m.msg}</div>
            <div style={{ fontSize:9,color:'#475569',marginTop:2,textAlign:m.me?'right':'left' }}>{m.t}</div>
          </div>
        </div>
      ))}
    </div>,
    <div style={{ padding:'18px 16px', display:'flex', flexDirection:'column', gap:11 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.07em' }}>{lang==='es'?'Estado flota — 88 vehículos':lang==='en'?'Fleet health — 88 vehicles':lang==='fr'?'État flotte — 88 véhicules':'Stato flotta — 88 veicoli'}</div>
      <div style={{ display:'flex', height:10, borderRadius:99, overflow:'hidden' }}>
        {[[22,'#34d399'],[41,'#fbbf24'],[26,'#fb923c'],[8,'#f87171'],[3,'#ef4444']].map(([p,c],i)=><div key={i} style={{ width:`${p}%`,background:c }} />)}
      </div>
      {[
        {k:lang==='es'?'Sin daños':lang==='en'?'No damage':'Senza danni',p:22,n:19,c:'#34d399'},
        {k:lang==='es'?'Leve':lang==='en'?'Minor':'Lieve',p:41,n:36,c:'#fbbf24'},
        {k:lang==='es'?'Moderado':lang==='en'?'Moderate':'Moderato',p:26,n:23,c:'#fb923c'},
        {k:lang==='es'?'Grave':lang==='en'?'Serious':'Grave',p:8,n:7,c:'#f87171'},
        {k:lang==='es'?'Crítico':lang==='en'?'Critical':'Critico',p:3,n:3,c:'#ef4444'},
      ].map(b=>(
        <div key={b.k} style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:7,height:7,borderRadius:'50%',background:b.c,flexShrink:0 }} />
          <span style={{ flex:1,fontSize:11.5,color:'#8b94a3' }}>{b.k}</span>
          <div style={{ width:60,height:4,background:'rgba(255,255,255,.06)',borderRadius:99,overflow:'hidden' }}><div style={{ width:`${b.p}%`,height:'100%',background:b.c,borderRadius:99 }} /></div>
          <span style={{ fontSize:11,fontWeight:700,color:'#cbd3e0',width:16,textAlign:'right' }}>{b.n}</span>
        </div>
      ))}
      <div style={{ display:'flex', gap:7 }}>
        <div style={{ flex:1,background:'rgba(52,211,153,.08)',border:'1px solid rgba(52,211,153,.2)',borderRadius:9,padding:'9px',textAlign:'center' }}>
          <div style={{ fontSize:18,fontWeight:900,color:'#34d399' }}>19</div>
          <div style={{ fontSize:10,color:'#64748b' }}>{lang==='es'?'sin daños':'no damage'}</div>
        </div>
        <div style={{ flex:1,background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:9,padding:'9px',textAlign:'center' }}>
          <div style={{ fontSize:18,fontWeight:900,color:'#ef4444' }}>10</div>
          <div style={{ fontSize:10,color:'#64748b' }}>{lang==='es'?'críticos/graves':'critical/serious'}</div>
        </div>
      </div>
    </div>,
    <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:9 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.07em' }}>{lang==='es'?'Revisión rápida — valida IA':lang==='en'?'Quick review — validate AI':'Revisione rapida — valida IA'}</div>
      <div style={{ position:'relative', background:'#0a0c10', borderRadius:11, overflow:'hidden', height:120 }}>
        <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:44 }}>🚐</div>
        <div style={{ position:'absolute',left:'30%',top:'32%',width:'38%',height:'30%',border:'2.5px solid #f59e0b',borderRadius:6,boxShadow:'0 0 12px rgba(245,158,11,.4)' }} />
        <div style={{ position:'absolute',left:'30%',top:'23%',background:'#f59e0b',color:'#000',fontSize:8,fontWeight:900,padding:'2px 6px',borderRadius:4 }}>{lang==='es'?'Rozadura · 87%':'Scratch · 87%'}</div>
      </div>
      {[
        {part:lang==='es'?'Puerta corredera izq.':lang==='en'?'Left sliding door':'Porta scorrevole sx.',sev:lang==='es'?'Leve':'Minor',ok:true},
        {part:lang==='es'?'Paragolpes trasero':lang==='en'?'Rear bumper':'Paraurti posteriore',sev:lang==='es'?'Moderado':'Moderate',ok:null},
      ].map((d,i)=>(
        <div key={i} style={{ display:'flex', alignItems:'center', gap:9, background:'#13161b', border:'1px solid rgba(255,255,255,.07)', borderRadius:9, padding:'8px 11px' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11.5,fontWeight:600,color:'#eef1f6' }}>{d.part}</div>
            <div style={{ fontSize:10,color:'#64748b' }}>{d.sev}</div>
          </div>
          <div style={{ display:'flex', gap:5 }}>
            <div style={{ width:28,height:28,borderRadius:7,border:d.ok?'1px solid #34d399':'1px solid rgba(255,255,255,.1)',background:d.ok?'rgba(52,211,153,.15)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:d.ok?'#34d399':'#64748b' }}>✓</div>
            <div style={{ width:28,height:28,borderRadius:7,border:'1px solid rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'#64748b' }}>✗</div>
          </div>
        </div>
      ))}
      <div style={{ background:'rgba(139,92,246,.1)', border:'1px solid rgba(139,92,246,.22)', borderRadius:9, padding:'7px 11px', display:'flex', alignItems:'center', gap:7 }}>
        <span style={{ fontSize:13 }}>🧠</span>
        <span style={{ fontSize:11, color:'#a78bfa' }}>{lang==='es'?'Cada ✓/✗ entrena tu IA propia':lang==='en'?'Each ✓/✗ trains your own AI':'Jedes ✓/✗ trainiert deine KI'}</span>
      </div>
    </div>,
  ]

  return (
    <section style={{ background:'#0e1116', borderTop:'1px solid rgba(255,255,255,.05)', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
      <div style={{ maxWidth:1180, margin:'0 auto', padding:'80px 20px' }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:56 }}>
          <h2 style={{ fontSize:'clamp(24px,3vw,38px)', fontWeight:900, margin:'0 0 12px', background:'linear-gradient(135deg,#eef1f6,#94a3b8)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            {tl('ld.demo.title')}
          </h2>
          <p style={{ color:'#8b94a3', fontSize:15, margin:0, maxWidth:540, marginLeft:'auto', marginRight:'auto' }}>{tl('ld.sh.sub')}</p>
        </div>

        {/* Mockups side by side */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, alignItems:'start' }}>

          {/* ── Teléfono (LiveDemo) ── */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:24 }}>
            {/* Glow */}
            <div style={{ position:'relative' }}>
              <div style={{ position:'absolute', inset:-40, background:'radial-gradient(ellipse at center,rgba(14,165,233,.12),transparent 65%)', pointerEvents:'none' }} />
              <div style={{ position:'relative', width:220, height:440, background:'#0e1116', borderRadius:34, border:'3px solid rgba(255,255,255,.12)', boxShadow:'0 40px 80px -20px rgba(0,0,0,.9)', overflow:'hidden' }}>
                <div style={{ width:76,height:20,background:'#0e1116',borderRadius:'0 0 12px 12px',margin:'0 auto',position:'relative',zIndex:2 }} />
                <div style={{ margin:'0 9px', borderRadius:18, overflow:'hidden', height:385, position:'relative', background:'#13161b' }}>
                  <img src="/van.jpg" alt="" style={{ width:'100%',height:'100%',objectFit:'cover',opacity:step===0?0.4:0.85,transition:'opacity .6s' }} />
                  {step===0 && <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8 }}><div style={{ width:52,height:52,borderRadius:'50%',background:'rgba(14,165,233,.25)',border:'2px solid rgba(14,165,233,.5)',display:'flex',alignItems:'center',justifyContent:'center' }}><Camera size={22} color="#38bdf8" /></div><span style={{ color:'#38bdf8',fontSize:11,fontWeight:700 }}>{tl('ld.demo.s1')}</span></div>}
                  {step===1 && <div style={{ position:'absolute',inset:0 }}><div style={{ position:'absolute',left:0,right:0,height:2,background:'linear-gradient(90deg,transparent,#0ea5e9,transparent)',top:`${scanPct}%`,transition:'top .1s',boxShadow:'0 0 12px #0ea5e9' }} /><div style={{ position:'absolute',bottom:12,left:0,right:0,textAlign:'center' }}><div style={{ display:'inline-flex',alignItems:'center',gap:6,background:'rgba(14,165,233,.9)',borderRadius:20,padding:'5px 14px' }}><div style={{ width:8,height:8,borderRadius:'50%',background:'#fff' }} /><span style={{ color:'#fff',fontSize:11,fontWeight:700 }}>{tl('ld.demo.scanning')}</span></div></div></div>}
                  {step===2 && <div style={{ position:'absolute',inset:0 }}><div style={{ position:'absolute',left:'38%',top:'48%',width:'38%',height:'8%',border:'2.5px solid #f59e0b',borderRadius:6,boxShadow:'0 0 10px rgba(245,158,11,.5)' }} /><div style={{ position:'absolute',left:'38%',top:'42%',background:'#f59e0b',color:'#000',fontSize:8,fontWeight:900,padding:'2px 6px',borderRadius:4,whiteSpace:'nowrap' }}>{tl('ld.demo.dmg')}</div><div style={{ position:'absolute',top:8,right:8,background:'rgba(239,68,68,.9)',borderRadius:20,padding:'3px 10px',fontSize:9,fontWeight:800,color:'#fff' }}>GRAVE</div><div style={{ position:'absolute',bottom:10,left:10,right:10 }}><div style={{ background:'rgba(0,0,0,.7)',borderRadius:10,padding:'8px 10px',backdropFilter:'blur(8px)' }}><div style={{ fontSize:9,fontWeight:700,color:'#f59e0b' }}>{tl('ld.demo.sev')}</div><div style={{ fontSize:8,color:'#94a3b8',marginTop:2 }}>3 {lang==='es'?'zonas afectadas':lang==='en'?'areas affected':'Bereiche'}</div></div></div></div>}
                  {step===3 && <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',gap:7,padding:11,background:'#0b0d10' }}><div style={{ fontSize:9,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em' }}>FlotaDSP Panel</div><div style={{ display:'flex',gap:5 }}>{[['48',lang==='es'?'Furgonetas':'Vans','#38bdf8'],['96%','Score','#34d399'],['2',lang==='es'?'Alertas':'Alerts','#f59e0b']].map(([v,l,c])=><div key={l} style={{ flex:1,background:'#13161b',borderRadius:7,padding:'7px 5px',textAlign:'center' }}><div style={{ fontSize:13,fontWeight:900,color:c }}>{v}</div><div style={{ fontSize:7,color:'#64748b' }}>{l}</div></div>)}</div><div style={{ background:'rgba(239,68,68,.12)',border:'1px solid rgba(239,68,68,.3)',borderRadius:7,padding:'7px 9px' }}><div style={{ fontSize:9,fontWeight:800,color:'#f87171' }}>{tl('ld.demo.alert')}</div><div style={{ fontSize:8,color:'#94a3b8',marginTop:2 }}>VAN-8742 · {tl('ld.demo.sev')}</div></div><div style={{ background:'#13161b',borderRadius:7,padding:'7px 8px 4px',flex:1 }}><div style={{ fontSize:8,color:'#64748b',marginBottom:5 }}>{lang==='es'?'Inspecciones / semana':'Inspections / week'}</div><div style={{ display:'flex',alignItems:'flex-end',gap:2,height:36 }}>{[55,80,65,90,70,95,85].map((h,i)=><div key={i} style={{ flex:1,height:`${h}%`,borderRadius:2,background:i===5?'#0ea5e9':'rgba(14,165,233,.3)' }} />)}</div></div></div>}
                  {step===4 && <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',gap:6,padding:11,background:'#0b0d10' }}><div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}><div style={{ fontSize:8,fontWeight:700,color:'#64748b',textTransform:'uppercase' }}>Scorecard Amazon</div><div style={{ fontSize:7,background:'rgba(52,211,153,.15)',color:'#34d399',padding:'2px 6px',borderRadius:99,fontWeight:800 }}>Sem 23</div></div><div style={{ background:'linear-gradient(135deg,rgba(52,211,153,.12),rgba(52,211,153,.04))',border:'1px solid rgba(52,211,153,.25)',borderRadius:9,padding:'9px 11px' }}><div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5 }}><div style={{ fontSize:9,fontWeight:800,color:'#34d399' }}>Fantastic+</div><div style={{ fontSize:16,fontWeight:900,color:'#34d399' }}>96%</div></div><div style={{ height:4,background:'rgba(52,211,153,.2)',borderRadius:99 }}><div style={{ width:'96%',height:'100%',background:'#34d399',borderRadius:99 }} /></div></div>{[['DCR','99.2%','#34d399'],['POD','98.8%','#34d399'],['DPMO','1.2','#34d399'],['CC','0','#34d399']].map(([k,v,c])=><div key={k} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',background:'#13161b',borderRadius:6,padding:'5px 9px' }}><div style={{ fontSize:8,color:'#64748b',fontWeight:700 }}>{k}</div><div style={{ display:'flex',alignItems:'center',gap:3 }}><div style={{ fontSize:10,fontWeight:900,color:c }}>{v}</div><div style={{ fontSize:9,color:'#34d399' }}>✓</div></div></div>)}<div style={{ fontSize:8,color:'#64748b',textAlign:'center',marginTop:2 }}>🏆 {lang==='es'?'Top: Juan G.':'Top driver: Juan G.'}</div></div>}
                  {step===5 && <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',gap:5,padding:11,background:'#0b0d10' }}><div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}><div style={{ fontSize:8,fontWeight:700,color:'#64748b',textTransform:'uppercase' }}>{lang==='es'?'Asignación del día':'Daily assignment'}</div><div style={{ fontSize:8,color:'#8b94a3' }}>Lun 28</div></div>{[{name:'Juan García',van:'VAN-142',ok:true},{name:'María López',van:'VAN-089',ok:true},{name:'Pedro Ruiz',van:'—',ok:false},{name:'Ana Martín',van:'VAN-231',ok:true},{name:'Luis Sánchez',van:'VAN-007',ok:true}].map(d=><div key={d.name} style={{ display:'flex',alignItems:'center',gap:6,background:'#13161b',borderRadius:7,padding:'6px 8px',border:d.ok?'1px solid rgba(52,211,153,.1)':'1px solid rgba(245,158,11,.2)' }}><div style={{ width:6,height:6,borderRadius:'50%',background:d.ok?'#34d399':'#f59e0b',flexShrink:0 }} /><div style={{ fontSize:9,color:'#cbd3e0',flex:1,fontWeight:600 }}>{d.name}</div><div style={{ fontSize:9,color:d.ok?'#38bdf8':'#f59e0b',fontWeight:800 }}>{d.van}</div></div>)}<div style={{ fontSize:8,color:'#64748b',textAlign:'center',marginTop:2 }}>4/5 {lang==='es'?'asignados · 1 pendiente':'assigned · 1 pending'}</div></div>}
                </div>
              </div>
            </div>

            {/* Step indicators debajo del teléfono */}
            <div style={{ width:'100%', maxWidth:340 }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'rgba(14,165,233,.1)', border:'1px solid rgba(14,165,233,.25)', borderRadius:99, padding:'4px 14px', fontSize:11, fontWeight:700, color:'#38bdf8', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:16 }}>🎬 Demo</div>
              {demoLabels.map((label,i) => {
                const active = activeLabel === i
                return (
                  <div key={i} onClick={() => { clearInterval(phoneTimer.current); setStep(DEMO_NAV[i]) }} style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:13, cursor:'pointer', opacity:active?1:0.42, transition:'opacity .3s' }}>
                    <div style={{ width:32,height:32,borderRadius:9,background:active?'linear-gradient(135deg,#fb923c,#ea6800)':'#13161b',border:active?'none':'1px solid rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:13,flexShrink:0,transition:'background .3s',color:'#fff' }}>{i+1}</div>
                    <div style={{ flex:1, paddingTop:4 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:active?'#eef1f6':'#8b94a3' }}>{label}</div>
                      <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>{demoSubs[i][lang]||demoSubs[i].en}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Browser (FeatureShowcase) ── */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:24 }}>
            {/* Mockup */}
            <div style={{ position:'relative', width:'100%', maxWidth:420 }}>
              <div style={{ position:'absolute', inset:-40, background:`radial-gradient(ellipse at center,${f.accent}0d,transparent 65%)`, pointerEvents:'none', transition:'all .5s' }} />
              <div style={{ background:'#0e1116', border:`1px solid ${f.accentBorder}`, borderRadius:18, overflow:'hidden', boxShadow:`0 40px 100px -30px rgba(0,0,0,.9), 0 0 0 1px ${f.accent}18`, position:'relative', transition:'border-color .4s,box-shadow .4s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 14px', borderBottom:`1px solid ${f.accentBorder}`, background:'#080a0e' }}>
                  {['#ef4444','#f59e0b','#22c55e'].map(c=><span key={c} style={{ width:9,height:9,borderRadius:'50%',background:c,display:'inline-block' }} />)}
                  <span style={{ marginLeft:7, fontSize:11, color:'#334155', fontWeight:600 }}>flotadsp.com/panel</span>
                  <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4, background:f.accentLight, border:`1px solid ${f.accentBorder}`, borderRadius:6, padding:'2px 8px' }}>
                    <span style={{ fontSize:10, color:f.accent, fontWeight:700 }}>{f.icon} {f.label}</span>
                  </div>
                </div>
                <div style={{ minHeight:340 }}>{browserScreens[tab]}</div>
              </div>
            </div>

            {/* Feature tabs debajo del browser */}
            <div style={{ width:'100%', maxWidth:420 }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:f.accentLight, border:`1px solid ${f.accentBorder}`, borderRadius:99, padding:'4px 14px', fontSize:11, fontWeight:700, color:f.accent, letterSpacing:'.06em', textTransform:'uppercase', marginBottom:16, transition:'all .4s' }}>
                {f.icon} {f.label}
              </div>
              {FEATURES.map((feat,i) => {
                const active = tab === i
                return (
                  <div key={i} onClick={() => { clearInterval(browserTimer.current); setTab(i) }} style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:13, cursor:'pointer', opacity:active?1:0.42, transition:'opacity .3s' }}>
                    <div style={{ width:32,height:32,borderRadius:9,background:active?`linear-gradient(135deg,${feat.accent},${feat.accent}99)`:'#13161b',border:active?'none':'1px solid rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0,transition:'background .3s',boxShadow:active?`0 3px 14px ${feat.accent}40`:'none' }}>{feat.icon}</div>
                    <div style={{ flex:1, paddingTop:4 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:active?'#eef1f6':'#8b94a3' }}>{feat.label}</div>
                      <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>{feat.sub}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

export default function Landing() {
  const { t, lang } = useT()
  const tl = useLD()
  const { setLang } = useT()
  const [demoBusy, setDemoBusy] = useState(false)

  // Demo sin registro: pide un token de solo lectura y entra al panel
  async function openDemo() {
    if (demoBusy) return
    setDemoBusy(true)
    try {
      const r = await fetch(`${API_BASE}/auth/demo-login`, { method: 'POST' })
      const j = await r.json()
      if (j?.access_token) {
        localStorage.setItem('flotadsp_token', j.access_token)
        localStorage.setItem('flotadsp_admin', JSON.stringify({
          name: j.name, role: j.role, id: j.id, account_type: j.account_type,
          slug: j.slug, centers: j.centers || [],
        }))
        window.location.href = '/panel'
        return
      }
    } catch { /* backend caído: no romper la landing */ }
    setDemoBusy(false)
  }

  return (
    <div style={{ background: '#080a0e', color: '#eef1f6', fontFamily: 'Inter Variable,Inter,system-ui,sans-serif', overflowX: 'hidden' }}>

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
            <a href="/registro" style={{ background: 'linear-gradient(135deg,#fb923c,#ea6800)', color: '#fff', textDecoration: 'none', padding: '7px 16px', borderRadius: 9, fontSize: 13, fontWeight: 800 }}>{t('nav.try')}</a>
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
              <span style={{ background: 'linear-gradient(120deg,#fb923c 20%,#fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t('hero.title2')}</span>.
            </h1>
            <p style={{ fontSize: 16.5, color: '#94a3b8', maxWidth: 500, margin: '0 0 30px', lineHeight: 1.65 }}>{t('hero.sub')}</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <a href="/registro" style={{ background: 'linear-gradient(135deg,#fb923c,#ea6800)', color: '#fff', textDecoration: 'none', padding: '14px 24px', borderRadius: 12, fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {t('hero.ctaTry')} <ArrowRight size={16} />
              </a>
              <a href="/planes" style={{ background: 'rgba(255,255,255,.05)', color: '#eef1f6', textDecoration: 'none', padding: '14px 24px', borderRadius: 12, fontSize: 15, fontWeight: 700, border: '1px solid rgba(255,255,255,.1)' }}>
                {t('hero.ctaPlans')}
              </a>
              <button onClick={openDemo} disabled={demoBusy}
                style={{ background: 'transparent', color: '#8b94a3', padding: '14px 18px', borderRadius: 12, fontSize: 14, fontWeight: 700, border: '1px dashed rgba(255,255,255,.18)', cursor: 'pointer', opacity: demoBusy ? .6 : 1 }}>
                {demoBusy ? '…' : `▶ ${t('hero.ctaDemo')}`}
              </button>
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

      {/* ── DUAL DEMO ── */}
      <DualDemo />

      {/* ── ROI ── */}
      <section style={{ borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
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
            <a href="/registro" style={{ background: 'linear-gradient(135deg,#fb923c,#ea6800)', color: '#fff', textDecoration: 'none', padding: '15px 32px', borderRadius: 12, fontSize: 16, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
