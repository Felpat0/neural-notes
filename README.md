# NEURAL//NOTES

PWA per prendere note, con la lista dei todo del giorno, checklist nelle note e promemoria. Mobile first, con layout per pieghevoli e tablet, grafica in stile cyberpunk.

Stack: SvelteKit 3 + Svelte 5 + Tailwind 4, Drizzle ORM, Neon Postgres, deploy su Vercel. Il piano completo è in [`PLAN.md`](PLAN.md).

## Avvio in locale

```sh
pnpm install
cp .env.example .env   # poi DATABASE_URL="pglite:./.pglite" per un database locale senza Neon
pnpm dev
```

Con `pglite:` il database sta nella cartella `.pglite` e le migrazioni in `drizzle/` si applicano da sole all'avvio. Senza `SMTP_URL` le email (conferma, nuova password) non partono: vengono stampate nel terminale con il link da aprire.

## Account

- **Registrazione** (`/registrati`): nome, email, password (almeno 10 caratteri, non tra le più comuni). Il primo account è admin. L'account si usa subito; arriva un'email per confermare l'indirizzo (link di 24 ore, `/verifica/<token>`).
  - `SIGNUP_MODE=closed` chiude la registrazione; con `SIGNUP_CODE` serve il codice d'invito.
  - Con un indirizzo già registrato la risposta è la stessa ("controlla la posta") e al proprietario arriva un avviso: dalla pagina non si scopre chi è registrato.
- **Accesso** (`/login`): "Resta collegato" = sessione di 60 giorni rinnovata a ogni uso, altrimenti cookie del browser e 12 ore. Dopo 10 tentativi sbagliati in 15 minuti (per email e per IP) si aspetta.
- **Password dimenticata** (`/password-dimenticata`): la risposta è sempre la stessa; il link (`/reimposta/<token>`) vale un'ora e si usa una volta. Salvando si entra, si possono chiudere gli altri dispositivi e arriva un'email di avviso. Massimo 5 richieste all'ora per indirizzo e per IP.
- **Profilo** (`/profilo`): nome, fuso orario, password, dispositivi collegati, uscita, eliminazione dell'account (con tutti i dati).
- Nel database ci sono solo gli hash di password (scrypt), token di sessione e link.

## Email con Gmail

Senza un dominio proprio le email partono da un account Gmail:

1. Verifica in due passaggi attiva sull'account.
2. Account Google → Sicurezza → **Password per le app**: crearne una.
3. `SMTP_URL="smtps://utente%40gmail.com:<password-per-le-app>@smtp.gmail.com:465"` e `MAIL_FROM="NEURAL//NOTES <utente@gmail.com>"` (stesso indirizzo).

## Notifiche

1. Chiavi VAPID: `npx web-push generate-vapid-keys` → `PUBLIC_VAPID_KEY` e `VAPID_PRIVATE_KEY`; `VAPID_SUBJECT` = `mailto:` + un tuo indirizzo.
2. `CRON_SECRET`: una stringa casuale lunga.
3. Su [cron-job.org](https://cron-job.org) un job **ogni minuto**, GET `https://<app>/api/cron/notify`, con l'header `Authorization: Bearer <CRON_SECRET>` (oppure `?key=<CRON_SECRET>` nell'indirizzo).
4. Nell'app: Profilo → Notifiche → Attiva, su ogni dispositivo. Su iPhone serve l'app aggiunta alla schermata Home (iOS 16.4+).

Il cron prende i promemoria arrivati all'ora e li invia a tutti i dispositivi dell'utente; salta i todo già fatti o eliminati e quelli in ritardo di più di 6 ore (es. dopo un'interruzione). Crea anche le occorrenze di oggi dei todo ricorrenti con un'ora, così suonano anche senza aprire l'app.

## Google (accesso e Google Calendar)

Su [Google Cloud Console](https://console.cloud.google.com):

1. Nuovo progetto → **API e servizi → Libreria** → abilita **Google Calendar API**.
2. **Schermata consenso OAuth** (Google Auth Platform): tipo **Esterno**, nome dell'app, email di supporto. Negli scope aggiungi `openid`, `email`, `profile`, `.../auth/calendar.app.created`, `.../auth/calendar.calendarlist.readonly`, `.../auth/calendar.events.readonly`.
3. **Pubblica l'app** (stato _In produzione_): in _Testing_ i refresh token scadono dopo 7 giorni e il calendario si scollega. Senza la verifica di Google compare la schermata "app non verificata" (Avanzate → continua), con un limite di 100 utenti.
4. **Client** → Crea client → _Applicazione web_. URI di reindirizzamento autorizzati: `https://<app>/auth/google/callback` (e `http://localhost:5173/auth/google/callback` per provare in locale).
5. Su Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_TOKEN_KEY` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, cifra i token nel DB: non cambiarla dopo, altrimenti va ricollegato il calendario).
6. Su cron-job.org un secondo job **ogni 15 minuti**: GET `https://<app>/api/cron/google`, stesso header `Authorization: Bearer <CRON_SECRET>`.

Con solo client ID e segreto c'è "Continua con Google" su accesso e registrazione; con anche `GOOGLE_TOKEN_KEY` compare Profilo → Google Calendar.

- **Accesso con Google**: nuovo account senza password (si può impostare dal Profilo); un account esistente con la stessa email viene collegato solo se l'email è confermata. Con `SIGNUP_CODE` i nuovi account passano solo dalla registrazione con il codice.
- **Calendario**: al collegamento l'app crea il calendario "NEURAL//NOTES" e ci mette i todo con orario (30 minuti; fatti con "✓"), i ricorrenti come serie (`RRULE`, le occorrenze eliminate o spostate come eccezioni) e le note con un giorno o un promemoria. I todo senza orario sono facoltativi. Gli eventi non hanno promemoria di Google: gli avvisi restano le notifiche dell'app.
- **Da Google all'app**: spostare o rinominare l'evento di un todo o di una nota (o aggiungere/togliere "✓") cambia l'elemento; un evento eliminato in Google non viene ricreato finché l'elemento non cambia. Le serie ricorrenti si modificano dall'app (le modifiche fatte in Google vengono sovrascritte).
- **Eventi in todo**: gli eventi dei calendari scelti nel Profilo, da oggi a 60 giorni, diventano todo nel loro giorno, all'ora d'inizio con il promemoria (quelli di tutto il giorno senza ora). Si spuntano, modificano ed eliminano come gli altri; dalle modifiche fatte in Google si riporta solo quello che cambia (titolo, giorno, ora) e un evento eliminato toglie il suo todo, se non è già fatto. Non finiscono nel calendario NEURAL//NOTES e, passati, non restano "in sospeso". Togliendo un calendario dalla scelta (o scollegando) se ne vanno i suoi todo futuri non fatti.
- Online Google avvisa l'app a ogni modifica (webhook `/api/google/webhook`, canali rinnovati dal cron); il cron ogni 15 minuti è la rete di sicurezza. In locale non ci sono notifiche di Google (serve un indirizzo https): usa "Sincronizza ora".

## Database

- `pnpm db:generate` — nuova migrazione da `src/lib/server/db/schema.ts`.
- `pnpm db:migrate` — applica le migrazioni al database di `DATABASE_URL` (Neon), via HTTP, mostrando l'errore se qualcosa va storto. Per un database creato con `db:push`: `pnpm db:migrate --baseline` (segna la prima migrazione come già applicata).
- `pnpm db:studio` — Drizzle Studio.

## Comandi utili

- `pnpm check` — controllo dei tipi.
- `pnpm test` — test delle funzioni pure (ricorrenze, aggiunta rapida, date).
- `pnpm lint` / `pnpm format` — Prettier ed ESLint.
- `pnpm icons` — rigenera le icone dell'app in `static/icons`.

## Stato

- [x] Fase 1 — base: progetto, tema, guscio responsive, schema e prima migrazione, account (registrazione, accesso, conferma email, password dimenticata, profilo).
- [x] Fase 2 — note ed editor: elenco per periodo, ricerca, tag, editor rich text con salvataggio automatico, giorno, fissate, schermo intero.
- [x] Fase 3 — lista del giorno e todo: aggiunta rapida con riconoscimento di giorno, ora e ripetizione, modifica nella riga, scorrimento (Domani/Elimina), annulla, riordino, tastiera, ricorrenti.
- [x] Fase 4 — home "Oggi": checklist dentro le note, card delle note del giorno, note raggruppate per periodo, todo in sospeso, segni sui giorni, calendario mensile.
- [x] Fase 5 — notifiche: push sui dispositivi (Profilo), promemoria di todo e note, invio dal cron ogni minuto.
- [x] Fase 6 — Google: accesso con Google, Google Calendar nei due sensi (calendario dell'app, modifiche da Google, eventi dei calendari in todo).
- [ ] Fase 7 — AI con Gemini.
- [ ] Fase 8 — PWA offline e pieghevoli. Fatto: uso offline (service worker con pagine e dati in cache) e modifiche offline in coda (IndexedDB, `lib/outbox.svelte.ts`) inviate al ritorno della rete; restano i pieghevoli.
- [ ] Fase 9 — deploy.
