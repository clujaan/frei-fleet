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
