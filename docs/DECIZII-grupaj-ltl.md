# Decizii de model: grupaj (LTL) și distribuție subcontractată

Confirmat de Sergiu, 2026-11-10. Are prioritate față de SPEC-APLICATIE-TRANSPORTATOR.md acolo unde diferă (secț. 3, 7).

## Fluxul real
- Camionul propriu face cursa-circuit bază -> import -> bază.
- În camion sunt **3–6 mărfuri de la clienți diferiți, din localități diferite (LTL / grupaj)**. Fiecare client plătește pentru marfa lui.
- La bază, marfa pentru livrările din România se **dă altor transportatori (subcontractare), contra cost**, câte o livrare/grup.

## Consecințe pentru model
- Comenzile (mărfurile) sunt entitatea de venit; o cursă are mai multe comenzi, fiecare cu client, încărcare și descărcare proprii.
- **Transportatorii și Comenzile de transport (CT) rămân în meniul principal.** Nu mai sunt „rare".
- O comandă poate avea unul sau mai multe **tronsoane de distribuție subcontractate** (CT către transportator, cu cost).
- Un CT nu mai este limitat la o cursă proprie (indexurile unice vechi „un CT activ pe cursă" se elimină în Etapa 3).
- Profit, afișat separat și total: transport propriu (până la bază), distribuție (cost subcontractat), total; pe cursă, camion, șofer, client, lună.
- **Repartizarea costului cursei proprii pe mărfuri** (decis 2026-11-10): implicit după **LDM**; criteriul implicit se alege în Setări firmă (`company_settings.cost_allocation_basis`) și se poate schimba pe o cursă (`trips.allocation_basis`). Opțiuni: LDM, greutate, paleți, pondere din venit. Dacă o comandă din cursă nu are valoarea criteriului ales, cursa se repartizează pe criteriul următor pe care îl au toate comenzile (LDM → greutate → paleți → venit) și aplicația arată ce criteriu a folosit. Același criteriu împarte costul unui CT de distribuție care duce mai multe mărfuri.

## Alte decizii
- Meniul rămâne ca în sursă; se schimbă pe etape.
- Dashboard: curse în desfășurare, profit pe lună/camion, documente care expiră, costuri nealocate.
- Pilot: 6–20 camioane.

## Plan extins și ordinea etapelor (decis de Sergiu, 2026-11-11)
Ordinea de lucru de acum (înlocuiește ordinea din SPEC secț. 13 acolo unde diferă):
1. **Etapa 4 — costuri, combustibil, profit** (ca în SPEC). Precizări:
   - Costurile directe ale cursei se repartizează pe mărfuri după criteriul cursei (LDM implicit), nu după venit; profitul pe client folosește aceeași repartizare.
   - Un cost cu camion se alocă automat cursei acelui camion dacă data lui e între plecare și întoarcere; altfel apare în „Nealocate", de unde se alocă manual unei curse sau se marchează „cost al camionului pe lună" (ex. service).
   - Cursa intră în luna în care a plecat din bază (`start_at`).
2. **Etapa 4b — Tabla flotei + găsirea returului.** Calendar pe camioane (rând = camion, coloane = zile), camioanele fără retur marcate; la o descărcare, ofertele din Burse care încarcă în zonă și vin spre România, cu profitul estimat al cursei tur+retur; km goi pe camion/lună.
3. **Etapa 5 — Deconturi legate de cursă + diurnă automată** (ca în SPEC).
4. **Etapa 5b — Pachetul Mobilitate:** alerte pentru întoarcerea camionului în RO (8 săptămâni), întoarcerea șoferului acasă (3–4 săptămâni), cabotaj (3 operațiuni în 7 zile + pauză), evidența declarațiilor de detașare pe țară și șofer.
5. **Etapa 6 — Documente și termene + Dashboard** (ca în SPEC), plus revizii după km (service, anvelope, tahograf) și documentele șoferului (atestat, card tahograf, aviz medical/psihologic).
6. **Etapa 6b — CMR și încasări:** pe comandă: CMR primit de la șofer → trimis prin curier (AWB) → primit de client; scadența se calculează din data aleasă (inclusiv primirea CMR-ului original); încasări pe vechime (0–30/31–60/>60), alertă la depășirea limitei de credit.
7. **Etapa 6c — Facturare:** factură din comandă (EUR, curs BNR din ziua anterioară), export e-Factura (pornind de la `src/lib/efactura.js`); pagina Facturi.
8. **Etapa 7, 8, 9** ca în SPEC.
Mai târziu: pagină simplă de șofer pe telefon (cursa lui, poze CMR/bonuri), amenzi și daune, link de urmărire pentru client, rapoarte profit/km și profit/zi, GPS.
