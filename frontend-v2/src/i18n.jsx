import { createContext, useContext, useState, useCallback } from 'react'

export const LANGS = { es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português' }

// Diccionarios. Clave → texto por idioma. Fallback a inglés y luego a la clave.
const DICT = {
  'nav.login':        { es: 'Entrar', en: 'Log in', fr: 'Connexion', de: 'Anmelden', it: 'Accedi', pt: 'Entrar' },
  'nav.plans':        { es: 'Planes', en: 'Pricing', fr: 'Tarifs', de: 'Preise', it: 'Prezzi', pt: 'Planos' },
  'nav.try':          { es: 'Probar gratis', en: 'Try free', fr: 'Essai gratuit', de: 'Kostenlos testen', it: 'Prova gratis', pt: 'Testar grátis' },
  'hero.badge':       { es: 'Prueba todo gratis · sin tarjeta', en: 'Try everything free · no card', fr: 'Tout gratuit · sans carte', de: 'Alles gratis testen · ohne Karte', it: 'Tutto gratis · senza carta', pt: 'Tudo grátis · sem cartão' },
  'hero.title1':      { es: 'Tu flota de furgonetas,', en: 'Your delivery fleet,', fr: 'Votre flotte de camionnettes,', de: 'Deine Lieferflotte,', it: 'La tua flotta di furgoni,', pt: 'A tua frota de carrinhas,' },
  'hero.title2':      { es: 'bajo control', en: 'under control', fr: 'sous contrôle', de: 'unter Kontrolle', it: 'sotto controllo', pt: 'sob controlo' },
  'hero.sub':         { es: 'Inspecciones con foto, avisos de ITV, scoring de conductores y mantenimiento — todo en un sitio. Para DSPs de Amazon. Ahorra en daños y evita multas.',
                        en: 'Photo inspections, MOT alerts, driver scoring and maintenance — all in one place. Built for Amazon DSPs. Save on damages, avoid fines.',
                        fr: "Inspections photo, alertes contrôle technique, scoring des chauffeurs et entretien — tout au même endroit. Pour les DSP Amazon. Économisez sur les dommages, évitez les amendes.",
                        de: 'Foto-Inspektionen, TÜV-Warnungen, Fahrer-Scoring und Wartung — alles an einem Ort. Für Amazon-DSPs. Spare bei Schäden, vermeide Bußgelder.',
                        it: 'Ispezioni fotografiche, avvisi revisione, scoring autisti e manutenzione — tutto in un posto. Per DSP Amazon. Risparmia sui danni, evita multe.',
                        pt: 'Inspeções com foto, alertas de inspeção, scoring de motoristas e manutenção — tudo num só lugar. Para DSPs da Amazon. Poupa em danos e evita multas.' },
  'hero.ctaTry':      { es: 'Crear cuenta gratis', en: 'Create free account', fr: 'Créer un compte gratuit', de: 'Kostenloses Konto', it: 'Crea account gratis', pt: 'Criar conta grátis' },
  'hero.ctaPlans':    { es: 'Ver planes y precios', en: 'See pricing', fr: 'Voir les tarifs', de: 'Preise ansehen', it: 'Vedi prezzi', pt: 'Ver planos' },
  'hero.mini':        { es: '14 días gratis · sin tarjeta · tus conductores suben fotos desde el móvil', en: '14 days free · no card · drivers upload photos from their phone', fr: '14 jours gratuits · sans carte · les chauffeurs envoient les photos depuis leur mobile', de: '14 Tage gratis · ohne Karte · Fahrer laden Fotos vom Handy hoch', it: '14 giorni gratis · senza carta · gli autisti caricano foto dal cellulare', pt: '14 dias grátis · sem cartão · motoristas enviam fotos do telemóvel' },
  'f1.t': { es: 'Inspecciones con IA', en: 'AI inspections', fr: 'Inspections par IA', de: 'KI-Inspektionen', it: 'Ispezioni con IA', pt: 'Inspeções com IA' },
  'f1.d': { es: 'Tus conductores fotografían la furgoneta y se detectan daños al momento. Menos disputas, menos cargos.', en: 'Drivers photograph the van and damage is detected instantly. Fewer disputes, fewer charges.', fr: 'Les chauffeurs photographient la camionnette et les dommages sont détectés instantanément. Moins de litiges, moins de frais.', de: 'Fahrer fotografieren den Transporter, Schäden werden sofort erkannt. Weniger Streit, weniger Kosten.', it: 'Gli autisti fotografano il furgone e i danni si rilevano subito. Meno dispute, meno addebiti.', pt: 'Os motoristas fotografam a carrinha e os danos são detetados na hora. Menos disputas, menos custos.' },
  'f2.t': { es: 'Avisos de ITV', en: 'MOT alerts', fr: 'Alertes contrôle technique', de: 'TÜV-Warnungen', it: 'Avvisi revisione', pt: 'Alertas de inspeção' },
  'f2.d': { es: 'Te avisa antes de que caduque la ITV de cada furgoneta. Nunca más una multa por despiste.', en: 'Get alerted before each van’s MOT expires. Never get fined for forgetting again.', fr: "Soyez alerté avant l'expiration du contrôle technique. Plus jamais d'amende par oubli.", de: 'Werde gewarnt, bevor der TÜV abläuft. Nie wieder ein Bußgeld aus Versehen.', it: 'Avviso prima che scada la revisione. Mai più multe per dimenticanza.', pt: 'Avisa antes de expirar a inspeção. Nunca mais uma multa por esquecimento.' },
  'f3.t': { es: 'Scoring de conductores', en: 'Driver scoring', fr: 'Scoring des chauffeurs', de: 'Fahrer-Scoring', it: 'Scoring autisti', pt: 'Scoring de motoristas' },
  'f3.d': { es: 'Ranking justo por cumplimiento, puntualidad y conservación. Sabes quién cuida la flota.', en: 'Fair ranking by compliance, punctuality and care. Know who looks after the fleet.', fr: 'Classement juste par conformité, ponctualité et soin. Sachez qui prend soin de la flotte.', de: 'Faires Ranking nach Compliance, Pünktlichkeit und Pflege. Wisse, wer auf die Flotte achtet.', it: 'Classifica equa per conformità, puntualità e cura. Sai chi tiene alla flotta.', pt: 'Ranking justo por cumprimento, pontualidade e cuidado. Sabes quem cuida da frota.' },
  'f4.t': { es: 'Tus datos, solo tuyos', en: 'Your data, only yours', fr: 'Vos données, rien qu’à vous', de: 'Deine Daten, nur deine', it: 'I tuoi dati, solo tuoi', pt: 'Os teus dados, só teus' },
  'f4.d': { es: 'Cada empresa con su espacio aislado y su propio enlace para los conductores. Privado y seguro.', en: 'Each company with its own isolated space and driver link. Private and secure.', fr: 'Chaque entreprise avec son espace isolé et son lien chauffeurs. Privé et sécurisé.', de: 'Jedes Unternehmen mit eigenem isolierten Bereich und Fahrer-Link. Privat und sicher.', it: 'Ogni azienda con spazio isolato e link autisti. Privato e sicuro.', pt: 'Cada empresa com o seu espaço isolado e link para motoristas. Privado e seguro.' },
  'foot.have':        { es: '¿Ya tienes cuenta?', en: 'Already have an account?', fr: 'Déjà un compte ?', de: 'Schon ein Konto?', it: 'Hai già un account?', pt: 'Já tens conta?' },
  'foot.login':       { es: 'Inicia sesión', en: 'Log in', fr: 'Connectez-vous', de: 'Anmelden', it: 'Accedi', pt: 'Inicia sessão' },

  'login.title':   { es: 'Entra en tu empresa', en: 'Log in to your company', fr: 'Connexion à votre entreprise', de: 'Bei deinem Unternehmen anmelden', it: 'Accedi alla tua azienda', pt: 'Entra na tua empresa' },
  'login.user':    { es: 'Usuario', en: 'Username', fr: 'Identifiant', de: 'Benutzer', it: 'Utente', pt: 'Utilizador' },
  'login.pass':    { es: 'Contraseña', en: 'Password', fr: 'Mot de passe', de: 'Passwort', it: 'Password', pt: 'Palavra-passe' },
  'login.btn':     { es: 'Entrar', en: 'Log in', fr: 'Se connecter', de: 'Anmelden', it: 'Accedi', pt: 'Entrar' },
  'login.err':     { es: 'Usuario o contraseña incorrectos', en: 'Wrong username or password', fr: 'Identifiant ou mot de passe incorrect', de: 'Benutzer oder Passwort falsch', it: 'Utente o password errati', pt: 'Utilizador ou palavra-passe incorretos' },
  'login.no':      { es: '¿No tienes cuenta?', en: 'No account?', fr: 'Pas de compte ?', de: 'Kein Konto?', it: 'Nessun account?', pt: 'Sem conta?' },
  'login.create':  { es: 'Crear empresa', en: 'Create company', fr: 'Créer une entreprise', de: 'Unternehmen erstellen', it: 'Crea azienda', pt: 'Criar empresa' },

  'reg.title':     { es: 'Crea tu empresa', en: 'Create your company', fr: 'Créez votre entreprise', de: 'Erstelle dein Unternehmen', it: 'Crea la tua azienda', pt: 'Cria a tua empresa' },
  'reg.sub':       { es: 'Gestiona tu flota. 14 días de prueba, sin tarjeta.', en: 'Manage your fleet. 14-day trial, no card.', fr: 'Gérez votre flotte. 14 jours d’essai, sans carte.', de: 'Verwalte deine Flotte. 14 Tage Test, ohne Karte.', it: 'Gestisci la tua flotta. 14 giorni di prova, senza carta.', pt: 'Gere a tua frota. 14 dias grátis, sem cartão.' },
  'reg.company':   { es: 'Nombre de tu empresa', en: 'Company name', fr: 'Nom de l’entreprise', de: 'Firmenname', it: 'Nome azienda', pt: 'Nome da empresa' },
  'reg.url':       { es: 'La URL de tu empresa', en: 'Your company URL', fr: 'L’URL de votre entreprise', de: 'Deine Firmen-URL', it: 'L’URL della tua azienda', pt: 'O URL da tua empresa' },
  'reg.urlhint':   { es: 'Aquí entran tú y tus conductores. Solo letras, números y guiones.', en: 'Where you and your drivers log in. Letters, numbers and hyphens only.', fr: 'Où vous et vos chauffeurs vous connectez. Lettres, chiffres et tirets.', de: 'Hier melden sich du und deine Fahrer an. Nur Buchstaben, Zahlen, Bindestriche.', it: 'Qui accedete tu e i tuoi autisti. Solo lettere, numeri e trattini.', pt: 'Onde tu e os motoristas entram. Só letras, números e hífens.' },
  'reg.center':    { es: 'Código de tu centro / estación', en: 'Your station / depot code', fr: 'Code de votre dépôt', de: 'Code deiner Station', it: 'Codice della tua sede', pt: 'Código do teu centro' },
  'reg.btn':       { es: 'Crear cuenta y empezar', en: 'Create account and start', fr: 'Créer le compte et démarrer', de: 'Konto erstellen und starten', it: 'Crea account e inizia', pt: 'Criar conta e começar' },
  'reg.have':      { es: '¿Ya tienes cuenta?', en: 'Already registered?', fr: 'Déjà inscrit ?', de: 'Schon registriert?', it: 'Già registrato?', pt: 'Já registado?' },
  'reg.taken':     { es: 'Ese identificador ya está cogido, elige otro', en: 'That URL is taken, choose another', fr: 'Cet identifiant est pris, choisissez-en un autre', de: 'Diese URL ist vergeben, wähle eine andere', it: 'Quell’identificativo è già preso, scegline un altro', pt: 'Esse identificador já existe, escolhe outro' },

  'dash.welcome':  { es: 'Bienvenido', en: 'Welcome', fr: 'Bienvenue', de: 'Willkommen', it: 'Benvenuto', pt: 'Bem-vindo' },
  'dash.soon':     { es: 'Tu panel se está construyendo. Pronto verás aquí tu flota, conductores e inspecciones.', en: 'Your dashboard is being built. Soon you’ll see your fleet, drivers and inspections here.', fr: 'Votre tableau de bord est en cours de construction. Bientôt votre flotte, vos chauffeurs et vos inspections ici.', de: 'Dein Dashboard wird gebaut. Bald siehst du hier Flotte, Fahrer und Inspektionen.', it: 'La tua dashboard è in costruzione. Presto vedrai flotta, autisti e ispezioni qui.', pt: 'O teu painel está a ser construído. Em breve verás a tua frota, motoristas e inspeções aqui.' },
  'dash.logout':   { es: 'Cerrar sesión', en: 'Log out', fr: 'Déconnexion', de: 'Abmelden', it: 'Esci', pt: 'Sair' },
  'dash.vehicles': { es: 'Furgonetas', en: 'Vans', fr: 'Camionnettes', de: 'Transporter', it: 'Furgoni', pt: 'Carrinhas' },
  'dash.drivers':  { es: 'Conductores', en: 'Drivers', fr: 'Chauffeurs', de: 'Fahrer', it: 'Autisti', pt: 'Motoristas' },
  'dash.insp':     { es: 'Inspecciones', en: 'Inspections', fr: 'Inspections', de: 'Inspektionen', it: 'Ispezioni', pt: 'Inspeções' },
  'dash.linkT':    { es: 'Enlace para tus conductores', en: 'Link for your drivers', fr: 'Lien pour vos chauffeurs', de: 'Link für deine Fahrer', it: 'Link per i tuoi autisti', pt: 'Link para os teus motoristas' },
  'dash.linkD':    { es: 'Comparte este enlace con tus conductores. Entran, eligen su nombre y suben las fotos a TU empresa.', en: 'Share this link with your drivers. They open it, pick their name and upload photos to YOUR company.', fr: 'Partagez ce lien avec vos chauffeurs. Ils l’ouvrent, choisissent leur nom et envoient les photos à VOTRE entreprise.', de: 'Teile diesen Link mit deinen Fahrern. Sie öffnen ihn, wählen ihren Namen und laden Fotos zu DEINEM Unternehmen hoch.', it: 'Condividi questo link con i tuoi autisti. Lo aprono, scelgono il nome e caricano le foto nella TUA azienda.', pt: 'Partilha este link com os teus motoristas. Abrem, escolhem o nome e enviam fotos para a TUA empresa.' },
  'dash.copy':     { es: 'Copiar', en: 'Copy', fr: 'Copier', de: 'Kopieren', it: 'Copia', pt: 'Copiar' },
  'dash.copied':   { es: '¡Copiado!', en: 'Copied!', fr: 'Copié !', de: 'Kopiert!', it: 'Copiato!', pt: 'Copiado!' },
  'dash.recent':   { es: 'Últimas inspecciones', en: 'Recent inspections', fr: 'Inspections récentes', de: 'Letzte Inspektionen', it: 'Ispezioni recenti', pt: 'Inspeções recentes' },
  'dash.empty':    { es: 'Aún no hay datos. Sube tu primera furgoneta o pide a un conductor que suba fotos.', en: 'No data yet. Add your first van or have a driver upload photos.', fr: 'Pas encore de données. Ajoutez votre première camionnette ou demandez à un chauffeur d’envoyer des photos.', de: 'Noch keine Daten. Füge deinen ersten Transporter hinzu oder lass einen Fahrer Fotos hochladen.', it: 'Ancora nessun dato. Aggiungi il primo furgone o fai caricare foto a un autista.', pt: 'Ainda sem dados. Adiciona a tua primeira carrinha ou pede a um motorista para enviar fotos.' },
}

const LangCtx = createContext({ lang: 'es', setLang: () => {}, t: (k) => k })

function detect() {
  const saved = localStorage.getItem('flota_lang')
  if (saved && LANGS[saved]) return saved
  const nav = (navigator.language || 'es').slice(0, 2).toLowerCase()
  return LANGS[nav] ? nav : 'en'
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(detect)
  const setLang = useCallback((l) => { localStorage.setItem('flota_lang', l); setLangState(l) }, [])
  const t = useCallback((key) => {
    const e = DICT[key]
    if (!e) return key
    return e[lang] || e.en || key
  }, [lang])
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>
}

export const useT = () => useContext(LangCtx)
