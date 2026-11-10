# FREI Fleet — instrucțiuni pentru Claude Code

TMS pentru transportatori cu flotă proprie, construit din copia curățată a unei aplicații-sursă. Trebuie să fie complet independent de aplicația-sursă (cod, conturi, date, branding).

## Documente (în ordinea priorității)
1. `docs/DECIZII-grupaj-ltl.md` — decizii recente ale lui Sergiu (câștigă în fața specificației).
2. `docs/SPEC-APLICATIE-TRANSPORTATOR.md` — specificația completă și planul pe etape (secț. 13).
3. `docs/REFERINTA-aplicatia-sursa.md` — cum funcționa sursa. Singurul fișier în care apare numele vechi.

## Cum lucrezi cu Sergiu
- Răspunzi în **română**. Prima propoziție spune ce urmează să faci. La final: rezultat scurt și cel mult un pas următor, fără recapitulare.
- Sergiu e „vibe coder": explici pe scurt, fără jargon. Întrebi doar dacă o decizie din spec intră în conflict cu codul sau dacă pasul următor e ireversibil.
- Folosești lista de sarcini; ultimul pas e verificarea (build, teste, grep).
- **Sergiu rulează singur `git` și SQL și testează pe aplicația pornită.** Tu propui comenzile de git, fiecare pe linie separată, într-un bloc de cod separat; nu faci commit/push singur. Mesajele de commit se încheie cu atribuirea cerută de sesiune.
- Nu ceri și nu stochezi chei sau parole în chat. `.env`/`.env.local` nu se comit niciodată. Date de test doar fictive; niciun fișier cu date reale în repo.

## Reguli de cod
- Dezvoltare locală: Supabase în Docker. Porturile sunt mutate pe 44320–44329 în `supabase/config.toml` (Windows bloca 54322).
- Migrările din `supabase/migrations/` sunt **aditive** (0001 baza, 0002 utilizatori; următoarele 0003+). Nu editezi o migrare deja aplicată; scrii una nouă.
- Calculele (venit, cost, profit, diurnă, alocări) sunt **funcții pure în `src/lib`**, cu teste Node în `tests/` (`npm test`).
- Accesul pe roluri (owner/dispatcher/accountant) se aplică în RLS și funcții SECURITY DEFINER, nu doar în interfață.
- Brandul produsului: `src/config/brand.js`. Datele și culorile firmei-client vin din `company_settings` (`src/lib/company.js`).
- `grep -ri frevia` (în afara `docs/REFERINTA-aplicatia-sursa.md`, `node_modules`, `dist`) trebuie să dea zero rezultate.

## Pornire locală
`npm install` · `npx supabase start` · `npx supabase db reset` · `.env.local` (URL `http://127.0.0.1:44321` + cheia publishable din `npx supabase status`) · `npm run seed:dev` · `npm run dev`.
Conturi de test (doar local): patron@/dispecer@/contabil@demo.test, parola `Demo-12345!`. `db reset` șterge conturile, deci după el rulezi din nou `npm run seed:dev`.

## Starea etapelor
- Etapa 0 (build verde): făcută.
- Etapa 1 (schemă unificată `0001_baza.sql`, Supabase local, curățare): făcută.
- Etapa 2 (Setări firmă, Utilizatori și roluri, culori/logo în PDF-uri, `0002`): făcută; în testare de Sergiu.
- Etapa 3 (Flotă, cursa-circuit, comenzi multiple, grupaj + distribuție subcontractată, `0003`): scrisă; **în testare de Sergiu**. Repartizare decisă: LDM implicit, schimbabil pe cursă (DECIZII). Calcule în `src/lib/tripMoney.js` (teste `tests/tripMoney.test.mjs`).
- Etapa 4 (costuri, combustibil, profit): urmează; P&L-ul și `calcTrip` din `trips.js` sunt încă pe modelul vechi.
- Etapele 4–9: vezi spec secț. 13.

## Cunoscute / amânate
- Textul „Control Center" din meniu/login e încă cel vechi; se schimbă odată cu meniul.
- Meniul rămâne ca în sursă și se transformă pe etape.
- Condițiile generale din Setări se salvează, dar PDF-ul le folosește abia în Etapa 7.
- Cursele noi primesc cod `CR-AAAA-NNN` (prefix din Setări); cele vechi își păstrează `CR-NNNN`.
- Salariile stau în `driver_pay` (RLS: patron; contabil dacă `accountant_sees_payroll`). Verificat în tranzacție: dispecerul vede 0 rânduri.
- Coloanele vechi din `trips` (client, puncte, venit, cost) rămân în tabel, dar cursa nouă nu le mai folosește; punctele și prețul stau pe comandă.
- Calculul automat de km pe cursă (din puncte) a fost scos din fereastra cursei; km vin din kilometraj sau se trec de mână.
- Tools → Camioane (cost/km) și Flota folosesc același tabel `trucks`; se unesc vizual mai târziu.
- Formularul de client ascuns (`ImportClientFormModal`) creează încă curse pe modelul vechi.
