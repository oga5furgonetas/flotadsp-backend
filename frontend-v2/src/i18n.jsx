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
  'how.t':   { es: 'Cómo funciona', en: 'How it works', fr: 'Comment ça marche', de: 'So funktioniert es', it: 'Come funziona', pt: 'Como funciona' },
  'how.1t':  { es: 'El conductor hace la foto', en: 'The driver takes the photo', fr: 'Le chauffeur prend la photo', de: 'Der Fahrer macht das Foto', it: 'L’autista scatta la foto', pt: 'O motorista tira a foto' },
  'how.1d':  { es: 'Desde su móvil, con tu enlace. En 30 segundos.', en: 'From their phone, with your link. In 30 seconds.', fr: 'Depuis son mobile, avec votre lien. En 30 secondes.', de: 'Vom Handy, mit deinem Link. In 30 Sekunden.', it: 'Dal cellulare, col tuo link. In 30 secondi.', pt: 'Do telemóvel, com o teu link. Em 30 segundos.' },
  'how.2t':  { es: 'La IA detecta los daños', en: 'AI detects the damage', fr: 'L’IA détecte les dommages', de: 'Die KI erkennt Schäden', it: 'L’IA rileva i danni', pt: 'A IA deteta os danos' },
  'how.2d':  { es: 'Marca cada daño con su recuadro y lo valora al momento.', en: 'Boxes each damage and values it instantly.', fr: 'Encadre chaque dommage et l’évalue instantanément.', de: 'Markiert jeden Schaden und bewertet ihn sofort.', it: 'Inquadra ogni danno e lo valuta subito.', pt: 'Marca cada dano e avalia-o na hora.' },
  'how.3t':  { es: 'Tú lo controlas todo', en: 'You control everything', fr: 'Vous contrôlez tout', de: 'Du hast alles im Griff', it: 'Tu controlli tutto', pt: 'Controlas tudo' },
  'how.3d':  { es: 'Flota, conductores, ITV e incidencias en un panel.', en: 'Fleet, drivers, MOT and issues in one dashboard.', fr: 'Flotte, chauffeurs, contrôle technique et incidents en un tableau.', de: 'Flotte, Fahrer, TÜV und Vorfälle in einem Dashboard.', it: 'Flotta, autisti, revisione e problemi in un pannello.', pt: 'Frota, motoristas, inspeção e incidências num painel.' },
  'show.tag':   { es: 'Detección con IA', en: 'AI detection', fr: 'Détection IA', de: 'KI-Erkennung', it: 'Rilevamento IA', pt: 'Deteção com IA' },
  'show.t':     { es: 'Cada daño, detectado y documentado', en: 'Every damage, detected and documented', fr: 'Chaque dommage, détecté et documenté', de: 'Jeder Schaden, erkannt und dokumentiert', it: 'Ogni danno, rilevato e documentato', pt: 'Cada dano, detetado e documentado' },
  'show.d':     { es: 'La IA marca el daño con su recuadro exacto. Prueba ante Amazon, menos disputas, menos cargos.', en: 'AI boxes the exact damage. Proof for Amazon, fewer disputes, fewer charges.', fr: 'L’IA encadre le dommage exact. Preuve pour Amazon, moins de litiges, moins de frais.', de: 'Die KI markiert den genauen Schaden. Beweis für Amazon, weniger Streit, weniger Kosten.', it: 'L’IA inquadra il danno esatto. Prova per Amazon, meno dispute, meno addebiti.', pt: 'A IA marca o dano exato. Prova para a Amazon, menos disputas, menos custos.' },
  'show.label': { es: 'Daño detectado', en: 'Damage detected', fr: 'Dommage détecté', de: 'Schaden erkannt', it: 'Danno rilevato', pt: 'Dano detetado' },
  'score.tag':  { es: 'Próximamente', en: 'Coming soon', fr: 'Bientôt', de: 'Demnächst', it: 'Prossimamente', pt: 'Brevemente' },
  'score.t':    { es: 'Predicción de tu Scorecard de Amazon', en: 'Predict your Amazon Scorecard', fr: 'Prédisez votre Scorecard Amazon', de: 'Prognostiziere deine Amazon-Scorecard', it: 'Prevedi la tua Scorecard Amazon', pt: 'Prevê a tua Scorecard da Amazon' },
  'score.d':    { es: 'Sube tus reportes y sabrás qué nota vas a sacar antes de que salga. Pronto disponible.', en: 'Upload your reports and know your score before it’s published. Available soon.', fr: 'Importez vos rapports et connaissez votre note avant publication. Bientôt disponible.', de: 'Lade deine Berichte hoch und kenne deine Note vor der Veröffentlichung. Bald verfügbar.', it: 'Carica i tuoi report e scopri il voto prima della pubblicazione. Presto disponibile.', pt: 'Carrega os teus relatórios e sabe a nota antes de sair. Em breve.' },
  'roi.t':   { es: 'Cuánto te ahorras', en: 'How much you save', fr: 'Combien vous économisez', de: 'Wie viel du sparst', it: 'Quanto risparmi', pt: 'Quanto poupas' },
  'roi.sub': { es: 'Una sola cosa de estas ya paga FlotaDSP muchas veces.', en: 'Just one of these pays for FlotaDSP many times over.', fr: 'Une seule de ces choses rentabilise FlotaDSP largement.', de: 'Schon eines davon zahlt FlotaDSP um ein Vielfaches.', it: 'Basta una di queste per ripagare FlotaDSP molte volte.', pt: 'Só uma destas já paga o FlotaDSP muitas vezes.' },
  'roi.1t':  { es: 'Evita cargos por daños', en: 'Avoid damage charges', fr: 'Évitez les frais de dommages', de: 'Vermeide Schadenskosten', it: 'Evita addebiti per danni', pt: 'Evita cobranças por danos' },
  'roi.1d':  { es: 'Un daño no documentado puede costarte 300–1.500 € que acabas pagando tú. Con foto + IA al entregar, tienes la prueba y no pagas lo que no causaste.', en: 'An undocumented damage can cost you €300–1,500 that you end up paying. With photo + AI at handover, you have proof and don’t pay for what you didn’t cause.', fr: 'Un dommage non documenté peut vous coûter 300–1 500 € que vous finissez par payer. Avec photo + IA à la remise, vous avez la preuve.', de: 'Ein nicht dokumentierter Schaden kann dich 300–1.500 € kosten. Mit Foto + KI bei der Übergabe hast du den Beweis.', it: 'Un danno non documentato può costarti 300–1.500 € che paghi tu. Con foto + IA alla consegna, hai la prova.', pt: 'Um dano não documentado pode custar-te 300–1.500 € que acabas a pagar. Com foto + IA, tens a prova.' },
  'roi.2t':  { es: 'Cero multas de ITV', en: 'Zero MOT fines', fr: 'Zéro amende de contrôle technique', de: 'Keine TÜV-Bußgelder', it: 'Zero multe di revisione', pt: 'Zero multas de inspeção' },
  'roi.2d':  { es: 'Te avisamos antes de que caduque. Una multa más la furgoneta parada son cientos de euros y entregas perdidas.', en: 'We alert you before it expires. A fine plus the van off-road is hundreds of euros and lost deliveries.', fr: 'On vous alerte avant l’expiration. Une amende plus la camionnette immobilisée, c’est des centaines d’euros.', de: 'Wir warnen vor Ablauf. Bußgeld plus stillgelegter Transporter = Hunderte Euro.', it: 'Ti avvisiamo prima della scadenza. Multa più furgone fermo = centinaia di euro.', pt: 'Avisamos antes de expirar. Multa mais a carrinha parada são centenas de euros.' },
  'roi.3t':  { es: 'Conductores que cuidan', en: 'Drivers who take care', fr: 'Des chauffeurs qui font attention', de: 'Fahrer, die aufpassen', it: 'Autisti che hanno cura', pt: 'Motoristas que cuidam' },
  'roi.3d':  { es: 'Cuando saben que se registra todo, hay menos daños por descuido. El scoring premia a los que cuidan tu flota.', en: 'When they know everything is logged, there’s less careless damage. Scoring rewards those who care for your fleet.', fr: 'Quand tout est enregistré, moins de dommages par négligence. Le scoring récompense le soin.', de: 'Wenn alles erfasst wird, weniger Schäden durch Unachtsamkeit. Scoring belohnt sorgsame Fahrer.', it: 'Sapendo che tutto è registrato, meno danni per disattenzione. Lo scoring premia chi ha cura.', pt: 'Sabendo que tudo fica registado, há menos danos por descuido. O scoring premeia quem cuida.' },
  'roi.4t':  { es: 'Menos horas gestionando', en: 'Fewer hours managing', fr: 'Moins d’heures de gestion', de: 'Weniger Verwaltungsstunden', it: 'Meno ore di gestione', pt: 'Menos horas a gerir' },
  'roi.4d':  { es: 'Flota, conductores, ITV e incidencias en un panel. Lo que antes te llevaba toda la mañana, en minutos.', en: 'Fleet, drivers, MOT and issues in one dashboard. What took all morning, in minutes.', fr: 'Flotte, chauffeurs, contrôle technique et incidents en un tableau. Ce qui prenait une matinée, en minutes.', de: 'Flotte, Fahrer, TÜV und Vorfälle in einem Dashboard. Was Stunden dauerte, in Minuten.', it: 'Flotta, autisti, revisione e problemi in un pannello. Ciò che richiedeva ore, in minuti.', pt: 'Frota, motoristas, inspeção e incidências num painel. O que demorava horas, em minutos.' },
  'found.t': { es: 'Oferta de socio fundador', en: 'Founding member offer', fr: 'Offre membre fondateur', de: 'Gründungsmitglied-Angebot', it: 'Offerta socio fondatore', pt: 'Oferta sócio fundador' },
  'found.d': { es: 'Los primeros DSP que entren fijan -30% de por vida. Cuando lleguen los demás, tú sigues con tu precio. Plazas limitadas.', en: 'The first DSPs lock in -30% for life. When others arrive, you keep your price. Limited spots.', fr: 'Les premiers DSP obtiennent -30 % à vie. Quand les autres arrivent, vous gardez votre prix. Places limitées.', de: 'Die ersten DSPs sichern sich -30% auf Lebenszeit. Begrenzte Plätze.', it: 'I primi DSP bloccano -30% a vita. Posti limitati.', pt: 'Os primeiros DSPs fixam -30% para sempre. Vagas limitadas.' },
  'cta.t':      { es: 'Empieza a controlar tu flota hoy', en: 'Start controlling your fleet today', fr: 'Maîtrisez votre flotte dès aujourd’hui', de: 'Übernimm heute die Kontrolle über deine Flotte', it: 'Inizia a controllare la flotta oggi', pt: 'Começa a controlar a tua frota hoje' },
  'cta.d':      { es: '14 días gratis. Sin tarjeta. Sin permanencia.', en: '14 days free. No card. No commitment.', fr: '14 jours gratuits. Sans carte. Sans engagement.', de: '14 Tage gratis. Ohne Karte. Ohne Bindung.', it: '14 giorni gratis. Senza carta. Senza vincoli.', pt: '14 dias grátis. Sem cartão. Sem fidelização.' },

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

  'pl.title':   { es: 'Planes y precios', en: 'Plans & pricing', fr: 'Forfaits et tarifs', de: 'Pläne & Preise', it: 'Piani e prezzi', pt: 'Planos e preços' },
  'pl.sub':     { es: 'Gestiona tu flota y ahorra en daños. Sin permanencia.', en: 'Manage your fleet and save on damages. No commitment.', fr: 'Gérez votre flotte et économisez sur les dommages. Sans engagement.', de: 'Verwalte deine Flotte und spare bei Schäden. Ohne Bindung.', it: 'Gestisci la flotta e risparmia sui danni. Senza vincoli.', pt: 'Gere a tua frota e poupa em danos. Sem fidelização.' },
  'pl.beta':    { es: 'Beta: prueba todo gratis, los pagos abren pronto', en: 'Beta: try everything free, payments coming soon', fr: 'Bêta : tout gratuit, paiements bientôt', de: 'Beta: alles gratis, Zahlungen bald', it: 'Beta: tutto gratis, pagamenti in arrivo', pt: 'Beta: tudo grátis, pagamentos em breve' },
  'pl.mo':      { es: '/mes', en: '/mo', fr: '/mois', de: '/Mon.', it: '/mese', pt: '/mês' },
  'pl.free':    { es: 'Gratis', en: 'Free', fr: 'Gratuit', de: 'Gratis', it: 'Gratis', pt: 'Grátis' },
  'pl.days':    { es: '14 días', en: '14 days', fr: '14 jours', de: '14 Tage', it: '14 giorni', pt: '14 dias' },
  'pl.start':   { es: 'Empezar gratis', en: 'Start free', fr: 'Commencer', de: 'Kostenlos starten', it: 'Inizia gratis', pt: 'Começar grátis' },
  'pl.choose':  { es: 'Empezar', en: 'Get started', fr: 'Choisir', de: 'Loslegen', it: 'Inizia', pt: 'Começar' },
  'pl.popular': { es: 'Más popular', en: 'Most popular', fr: 'Le plus choisi', de: 'Am beliebtesten', it: 'Più scelto', pt: 'Mais popular' },
  'pl.who.trial': { es: 'Para probarlo', en: 'To try it out', fr: 'Pour essayer', de: 'Zum Ausprobieren', it: 'Per provare', pt: 'Para experimentar' },
  'pl.who.s':   { es: 'DSP pequeño', en: 'Small DSP', fr: 'Petit DSP', de: 'Kleiner DSP', it: 'Piccolo DSP', pt: 'DSP pequeno' },
  'pl.who.p':   { es: 'El DSP típico', en: 'The typical DSP', fr: 'Le DSP type', de: 'Der typische DSP', it: 'Il DSP tipico', pt: 'O DSP típico' },
  'pl.who.f':   { es: 'Multi-estación', en: 'Multi-station', fr: 'Multi-stations', de: 'Multi-Station', it: 'Multi-stazione', pt: 'Multi-estação' },
  'pl.feat.all':   { es: 'Acceso a todo', en: 'Access to everything', fr: 'Accès à tout', de: 'Zugang zu allem', it: 'Accesso a tutto', pt: 'Acesso a tudo' },
  'pl.feat.nocard':{ es: 'Sin tarjeta', en: 'No card', fr: 'Sans carte', de: 'Ohne Karte', it: 'Senza carta', pt: 'Sem cartão' },
  'pl.feat.1c':    { es: '1 centro', en: '1 station', fr: '1 dépôt', de: '1 Station', it: '1 sede', pt: '1 centro' },
  'pl.feat.25':    { es: 'Hasta 25 furgonetas', en: 'Up to 25 vans', fr: "Jusqu'à 25 camionnettes", de: 'Bis zu 25 Transporter', it: 'Fino a 25 furgoni', pt: 'Até 25 carrinhas' },
  'pl.feat.insp':  { es: 'Inspecciones + ITV', en: 'Inspections + MOT', fr: 'Inspections + contrôle technique', de: 'Inspektionen + TÜV', it: 'Ispezioni + revisione', pt: 'Inspeções + inspeção' },
  'pl.feat.3c':    { es: 'Hasta 3 centros', en: 'Up to 3 stations', fr: "Jusqu'à 3 dépôts", de: 'Bis zu 3 Stationen', it: 'Fino a 3 sedi', pt: 'Até 3 centros' },
  'pl.feat.unl':   { es: 'Furgonetas ilimitadas', en: 'Unlimited vans', fr: 'Camionnettes illimitées', de: 'Unbegrenzte Transporter', it: 'Furgoni illimitati', pt: 'Carrinhas ilimitadas' },
  'pl.feat.allm':  { es: 'Todos los módulos', en: 'All modules', fr: 'Tous les modules', de: 'Alle Module', it: 'Tutti i moduli', pt: 'Todos os módulos' },
  'pl.feat.prio':  { es: 'Soporte prioritario', en: 'Priority support', fr: 'Support prioritaire', de: 'Priorisierter Support', it: 'Supporto prioritario', pt: 'Suporte prioritário' },
  'pl.feat.unlc':  { es: 'Centros ilimitados', en: 'Unlimited stations', fr: 'Dépôts illimités', de: 'Unbegrenzte Stationen', it: 'Sedi illimitate', pt: 'Centros ilimitados' },
  'pl.note':    { es: 'Socios fundadores: los primeros DSP fijan -30% de por vida. Paga anual y llévate 2 meses gratis.', en: 'Founding members: first DSPs lock in -30% for life. Pay yearly, get 2 months free.', fr: 'Membres fondateurs : les premiers DSP bénéficient de -30 % à vie. Paiement annuel = 2 mois offerts.', de: 'Gründungsmitglieder: erste DSPs erhalten -30% auf Lebenszeit. Jährlich zahlen = 2 Monate gratis.', it: 'Soci fondatori: i primi DSP bloccano -30% a vita. Paghi annuale = 2 mesi gratis.', pt: 'Sócios fundadores: os primeiros DSPs fixam -30% para sempre. Paga anual e leva 2 meses grátis.' },

  'bill.title':  { es: 'Tu suscripción', en: 'Your subscription', fr: 'Votre abonnement', de: 'Dein Abo', it: 'Il tuo abbonamento', pt: 'A tua subscrição' },
  'bill.trial':  { es: 'En prueba', en: 'On trial', fr: 'En essai', de: 'Testphase', it: 'In prova', pt: 'Em teste' },
  'bill.daysleft': { es: 'días restantes', en: 'days left', fr: 'jours restants', de: 'Tage übrig', it: 'giorni rimasti', pt: 'dias restantes' },
  'bill.active': { es: 'Suscripción activa', en: 'Active subscription', fr: 'Abonnement actif', de: 'Abo aktiv', it: 'Abbonamento attivo', pt: 'Subscrição ativa' },
  'bill.soon':   { es: 'Pagos próximamente — estamos terminando de conectarlos.', en: 'Payments coming soon — we’re finishing the setup.', fr: 'Paiements bientôt — finalisation en cours.', de: 'Zahlungen bald — wir richten sie ein.', it: 'Pagamenti in arrivo — stiamo completando.', pt: 'Pagamentos em breve — a terminar a ligação.' },
  'bill.sub':    { es: 'Suscribirse', en: 'Subscribe', fr: 'S’abonner', de: 'Abonnieren', it: 'Abbonati', pt: 'Subscrever' },
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
