// Tools → Camioane: cost / km pe cap tractor (model preluat din calculul Excel „calcul_vans”).
import { makeEntityApi } from './entityApi'
import { parseNum } from './format'

const L = (ro, en) => ({ ro, en })

export const FREQ = ['An', 'Lună', 'Unic']
export const ITEM_KINDS = ['Intervenție mecanică', 'Asigurare', 'Alt cost']

// type: text | number | select. def = valoare implicită la camion nou. help = explicație simplă (iconița „i”). show = condiție de afișare.
const REEFER = (f) => f.trailer_type === 'Frigorific'
export const TRAILER_TYPES = ['Prelată', 'Frigorific', 'Alt tip']
export const TRUCK_SECTIONS = [
  { key: 'basic', title: L('Date generale', 'General'), fields: [
    { key: 'plate', type: 'text', label: L('Număr de înmatriculare', 'Plate number'), required: true },
    { key: 'label', type: 'text', label: L('Marcă / model', 'Make / model') },
    { key: 'status', type: 'select', options: ['Activ', 'Inactiv'], label: L('Status', 'Status'), def: 'Activ' },
    { key: 'currency', type: 'select', options: ['EUR', 'RON'], label: L('Moneda calculului', 'Calculation currency'), def: 'EUR',
      help: L('Moneda în care introduci TOATE sumele de mai jos. Rezultatul se arată în ambele monede, cu cursul de mai jos.', 'The currency in which you enter ALL amounts below. The result is shown in both currencies using the rate below.') },
    { key: 'fx_rate', type: 'number', label: L('Curs RON / EUR', 'RON / EUR rate'),
      help: L('Câți lei face 1 euro. Se completează automat cu cursul de azi (butonul BNR îl reia). Folosit doar pentru a arăta rezultatul și în cealaltă monedă.', 'How many lei 1 euro is worth. Filled automatically with today’s rate (the BNR button refreshes it). Used only to show the result in the other currency.') },
  ] },
  { key: 'capital', title: L('Achiziție, amortizare, dobândă', 'Purchase, depreciation, interest'), fields: [
    { key: 'financing', type: 'select', options: ['Achiziție', 'Leasing'], label: L('Finanțare cap tractor', 'Tractor financing'), def: 'Achiziție',
      help: L('Achiziție = ai plătit camionul (se calculează amortizarea și dobânda de capital). Leasing = plătești o rată lunară; atunci amortizarea și dobânda capului tractor nu se mai calculează separat, se folosește doar rata.', 'Purchase = you paid for the truck (depreciation and cost of capital are calculated). Leasing = you pay a monthly instalment; then tractor depreciation and interest are not calculated separately, only the instalment is used.') },
    { key: 'purchase_price', type: 'number', label: L('Preț de achiziție cap tractor', 'Tractor purchase price'),
      help: L('Cât ai plătit (sau vei plăti) pentru capul tractor, fără TVA dacă o deduci.', 'What you paid (or will pay) for the tractor unit, excluding VAT if you deduct it.') },
    { key: 'residual_value', type: 'number', label: L('Valoare reziduală cap tractor', 'Tractor residual value'),
      help: L('Cât crezi că va valora camionul la finalul perioadei de amortizare, dacă l-ai vinde atunci. Se scade din preț: amortizarea pe an = (preț − valoare reziduală) ÷ ani. Exemplu: cumperi cu 55.000 €, peste 5 ani crezi că îl vinzi cu 20.000 € → „pierzi” 35.000 € în 5 ani, adică 7.000 € pe an. Ca reper, uită-te la prețul unui camion similar, cu 5 ani și mai mulți km.', 'What you expect the truck to be worth at the end of the depreciation period if you sold it then. It is deducted from the price: yearly depreciation = (price − residual value) ÷ years. Example: you buy for €55,000 and expect to sell for €20,000 in 5 years → you “lose” €35,000 in 5 years, i.e. €7,000 a year. As a guide, look at the price of a similar truck that is 5 years older with more km.') },
    { key: 'depr_years', type: 'number', label: L('Ani de amortizare cap tractor', 'Tractor depreciation years'), def: '5',
      help: L('Perioada după care socotești că vinzi sau înlocuiești camionul. Nu e durata lui de viață, ci orizontul tău de calcul; pentru cap tractor, de obicei 4–6 ani.', 'The period after which you expect to sell or replace the truck. It is not its service life but your calculation horizon; for a tractor unit, usually 4–6 years.') },
    { key: 'leasing_monthly', type: 'number', label: L('Rată leasing / lună', 'Leasing instalment / month'),
      help: L('Rata lunară din contractul de leasing, fără avans. Se folosește doar dacă finanțarea e Leasing.', 'The monthly instalment from the leasing contract, excluding the down payment. Used only when financing is Leasing.') },
    { key: 'trailer_type', type: 'select', options: TRAILER_TYPES, label: L('Tip remorcă', 'Trailer type'), def: 'Prelată',
      help: L('Prelată = marfă generală. Frigorific = remorcă cu agregat termic (thermo): apar câmpurile agregatului, iar costul include motorina și service-ul lui. Cu agregatul oprit (marfă generală) costul e mai mic decât cu el pornit la −18 °C.', 'Curtainsider = general cargo. Reefer = trailer with a refrigeration unit: the unit’s fields appear and the cost includes its fuel and servicing. With the unit off (general cargo) cost is lower than with it running at −18 °C.') },
    { key: 'equip_price', type: 'number', label: L('Preț remorcă / alte echipamente', 'Trailer / other equipment price'),
      help: L('Prețul semiremorcii și al echipamentelor cumpărate separat (agregat frigorific, prelată, centuri de ancorare). O remorcă frigorifică costă mult mai mult decât una cu prelată.', 'Price of the semi-trailer and separately bought equipment (refrigeration unit, tarpaulin, lashing straps). A reefer trailer costs much more than a curtainsider.') },
    { key: 'equip_residual', type: 'number', label: L('Valoare reziduală remorcă / echipamente', 'Trailer residual value'),
      help: L('La fel ca la capul tractor: cât crezi că valorează remorca la finalul amortizării.', 'Same idea as for the tractor: what you expect the trailer to be worth at the end of depreciation.') },
    { key: 'equip_depr_years', type: 'number', label: L('Ani de amortizare remorcă', 'Trailer depreciation years'), def: '8',
      help: L('Semiremorcile se țin de obicei mai mult decât capul tractor, deci amortizarea e mai lentă (adesea 7–10 ani).', 'Semi-trailers are usually kept longer than the tractor, so depreciation is slower (often 7–10 years).') },
    { key: 'interest_pct', type: 'number', label: L('Dobândă / cost de capital (% pe an)', 'Interest / cost of capital (% a year)'), def: '2.8',
      help: L('Costul banilor blocați în camion. Dacă ai credit, pune dobânda lui; dacă ai plătit din banii tăi, pune dobânda pe care ai fi primit-o ținând banii la bancă. Se aplică la media dintre preț și valoarea reziduală (capitalul mediu blocat).', 'The cost of the money tied up in the truck. With a loan use its interest rate; if you paid with your own money, use the interest you would have earned keeping it in the bank. Applied to the average of price and residual value (average capital tied up).') },
  ] },
  { key: 'reefer', title: L('Agregat frigorific (thermo)', 'Refrigeration unit (reefer)'), fields: [
    { key: 'reefer_temp', type: 'text', show: REEFER, label: L('Temperatura de lucru (informativ)', 'Set temperature (informational)'),
      help: L('Doar pentru evidență, ex. −18 °C (congelat) sau 0…+4 °C (refrigerat). Nu intră în calcul; pune în consum media pentru temperatura ta uzuală.', 'For reference only, e.g. −18 °C (frozen) or 0…+4 °C (chilled). Not used in the calculation; enter the average consumption for your usual temperature.') },
    { key: 'reefer_l_h', type: 'number', show: REEFER, label: L('Consum agregat (litri / oră de funcționare)', 'Unit fuel use (litres / running hour)'),
      help: L('Motorina consumată de agregat într-o oră de funcționare. Depinde de model, de temperatura setată (−18 °C consumă mai mult) și de vreme. Cel mai sigur: media din cursele tale sau de la service-ul agregatului.', 'Diesel the unit burns in one running hour. Depends on model, set temperature (−18 °C uses more) and weather. Safest: the average from your trips or from the unit’s service provider.') },
    { key: 'reefer_hours_day', type: 'number', show: REEFER, label: L('Ore de funcționare pe zi (cu marfă la bord)', 'Running hours per day (with cargo on board)'), def: '24',
      help: L('Câte ore pe zi merge agregatul cât timp ai marfă frigorifică. 24 dacă merge continuu (include încărcarea, descărcarea și pauzele).', 'How many hours a day the unit runs while you carry refrigerated cargo. 24 if it runs continuously (including loading, unloading and breaks).') },
    { key: 'reefer_days_year', type: 'number', show: REEFER, label: L('Zile pe an cu agregat pornit', 'Days per year with unit running'),
      help: L('Câte zile din an transporți marfă la temperatură controlată. În restul zilelor transporți marfă generală, cu agregatul oprit, deci fără acest cost.', 'How many days a year you carry temperature-controlled cargo. On the other days you carry general cargo with the unit off, with no such cost.') },
    { key: 'reefer_maint_h', type: 'number', show: REEFER, label: L('Service agregat / oră de funcționare', 'Unit servicing / running hour'),
      help: L('Costul mediu de întreținere al agregatului (ulei, filtre, revizii) raportat la o oră de funcționare. Furnizorul agregatului îți poate da o medie.', 'Average maintenance cost of the unit (oil, filters, inspections) per running hour. The unit’s supplier can give you an average.') },
  ] },
  { key: 'fixed', title: L('Asigurări și taxe fixe (pe an)', 'Insurance and fixed taxes (per year)'), fields: [
    { key: 'rca', type: 'number', label: L('Asigurare RCA', 'RCA insurance'),
      help: L('Asigurarea obligatorie de răspundere civilă auto: acoperă daunele produse altora. Suma pe an.', 'Compulsory motor third-party liability insurance: covers damage you cause to others. Yearly amount.') },
    { key: 'cmr', type: 'number', label: L('Asigurare CMR', 'CMR insurance'),
      help: L('Asigurarea răspunderii transportatorului pentru marfa transportată (pierdere, avarie), conform convenției CMR. Suma pe an.', 'Insurance for the carrier’s liability for cargo carried (loss, damage) under the CMR convention. Yearly amount.') },
    { key: 'casco', type: 'number', label: L('Asigurare CASCO', 'CASCO insurance'),
      help: L('Asigurarea daunelor propriului camion (accident, furt). Opțională; lasă gol dacă nu o ai.', 'Insurance for damage to your own truck (accident, theft). Optional; leave empty if you do not have it.') },
    { key: 'other_insurance', type: 'number', label: L('Alte asigurări', 'Other insurance') },
    { key: 'own_risk', type: 'number', label: L('Franșiză / risc propriu (rezervă)', 'Own risk / deductible reserve'),
      help: L('Franșiza e partea dintr-o daună pe care o plătești tu. Aici treci o sumă anuală pusă deoparte pentru astfel de cazuri.', 'The deductible is the part of a claim you pay yourself. Enter a yearly amount set aside for such cases.') },
    { key: 'road_tax', type: 'number', label: L('Impozit mijloc de transport', 'Vehicle tax'),
      help: L('Impozitul anual pe mijlocul de transport, plătit la primărie.', 'Annual vehicle tax paid to the local authority.') },
    { key: 'eurovignet', type: 'number', label: L('Rovinietă / Eurovignette', 'Road vignette / Eurovignette'),
      help: L('Taxele de utilizare a drumurilor plătite pe perioadă (ex. rovinieta). Taxele pe km, pe țări, vor fi într-un tool separat; nu le pune aici ca să nu se dubleze.', 'Road-use charges paid per period (e.g. the Romanian vignette). Per-km tolls by country will be in a separate tool; do not enter them here to avoid double counting.') },
    { key: 'phone_year', type: 'number', label: L('Telefon (an)', 'Phone (year)') },
    { key: 'local_taxes', type: 'number', label: L('Taxe locale', 'Local taxes') },
    { key: 'papers_year', type: 'number', label: L('ITP, acte, licențe (an)', 'Inspection, papers, licences (year)'),
      help: L('Inspecția tehnică periodică, copii conforme ale licenței de transport, atestate, verificarea tahografului etc., pe an.', 'Periodic technical inspection, certified copies of the transport licence, certificates, tachograph checks etc., per year.') },
  ] },
  { key: 'driver', title: L('Șofer', 'Driver'), fields: [
    { key: 'driver_salary_month', type: 'number', label: L('Salariu șofer / lună', 'Driver salary / month'),
      help: L('Salariul lunar al șoferului (brut sau, dacă îl ai, costul total pentru firmă). Dacă pui doar brutul, folosește câmpul de majorare de mai jos.', 'The driver’s monthly salary (gross, or the total cost to the company if you have it). If you enter only the gross, use the surcharge field below.') },
    { key: 'driver_burden_pct', type: 'number', label: L('Majorare cost angajator (%)', 'Employer cost surcharge (%)'), def: '10',
      help: L('Procent adăugat peste salariul introdus, pentru ce mai plătești tu ca angajator: contribuția asiguratorie pentru muncă (CAM, 2,25%), tichete de masă, concedii plătite, medicina muncii, echipament. Dacă ai introdus deja costul total al angajatorului, pune 0. Dacă ai introdus doar brutul, 10% e o estimare prudentă.', 'A percentage added on top of the salary you entered, for what else you pay as employer: work insurance contribution (CAM, 2.25%), meal vouchers, paid leave, occupational health, equipment. If you already entered the total employer cost, put 0. If you entered only the gross, 10% is a prudent estimate.') },
    { key: 'perdiem_ro_day', type: 'number', label: L('Diurnă în România / zi', 'Per diem inside RO / day'),
      help: L('Suma zilnică plătită șoferului în delegație pe teritoriul României.', 'The daily amount paid to the driver on assignment inside Romania.') },
    { key: 'perdiem_ro_days', type: 'number', label: L('Zile în România / an', 'Days inside RO / year') },
    { key: 'perdiem_abroad_day', type: 'number', label: L('Diurnă externă / zi', 'Per diem abroad / day'),
      help: L('Suma zilnică plătită șoferului în delegație în străinătate (de obicei mai mare).', 'The daily amount paid to the driver on assignment abroad (usually higher).') },
    { key: 'perdiem_abroad_days', type: 'number', label: L('Zile în străinătate / an', 'Days abroad / year') },
    { key: 'lodging_night', type: 'number', label: L('Cazare / noapte', 'Lodging / night'),
      help: L('Doar dacă firma plătește cazarea. Dacă șoferul doarme în cabină, lasă gol.', 'Only if the company pays for lodging. If the driver sleeps in the cab, leave empty.') },
    { key: 'lodging_nights', type: 'number', label: L('Nopți cazare / an', 'Lodging nights / year') },
  ] },
  { key: 'fuel', title: L('Consum și motorină', 'Fuel consumption'), fields: [
    { key: 'cons_light', type: 'number', label: L('Consum cu încărcătură mică (l / 100 km)', 'Consumption, light load (l / 100 km)'), def: '25',
      help: L('Litri la 100 km, cu o încărcătură ușoară (cu greutatea de mai jos). Împreună cu punctul „încărcătură mare” formează o dreaptă: pentru orice altă greutate consumul se calculează între cele două puncte.', 'Litres per 100 km with a light load (at the weight below). Together with the “heavy load” point it forms a line: for any other weight consumption is calculated between the two points.') },
    { key: 'cons_light_t', type: 'number', label: L('… la greutatea de (t)', '… at weight (t)'), def: '10' },
    { key: 'cons_heavy', type: 'number', label: L('Consum cu încărcătură mare (l / 100 km)', 'Consumption, heavy load (l / 100 km)'), def: '32' },
    { key: 'cons_heavy_t', type: 'number', label: L('… la greutatea de (t)', '… at weight (t)'), def: '23' },
    { key: 'cons_empty', type: 'number', label: L('Consum gol (l / 100 km), opțional', 'Empty consumption (l / 100 km), optional'),
      help: L('Consumul cu remorca goală. Dacă lași gol, se estimează din cele două puncte de mai sus.', 'Consumption with an empty trailer. If left empty, it is estimated from the two points above.') },
    { key: 'avg_load_t', type: 'number', label: L('Încărcătură medie (t)', 'Average load (t)'), def: '18',
      help: L('Greutatea medie a mărfii pe cursele tale. Cu ea se calculează consumul mediu și costul pe km afișat în listă.', 'The average weight of cargo on your trips. It is used for the average consumption and the cost per km shown in the list.') },
    { key: 'diesel_price', type: 'number', label: L('Preț motorină / litru', 'Diesel price / litre'),
      help: L('Prețul mediu plătit pe litru, în moneda calculului, fără TVA dacă o deduci.', 'The average price paid per litre, in the calculation currency, excluding VAT if you deduct it.') },
    { key: 'adblue_pct', type: 'number', label: L('AdBlue (% din costul motorinei)', 'AdBlue (% of diesel cost)'), def: '5',
      help: L('AdBlue e soluția pentru reducerea emisiilor la motoarele Euro 6. Costul ei e de obicei 4–6% din costul motorinei.', 'AdBlue is the emissions-reduction fluid for Euro 6 engines. Its cost is usually 4–6% of the diesel cost.') },
  ] },
  { key: 'variable', title: L('Costuri variabile', 'Variable costs'), fields: [
    { key: 'tyres_count', type: 'number', label: L('Număr anvelope', 'Number of tyres'), def: '10' },
    { key: 'tyre_life_km', type: 'number', label: L('Durată de viață anvelope (km)', 'Tyre life (km)'), def: '120000' },
    { key: 'tyre_cost', type: 'number', label: L('Preț / anvelopă', 'Cost / tyre') },
    { key: 'maint_per_km', type: 'number', label: L('Întreținere și reparații / km (medie)', 'Maintenance and repair / km (average)'),
      help: L('Costul mediu de service și reparații raportat la km (ulei, plăcuțe, mici defecțiuni). Reparațiile mari le treci în lista de costuri de mai jos, ca să nu se dubleze.', 'Average service and repair cost per km (oil, pads, small faults). Put big repairs in the cost list below so they are not counted twice.') },
    { key: 'road_costs_per_km', type: 'number', label: L('Alte costuri pe drum / km (taxe etc.)', 'Other road costs / km (tolls etc.)'),
      help: L('Costuri medii pe km pentru taxe de drum. Taxele reale pe țări vor fi în tool-ul dedicat; lasă 0 aici ca să nu se dubleze.', 'Average per-km road costs such as tolls. Actual tolls by country will be in the dedicated tool; leave 0 here to avoid double counting.') },
    { key: 'clean_cost', type: 'number', label: L('Spălat: cost / serviciu', 'Washing: cost / service') },
    { key: 'clean_freq_km', type: 'number', label: L('Spălat: la fiecare (km)', 'Washing: every (km)'), def: '5000' },
    { key: 'parking_cost', type: 'number', label: L('Parcare: cost / noapte', 'Parking: cost / night') },
    { key: 'parkings_year', type: 'number', label: L('Parcări / an', 'Parkings / year') },
  ] },
  { key: 'use', title: L('Utilizare și marje', 'Usage and margins'), fields: [
    { key: 'annual_km', type: 'number', label: L('Km pe an (total)', 'Km per year (total)'), def: '120000',
      help: L('Toți km parcurși într-un an, inclusiv cei fără marfă. Costurile fixe se împart la acest număr, deci un camion folosit mai mult are cost pe km mai mic.', 'All km driven in a year, including those without cargo. Fixed costs are divided by this number, so a truck used more has a lower cost per km.') },
    { key: 'empty_pct', type: 'number', label: L('Km goi (% din total)', 'Empty km (% of total)'), def: '15',
      help: L('Ce procent din km se parcurg fără marfă (drum până la încărcare, retur). Acești km costă, dar nu aduc venit, de aceea „costul pe km încărcat” e mai mare decât „costul pe km”.', 'The share of km driven without cargo (positioning, return). These km cost money but earn nothing, which is why “cost per loaded km” is higher than “cost per km”.') },
    { key: 'avg_speed', type: 'number', label: L('Viteză medie (km/h)', 'Average speed (km/h)'), def: '50',
      help: L('Viteza medie pe tot parcursul, inclusiv opriri. Folosită doar pentru costul pe oră.', 'Average speed over the whole trip, including stops. Used only for the cost per hour.') },
    { key: 'overhead_pct', type: 'number', label: L('Adaos regie (% din costuri)', 'Overhead surcharge (% of costs)'), def: '5',
      help: L('Adaos pentru costurile firmei care nu aparțin unui camion anume: birou, contabilitate, programe, administrație.', 'A surcharge for company costs that do not belong to one specific truck: office, accounting, software, administration.') },
    { key: 'profit_pct', type: 'number', label: L('Adaos profit și risc (%)', 'Profit and risk surcharge (%)'), def: '0',
      help: L('Profitul pe care vrei să-l incluzi în costul de referință și o marjă pentru riscuri (client rău-platnic, daune, întârzieri).', 'The profit you want built into the reference cost plus a margin for risks (late-paying client, damage, delays).') },
  ] },
]

const flat = TRUCK_SECTIONS.flatMap((s) => s.fields)
export const TRUCK_DEFAULTS = Object.fromEntries(flat.filter((f) => f.def !== undefined).map((f) => [f.key, f.def]))

export const TRUCKS = {
  key: 'trucks',
  table: 'trucks',
  prefix: 'TK',
  pad: 3,
  fields: [
    ...flat.map((f) => ({ key: f.key, type: f.type === 'number' ? 'number' : 'text' })),
    { key: 'notes', type: 'text' },
    { key: 'cost_items', type: 'json' },
    // Flotă (migrarea 0003): se salvează împreună cu restul, ca editarea din Tools să nu le șteargă
    { key: 'vin', type: 'text' }, { key: 'make', type: 'text' }, { key: 'model', type: 'text' },
    { key: 'year', type: 'number' }, { key: 'ref_consumption', type: 'number' }, { key: 'default_trailer_id', type: 'text' },
  ],
  seed: [
    { plate: 'MM32ANV', trailer_type: 'Prelată', label: 'Exemplu demo – cap tractor', status: 'Activ', currency: 'EUR', financing: 'Achiziție', purchase_price: 55000, residual_value: 20000, depr_years: 5, equip_price: 25000, equip_residual: 8000, equip_depr_years: 8, interest_pct: 2.8, rca: 2200, cmr: 600, casco: 3300, road_tax: 480, driver_salary_month: 1300, driver_burden_pct: 10, perdiem_ro_day: 12, perdiem_ro_days: 60, perdiem_abroad_day: 55, perdiem_abroad_days: 180, cons_light: 25, cons_light_t: 10, cons_heavy: 32, cons_heavy_t: 23, avg_load_t: 18, diesel_price: 1.45, adblue_pct: 5, tyres_count: 10, tyre_life_km: 120000, tyre_cost: 320, maint_per_km: 0.05, clean_cost: 40, clean_freq_km: 5000, annual_km: 120000, empty_pct: 15, avg_speed: 50, overhead_pct: 5, profit_pct: 0, cost_items: [{ name: 'Schimb ulei și filtre', kind: 'Intervenție mecanică', amount: 450, freq: 'An', years: 1 }] },
  ],
}
TRUCKS.api = makeEntityApi(TRUCKS)

const num = (v) => { const x = parseNum(v); return Number.isFinite(x) ? x : 0 }
export const toNum = num

export const itemAnnual = (it) => {
  const a = num(it.amount)
  if (it.freq === 'Lună') return a * 12
  if (it.freq === 'Unic') return num(it.years) > 0 ? a / num(it.years) : a
  return a
}

// Consum (l/100 km) la o greutate dată: interpolare / extrapolare liniară între cele două puncte (ex. 25 la 10 t și 32 la 23 t).
export function consumption(t, loadT) {
  const a = num(t.cons_light), at = num(t.cons_light_t), b = num(t.cons_heavy), bt = num(t.cons_heavy_t)
  if (bt === at) return a || b
  return Math.max(0, a + ((loadT - at) * (b - a)) / (bt - at))
}

// Calcul complet pe an, în moneda camionului. loadT = greutatea încărcăturii (implicit media).
export function calcTruck(t, opts = {}) {
  const loadT = opts.loadT ?? num(t.avg_load_t)
  const km = num(t.annual_km)
  const empty = Math.min(Math.max(num(t.empty_pct), 0), 100) / 100
  const loadedKm = km * (1 - empty)
  const leasing = t.financing === 'Leasing'

  const items = Array.isArray(t.cost_items) ? t.cost_items : []
  const sumKind = (k) => items.filter((i) => i.kind === k).reduce((s, i) => s + itemAnnual(i), 0)

  const price = num(t.purchase_price), resid = num(t.residual_value), eq = num(t.equip_price), eqRes = num(t.equip_residual)
  const interest = leasing ? 0 : ((price + resid) / 2 + (eq + eqRes) / 2) * (num(t.interest_pct) / 100)
  const deprTruck = leasing || num(t.depr_years) <= 0 ? 0 : (price - resid) / num(t.depr_years)
  const deprEquip = num(t.equip_depr_years) <= 0 ? 0 : (eq - eqRes) / num(t.equip_depr_years)
  const leasingY = leasing ? num(t.leasing_monthly) * 12 : 0

  const R = (key, label, value) => ({ key, label, value })
  const fixedRows = [
    R('interest', L('Dobândă / cost de capital', 'Interest / cost of capital'), interest),
    R('leasing', L('Leasing cap tractor', 'Tractor leasing'), leasingY),
    R('deprTruck', L('Amortizare cap tractor', 'Tractor depreciation'), deprTruck),
    R('deprEquip', L('Amortizare remorcă / echipamente', 'Trailer / equipment depreciation'), deprEquip),
    R('road_tax', L('Impozit mijloc de transport', 'Vehicle tax'), num(t.road_tax)),
    R('eurovignet', L('Rovinietă / Eurovignette', 'Vignette'), num(t.eurovignet)),
    R('casco', L('Asigurare CASCO', 'CASCO insurance'), num(t.casco)),
    R('rca', L('Asigurare RCA', 'RCA insurance'), num(t.rca)),
    R('cmr', L('Asigurare CMR', 'CMR insurance'), num(t.cmr)),
    R('other_ins', L('Alte asigurări (câmp + listă)', 'Other insurance (field + list)'), num(t.other_insurance) + sumKind('Asigurare')),
    R('own_risk', L('Franșiză / risc propriu', 'Own risk / deductible'), num(t.own_risk)),
    R('other_items', L('Alte costuri din listă', 'Other listed costs'), sumKind('Alt cost')),
  ].filter((r) => r.value || ['deprTruck', 'interest'].includes(r.key))
  const dedicatedRows = [
    R('phone', L('Telefon', 'Phone'), num(t.phone_year)),
    R('local', L('Taxe locale', 'Local taxes'), num(t.local_taxes)),
    R('papers', L('ITP, acte, licențe', 'Inspection, papers, licences'), num(t.papers_year)),
  ].filter((r) => r.value)
  const driverRows = [
    R('salary', L('Salariu șofer (cu majorare)', 'Driver salary (with surcharge)'), num(t.driver_salary_month) * 12 * (1 + num(t.driver_burden_pct) / 100)),
    R('pd_ro', L('Diurnă România', 'Per diem inside RO'), num(t.perdiem_ro_day) * num(t.perdiem_ro_days)),
    R('pd_ab', L('Diurnă străinătate', 'Per diem abroad'), num(t.perdiem_abroad_day) * num(t.perdiem_abroad_days)),
    R('lodging', L('Cazare', 'Lodging'), num(t.lodging_night) * num(t.lodging_nights)),
  ].filter((r) => r.value)

  const consLoaded = consumption(t, loadT)
  const consEmpty = num(t.cons_empty) > 0 ? num(t.cons_empty) : consumption(t, 0)
  const l100 = (1 - empty) * consLoaded + empty * consEmpty // media ponderată cu km goi
  const litres = (km / 100) * l100
  const fuel = litres * num(t.diesel_price)
  const varRows = [
    R('fuel', L('Motorină', 'Diesel'), fuel),
    R('adblue', L('AdBlue', 'AdBlue'), fuel * (num(t.adblue_pct) / 100)),
    R('tyres', L('Anvelope', 'Tyres'), num(t.tyre_life_km) > 0 ? (km / num(t.tyre_life_km)) * num(t.tyres_count) * num(t.tyre_cost) : 0),
    R('maint', L('Întreținere și reparații (medie + intervenții)', 'Maintenance and repair (average + interventions)'), num(t.maint_per_km) * km + sumKind('Intervenție mecanică')),
    R('roadc', L('Alte costuri pe drum', 'Other road costs'), num(t.road_costs_per_km) * km),
    R('clean', L('Spălat', 'Washing'), num(t.clean_freq_km) > 0 ? (km / num(t.clean_freq_km)) * num(t.clean_cost) : 0),
    R('parking', L('Parcări', 'Parking'), num(t.parking_cost) * num(t.parkings_year)),
  ].filter((r) => r.value)

  // agregat frigorific (doar remorcă frigorifică): litri/oră × ore/zi × zile/an
  const isReefer = t.trailer_type === 'Frigorific'
  const reeferPerDay = isReefer ? (num(t.reefer_hours_day) || 24) * (num(t.reefer_l_h) * num(t.diesel_price) + num(t.reefer_maint_h)) : 0
  const reeferAnnual = reeferPerDay * num(t.reefer_days_year)
  if (reeferAnnual) varRows.push(R('reefer', L('Agregat frigorific (motorină + service)', 'Refrigeration unit (fuel + servicing)'), reeferAnnual))

  const sum = (rows) => rows.reduce((s, r) => s + r.value, 0)
  const groups = [
    { key: 'fixed', title: L('Costuri fixe', 'Fixed costs'), rows: fixedRows, total: sum(fixedRows) },
    { key: 'dedicated', title: L('Costuri dedicate (telefon, taxe, acte)', 'Dedicated costs (phone, taxes, papers)'), rows: dedicatedRows, total: sum(dedicatedRows) },
    { key: 'driver', title: L('Șofer', 'Driver'), rows: driverRows, total: sum(driverRows) },
    { key: 'variable', title: L('Costuri variabile', 'Variable costs'), rows: varRows, total: sum(varRows) },
  ]
  const total = groups.reduce((s, g) => s + g.total, 0)
  // la fel ca în Excel: adaosurile se calculează la (total / 0,92)
  const overhead = (total / 0.92) * (num(t.overhead_pct) / 100)
  const profit = (total / 0.92) * (num(t.profit_pct) / 100)
  const grand = total + overhead + profit
  const hours = num(t.avg_speed) > 0 ? km / num(t.avg_speed) : 0
  const sur = 1 + (num(t.overhead_pct) + num(t.profit_pct)) / 100 / 0.92 // adaosurile, ca în Excel
  const kmPerDay = km / 240 // 20 zile lucrătoare × 12 luni
  const grandGeneral = (total - reeferAnnual) * sur
  return {
    isReefer, reeferPerDay, reeferAnnual, kmPerDay,
    perKmGeneral: km ? grandGeneral / km : 0, // fără agregat frigorific (marfă generală)
    reeferPerDayFull: reeferPerDay * sur, // costul unei zile cu agregatul pornit, cu adaosuri
    reeferPerKm: kmPerDay ? (reeferPerDay * sur) / kmPerDay : 0, // adaos pe km în zilele cu agregat pornit

    groups, total, overhead, profit, grand, km, loadedKm, litres, l100, consLoaded, loadT,
    perKm: km ? grand / km : 0, perLoadedKm: loadedKm ? grand / loadedKm : 0,
    perHour: hours ? grand / hours : 0, perMonth: grand / 12, perDay: grand / 12 / 20,
    costPerKmNoProfit: km ? (total + overhead) / km : 0,
  }
}

export const toEur = (t, v) => (t.currency === 'RON' ? (num(t.fx_rate) > 0 ? v / num(t.fx_rate) : null) : v)
export const fmt3 = (n) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
