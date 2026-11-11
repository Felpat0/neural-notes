# NEURAL//NOTES — Plan

PWA per prendere note con rich text, checklist legate a giorni o a note e promemoria push. Mobile first, layout dedicati per foldable e tablet, grafica in stile cyberpunk (neon giallo/ciano/rosso su fondo scuro, angoli tagliati, font tecnici).

Mockup: https://claude.ai/artifact/XeabCjRjZwEaN2uj4pEgbL (Oggi, Editor, Modifica inline + aggiunta rapida, Foldable, Tablet).

## Stack (come `../japan-trip`)

| Parte           | Scelta                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Framework       | SvelteKit 3, Svelte 5 (runes forzate in `vite.config.ts`), TypeScript                                            |
| Stile           | Tailwind 4 (`@tailwindcss/vite`), token del tema in `src/routes/layout.css`                                      |
| DB              | Neon Postgres (piano gratuito) con `drizzle-orm/neon-http`; PGlite in locale (`DATABASE_URL="pglite:./.pglite"`) |
| Migrazioni      | `drizzle-kit` (`db:generate`, `db:migrate`, `db:studio`)                                                         |
| Deploy          | Vercel, `@sveltejs/adapter-vercel` con `regions: ['fra1']` (vicino a Neon `eu-central-1`)                        |
| Push            | `web-push` + chiavi VAPID, service worker in `src/service-worker/`                                               |
| Cron            | cron-job.org ogni minuto → `/api/cron/notify` con `CRON_SECRET` (il cron di Vercel Hobby è solo giornaliero)     |
| Editor          | Tiptap 3 (`@tiptap/core` + starter-kit, senza wrapper React) montato in un'azione Svelte                         |
| Icone           | `@lucide/svelte`                                                                                                 |
| Env             | `src/env.ts` con `defineEnvVars`, come in japan-trip                                                             |
| Package manager | pnpm                                                                                                             |

Da japan-trip si riprendono quasi invariati: `lib/server/auth.ts` + `password.ts` + `password-rules.ts` (email/password scrypt, sessioni in DB, limite tentativi; da estendere con registrazione ed email), `lib/server/push.ts`, `lib/server/db/{index,local}.ts`, la struttura di `hooks.server.ts` (path pubblici, redirect a `/login`), il service worker (cache-first per gli statici, network-first per pagine e `__data.json`) e `scripts/icons.mjs` per le icone del manifest.

## Modello dati

```ts
user            id, email (unique, minuscolo), name,
                password_hash null,        // null per account solo Google
                email_verified_at null, google_sub null (unique),
                timezone ('Europe/Rome'), is_admin bool,   // il primo account è admin
                ai_enabled bool (default true), created_at
session         id, user_id, expires_at, remember bool, user_agent, last_seen_at   // come japan-trip
auth_token      id, user_id, kind ('verify' | 'reset'), token_hash, expires_at, used_at null, created_at
login_attempt   key ('email:…' | 'ip:…'), at                  // limite tentativi, come japan-trip
push_subscription endpoint (pk), user_id, p256dh, auth, user_agent, created_at

note            id, user_id, title, content jsonb (doc Tiptap), text (testo piano per la ricerca),
                day date null,            // nota assegnata a un giorno
                tags text[], pinned bool, ai_allowed bool (default false), archived_at, deleted_at, created_at, updated_at,
                rule_id null → note_rule.id      // occorrenza di una nota ricorrente
                unique (rule_id, day)

checklist       id, user_id,
                kind text,                // 'day' | 'note'
                day date null,            // solo kind = 'day'
                note_id null → note.id (on delete cascade), // solo kind = 'note'
                title null,               // solo kind = 'note'
                created_at
                unique (user_id, day) where kind = 'day'

todo            id, checklist_id, text, position, done_at null,
                rule_id null → todo_rule.id,   // occorrenza di un todo ricorrente
                created_at, updated_at
                unique (rule_id, checklist_id)

todo_rule       id, user_id, text, repeat text,  // 'daily' | 'weekdays' | 'weekly:1,3' | 'monthly:15'
                starts_on date, ends_on date null, remind_time time null

note_rule       id, user_id, template_note_id → note.id,  // nota modello (testo + checklist)
                repeat text, starts_on date, ends_on date null, remind_time time null

reminder        id, user_id, note_id null, todo_id null, rule_id null,
                fire_at timestamptz, title, body, sent_at null, created_at

google_account  user_id (pk), google_sub, email, refresh_token_enc, access_token_enc, expires_at,
                target_calendar_id,            // calendario "NEURAL//NOTES" creato dall'app
                read_calendar_ids text[],      // calendari mostrati nella home
                push_todos bool, push_untimed_todos bool, push_notes bool, pull_changes bool,
                watch_channel_id, watch_resource_id, watch_expires_at, last_sync_at

google_calendar_state user_id, calendar_id, sync_token, updated_at   // pk (user_id, calendar_id)

google_event_link user_id, google_event_id, kind ('todo' | 'note'), entity_id,
                google_etag, google_updated timestamptz, local_updated timestamptz
                // pk (user_id, google_event_id), unique (kind, entity_id)

app_setting     key (pk), value jsonb, updated_at       // modelli AI, come japan-trip

note_embedding  note_id (pk) → note.id, model, content_hash, embedding vector(768), updated_at
                // pgvector su Neon, indice HNSW (vector_cosine_ops)

ai_usage        user_id, day date, requests int, web_requests int   // pk (user_id, day)

google_outbox   id, user_id, kind, entity_id, op ('upsert' | 'delete'), attempts, created_at

google_event_cache user_id, calendar_id, event_id, start timestamptz, end timestamptz,
                all_day bool, title, location, updated   // eventi letti, per la home
```

Note sulle scelte:

- **Lista del giorno sempre presente**: ogni giorno ha una sola checklist `kind = 'day'`. Non esiste un comando per crearla: la riga viene creata con un upsert (`on conflict do nothing`) quando il giorno viene aperto o riceve il primo todo. Per l'utente esiste già, anche vuota; non si può rinominare né eliminare.
- **Note ricorrenti**: dal chip "↻ Ripeti" dell'editor una nota diventa il modello di una `note_rule` (es. "Riunione settimanale" ogni lunedì). Nei giorni previsti viene creata una copia (titolo, testo e checklist del modello, `day` = quel giorno, `rule_id`), che compare tra le card "Note di oggi" e si compila senza toccare le altre settimane. Modificare il modello cambia solo le copie future; la nota modello resta in un gruppo "Modelli" accessibile da `/ricorrenti`. Le copie si creano quando si apre il giorno (stesso meccanismo dei todo) e, per notifiche e Google Calendar, dal cron per i 7 giorni successivi.
- **Todo ricorrenti**: la regola sta in `todo_rule`; quando si carica un giorno, le occorrenze mancanti vengono create come righe `todo` (unicità su `rule_id` + `checklist_id`). Così ogni occorrenza si spunta, modifica o elimina da sola. Si sceglie se cambiare "solo questa" o "tutte le prossime".
- **Checklist dentro le note**: una nota può avere più checklist `kind = 'note'`; nel documento Tiptap c'è un nodo `checklistEmbed { checklistId }` disegnato con una NodeView Svelte. La stessa checklist si spunta dalla nota e dalla home quando la nota ha `day = oggi`.
- Ricerca: `ILIKE` su `title` e `text` delle note e su `todo.text`, poi indice `pg_trgm` quando serve.

## Account: registrazione, accesso, password dimenticata

Parte da `lib/server/auth.ts`, `password.ts` e `password-rules.ts` di japan-trip (scrypt, sessioni nel DB, limite tentativi), con in più la registrazione libera, l'invio di email e l'accesso con Google.

**Registrazione** (`/registrati`)

- Nome, email, password. Regole: almeno 10 caratteri, non tra le password più comuni (elenco in `password-rules.ts`), indicatore di robustezza a 4 tacche.
- Codice d'invito facoltativo: se `SIGNUP_CODE` è impostato la registrazione lo richiede, altrimenti è aperta; con `SIGNUP_MODE=closed` è disattivata (rimane solo l'accesso).
- L'account è subito utilizzabile; parte un'email di conferma con un link `/verifica/<token>` (24 ore). Finché l'email non è confermata compare un avviso nel Profilo con "Rinvia". La conferma serve per collegare Google con lo stesso indirizzo e per cambiare email.
- Se l'email esiste già la risposta è la stessa di una registrazione riuscita ("controlla la posta") e al proprietario arriva un'email "qualcuno ha provato a registrarsi con il tuo indirizzo, se eri tu accedi o reimposta la password". Così non si scopre chi è registrato.

**Accesso** (`/login`)

- Email e password; "Resta collegato su questo dispositivo" = sessione di 60 giorni rinnovata a ogni uso, altrimenti cookie di sessione del browser (12 ore).
- Dopo 10 tentativi sbagliati in 15 minuti (per email e per IP) si aspetta, come in japan-trip. Messaggio d'errore unico: "Email o password non corretti".
- Cookie `HttpOnly`, `Secure`, `SameSite=Lax`; le form action di SvelteKit controllano già l'origine (CSRF).
- `?next=` riporta alla pagina richiesta (solo percorsi interni).

**Continua con Google**

- Stesso client OAuth di Google Calendar, ma con i soli scope `openid email profile`; i permessi del calendario si chiedono dopo, dalle Impostazioni.
- Nuovo utente → account creato con `google_sub` ed email già confermata, senza password (può impostarla dal Profilo).
- Email già registrata e confermata → `google_sub` collegato a quell'account. Se l'account non ha ancora confermato l'email si chiede prima di accedere con la password, per evitare che qualcuno si appropri di un account registrato con un indirizzo altrui.

**Password dimenticata** (`/password-dimenticata` → email → `/reimposta/<token>`)

- Si inserisce l'email; la risposta è sempre "se esiste un account con questo indirizzo, l'email arriva entro qualche minuto". Pulsante "Rinvia" dopo 60 secondi; massimo 5 richieste all'ora per email e per IP.
- Token casuale di 32 byte, nel DB solo l'hash SHA-256 (`auth_token`), valido 1 ora e una sola volta; una nuova richiesta annulla le precedenti.
- La pagina mostra l'account, chiede la nuova password due volte e "Esci da tutti gli altri dispositivi" (attivo di default). Salvando: password aggiornata, token usato, sessioni chiuse, accesso fatto e email "la tua password è stata cambiata".
- Link scaduto o già usato → messaggio con "Chiedine uno nuovo".
- Funziona anche per gli account solo Google (serve a impostare una password).

**Email**

- Senza dominio proprio: **SMTP di Gmail** con `nodemailer` (`smtp.gmail.com:465`), da un account Gmail dedicato all'app (es. `neuralnotes.app@gmail.com`) con verifica in due passaggi e una **password per le app**. Limite di circa 500 destinatari al giorno; le email partono davvero da Gmail, quindi passano i controlli SPF/DKIM e non finiscono nello spam.
- `lib/server/mail.ts` espone solo `sendMail({ to, subject, html, text })`: se in futuro arriva un dominio si passa a Resend (3.000 email al mese gratis) cambiando solo le variabili d'ambiente.
- Recupero senza email: chi ha collegato Google può sempre rientrare con "Continua con Google" e impostare una nuova password dal Profilo.
- In sviluppo le email non partono: vengono stampate nel terminale con il link cliccabile.
- Modelli semplici (HTML + testo) nello stile dell'app: fascia gialla con il nome, pulsante giallo, link anche in chiaro.

**Profilo** (`/profilo`)

- Cambio nome, fuso, password (richiede quella attuale), email (conferma sul nuovo indirizzo prima di sostituirla).
- Sessioni attive con dispositivo e ultimo uso; "Esci" su una o "Esci da tutti gli altri".
- Elimina account: chiede la password (o Google), revoca il collegamento a Google Calendar, cancella tutti i dati a cascata.

## Home "Oggi"

Data di oggi nel fuso dell'utente (`user.timezone`). La query unisce:

Dall'alto in basso:

1. **Lista del giorno**, sempre presente, con il campo di aggiunta sempre visibile; include le occorrenze dei todo ricorrenti (`repeat` interpretato in `lib/repeat.ts`, testato a parte).
2. **In sospeso** (solo se ce ne sono): todo non fatti dei giorni passati, con "Porta a oggi" su ognuno e "Porta tutti a oggi". Un'impostazione li sposta in automatico a mezzanotte.
3. **Note di oggi**: una card per ogni nota con `note.day = oggi`, in ordine di promemoria e poi di aggiornamento. La card mostra titolo, prime righe del testo, promemoria e le checklist della nota, che si spuntano e si modificano direttamente nella card. Tocco sul titolo → apre la nota. Su foldable e tablet le card vanno su una griglia a due colonne (o nel pannello "Oggi").
4. **Note**, raggruppate per periodo con intestazioni fisse durante lo scorrimento:
   - **Oggi**: note create o modificate oggi (escluse quelle già nelle card);
   - **Questo mese**: il resto del mese corrente;
   - poi un gruppo per mese, dal più recente: **Ottobre 2026**, **Settembre 2026**, … (nome del mese con `Intl.DateTimeFormat('it', { month: 'long', year: 'numeric' })`).

   Il raggruppamento usa `updated_at` nel fuso dell'utente; le note fissate restano in cima al loro gruppo. Le note assegnate a un giorno futuro stanno in un gruppo **In arrivo** sopra "Oggi". Si caricano i primi tre mesi; "Mesi precedenti" (e lo scorrimento in fondo) carica i successivi con un cursore sulla data (`updated_at < :cursore`, `limit`), sfruttando un indice su `(user_id, updated_at desc)`.

Promemoria del giorno: compaiono come chip nelle card e nel pannello "Oggi" su tablet; un elenco a parte solo se non sono legati a note.

**Agenda** (se Google Calendar è collegato): dopo le card, gli eventi del giorno dei calendari scelti, in ordine di orario; quelli creati dall'app hanno il segno "↔ Nota" / "↔ Todo" e aprono l'elemento collegato.

La striscia della settimana apre un altro giorno (`/?giorno=2026-11-04`) con la sua lista e le sue note, con un indicatore rosso sui giorni che hanno contenuti; anche lì si aggiunge direttamente.

## Todo: aggiungere, modificare, eliminare

L'obiettivo è che ogni azione costi un tocco o un gesto, senza fogli, finestre di conferma o pagine di dettaglio.

- **Aggiungere**: campo "+ Aggiungi un todo…" sempre visibile in cima alla lista del giorno (e in fondo a ogni checklist delle note). Invio aggiunge e lascia il cursore nel campo per il todo successivo. Incollando più righe si crea un todo per riga.
- **Aggiunta rapida con riconoscimento** (`lib/quick-parse.ts`): "domani", "lun", "15/11" spostano il giorno; "15:00" crea un promemoria; "ogni lunedì" crea una regola. I riconoscimenti compaiono come chip sotto il campo e si tolgono con un tocco prima di inviare.
- **Spuntare**: tocco sulla casella (area di 44 px). I fatti scendono in fondo alla lista.
- **Modificare**: tocco sul testo → diventa un campo sul posto, con sotto le azioni Sposta giorno, Promemoria, Ripeti, Elimina. Invio o tocco fuori salva, Esc annulla, testo vuoto + Invio elimina.
- **Eliminare / rimandare**: scorrimento a sinistra mostra "Domani" ed "Elimina"; scorrimento completo elimina. Nessuna conferma: compare un avviso "Todo eliminato · ANNULLA" per 5 secondi.
- **Riordinare**: pressione lunga e trascinamento (su tablet una maniglia visibile al passaggio).
- **Tablet e tastiera**: X di eliminazione al passaggio del puntatore; scorciatoie N (nuovo), ↑/↓, Spazio (spunta), E o Invio (modifica), Canc (elimina), Ctrl+Z (annulla).
- **Aggiornamento ottimistico**: lo stato locale cambia subito e la richiesta parte in background verso `/api/todo` (`fetch` con JSON, senza ricaricare la pagina); in caso di errore si ripristina lo stato e compare un avviso. Più avanti la coda offline in IndexedDB riusa lo stesso canale.

## Notifiche

- Dal Profilo si attivano le push sul dispositivo (`PushManager.subscribe` con `PUBLIC_VAPID_KEY`, salvataggio in `/api/push`).
- Un promemoria si aggiunge a una nota (chip campanella nell'editor) o a un todo (azione Promemoria nella modifica sul posto, oppure un orario scritto nell'aggiunta rapida). Opzionale: un riepilogo mattutino con i todo del giorno, all'ora scelta nel Profilo.
- `/api/cron/notify` (ogni minuto): prende i `reminder` con `fire_at <= now()` e `sent_at is null`, invia a tutti i dispositivi dell'utente, segna `sent_at`; per un todo ricorrente con `remind_time` crea il promemoria dell'occorrenza successiva. Un todo spuntato prima dell'orario non viene notificato. Precisione ±1 minuto.
- Click sulla notifica → apre la nota o la home del giorno (`notificationclick` nel service worker, già presente in japan-trip).
- iOS: le push funzionano solo con la PWA aggiunta alla schermata Home (iOS 16.4+). La pagina notifiche lo spiega se rileva Safari non installato.

## Google Calendar

Sincronizzazione nei due sensi con l'API Google Calendar v3 (chiamate `fetch` dirette, senza il pacchetto `googleapis`, troppo pesante per una funzione Vercel).

**Collegamento** (Impostazioni → Google Calendar):

- OAuth 2.0 lato server: `/api/google/connect` → consenso Google → `/api/google/callback`. Scope: `openid email`, `calendar.calendarlist.readonly`, `calendar.events` (lettura dei calendari scelti e scrittura nel calendario dell'app). `access_type=offline`, `prompt=consent` per ottenere il refresh token.
- Token cifrati nel DB con AES-256-GCM (`GOOGLE_TOKEN_KEY`), access token rinnovato quando scade.
- Al primo collegamento l'app crea un calendario dedicato "NEURAL//NOTES": gli elementi dell'app non finiscono mescolati negli altri calendari e scollegando si può eliminare tutto in un colpo.
- "Scollega" revoca il token (`oauth2.googleapis.com/revoke`), chiude il canale di notifica e chiede se eliminare anche il calendario dell'app.

**Google → app**

- Eventi dei calendari scelti mostrati nella sezione Agenda della home (sola lettura, cache in `google_event_cache`).
- Sincronizzazione incrementale con `syncToken` (`events.list`); se Google risponde 410 si riparte da una lettura completa dei 30 giorni passati e 90 futuri.
- Aggiornamenti quasi immediati con `events.watch` → webhook `/api/google/webhook` (verifica di `X-Goog-Channel-Token`); i canali scadono dopo al massimo 7 giorni e vengono rinnovati dal cron giornaliero. In più cron-job.org chiama `/api/cron/google` ogni 15 minuti come rete di sicurezza.
- Per gli eventi creati dall'app (trovati tramite `google_event_link`): orario o data spostati in Google aggiornano promemoria e giorno del todo o della nota; un evento eliminato in Google toglie il collegamento e il promemoria, senza eliminare il todo o la nota.

**App → Google** (nel calendario dell'app, scelte nelle impostazioni)

| Elemento                                         | Evento                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Todo con orario                                  | evento di 30 minuti all'orario, titolo = testo del todo; spuntato → titolo con "✓"                  |
| Todo senza orario (opzionale, spento di default) | evento di tutta la giornata                                                                         |
| Nota assegnata a un giorno                       | evento all'ora del promemoria o di tutta la giornata; descrizione = prime righe + link `/note/<id>` |
| Todo e note ricorrenti                           | evento ricorrente con `RRULE` derivata da `repeat`                                                  |

- Le modifiche locali vengono messe in coda (`google_outbox`) e inviate subito dopo la risposta (`waitUntil` di Vercel) o al giro di cron successivo.
- Conflitti: vince la modifica più recente confrontando `local_updated` e `google_updated`; con `If-Match` sull'etag per non sovrascrivere una modifica arrivata nel frattempo.
- Le notifiche restano quelle push dell'app; gli eventi creati non hanno promemoria Google, per non ricevere due avvisi.

**Progetto Google Cloud**: client OAuth di tipo "Web", URI di reindirizzamento `https://<dominio>/api/google/callback`, dominio verificato per i webhook. Gli scope di Calendar sono "sensibili": finché l'app è in stato **Testing** i refresh token scadono dopo 7 giorni, quindi va messa **In produzione**. Senza la verifica di Google compare la schermata "app non verificata" (si accetta una volta) e il limite è di 100 utenti, sufficiente per uso personale.

**Alternativa semplice** (prima versione, già fatta in japan-trip): feed `/calendario/<chiave>.ics` da aggiungere a Google Calendar "da URL". È in sola lettura e Google lo aggiorna ogni 8–24 ore; può restare come opzione per chi non vuole collegare l'account.

## AI con Gemini

Stesso collegamento di japan-trip: chiamate REST dirette a `https://generativelanguage.googleapis.com/v1beta` con `GEMINI_API_KEY` (header `x-goog-api-key`), senza SDK. Da japan-trip si riprendono `lib/server/gemini.ts` (`listModels`, `testModel`, gestione di 429/404), il componente `ModelSelect.svelte` e la pagina dei modelli (`/viaggi/ai` → `/impostazioni/ai`), con le impostazioni in `app_setting`.

**Modelli** (Impostazioni → Modelli AI, solo admin)

- Elenco dei modelli disponibili letto dall'API, con pulsante **Prova** (tempo di risposta ed errore leggibile: quota esaurita, modello ritirato).
- Per ogni uso un modello **principale** e delle **riserve**: se il principale risponde 429 (quota del piano gratuito esaurita) o 5xx si passa alla riserva successiva, e la risposta mostra quale modello ha risposto.
  - **Testo** (riassunto, todo, riscrittura, risposte): es. `gemini-2.5-flash`, riserva `gemini-2.5-flash-lite`.
  - **Ricerca web**: modello con lo strumento `google_search`; se la quota della ricerca è esaurita risponde senza ricerca e lo segnala, come "Chiedi all'AI" in japan-trip.
  - **Embedding**: `gemini-embedding-001` con `outputDimensionality: 768`.
- Temperatura e timeout come in japan-trip.

**Funzioni**

| Funzione                                   | Dove                                  | Come                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Riassumi**                               | ✦ nell'editor → Assistente            | 3–6 punti in italiano; "Inserisci in cima" aggiunge un blocco citazione "✦ Riassunto" alla nota, oppure Copia / Rigenera. Risposta in streaming (`streamGenerateContent`, SSE).                                                          |
| **Estrai todo**                            | Assistente                            | Gemini restituisce JSON (`responseSchema`: `[{ text, day?, time? }]`); le proposte compaiono spuntabili e si aggiungono alla checklist della nota o alla lista del giorno solo dopo conferma, come le proposte dell'Inbox di japan-trip. |
| **Riscrivi**                               | Assistente, o sul testo selezionato   | Correggi, accorcia, rendi elenco puntato, tono formale; anteprima con "Sostituisci".                                                                                                                                                     |
| **Chiedi su questa nota**                  | campo in fondo all'Assistente         | Domanda libera con il testo della nota come contesto.                                                                                                                                                                                    |
| **Chiedi alle note**                       | Ricerca → scheda "✦ Chiedi alle note" | Ricerca per significato con embedding (vedi sotto) + risposta di Gemini con citazioni numerate [1] [2] che aprono note e todo. Se le note non contengono la risposta lo dice, senza inventare.                                           |
| **Cerca sul web**                          | Assistente                            | Richiesta con `google_search` (es. "orari dell'ufficio anagrafe"); il risultato si inserisce nella nota con le fonti come link.                                                                                                          |
| **Riepilogo della giornata** (facoltativo) | home, la sera                         | Cosa è stato fatto, cosa resta, note del giorno.                                                                                                                                                                                         |

**Ricerca per significato**

- Neon supporta `pgvector` anche nel piano gratuito: `create extension vector`.
- Quando una nota viene salvata e il testo cambia (`content_hash` diverso), dopo la risposta (`waitUntil`) si calcola l'embedding di titolo + testo (`taskType: RETRIEVAL_DOCUMENT`); le note lunghe si tagliano a ~2.000 parole. Solo le note con `ai_allowed = true` hanno un embedding; togliendo il consenso l'embedding viene cancellato subito.
- Domanda → embedding (`RETRIEVAL_QUERY`) → prime 8 note per similarità, unite ai risultati della ricerca testuale (`pg_trgm`) e ai todo che contengono le parole cercate → passate a Gemini come contesto con un id ciascuna.
- `pnpm ai:reindex` ricalcola tutti gli embedding (cambio di modello).

**Privacy e limiti**

- **Le note sono escluse dall'AI di default** (`note.ai_allowed = false`): nessun testo viene inviato a Gemini né indicizzato finché non lo si consente nota per nota.
  - Si consente dal menu della nota ("✦ Consenti all'AI") o direttamente dall'Assistente: aprendolo su una nota esclusa compare "Questa nota è esclusa dall'AI" con il pulsante "Consenti e continua", che attiva il consenso ed esegue l'azione scelta.
  - Le note consentite hanno un piccolo ✦ nell'elenco e nelle card; dal menu si può togliere il consenso in qualsiasi momento.
  - "Chiedi alle note" cerca solo tra le note consentite e lo dice ("cerca in 12 note consentite"); i todo della lista del giorno non vengono mai inviati.
  - Le note ricorrenti copiano il consenso dal modello.
  - Impostazione nel Profilo "Consenti l'AI sulle nuove note" (spenta di default) per chi preferisce il contrario.
- Nel piano gratuito dell'API Gemini Google può usare richieste e risposte per migliorare i propri prodotti: l'app lo dice nel Profilo e nel messaggio di consenso. Ogni utente può spegnere del tutto l'AI (`user.ai_enabled`). Con la fatturazione attiva sul progetto Google i dati non vengono usati.
- Limite per utente al giorno (`ai_usage`, es. 100 richieste di testo e 20 ricerche web) per non esaurire la quota condivisa.
- Senza `GEMINI_API_KEY` i pulsanti ✦ non compaiono.
- Codice: `lib/server/gemini.ts` (chiamate, riserve, streaming), `lib/server/ai.ts` (prompt e schemi delle funzioni), `lib/server/embeddings.ts`.

## Layout adattivo

Tre configurazioni, scelte con media query sulla larghezza e sui segmenti dello schermo:

| Classe   | Larghezza                                       | Layout                                                                     |
| -------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Compatto | < 600 px (telefono, foldable chiuso)            | una colonna, barra in basso, FAB, editor a schermo intero, fogli dal basso |
| Medio    | 600–1023 px (foldable aperto, tablet verticale) | lista + dettaglio su due pannelli; navigazione a rail                      |
| Esteso   | ≥ 1024 px (tablet orizzontale, desktop)         | rail + elenco note + editor + pannello "Oggi" a destra                     |

- **Foldable**: con `@media (horizontal-viewport-segments: 2)` la griglia usa `env(viewport-segment-width 0 0)` e `env(viewport-segment-left 1 0)` per mettere i due pannelli ai lati della cerniera, senza contenuti sopra di essa. In postura "libro" verticale (`vertical-viewport-segments: 2`): editor sopra, toolbar e tastiera sotto.
- **Nota a schermo intero** (configurazioni media ed estesa): pulsante "Schermo intero" nella toolbar dell'editor (e doppio tocco sul titolo). Nasconde rail ed elenco e dà alla nota tutta la larghezza; "Riduci" o Esc torna a lista + dettaglio. La scelta resta per quel dispositivo (`localStorage`) e la URL non cambia (`?full=1` solo per poterla condividere o ricaricare).
  - Con la cerniera rilevata (`horizontal-viewport-segments: 2`): a sinistra titolo, chip e checklist, a destra il testo, così nulla cade sulla piega. Senza segmenti (Fold con schermo continuo, tablet): una sola colonna di lettura larga al massimo 72 caratteri, centrata.
  - In postura "libro" orizzontale (`vertical-viewport-segments: 2`): testo nella metà superiore, toolbar e tastiera in quella inferiore.
  - Facoltativo: `document.documentElement.requestFullscreen()` per nascondere anche le barre di sistema, con uscita automatica quando si chiude la nota.
- Le pagine restano le stesse (`/note/[id]`): in configurazione media/estesa il layout `/note` mostra lista e dettaglio insieme, in compatta solo la pagina richiesta.
- Tastiera virtuale: `interactive-widget=resizes-content` nel viewport e toolbar dell'editor fissata sopra la tastiera (`visualViewport` come fallback).
- Area tocco minima 44 px; `safe-area-inset-*` per notch e barre di sistema.

## Tema cyberpunk

Linguaggio visivo ripreso da cyberpunk.net: giallo dominante su nero, ciano e rosso come accenti, riquadri con bordo sottile e triangolo pieno nell'angolo, fasce gialle con testo nero.

Token in `layout.css` (`@theme` di Tailwind 4):

| Token           | Valore                | Uso                                                                                              |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| `--color-void`  | `#000000`             | fondo                                                                                            |
| `--color-volt`  | `#FCEE0A`             | colore principale: intestazioni, titoli, bordi dei riquadri, pulsanti pieni, barra della toolbar |
| `--color-neon`  | `#00F0FF`             | note e checklist delle note, link, stato "salvata"                                               |
| `--color-alert` | `#FE1038`             | promemoria, eliminazione, indicatori sui giorni                                                  |
| `--color-ink`   | `#E6E6E6`             | testo                                                                                            |
| `--color-dim`   | `#A6A6A6`             | testo secondario (≈ 8:1 sul nero)                                                                |
| `--color-line`  | `#262626` / `#4C4C4C` | separatori / bordi dei campi                                                                     |

Componenti e motivi (in `lib/components/`):

- **Riquadro** (`Frame`): bordo 1 px giallo (o ciano) e triangolo pieno 16 px nell'angolo in alto a sinistra (`::before` con `border-top` + `border-right: transparent`).
- **Pannello menu**: bordo 1 px con bordo superiore da 6–8 px (campo in modifica, fogli, menu).
- **Fascia di gruppo** (`Separator`): barra gialla alta 30 px con testo nero maiuscolo e angolo in basso a destra tagliato; usata per "Oggi", "Questo mese", "Ottobre 2026"…
- **Voce di elenco**: trattino giallo di 12 px prima del titolo (note, sottotitoli nell'editor).
- **Pulsanti**: pieno giallo con testo nero e angolo in basso a destra tagliato (`clip-path`); secondari con contorno colorato e testo dello stesso colore.
- **Intestazione della home**: blocco giallo a tutta larghezza con data grande in nero (52 px, interlinea 0,9) e fascia nera a intagli sul bordo inferiore.
- **Navigazione**: voce attiva su fondo giallo con testo nero (barra in basso, rail su tablet).
- **Toolbar dell'editor**: barra gialla con icone nere, comando attivo nero con icona gialla.
- Font: **Chakra Petch** (400–700), maiuscolo con spaziatura per titoli ed etichette, self-hosted con `@fontsource/chakra-petch`. Il sito usa Blender Pro, che ha una licenza commerciale: Chakra Petch è l'alternativa libera più vicina.
- Animazioni brevi (≤ 200 ms): comparsa a scatti e leggero glitch solo sul titolo principale, disattivate con `prefers-reduced-motion`.
- Solo tema scuro all'inizio; il sistema di temi di japan-trip (`data-theme`) permette di aggiungerne altri.
- Si riprendono colori e forme, non loghi, immagini, SVG o font del sito né il nome del gioco.

## Rotte

```
/                      Oggi (lista del giorno, checklist da note, promemoria, in sospeso); ?giorno=AAAA-MM-GG
/note                  elenco, ricerca, filtro tag
/note/[id]             editor
/ricorrenti            todo e note ricorrenti, note modello (modifica e rimozione delle regole)
/impostazioni          fuso, notifiche, Google Calendar
/api/google/connect    avvio OAuth  ·  /api/google/callback  ·  /api/google/webhook
/api/cron/google       sincronizzazione periodica e rinnovo dei canali (CRON_SECRET)
/impostazioni/ai       modelli Gemini: principale, riserve, prova (solo admin)
/cerca                 ricerca testuale e "✦ Chiedi alle note"
/api/ai/[azione]       summarize · extract-todos · rewrite · ask-note · ask-notes · web (streaming SSE dove serve)
/calendario            mese con i giorni che hanno note o todo
/api/todo              crea / modifica / spunta / sposta / riordina / elimina (JSON)
/profilo               account, fuso, password, email, sessioni, eliminazione
/login                 accesso (pubblica)
/registrati            registrazione (pubblica)
/password-dimenticata  richiesta del link (pubblica)
/reimposta/[token]     nuova password (pubblica)
/verifica/[token]      conferma email (pubblica)
/api/auth/google       accesso con Google  ·  /api/auth/google/callback
/api/push              iscrizione / rimozione dispositivo
/api/cron/notify       invio promemoria (CRON_SECRET)
```

Salvataggio dell'editor: debounce di 800 ms verso una form action (`?/save`) con `content`, `text` e `updated_at`; indicatore "● SALVATA". Se `updated_at` sul server è più recente (modifica da un altro dispositivo) si mostra un avviso invece di sovrascrivere.

## Fasi

1. **Base** — scaffold (`pnpm dlx sv create`), Tailwind 4, Drizzle + PGlite, schema e prima migrazione, account (accesso, registrazione, conferma email, password dimenticata, Profilo, invio email con SMTP Gmail; accesso con Google insieme alla fase Google Calendar), tema e componenti base (Button, Sheet, Chip, Checkbox, Card tagliata), shell responsive con le tre configurazioni.
2. **Note** — elenco, ricerca, tag, editor Tiptap (grassetto, corsivo, sottolineato, titoli, elenchi, citazione, evidenziatore, link), autosalvataggio, assegnazione a un giorno.
3. **Lista del giorno e todo** — upsert della lista del giorno, componente `TodoList` con aggiunta sempre visibile, modifica sul posto, scorrimento (Domani/Elimina), annulla, riordino, scorciatoie; `/api/todo` con aggiornamento ottimistico; aggiunta rapida (`lib/quick-parse.ts` + test); todo ricorrenti (`lib/repeat.ts` + test).
4. **Home Oggi e note** — checklist nelle note (nodo `checklistEmbed` che riusa `TodoList`), query unificata della home, card "Note di oggi", note raggruppate per periodo con caricamento a mesi, striscia settimanale, "In sospeso", calendario mensile.
5. **Notifiche** — VAPID, iscrizione dispositivi, `reminder` su note e checklist, endpoint cron, configurazione cron-job.org, click sulla notifica.
6. **Google Calendar** — progetto Google Cloud e client OAuth, collegamento e cifratura dei token, calendario dell'app, invio di todo e note (outbox), lettura incrementale con `syncToken`, webhook + cron, sezione Agenda, pagina impostazioni. Note ricorrenti (`note_rule`) in questa fase o nella 4.
7. **AI** — `gemini.ts` e pagina Modelli AI da japan-trip, Assistente nell'editor (riassumi, estrai todo, riscrivi, chiedi sulla nota, cerca sul web), pgvector + embedding, "Chiedi alle note", consenso per nota (escluse di default) e limiti giornalieri.
8. **PWA e foldable** — manifest e icone, service worker offline (lettura), segmenti dello schermo, rifinitura tastiera e safe area, test su Galaxy Fold/Pixel Fold (o emulatore Chrome DevTools "Dual screen"), tablet.
9. **Deploy** — progetto Neon (branch `main` + `dev`), variabili su Vercel, `db:migrate` in produzione, cron attivi (notify ogni minuto, google ogni 15 minuti).

Più avanti: condivisione di note in sola lettura, allegati immagine (Vercel Blob), widget "Oggi" via Web App Shortcuts.

## Variabili d'ambiente

```
DATABASE_URL       Neon (o pglite:./.pglite in locale)
SESSION_SECRET     ≥ 32 caratteri
PUBLIC_APP_URL     indirizzo pubblico, per i link nelle email
SIGNUP_MODE        open (default) | closed
SIGNUP_CODE        se impostato, codice richiesto per registrarsi
SMTP_URL           smtps://neuralnotes.app%40gmail.com:<password-per-le-app>@smtp.gmail.com:465
                   (senza: email stampate nel log)
MAIL_FROM          "NEURAL//NOTES <neuralnotes.app@gmail.com>" (deve essere lo stesso account Gmail)
PUBLIC_VAPID_KEY   npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY
VAPID_SUBJECT      mailto: o URL dell'app
CRON_SECRET        richiesto da /api/cron/notify e /api/cron/google
GOOGLE_CLIENT_ID      client OAuth "Web" (Google Cloud Console)
GOOGLE_CLIENT_SECRET
GOOGLE_TOKEN_KEY      32 byte casuali in base64, per cifrare i token Google
GOOGLE_WEBHOOK_SECRET token dei canali events.watch
GEMINI_API_KEY        aistudio.google.com (senza: funzioni AI e note vocali nascoste)
GEMINI_MODELS         facoltativo, modelli in ordine di riserva (default gemini-2.5-flash,gemini-2.5-flash-lite)
BLOB_READ_WRITE_TOKEN store Vercel Blob per l'audio delle note vocali (in locale: cartella .attachments/)
```

## Note vocali

Pulsante flottante con il microfono nella home, sopra "Nuova nota": un tocco avvia e un secondo tocco ferma, oppure si tiene premuto per parlare. L'audio (`MediaRecorder`, opus/mp4 a 32 kbit/s, massimo 10 minuti) va nella coda offline come voce `voice` e da lì a `/api/voice`, che crea la nota del giorno, salva l'audio come allegato (`attachment`, Vercel Blob privato) e lo fa trascrivere a Gemini nella stessa richiesta: titolo, testo ripulito e una checklist con le cose da fare. Al primo uso si chiede il consenso (`user.voice_consent_at`), che si toglie dal Profilo. Se la trascrizione non riesce l'audio resta, e dalla nota si può fare "Trascrivi di nuovo". Codice: `server/voice.ts`, `server/gemini.ts`, `server/storage.ts`, `VoiceRecorder.svelte`, `NoteAttachments.svelte`.

## Limiti dei piani gratuiti

- Neon Free: 0,5 GB di storage e calcolo che si sospende dopo 5 minuti di inattività (primo accesso ~0,5–1 s più lento). Per note di testo lo spazio basta a lungo.
- Vercel Hobby: uso personale non commerciale; il cron interno è giornaliero, per questo si usa cron-job.org.

## Da decidere

- Registrazione aperta o con codice d'invito (`SIGNUP_CODE`): con l'app pubblica su Vercel conviene il codice, almeno all'inizio.
- Account Gmail per le email: crearne uno dedicato all'app (consigliato) o usare il proprio.
- Nome dell'app: "NEURAL//NOTES" è provvisorio.
