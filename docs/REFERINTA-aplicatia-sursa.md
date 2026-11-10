# REFERINȚĂ: aplicația-sursă (Frevia Control Center)

> Document de referință al aplicației-sursă, din care pornește produsul nou. Conține și informații specifice Frevia (adrese, conturi, variabile de mediu, persoane): **acestea se ignoră** în produsul nou. Unde acest document intră în conflict cu `SPEC-APLICATIE-TRANSPORTATOR.md`, câștigă spec-ul.

---

# Frevia Control Center: setup, stare și logica aplicației (09.11.2026)

Document de referință complet: ce face aplicația, de ce funcționează așa, ce s-a schimbat față de versiunile anterioare și ce mai rămâne de făcut. Ultima actualizare completă: 22.10.2026; acesta include tot ce s-a adăugat până la 09.11.2026.

## 1. Adrese, conturi, mediu

- Aplicație publicată: https://frevia-app.vercel.app (Vercel, plan Pro, cont `clujaan`)
- Cod: GitHub privat `clujaan/frevia-app` (branch `main`; fiecare push republică automat în Vercel)
- Baza de date: Supabase, proiect `frevia-app`, regiune Frankfurt (eu-central-1). Plan gratuit deocamdată (fără backup zilnic): vezi „Export date" mai jos. SSA WMS este pus pe pauză (restaurabil până la 1 an), Self Agenda rămâne activ
- Utilizatori (ambii admin): sergiu.suciu@frevia.ro, silviu.moldovan@frevia.ro (creați în Authentication, adăugați în `app_users`)
- Local: `C:\Users\cluja\Projects\frevia-app` (PC laptop), `npm run dev`; `.env` conține doar URL și cheia publishable Supabase și NU se urcă pe GitHub
- Stiva: React 18 + Vite + Tailwind v4 + Supabase + Vercel; PWA; interfață română / engleză (comutator în antet)

### Variabile de mediu în Vercel
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY` (cheie Anthropic Console `frevia-app`) și `ORS_API_KEY` (OpenRouteService). Cheile nu se pun în browser, cod sau chat. Limita de cheltuieli Anthropic: Console → Manage → Spend limits. Trimiterea de email folosește Microsoft Graph (autentificare Microsoft doar în momentul trimiterii; id-urile aplicației Entra sunt variabile `VITE_`).

### Securitate (în vigoare)
- RLS pe toate tabelele: doar utilizatorii din `app_users` (`is_app_user()`) citesc/scriu
- Migrarea 025: utilizatorii neautentificați (anon) nu pot apela funcțiile bazei; `log_change()` nu e apelabilă prin API; numerotarea (FD-/CT-/CC-) merge doar pentru utilizatorii aplicației
- Fișierele (bonuri, facturi) merg în bucket privat `documents`
- CSP în `vercel.json`: `frame-src 'self' blob: https://login.microsoftonline.com`, `object-src 'self' blob:`, `img-src ... blob:` (pentru previzualizarea PDF și login Microsoft); HSTS, X-Frame-Options DENY, nosniff
- Funcțiile `/api` verifică utilizatorul Supabase; secretele rămân pe server

## 2. Meniul aplicației (grupuri pliabile)

- Panou principal (Dashboard)
- **Vânzări:** Lead-uri, Clienți (doar clienți), Interacțiuni
- **Operațional:** Market research, offers and analysis (Burse și oferte), Adrese încărcare / descărcare, Curse, Comenzi transport, Comandă Client, Transportatori
- **Financiar:** Facturi (încă marcaj), Cheltuieli generale, P&L săptămânal, Deconturi
- **Tools:** Camioane, Estimator cost cursă, Taxe de drum, Calculator de marjă, Convertor RON/EUR
- **Sistem:** Jurnal de activitate, Export date
- Adresele de încărcare/descărcare folosesc același tabel `clients` (tip „Loading/unloading place"), numerotare comună CL-xxx, filtrate pe pagină

## 3. Principii transversale (valabile în toată aplicația)

- **Date reale în producție:** migrările sunt doar aditive (tabele/coloane/funcții noi), nu șterg și nu modifică date existente. Redenumirile de statusuri sunt doar etichete pe ecran; valorile stocate în baza de date rămân neschimbate (constrângerile `check` din bază le cer).
- **Ferestre modale:** nu se închid la click pe fundal sau Esc (se pierdeau date); doar X, Anulează sau după salvare. Butoane „Salvează" și „Salvează și ieși".
- **Motiv obligatoriu** la ștergere/anulare (curse, comenzi) → salvat în Jurnal. La anularea unei comenzi din cursă, dialogul poate fi fără motiv (`noReason`).
- **Jurnal automat:** trigger `log_change()` pe tabele scrie cine/ce/când în `activity_log`; evenimente speciale prin `log_event()`.
- **Numerotare atomică:** `next_fd_code()` (FD-AAAA-NNN), `next_ct_code()` (CT-AAAA-NNN), `next_cc_code()` (CC-AAAA-NNN), curse CR-NNNN, clienți CL-xxx. Contoarele NU se resetează înainte de go-live decât la decizia lui Sergiu.
- **`makeEntityApi`:** la salvare rescrie rândul întreg din câmpurile listate (câmpurile nelistate devin null). De aceea datele auxiliare (amprente, blocări) stau în tabele separate, nu în rândul comenzii.

## 4. Modulele, în detaliu

### 4.1 Vânzări
- **Lead-uri:** stadii Nou → Contactat → Ofertă trimisă → Negociere → Pierdut / Convertit în client; pas următor cu dată (alertă când e scadent/întârziat); conversie lead → client (creează clientul sau leagă unul existent cu același CUI/nume și închide lead-ul)
- **Interacțiuni:** canal (Telefon, Email, WhatsApp, Întâlnire, Bursă, LinkedIn), direcție, rezumat, pas următor
- **Clienți:** firmă, CUI, adresă completă, contact, termen de plată, **monedă preferată (implicit EUR)**, limbă (țară ≠ RO → EN la comenzi)
- **Import „Formular client":** PDF completabil Frevia; câmpurile se citesc, se normalizează (date „26-27.10", „26.10 sau 27.10", termen plată „30 zile", „la descărcare" = 0) și se verifică înainte de import; adresele pe un singur rând sunt împărțite de `api/parse-client-form.js` (AI), cu euristică de rezervă

### 4.2 Burse și oferte (Market research, offers and analysis)
- O linie = o ofertă primită de pe bursă (Trans.eu, Timocom, Bursatransport etc.); statusuri Cerută, Ofertată, Acceptată, Respinsă, Fără răspuns, Expirată; import din excelul „Freight Offers Database"
- Încărcări/descărcări suplimentare (țară, localitate/cod poștal, dată), a doua dată posibilă (ex. „joi sau vineri"), km calculați pe ruta completă (OpenRouteService HGV), ruta completă și insigne `+N` în listă
- **Oferte primite de la transportatori** (mai multe pe ofertă, inclusiv firme care nu sunt în Transportatori): preț, monedă, curs, id extern, contact; se evidențiază cea mai ieftină
- **„📷 Ofertă din imagine":** lipire Ctrl+V sau fișier (max 3 capturi); `api/read-offer.js` (Claude vision); formularul se deschide pentru verificare
- Sugestii localități/coduri poștale din baza GeoNames (`postal_places`, migrarea 011)

### 4.3 Adrese și transportatori
- Adresă structurată în 5 câmpuri (firmă, stradă, cod poștal, localitate, țară) + județ și contact; adăugare rapidă de adresă din formularul cursei, fără a pierde ce e completat (`PlaceQuickAdd`)
- Transportatori: firmă, CUI, email principal + emailuri suplimentare (pentru trimiterea comenzilor), asigurare CMR valabilă până la, termen de plată, monedă, status. Alerta CMR din comandă folosește data asigurării (vezi 4.5)

### 4.4 Curse
Cursa (CR) este **punctul de legătură** dintre comanda de transport (CT, către transportator), comanda client (CC) și P&L.
- Listă cu: client, rută, date, **Cod UIT** (coloană; badge roșu „FĂRĂ UIT" când lipsește, ca să nu uităm emiterea), venit/cost/marjă în EUR mare și RON mic, curs, status
- **Coloane separate „Comandă transport" și „Comandă Client"** (în această ordine): cod/stare/buton de creare pentru fiecare. Butonul de creare CT apare pentru orice cursă neanulată fără CT; fiecare cursă are cel mult o CT activă și o CC (indecși unici parțiali)
- **UIT:** câmp text multi-rând (o cursă cu 2–3 descărcări are câte un UIT pe descărcare, unul pe rând); `uitList()` desparte pe rând/spațiu/virgulă
- **Transportatorul și costul nu se introduc de mână în cursă:** vin doar din comanda de transport activă (sursă unică). Câmpurile sunt blocate, cu mesaj și link spre comanda (`/comenzi?trip=ID`). La salvare, cost/monedă/transportator se suprascriu din CT. Anularea sau ștergerea CT golește doar costul și transportatorul cursei, nu anulează cursa
- **Prețul de vânzare** (venit) se introduce în cursă și se copiază în CC. La alegerea clientului, moneda venitului se ia din moneda preferată a clientului; valutele implicite sunt EUR
- **Avertizare „cursa nu are comandă de transport"** (cursa rămâne Planificată, statusul se poate schimba manual)
- **Cursa anulată:** nu se anulează automat când se anulează CT; se anulează doar de către utilizator. Când cursa e anulată, comenzile ei arată badge roșu „⛔ Cursa a fost anulată!"
- **Status direct din listă** (dropdown), ca în Comenzi transport, cu sincronizare cu CT (vezi 5.1)
- Avertizări (`checkTrip`): client lipsă, dată încărcare, tip serviciu, curs lipsă la sume în monede diferite, date incoerente, cost 0 pe cursă începută
- Avertizare la modificarea datelor după trimitere (vezi 5.3) și blocare la editare (vezi 5.4)

### 4.5 Comenzi transport (CT-AAAA-NNN, către transportatori)
- **Statusuri** (valoare în baza de date → etichetă pe ecran): Ciornă, Trimisă, Confirmată, `Semnată încărcată` → **Încărcat / Loaded**, `Executată` → **Livrat / Delivered**, Anulată
- Puncte numerotate de încărcare/descărcare (listă `stops` jsonb), fiecare cu dată, interval orar, referință, contact și **marfă pe rânduri** (tip, dimensiuni, kg, LDM orientativ = nr × lungime × lățime / 2,4); câmpurile vechi (`load_address`, `load_date` etc.) se deduc din puncte ca lista și căutarea să meargă ca înainte (migrările 020, 021)
- Termen de plată: zile + „de la" (`invoice` data facturii, `original` documente în original, `electronic` documente electronice, `unload` data descărcării, `eom` sfârșit de lună); comenzile vechi rămân pe „electronic" (migrarea 024)
- Cod UIT (multi-rând), nr. camion/remorcă, șofer, condiții speciale, temperatură, ADR, tip camion
- **Condiții generale Frevia** (RO/EN, `orderTerms.js`): atașate PDF-ului (acceptare, plată, factură e-Factura, asigurare min. 100.000 EUR, răspundere, termene și întârzieri, temperatură, RO e-Transport/UIT, subtransport, nedeturnarea clienților, mărfuri sensibile etc.). **Variantă de început, de verificat cu un jurist.**
- **PDF** (`orderPdf.js`, pdfmake) în limba aleasă pe comandă; **trimitere email** prin Microsoft Graph din căsuța utilizatorului, cu PDF atașat, care marchează comanda ca trimisă (data, destinatari, număr de trimiteri). Fereastra de login Microsoft se deschide **prima**, direct din apăsarea butonului (browserul o blochează dacă se deschide după generarea PDF-ului); clientul Microsoft se pregătește din timp la deschiderea ferestrei de email (`warmUpMail`); PDF-ul se generează după autentificare (`attachment.make()`); dacă pop-up-ul e blocat, mesajul cere să permiți ferestrele pop-up pentru adresa aplicației și să apeși din nou Trimite
- **Previzualizare PDF (👁 Previzualizează):** buton lângă „Descarcă PDF" și „Trimite email"; fereastră mare cu PDF-ul generat din datele curente din formular (fără salvare), în limba comenzii, fără comutator de limbă; butoane Descarcă / Deschide în tab nou / Închide; necesită transportator ales. Scop: verifici datele înainte de trimitere fără să descarci
- **Avertizări** (`checkOrder`), inclusiv **CMR:** asigurarea CMR a transportatorului lipsește sau expiră înainte de data încărcării
- **Anulare:** cere motiv; golește costul și transportatorul cursei; nu anulează cursa; comanda anulată nu mai e activă (se poate crea alta)
- Filtru `?running=1` (comenzi cu status Încărcat) folosit de Dashboard

### 4.6 Comandă Client (CC-AAAA-NNN, către clienți) — migrarea 026
- Comanda de transport completată de Frevia și trimisă clientului spre semnare; legată de aceeași cursă ca CT; creată din cursă (import) sau din pagina Comandă Client
- Se preiau din cursă: puncte cu marfă, date, client, referințe. **Prețul și moneda au o singură sursă: cursa** (venitul cursei); în CC sunt blocate când comanda e legată de o cursă
- Din client: limba, termenul de plată, moneda preferată. Expeditor (Sergiu Suciu / Silviu Moldovan), referința clientului
- PDF (`clientOrderPdf.js`), trimitere email, previzualizare PDF (👁, necesită client ales)
- **Cursa unei CC nu se mai poate schimba** după creare (trigger `lock_cc_trip`, migrarea 028)
- Caseta **„Curse fără comandă client":** listează cursele neanulate care nu au CC; cursele anulate sunt excluse din lista de import, iar o cursă anulată apare cu banner de avertizare
- Amprentă „trimis", blocare la editare și UIT multi-rând, ca la CT

### 4.7 Financiar
- **Cheltuieli generale:** categorii (Leasing, Asigurări, Software, Burse transport, Contabilitate, Chirie, Telecom, Salarii, Marketing etc.); tipuri: Recurent lunar, Recurent anual, Unic – amortizat, Unic – one time cost; prag amortizare 500 RON fără TVA deductibil (propunere automată + avertisment peste/sub prag); TVA 21% / 11% / 0; furnizor, nr. document, dată document; curs RON/EUR completat automat la data documentului (editabil); buton „Completează cursurile lipsă"
  - Importuri: **e-Factura** din SPV (XML sau ZIP, citit direct din XML, fără AI), **PDF/poză** (citire AI), **raport SmartBill „Documente furnizor"** (.xls/.xlsx); furnizor cunoscut → preia categoria, tipul și TVA din ultimul cost; detectare dubluri (număr+furnizor, și față de foile de decont); recurentele noi închid rândul recurent anterior al aceluiași furnizor
  - O linie de decont poate deveni cost o singură dată (index unic); foile RAMBURSATE se propun spre adăugare în costuri
- **P&L** (săptămânal / lunar / anual, EUR sau RON, export Excel și PDF): săptămâni ISO (luni–duminică); venituri și costuri de transport intră în **săptămâna datei de încărcare**; overheads = cheltuieli generale alocate pe săptămâni (inclusiv amortizări). **Anul ISO** al săptămânii curente (primele zile din ianuarie pot fi încă anul trecut); primul an 2026. **Intră în P&L doar cursele cu comandă de transport activă**; cursele fără CT sunt considerate ciorne și nu se contorizează (apare o notă cu numărul lor)
- **Deconturi:** foaie nouă FD-AAAA-NNN (până la 10 rânduri, TVA 21% automat/manual, valută, bifă CUI Frevia), poze/PDF pe rând, citire AI (`api/read-document.js`), detectare duplicate, PDF identic cu modelul + atașamente (poze corectate EXIF, câte una pe pagină), export Excel; statusuri Ciornă, Emis, Trimis contabilă, Rambursat, Anulat
- **Facturi emise (SmartBill):** încă nu e construit

### 4.8 Tools
- **Camioane:** cost/km pe cap tractor (capital, costuri fixe anuale, consum, remorcă prelată/frigorific, agregat)
- **Estimator cost cursă:** estimare folosind camionul ales, km, zile cu agregat pornit (introduse sau estimate din km / km pe zi)
- **Taxe de drum:** profil de bază 40 t, 5 axe, Euro VI, țări UE; trei zone (taxe pe țări cu nivel de încredere Verificat / Sursă secundară / Estimat / Lipsă; costuri suplimentare: poduri, tunele, vignete; calculator de rută)
  - Calculator: până la 6 variante de rută pe cerere (filtru 1,35× km față de baza), țări non-UE evitate, km pe țară din poliliniile ORS (`api/km.js`, tabel static de id-uri de țară), km pe autostradă
  - „Traseu estimat" (vămi și orașe, `api/_geo.js`, liste statice) + link „Verifică în Google Maps"
  - Ungaria: coridoare exacte (HUF prin ECB, bifă „fără TVA"); Polonia ~0,12 €/km (e-TOLL din 1 feb 2026); România TollRO din 1 oct 2026: 0,48 lei/km autostradă/drum expres, 0,24 lei/km drum național, brut cu TVA, Euro VI (rate din surse secundare, neconfirmate oficial)
  - Camion din flotă, bifă frigorific, greutate marfă manuală (consum prin interpolare liniară), „Cost total / km"
- **Calculator de marjă:** preț client, cost transportator, cheltuieli extra în orice combinație RON/EUR; marjă EUR și %, adaos peste cost, preț minim pentru marja dorită, marjă/km
- **Convertor RON/EUR:** curs la o dată aleasă (BNR, iar dacă e indisponibil ECB)

### 4.9 Sistem
- **Jurnal de activitate:** filtre după entitate, acțiune, utilizator, perioadă; etichete românești pentru câmpuri (inclusiv „Cod UIT", „Termen plată – de la")
- **Export date:** copie de siguranță descărcată pe calculator (Excel/CSV, toate tabelele principale: curse, comenzi, comenzi client, clienți, transportatori, oferte, lead-uri, interacțiuni, cheltuieli, deconturi, camioane, taxe, jurnal). **De făcut săptămânal până la trecerea pe Supabase Pro** (backup zilnic)

### 4.10 Dashboard
- Hero truck ca fundal de antet; casetă de curs RON/EUR (LED, portocalie, dreapta sus; sursă BNR sau ECB)
- **Curse în desfășurare:** număr în titlu, lista clicabilă; se bazează pe **comenzi de transport cu status Încărcat** (nu pe statusul cursei) și duce la `/comenzi?running=1`. (Bug rezolvat: se numărau cursele „În curs", iar utilizatorul avea comenzi Încărcat → apărea 0.)
- Alerte: foi de decont emise dar netrimise (NETRIMIS) și pași de lead scadenți (PAS SCADENT); alerta pentru asigurarea CMR există doar pe comanda de transport, nu în Dashboard. Financiar în EUR: P&L săptămâna curentă, cumulat an, încasări, costuri, costuri recurente (REC = anual/12); FAC/RES rămân „—" până la Facturi emise
- Fără alerte noi pe statusuri (decizie: deocamdată nu)

## 5. Logici de fond

### 5.1 Statusuri și sincronizare Cursă ↔ Comandă transport (bidirecțională)
Statusul se poate pune oricând manual, atât în Comenzi, cât și în lista Curse (dropdown); celălalt se aliniază automat.
| Comandă transport (stocat → afișat) | → Cursă |
|---|---|
| Ciornă / Trimisă / Confirmată | Planificată |
| Semnată încărcată → **Încărcat** | În curs (afișat **Încărcat**) |
| Executată → **Livrat** | Livrată (afișat **Livrat**) |
Invers: cursa În curs → CT „Semnată încărcată"; Livrată → Executată; Planificată cu CT Încărcat/Livrat → CT Confirmată. Cursa Anulată nu e modificată de CT. Statusurile Facturată / Încasată / Anulată ale cursei nu sunt atinse de sincronizare (`TRIP_OPERATIONAL` = Planificată, În curs, Livrată). Sincronizarea nu face bucle: salvarea CT apelează `syncTripFromOrder`, care scrie direct în API-ul de bază al curselor. La încărcarea listei, statusurile existente nealiniate se aliniază.

### 5.2 Sursă unică pentru bani
- Preț vânzare = cursa (venit) → copiat în CC
- Cost + transportator = CT activă → copiat în cursă (read-only în cursă)
- P&L = doar curse cu CT activă; venit/cost în săptămâna datei de încărcare

### 5.3 Amprente „trimis" (avertizare la modificări după trimitere) — migrarea 027
- Tabel `sent_snapshots` (entity, entity_id, snapshot jsonb, taken_at, taken_by; PK entity+entity_id), pentru `ct` și `cc`
- Amprenta (`fpOf`) conține: data încărcării, data descărcării, semnătura punctelor, **marfa** (tip, nr., greutate, dimensiuni, LDM, descriere, pe fiecare punct; `goodsSig`), preț+monedă, partea (transportator/client)
- La trimiterea comenzii se face o amprentă. Dacă ulterior cursa/comanda diferă, apare un banner (`StaleBanner`) cu ce s-a schimbat și butoane **„Am verificat"** (reia amprenta) / **„Retrimite"**. Se aplică în Curse, Comenzi transport, Comandă Client
- Compatibilitate: `staleKeys` compară o cheie doar dacă amprenta veche o conține, deci amprentele create înainte de adăugarea mărfii nu dau avertizări false (marfa începe să fie urmărită după „Am verificat" sau „Retrimite")
- **Marfa din CT/CC se copiază din cursă doar la creare**; prețul se citește mereu din cursă. Dacă adaugi un palet în cursă după trimitere, bannerul arată „marfă"; actualizezi manual marfa în comenzile create, apoi apeși „Am verificat" sau „Retrimite"
- Comenzile deja trimise înainte de această funcție primesc o amprentă de bază leneșă (`baselineSnaps`), doar dacă cursa nu s-a modificat de la trimitere; erorile de tabel lipsă sunt înghițite (aplicația merge și fără migrare)

### 5.4 Blocare la editare (un singur utilizator odată) — migrarea 027
- Tabel `edit_locks` + funcții `acquire_edit_lock` / `release_edit_lock` (SECURITY DEFINER, cu RLS, doar pentru authenticated); expirare 90 s fără semnal, reînnoire la 30 s, eliberare la închidere/`pagehide`
- Al doilea utilizator care deschide aceeași cursă/CT/CC vede fereastra „în editare de X" (Reîncearcă / Închide) și nu poate deschide formularul; dacă pierzi blocarea, apare un strat de avertizare. Nu există buton de preluare forțată
- Limită cunoscută: blocarea nu acoperă acțiunile directe din rândurile listei (de ex. schimbarea statusului din dropdown)

### 5.5 Curs RON/EUR automat
`api/bnr-rate.js` încearcă BNR; dacă bnr.ro blochează IP-urile Vercel („Request Rejected") folosește ECB (frankfurter), marcat „ECB". ECB publică ~16:00, BNR ~13:00, deci dimineața apare cursul zilei precedente. Se completează automat la cursele în RON, la cheltuieli (la data documentului) și există butoane „Completează cursurile lipsă".

## 6. Baza de date: migrări (în ordine; toate doar aditive)
`schema.sql` conține schema completă actualizată; migrările se rulează o singură dată în Supabase → SQL Editor.
- 002 cheltuieli (furnizor, nr./dată document, linie decont) · 003 tip serviciu curse · 004 oferte bursă · 005 comenzi transport (+ `next_ct_code`) · 006 adrese structurate în curse · 007 jurnal de activitate · 008 emailuri suplimentare transportatori · 009 clienți cu adresă + tip · 010 o singură comandă activă pe cursă (index unic + `lock_order_trip`)
- 011 coduri poștale (GeoNames) · 012 oferte: locuri suplimentare · 013–014 camioane (remorcă, frigorific) · 015–019 taxe de drum (tari, coridoare, trasee, RO TollRO, PL e-TOLL) · 020 interval orar/referință/marfă pe punctul principal al cursei · 021 puncte pe comanda de transport · 022 oferte primite de la transportatori · 023 date alternative · 024 termen plată „de la" · 025 securitate funcții
- **026** Comandă Client (`client_orders`, `next_cc_code`) · **027** amprente „trimis" + blocări la editare · **028** trigger `lock_cc_trip`
- **De verificat că au fost rulate: 026, 027, 028** (aplicația funcționează și fără 027, dar fără amprente/blocări)

## 7. Fișiere cheie
- `src/pages/`: Curse, Comenzi, ComandaClient, Burse, Cheltuieli, PL, Deconturi/DecontEditor, Dashboard, Leaduri, Interactiuni, Jurnal, ExportDate, Tool*
- `src/lib/`: trips.js (calcTrip, checkTrip, syncTripFromOrder, etichete status), orders.js (ORDERS_API, checkOrder, uitList, syncOrderFromTripStatus), clientOrders.js, orderPdf.js, clientOrderPdf.js, orderStops.js, orderTerms.js, sentSnapshot.js, editLock.jsx, pl.js, costs.js, graphMail.js, efactura.js, smartbillReport.js, importInvoice.js, tolls.js, bnr.js, km.js
- `src/components/`: StaleBanner, PdfPreview, ReasonModal, StopBox, GoodsEditor, PlaceQuickAdd, ImportReportModal, ImportClientFormModal, AddToCostsModal
- `api/`: bnr-rate, km, _geo (fără endpoint, prefix `_`), parse-client-form, read-document, read-offer
- `scripts/`: load-postcodes.mjs, build-client-forms.mjs / .docx

## 8. Note tehnice
- Modelul claude-sonnet-5-5 nu acceptă `tool_choice` forțat
- `api/km.js` are `maxDuration` 30 s; ORS gratuit are limite (de aceea țările se rezolvă din tabel static)
- `api/places.js` este învechit (`git rm api/places.js`)
- Previzualizarea PDF folosește blob + iframe; dacă pe telefon nu se afișează în fereastră, „Deschide în tab nou" îl deschide în vizualizatorul telefonului
- **Pagină veche după deploy:** PWA-ul se actualizează automat, iar o filă deschisă poate cere fișiere (de ex. `vfs_fonts-*.js`) care nu mai există. `src/lib/lazyLoad.js` (`lazy()`) învelește importurile dinamice pdfmake (orderPdf, clientOrderPdf, foaiePdf) și afișează „Aplicația a fost actualizată între timp… reîncarcă (Ctrl+Shift+R)"
- Pop-up blocker: login-ul Microsoft folosește fereastră pop-up; dacă browserul o blochează, se alege „Always allow" pentru adresa aplicației
- **Harta aplicației (3D „creier" + variante 2D):** Artifact privat „Creierul Frevia" (42 noduri / 98 muchii, RO+EN, module în lucru marcate) și fișier independent `Harta_Frevia_3D.html` (funcționează offline, three.js inclus). Nu face parte din aplicație; integrarea în meniul Sistem ar cere three.js în pachet (CSP `script-src 'self'`). Dacă se schimbă fluxurile, harta se actualizează separat
- Test în Node pentru logica pură: `npx esbuild fișier --bundle --platform=node --format=esm --define:import.meta.env=...`

## 9. De testat / de făcut
**De testat pe site (după deploy):**
- Previzualizare PDF în CT și CC (și pe telefon); `vercel.json` modificat (CSP) → necesită redeploy
- După deploy: trimitere email CT/CC (login Microsoft direct, fără blocare), previzualizare PDF după un deploy nou, banner „marfă" la adăugarea unui palet într-o cursă trimisă
- Coloana UIT, sincronizarea de statusuri în ambele sensuri, Dashboard „Curse în desfășurare", bannerele de modificare după trimitere, blocarea cu doi utilizatori
- Taxe de drum: test Cluj → Waalwijk, km autostradă RO vs. SafeFleet, vămi/orașe, frigo, „Cost total / km"
- Import din capturi pe date reale; „Completează cursurile lipsă" (Cheltuieli, Curse), Financiar vs. P&L
- Șters cursele/comenzile de test rămase

**Rămas din audit (neabordat încă):** termen de plată implicit pe cursă (A5), A6, A7, C5, D5, D1–D3, C1–C3, C6 (înainte de al treilea cont), mai multe casete Dashboard (Facturat/de încasat, Restanțe, Oferte active) (D4), risc de dublă trimitere dacă emailul pleacă dar salvarea eșuează (C4), alerte pe statusuri (B8, amânat), marfă copiată automat din cursă în comenzile netrimise (de decis), blocare și pentru acțiunile din rândurile listei, verificare CMR/UIT pe fiecare punct de descărcare (nesolicitat)
**După trecerea pe Supabase Pro:** salvarea PDF-ului exact trimis în bucket privat, backup zilnic automat
**Module următoare:** Documente și termene, Facturi emise (SmartBill API), Export Excel foaie decont
**Mai târziu:** login Microsoft 365, domeniu app.frevia.ro, al doilea admin Entra, verificare juridică a condițiilor standard, job zilnic pentru cursul BNR oficial (dacă rămâne blocat), motiv la ștergere clienți/transportatori, copiere locuri suplimentare ofertă → cursă, etichete în Jurnal pentru `toll_routes` / `toll_corridors`, eventual secțiune cash-basis în Financiar
**Taxe de drum, țări rămase „Estimat"/„Lipsă":** SK, CZ, BG, SI, HR, IT, FR, ES, PT, GR, RS, DK, SE, EE, LV, LT, LU, IE, NO, GB, TR; confirmare tarife TollRO și e-TOLL pe surse oficiale; calibrare RO cu facturi reale

## 10. Livrare cod (flux)
Modificările de la Claude se livrează în folderul local; Sergiu rulează, pe linii separate, `git add .`, `git commit -m "..."`, `git push` în terminalul VS Code. Verificare: `git status --short`. După deploy: Ctrl+Shift+R. Dacă git deschide pager-ul, ieșire cu `q` (sau `git config --global core.pager cat`). Testele se fac doar pe site-ul publicat. Migrările SQL le rulează Sergiu în Supabase SQL Editor.
