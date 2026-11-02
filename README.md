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

## Database

- `pnpm db:generate` — nuova migrazione da `src/lib/server/db/schema.ts`.
- `pnpm db:migrate` — applica le migrazioni al database di `DATABASE_URL` (Neon).
- `pnpm db:studio` — Drizzle Studio.

## Comandi utili

- `pnpm check` — controllo dei tipi.
- `pnpm lint` / `pnpm format` — Prettier ed ESLint.
- `pnpm icons` — rigenera le icone dell'app in `static/icons`.

## Stato

- [x] Fase 1 — base: progetto, tema, guscio responsive, schema e prima migrazione, account (registrazione, accesso, conferma email, password dimenticata, profilo).
- [x] Fase 2 — note ed editor: elenco per periodo, ricerca, tag, editor rich text con salvataggio automatico, giorno, fissate, schermo intero.
- [ ] Fase 3 — lista del giorno e todo.
- [ ] Fase 4 — home "Oggi" e note nella home.
- [ ] Fase 5 — notifiche.
- [ ] Fase 6 — Google Calendar (e accesso con Google).
- [ ] Fase 7 — AI con Gemini.
- [ ] Fase 8 — PWA offline e pieghevoli.
- [ ] Fase 9 — deploy.
