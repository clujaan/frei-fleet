# SPEC COMPLET: aplicație TMS pentru transportatori cu flotă proprie

Nume de lucru: **FREI Fleet** (placeholder; numele final se schimbă dintr-un singur loc, `src/config/brand.js`).
Versiune 10.11.2026. Acest document este autosuficient: **nu mai sunt necesare întrebări înainte de începerea lucrului**. Ce nu e stabilit are o decizie implicită în secțiunea 15. Se întreabă doar când o decizie de mai sus intră în conflict cu ce găsești în cod sau când o modificare ar fi ireversibilă.

---

## 1. Contextul și obiectivul

Sergiu (vibe coder, fără pregătire formală în programare; 15+ ani în transport internațional și logistică) a construit pentru firma lui, Frevia SRL, aplicația internă „Frevia Control Center" (React/Vite + Supabase + Vercel). Acum vrea un **produs separat, vândut altor transportatori**, care **nu are nicio legătură cu Frevia** (cod, conturi, date, branding, domenii).

- **Produs:** TMS pentru **transportator cu flotă proprie** (camioane și șoferi proprii), nu pentru expeditor/broker. Subcontractarea unei curse la alt transportator rămâne o funcție opțională.
- **Proprietar:** Sergiu Suciu; vândut prin **SSA Smart Design SRL** (asociat unic Sergiu). Codul aparține integral lui Sergiu; se va face un contract de licență persoană fizică → SSA Smart Design (fără legătură cu această lucrare).
- **Primul client (pilot):** transportator internațional, aproximativ 20 de camioane, bază în **Sighetu Marmației**, în prezent doar Excel, fără TMS. **3 utilizatori:** patron, dispecer, contabil. Nu se pricepe la aplicații; datele inițiale le introducem noi. Pilot gratuit 1–2 luni, **după** ce există un produs funcțional.
- **Piață țintă:** 2–5 transportatori cunoscuți în primul an.
- **Livrare:** același cod, **instalat separat pentru fiecare client** (proiect Supabase propriu, proiect Vercel propriu, domeniu propriu), administrat de Sergiu. **Nu** multi-tenant în prima fază. **Abonament lunar** + taxă de configurare (prețul nu e stabilit).
- **Limbi:** RO și EN (interfață și PDF-uri). **Email:** Microsoft 365 **și** Gmail. **Facturare:** SmartBill (de confirmat; în versiunea 1 doar urmărire, nu emitere).
- **Prioritate imediată:** să existe o aplicație **funcțională, rulată local**, înainte de orice publicare. Sergiu nu are loc de alt proiect în Supabase free plan, deci dezvoltarea se face cu **Supabase local** (secțiunea 12).

## 2. Cum lucrează Sergiu cu Claude (reguli de colaborare)

- Răspunsuri în **română**. Prima propoziție spune ce urmează să faci. La final: rezultat concis, un singur pas următor (dacă există), fără recapitulare de pași.
- Sergiu rulează singur `git` și SQL-ul în Supabase; **testează doar pe aplicația rulată** (local acum, publicată mai târziu). Dă comenzile git pe linii separate, fiecare în propriul bloc de cod: `git add .`, `git commit -m "..."`, `git push`.
- Claude scrie codul în folderul local al proiectului (prin legătura cu calculatorul); după modificări rulează build-ul și, pentru logică pură, teste în Node (`npx esbuild fișier --bundle --platform=node --format=esm --define:import.meta.env=...`).
- Sergiu preferă ca Claude să pună **întrebări specifice înainte de răspunsuri lungi**, dar aici deciziile majore sunt luate. Întreabă doar în situațiile din antet.
- Date sensibile (salarii) trebuie tratate cu grijă. Nu se pun chei și parole în chat, `.env` nu se urcă în Git.
- Datele clienților vor fi reale după pilot: **migrări doar aditive** (fără ștergere/modificare distructivă de coloane/tabele cu date).

## 3. Ce este de fapt acest produs

Un transportator își conduce activitatea astfel:

1. Primește comenzi de la **clienți** (producători direcți sau case de expediție).
2. Execută **curse** cu camioane proprii și șoferi proprii.
3. Costurile apar din **combustibil, taxe de drum, diurne, salarii, costuri fixe, cheltuieli ale șoferului**.
4. La întoarcerea în țară, șoferul face **decont** cu cheltuielile din cursă; biroul îl introduce din documentele aduse.
5. Patronul vrea să vadă **profitul pe cursă, pe camion, pe șofer, pe client**, și **termenele documentelor** (ITP, RCA, licențe, tahograf etc.).

### Cursa = circuit de la bază la bază
- O **cursă** pleacă din **bază** (punct configurabil per firmă; pentru pilot: Sighetu Marmației), merge la una sau mai multe încărcări/descărcări (tur), apoi retur, și **se termină la întoarcerea în bază**. Exemplu: bază → țară europeană → retur în România → bază.
- O cursă are **un camion, o remorcă, un șofer**; opțional **al doilea șofer**.
- **O cursă are mai multe comenzi** (tur și retur pot fi la clienți diferiți). **Venitul cursei = suma comenzilor.** (Diferență majoră față de aplicația-sursă, unde o cursă are un singur client.)
- Cursele pot fi și **interne** (în România), facturate de obicei în RON.
- Opțional (rar): cursă **subcontractată** (fără camion propriu, dată unui alt transportator prin CT); funcționează ca în aplicația-sursă și nu e activitatea principală.

## 4. Principii care se păstrează din aplicația-sursă

(detalii în `REFERINTA-aplicatia-sursa.md`; acela este documentul complet al aplicației existente)

- Interfață bilingvă RO/EN; limba PDF-urilor aleasă pe document.
- **O singură sursă pentru fiecare valoare** (nu se introduce același număr în două locuri); în noul model prețul stă pe comandă, costurile pe înregistrări de cost.
- Statusurile sunt etichete (valorile din baza de date nu se redenumesc).
- **Amprente „trimis"** (avertizare când se modifică o comandă/cursă după trimitere), **blocare la editare** (un singur utilizator odată), **jurnal de activitate**, **motiv la ștergere/anulare**.
- Curs RON/EUR automat (BNR cu rezervă ECB), marcat clar; valori în moneda originală + echivalent.
- Taxe de drum (module Tools), estimator km, adrese cu coduri poștale (GeoNames).
- PDF-uri (pdfmake), email, previzualizare PDF, mesaj prietenos când pagina e veche după un deploy (`lazyLoad.js`), pop-up-ul de login Microsoft se deschide primul la trimiterea emailului.
- Securitate: RLS pe toate tabelele, bucket privat pentru fișiere, cheia AI doar pe server, funcții SECURITY DEFINER cu `search_path` fixat.

## 5. Modelul de date nou (schemă curată, de la zero)

Aplicația nouă pornește cu **o singură schemă unificată** (`supabase/migrations/0001_baza.sql`), construită din `supabase/schema.sql` + migrările 002–028 din sursă, apoi modificată pentru modelul de mai jos. Nu se păstrează date Frevia. Coloane orientative; se rafinează la implementare.

### 5.1 Firmă și utilizatori
- `company_settings` (un singur rând): nume, CUI, Reg. Com., adresă, țară, telefon, email, site, IBAN-uri (jsonb: bancă, IBAN, monedă), **bază** (nume, adresă, lat, lng), logo/ștampilă/semnătură (căi în bucket privat `branding`), culoare principală și secundară, moneda implicită, **moneda de raportare** (implicit EUR), prefixe numerotare (`ct`, `cc`, `trip`, `fd`), limbi active, persoane care semnează (jsonb), **condiții generale RO și EN** (text editabil), termen de plată implicit, pop-up/email (furnizor email, adresă expeditor).
- `app_users` (user_id, full_name, email, **role**: `owner` | `dispatcher` | `accountant`, active). Rolurile se aplică în RLS.
- `numbering` (serii): CT-AAAA-NNN, CC-AAAA-NNN, curse (ex. CR-AAAA-NNN), decont FD-AAAA-NNN; prefixele din `company_settings`.

### 5.2 Flotă
- `trucks`: număr înmatriculare, VIN, marcă/model, an, tip, consum mediu de referință (l/100 km), activ, note. (Reutilizează/extinde `trucks.js` și tabelul din Tools.)
- `trailers`: număr, tip (prelată, frigorific, mega etc.), activ.
- `drivers`: nume, telefon, email, CNP **nu** se stochează în v1, activ; **salariu lunar brut** + **cost angajator lunar** (sau procent taxe angajator) + monedă; **diurnă** (vezi 5.6); card/permise doar ca documente (5.7).
- `driver_truck_assignments` (opțional): șofer ↔ camion cu perioadă (ajută la costul lunar pe camion).

### 5.3 Clienți și comenzi
- `clients` (ca în sursă): firmă, CUI, țară, adresă, contacte, termen de plată, monedă preferată, limba documentelor.
- `trips` (cursa-circuit): cod, `kind` (`own` | `subcontracted`), camion, remorcă, șofer, șofer 2 (opțional), `start_at` (plecare din bază), `end_at` (întoarcere în bază), km (început/sfârșit sau total), țări (array), status (Planificată, În desfășurare, Încheiată, Anulată; etichete), note. Pentru `subcontracted`: transportator, cost, CT (ca în sursă).
- `client_orders` (comenzi client, CC): **mai multe pe cursă**; client, puncte de încărcare/descărcare (jsonb `stops` cu marfă pe rânduri, ca în sursă), referințe, **preț + monedă pe comandă**, termen de plată („de la" data facturii/descărcării/documente etc.), limbă, status (Ciornă, Trimisă, Confirmată, Semnată, Executată, Anulată), fișier atașat. Două moduri: **comandă primită** de la client (implicit) și **comandă emisă** de transportator (opțional, ca CC din sursă, cu PDF și email).
- `trip_orders`: nu e nevoie de tabel separat dacă `client_orders.trip_id` e obligatoriu; venitul cursei se calculează ca sumă.
- `transport_orders` (CT, către transportatori): ca în sursă, doar pentru curse `subcontracted`.

### 5.4 Costuri
- `costs` (tabel unic de costuri, extinde `Cheltuieli` din sursă): data, furnizor, nr./dată document, suma + monedă + curs + echivalent în moneda de raportare, **categorie** (`fuel_card`, `fuel_base`, `toll`, `driver_expense`, `per_diem`, `service`, `tires`, `parking`, `fine`, `other`), **plătit de** (`company` | `driver`), camion, șofer, **cursă** (nullable), țară, litri (pentru combustibil), kilometraj, `source` (manual | import | decont), `allocation_status` (`allocated` | `unallocated`), document atașat.
- `fuel_stock_movements` (rezervorul bazei): data, tip (`in` | `out`), litri, preț/litru + monedă, furnizor; pentru `out`: camion, kilometraj, cursă (alocată automat). **Cost mediu ponderat** calculat la data fiecărei ieșiri.
- `fixed_costs`: camion (sau remorcă), tip (leasing, asigurare, impozit, ITP, revizie planificată, altele), suma lunară + monedă, `valid_from`, `valid_to`.
- `payroll_months`: șofer, luna, salariu brut, taxe angajator, bonusuri, cost total, monedă; implicit se completează din `drivers` și se poate suprascrie pe lună. Plătit chiar dacă șoferul nu e în cursă.

### 5.5 Deconturi (decontul șoferului)
- Ca în sursă (`expense_reports` + linii), dar **legate de șofer și de cursă/curse**; liniile creează sau sunt legate de înregistrări `costs` (`source='decont'`, `paid_by='driver'`); diurna se calculează automat și se adaugă ca linie. Numerotare FD-AAAA-NNN, stări, PDF/Excel de decont, trimitere către contabil, încărcare documente în bucket privat. Foaia de decont a clientului va fi adusă ulterior (exemple așteptate peste 1–2 săptămâni); **implementarea de bază rămâne ca în sursă**.

### 5.6 Diurnă
- `per_diem_rates`: șofer (nullable = implicit firmă), țară (nullable = oricare), sumă/zi, monedă, `valid_from`.
- Setarea pe fiecare șofer a valorii exacte este obligatorie (cerință explicită). Regula de selecție: tarif șofer+țară → șofer → firmă+țară → firmă.
- Calcul implicit: zilele de la `start_at` până la `end_at` (inclusiv), alocate pe țări după `trip.countries`/punctele de oprire când există, altfel tarif unic; opțiune per firmă: calcul pe ore/24. Contabilul clientului validează regulile; aplicația **nu oferă consultanță fiscală**.

### 5.7 Documente și termene
- `fleet_documents`: entitate (camion | remorcă | șofer | firmă), tip (ITP, RCA, CASCO, licență comunitară, copii conforme, tahograf/calibrare, ADR, permis, atestat, aviz medical/psihologic, asigurare CMR, altele), număr, valabil de la/până la, fișier (bucket privat), zile de alertă.
- Pagină „Documente și termene" cu filtre (expirat, în 30/60 zile), alerte în Dashboard, indicator pe cursă (camion/remorcă/șofer cu document expirat la data cursei).

### 5.8 Păstrate din sursă
Tabele pentru Burse/oferte, lead-uri și interacțiuni, jurnal, locuri/postal_places, taxe de drum (țări, coridoare, trasee), `sent_snapshots`, `edit_locks`, curs BNR.

## 6. Calcule: venit, cost, profit (logică de implementat în funcții pure, testate)

Moneda de raportare = setare firmă (implicit **EUR**). Fiecare sumă se păstrează în moneda originală; echivalentul se calculează la cursul BNR/ECB din data documentului (logica din `bnr.js`, `costs.js`).

**Venitul cursei** = Σ prețuri comenzi nonanulate, în moneda de raportare.

**Costuri directe ale cursei** (alocate pe cursă):
- Combustibil card: tranzacții cu camionul cursei și `data/ora ∈ [start_at, end_at]`; dacă nu se potrivește, rămân **nealocate** (listă de verificat, alocare manuală).
- Combustibil din bază: ieșiri din stoc pentru camionul cursei în interval; cost = litri × cost mediu ponderat la acea dată.
- Taxe de drum: costuri `toll` alocate la fel (cont/dispozitiv al companiei: GO-Box, DKV etc.; sau plătite de șofer prin decont).
- Cheltuieli ale șoferului din decont (parcări, taxe plătite de el etc.).
- Diurnă (secțiunea 5.6).
- Altele alocate (service/amenzi legate de cursă).

**Contribuția cursei** = venit − costuri directe.

**Costuri lunare** (nu depind de cursă):
- Salariul șoferului (plătit și când nu e în cursă) = cost lunar al șoferului.
- Costuri fixe pe camion (leasing, asigurări, impozite etc.).

**Alocarea implicită a costurilor lunare:** *lunar*, nu pe cursă (cerință explicită: salariul se plătește oricum). Rapoartele:
- **Profit pe cursă (contribuție):** venit − costuri directe.
- **Profit pe camion / lună:** Σ contribuții ale curselor camionului − costuri fixe ale camionului − salariile șoferilor repartizate proporțional cu zilele în care au condus acel camion în lună.
- **Profit pe șofer / lună:** Σ contribuții ale curselor lui − cost lunar șofer.
- **Profit flotă / lună:** Σ contribuții − Σ costuri lunare.
- **Profit pe client:** venit − costuri directe repartizate proporțional cu venitul comenzii în cursă.
- Opțional (comutator în raport): „profit complet pe cursă" care repartizează costurile lunare pe zilele cursei.

**Kilometri și consum:** km cursă (din kilometraj sau estimare), litri alimentați / km → consum real față de consumul de referință al camionului; cost/km total.

Toate aceste funcții se scriu în `src/lib/fleetCosts.js` (pure, fără acces la DB), cu teste în Node pentru: alocare combustibil pe cursă, cost mediu ponderat, selecția tarifului de diurnă, zile de diurnă, repartizarea salariului pe camion, conversie valutară.

## 7. Module și ce se întâmplă cu ele

| Modul | Decizie |
|---|---|
| Dashboard | Se păstrează; casete noi: curse în desfășurare, documente care expiră, costuri nealocate, profit lună |
| Vânzări (Lead-uri, Interacțiuni) | Se păstrează, rebrandate |
| Burse și oferte | Se păstrează (opțional din meniu per client) |
| Adrese, Clienți | Se păstrează |
| Transportatori | Se păstrează (doar pentru subcontractare) |
| Curse | **Se rescrie** pentru modelul circuit (camion, remorcă, șofer, mai multe comenzi, costuri, profit) |
| Comenzi client | **Se adaptează**: mai multe pe cursă, „primită" vs „emisă" |
| Comenzi transport (CT) | Se păstrează, doar pentru curse subcontractate |
| Financiar / P&L | **Se rescrie** pentru profit pe cursă/camion/șofer/client/lună |
| Cheltuieli | **Se extinde** în tabelul unic de costuri |
| Deconturi | Se păstrează, legate de șofer și cursă, diurnă automată |
| Tools (taxe de drum, estimator, camioane) | Se păstrează; „Camioane" din Tools se unește cu Flota |
| Sistem (Jurnal, Export) | Se păstrează |
| **Flotă** (camioane, remorci, șoferi) | **Nou** |
| **Combustibil** (stoc bază, tranzacții card) | **Nou** |
| **Documente și termene** | **Nou** |
| **Setări firmă** | **Nou** |
| **Utilizatori și roluri** | **Nou** |
| **Import din Excel/CSV** (clienți, camioane, șoferi, curse) | **Nou** |
| Formular client (ImportClientFormModal, `public/forms`, scripturile `build-client-forms*`) | Ascuns din v1 (cod păstrat); decis după pilot |

Mai târziu (nu în v1): aplicație pentru șoferi (poze CMR/bonuri), emitere facturi în SmartBill cu urmărirea încasărilor, service/anvelope cu planificare, GPS, import automat al rapoartelor de card combustibil.

## 8. Roluri și acces (RLS, nu doar interfață)

- **owner** (patron): tot, inclusiv salarii, profit, utilizatori, setări.
- **dispatcher** (dispecer): clienți, comenzi, curse, flotă, documente, adrese, combustibil; **fără** salarii, fără profit pe șofer, fără setări firmă/utilizatori.
- **accountant** (contabil): deconturi, costuri, facturi/urmărire, rapoarte, export; salarii vizibile doar dacă patronul activează (`company_settings.accountant_sees_payroll`, implicit **da**).
- Tabelele cu date sensibile (`drivers` salariu, `payroll_months`) sunt protejate prin vederi/politici separate pe coloane/roluri.
- Toți utilizatorii: autentificare Supabase Auth, fără înregistrare liberă; creare manuală de către Sergiu.

## 9. Ce se scoate / se înlocuiește din codul Frevia (listă verificată în cod)

**Fișiere cu referințe Frevia (≈ 40) și acțiunea necesară:**
- `src/lib/orderTerms.js` (condițiile generale Frevia): devine **șablon neutru implicit**, textul real e în `company_settings` (editabil).
- `src/lib/orderPdf.js`, `clientOrderPdf.js`, `foaiePdf.js`, `foaieXlsx.js`: CUI/Reg. Com. fixe, antet, logo și ștampilă din cod → citite din `company_settings` și din bucket `branding`.
- `src/i18n/index.jsx`: textul cu CUI-ul Frevia și mențiuni ale firmei → parametrizate; numele aplicației din `brand.js`.
- `api/read-document.js` și `api/read-offer.js`: promptul menționează firma Frevia și CUI-ul ei → primesc numele și CUI-ul firmei prin cerere/setări; nicio valoare fixă.
- `src/lib/clientOrders.js` (`SENDERS`), `src/lib/format.js` (`EMPLOYEES`, angajat implicit după email), `src/lib/entities.js` (`OWNERS`), `src/pages/ComandaClient.jsx` (`defaultSender`): nume fixe ale persoanelor → din `app_users`/`company_settings.signers`.
- `src/lib/auth.jsx` (comentariu cu doi administratori), `activity.js` (utilizator demo `@frevia.ro`), `Comenzi.jsx`/`ComandaClient.jsx` (`demo@frevia.ro`): se înlocuiesc cu valori neutre.
- `src/lib/deconturiDemo.js`, `supabase/seed_deconturi.sql`: **se șterg**; datele de demo, dacă rămân, sunt fictive și neutre.
- `supabase/schema.sql` (comentarii și serii): se refac în schema unificată.
- `public/img/*frevia*`, `hero-*.jpg`, `stampila-frevia.png`, `apple-touch-icon.png`, `icon-*.png`: înlocuite cu active neutre (placeholder generat) până la brandul final; `public/manifest` și `index.html` (titlu, culori) parametrizate.
- `README.md`, `package.json` (nume), `vite.config.js` (nume PWA), `vercel.json` (CSP: verifică domeniile, păstrează `blob:` pentru frame/object), `src/index.css` (paleta Frevia: bleumarin `#0A2548` și portocaliu `#EC6A14` → paletă neutră definită ca tokenuri într-un singur loc).
- `scripts/build-client-forms*.mjs`: ascunse/neutralizate (formularul de client e dezactivat în v1).

**Reguli:** după curățare, `grep -ri frevia` pe tot proiectul (fără `node_modules`/`.git`) trebuie să dea **zero rezultate**, cu excepția `REFERINTA-aplicatia-sursa.md`, care păstrează istoricul sursei și este marcat ca atare.

## 10. Branding configurabil

- `src/config/brand.js`: `APP_NAME`, `APP_SHORT_NAME`, domeniu, culori implicite, texte de login. Un singur loc de schimbat la numele final.
- Logo, ștampilă, semnătură și culori ale **clientului** (firma care folosește aplicația) vin din `company_settings`; PDF-urile și antetul aplicației le folosesc.
- Semnături/ștampile sunt fișiere în bucket privat; PDF-urile le preiau la generare.

## 11. Email

- Microsoft 365 prin Graph (MSAL), ca în sursă (`graphMail.js`), cu ID aplicație și tenant din variabile de mediu **ale produsului** (aplicație înregistrată de SSA Smart Design, multi-tenant, cu acordul administratorului clientului).
- **Gmail:** autentificare Google (OAuth) cu trimitere prin API Gmail. Atenție: scopul de trimitere este restricționat; pentru puține conturi se lucrează în modul „testare" (utilizatori de test) până la verificarea aplicației.
- **Variantă de rezervă** pentru orice client: serviciu de email tranzacțional (ex. Resend) cu `Reply-To` pe adresa utilizatorului și domeniul clientului verificat (SPF/DKIM).
- Interfața: un strat `mailProvider` cu implementări `microsoft`, `google`, `smtpService`; clientul alege din setări. Implementarea Microsoft rămâne prima; Gmail se face după funcțiile de bază.

## 12. Dezvoltare locală (prioritate)

Sergiu nu mai are loc în Supabase free plan, deci rularea inițială este **complet locală**:

1. Copierea proiectului-sursă într-un **folder nou, fără istoric Git și fără secrete**, în PowerShell:
   `robocopy C:\Users\cluja\Projects\frevia-app C:\Users\cluja\Projects\NUME-NOU /E /XD node_modules .git dist .vercel /XF .env .env.local`
   (robocopy întoarce coduri 1–7 la succes; e normal). Apoi: `cd` în folder, `git init`, repository **nou și privat** pe contul SSA Smart Design.
2. `npm install`.
3. **Supabase local** cu Docker Desktop (WSL2): `npx supabase init`, apoi `npx supabase start` (afișează URL-ul API local, de obicei `http://127.0.0.1:54321`, cheia anon și Studio la `http://127.0.0.1:54323`). Migrările stau în `supabase/migrations/`; `npx supabase db reset` le reaplică de la zero.
4. `.env.local` cu `VITE_SUPABASE_URL` și `VITE_SUPABASE_ANON_KEY` din ieșirea de mai sus; `.env*` rămân în `.gitignore`.
5. Utilizatorii de test se creează în Studio (Authentication) sau printr-un script `scripts/seed-dev.mjs` care creează: un `owner`, un `dispatcher`, un `accountant`, 4–5 camioane, 3–4 șoferi, 3–4 clienți, câteva curse **fictive** (fără date reale).
6. Funcțiile din `api/` (curs BNR, km, citire documente cu AI) se rulează local printr-un mic server de dezvoltare `scripts/dev-api.mjs` (montează handler-ele din `api/*.js` pe un port local; Vite le proxiază la `/api`). Cheile externe (ORS, Anthropic) sunt opționale local; fără ele, funcția respectivă afișează „indisponibilă local" în loc să cadă.
7. Publicarea (Vercel + Supabase în organizația SSA Smart Design, regiune UE, plan plătit pentru backup zilnic) se face doar după ce versiunea locală e validată de Sergiu.

Dacă Docker nu merge pe calculatorul lui Sergiu, alternativa este să elibereze un proiect Supabase free (pauză/ștergere) sau să folosească un proiect nou pe un cont plătit; se decide atunci.

## 13. Plan de lucru, cu criterii de acceptare

Fiecare etapă se încheie cu build reușit, teste Node pentru logica pură și verificare de către Sergiu pe aplicația rulată local.

**Etapa 0, pregătire.** Folder nou, repository, `npm install`, build verde. *Acceptare:* `npm run build` trece; aplicația pornește în modul demo.

**Etapa 1, schemă unificată + Supabase local + curățare Frevia.**
- `0001_baza.sql` din schema + migrările 002–028; `supabase start` și `db reset` reușesc.
- `brand.js`, paletă neutră, active neutre, înlocuirile din secțiunea 9.
- *Acceptare:* aplicația rulează local cu login; `grep -ri frevia` fără rezultate în afara referinței; PDF de test se generează fără date Frevia.

**Etapa 2, Setări firmă + utilizatori și roluri.**
- Pagina Setări firmă (toate câmpurile din 5.1, încărcare logo/ștampilă/semnătură, condiții RO/EN editabile, bază).
- Roluri `owner`/`dispatcher`/`accountant` cu RLS.
- *Acceptare:* modificarea numelui/logo/CUI apare în PDF-uri; dispecerul nu vede salarii (verificat și direct în Supabase, nu doar în interfață).

**Etapa 3, Flotă + cursa-circuit + comenzi multiple.**
- Camioane, remorci, șoferi (cu salariu și diurnă), alocare pe cursă.
- Cursa cu `start_at`/`end_at`, mai multe comenzi, venit sumat; CT doar pentru subcontractate.
- *Acceptare:* o cursă cu 2 comenzi (tur și retur, monede diferite) arată venitul corect în moneda de raportare.

**Etapa 4, Costuri + combustibil + profit.**
- Tabel unic de costuri, stoc combustibil bază cu cost mediu ponderat, tranzacții card, taxe, alocare automată + listă „nealocate".
- `fleetCosts.js` cu teste; rapoarte profit pe cursă/camion/șofer/client/lună.
- *Acceptare:* testele Node trec cu cazuri fictive verificate manual; costurile nealocate pot fi alocate manual; consum real vs referință.

**Etapa 5, Deconturi legate de cursă + diurnă automată.**
- Decont legat de șofer și cursă; liniile intră în `costs`; diurnă automată; PDF/Excel.
- *Acceptare:* un decont cu 3 bonuri și diurnă produce totalul corect și cheltuielile apar în costurile cursei.

**Etapa 6, Documente și termene + Dashboard.**
- *Acceptare:* un ITP care expiră în 20 de zile apare în Dashboard; cursă cu document expirat afișează avertizare.

**Etapa 7, Email (Microsoft apoi Gmail/serviciu), import Excel, condiții editabile în PDF.**
- *Acceptare:* trimiterea unui CC/CT cu PDF atașat din ambele tipuri de cont; import de clienți și camioane din CSV cu previzualizare și raport de erori.

**Etapa 8, pregătire pilot.**
- Seturi de date reale introduse de noi pentru primul client; ghid scurt de utilizare (RO); listă de bifat pentru instalarea unui client nou (Supabase, migrări, Vercel, domeniu, aplicație email, utilizatori); backup/export săptămânal.
- *Acceptare:* Sergiu poate instala o instanță nouă urmând lista, fără ajutor.

**Etapa 9, feedback după câteva săptămâni** și lista de îmbunătățiri.

## 14. Legal și administrativ (în afara codului, pentru Sergiu)

- SSA Smart Design trebuie să fie activă (ANAF/ONRC) și să aibă un cod CAEN potrivit pentru software înainte de prima factură.
- Contract de licență Sergiu (persoană fizică) → SSA Smart Design; contract de utilizare/abonament cu clientul; **acord GDPR** (clientul = operator, SSA Smart Design = persoană împuternicită; furnizori: Supabase, Vercel, Anthropic, furnizorul de email; date în UE; salariile sunt date sensibile).
- Verificare nume/domeniu/marcă (OSIM/EUIPO) înainte de numele final.
- Disclaimer: taxe de drum, km, curs și diurnă sunt estimări/calcule de ajutor, validate de contabilul clientului.

## 15. Decizii implicite pentru ce nu a fost stabilit (nu se mai întreabă)

- **Doi șoferi pe cursă:** suportat (șofer 2 opțional, diurnă pentru fiecare).
- **Moneda de raportare:** EUR implicit, comutator RON; comenzile pot fi în EUR sau RON; costurile în moneda originală.
- **Salarii:** alocare lunară (secțiunea 6); comutator de „profit complet pe cursă" opțional.
- **Format rapoarte card combustibil:** necunoscut; v1 are **introducere manuală** + **import CSV/Excel generic cu mapare de coloane** (utilizatorul alege ce coloană e data, litri, sumă, număr camion). Format dedicat DKV/altele, ulterior.
- **Taxe de drum:** GO-Box, DKV și altele ca furnizori/categorii de cost; introducere manuală sau import generic; cele plătite de șofer vin prin decont.
- **Prețul abonamentului / pe camion sau pe utilizator:** nedecis; nu influențează v1.
- **Formularul de client:** ascuns în v1.
- **SmartBill:** în v1 doar câmpuri „nr. factură/dată/scadență/încasat" pe comandă; fără integrare API.
- **Mobil:** aplicația rămâne PWA responsivă; nu se construiește aplicație separată pentru șoferi în v1.
- **Numele produsului:** `FREI Fleet` ca placeholder, schimbabil dintr-un loc.
- **Date reale:** niciodată în repository; seed-urile sunt fictive.

## 16. Riscuri și atenționări

- Alocarea automată a costurilor depinde de camionul și intervalul corecte pe cursă: de aceea lista „nealocate", avertizări și teste.
- Reguli fiscale (diurnă, salarii, TVA): validare cu contabilul clientului.
- Mai multe instalări: migrările trebuie rulate pe fiecare; se ține un registru al versiunii de schemă per client (`schema_version`).
- Gmail: verificare Google pentru trimitere; pregătit planul de rezervă.
- Un singur dezvoltator: documentație la zi (acest fișier și `REFERINTA`), teste pentru logica de calcul.
- Date personale (salarii, șoferi): acces pe roluri, jurnal, backup, fără CNP în v1.
