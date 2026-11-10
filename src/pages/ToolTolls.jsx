import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backdrop } from '../lib/backdrop'
import { useLang } from '../i18n'
import { fmtDate, todayISO } from '../lib/format'
import { fetchBnrRate, fetchEurRate } from '../lib/bnr'
import { calcKmDetail, canCalcKm } from '../lib/km'
import { CONF_STYLE, CONFIDENCE, EXTRA_APPLIES, EXTRA_KINDS, PROFILE_WEIGHT_T, SCHEMES, TOLL_COUNTRIES, TOLL_EXTRAS, TOLL_ROUTES, TOLL_CORRIDORS, autoCorridor, corridorLabel, avoidKey, buildRows, countrySig, fmtHours, rowCost, rowMissing, splitCost, suggestExtras } from '../lib/tolls'
import { TRUCKS, calcTruck, toEur } from '../lib/trucks'
import { PlaceInput } from './Burse'
import ToolShell, { Field, Stat, toolInput as input } from '../components/ToolShell'
import { CloseX } from '../components/ModalChrome'

const L = (ro, en) => ({ ro, en })
const T = {
  title: L('Taxe de drum', 'Road tolls'),
  intro: L('Taxele de drum pe țară și costurile suplimentare (feriboturi, poduri, tuneluri, treceri speciale) pentru profilul de bază: ansamblu 40 t, 5 axe, Euro VI. Fiecare dată are sursă, dată de verificare și nivel de încredere; corectează oricând o valoare.', 'Road tolls by country and extra costs (ferries, bridges, tunnels, special crossings) for the base profile: 40 t, 5 axles, Euro VI. Every value has a source, a check date and a confidence level; correct any value at any time.'),
  tabCalc: L('Calculator rută', 'Route calculator'), tabCountries: L('Tarife pe țară', 'Rates by country'), tabExtras: L('Costuri suplimentare', 'Extra costs'),
  load: L('Încărcare', 'Loading'), unload: L('Descărcare', 'Unloading'), country: L('Țară', 'Country'), place: L('Localitate', 'Place'),
  calc: L('Calculează ruta și taxele', 'Calculate route and tolls'), busy: L('Se calculează…', 'Calculating…'), weight: L('Greutate ansamblu (t)', 'Combination weight (t)'),
  weightHelp: L('Contează doar pentru țările cu taxă pe tonă-km (Elveția). Profilul de bază este 40 t.', 'Only matters for tonne-km countries (Switzerland). The base profile is 40 t.'),
  byCountry: L('Pe țări', 'By country'), km: L('Km', 'Km'), rate: L('€ / km', '€ / km'), manual: L('Cost fix (€)', 'Fixed cost (€)'), cost: L('Cost', 'Cost'), addRow: L('＋ Țară', '＋ Country'),
  noSplit: L('Nu am putut împărți ruta pe țări (sau ești în modul demo). Adaugă țările și km manual.', 'Could not split the route by country (or you are in demo mode). Add countries and km manually.'),
  missing: L('Fără tarif în baza de date: completează „€ / km” sau „Cost fix” ca să intre în total.', 'No rate in the database: fill in “€ / km” or “Fixed cost” to include it in the total.'),
  extras: L('Costuri suplimentare', 'Extra costs'), extrasHint: L('Propuse după țările din rută. Bifează ce se aplică și ajustează prețul.', 'Suggested from the countries on the route. Tick what applies and adjust the price.'), extrasNone: L('Nicio propunere pentru țările din rută.', 'No suggestion for the countries on the route.'),
  moreExtras: L('Alte costuri suplimentare din listă', 'Other extra costs from the list'), noPrice: L('fără preț', 'no price'),
  ferry: L('Ruta conține ≈', 'The route contains ≈'), ferryTail: L('km pe feribot: verifică costurile suplimentare.', 'km of ferry: check the extra costs.'),
  totalRoad: L('Taxe de drum', 'Road tolls'), totalExtra: L('Costuri suplimentare', 'Extra costs'), total: L('Total taxe și suplimente', 'Total tolls and extras'), perKm: L('€ / km', '€ / km'),
  useEst: L('Folosește în Estimator →', 'Use in Estimator →'), conf: L('Încredere', 'Confidence'),
  add: L('Adaugă', 'Add'), edit: L('Editează', 'Edit'), del: L('Ștergi?', 'Delete?'), save: L('Salvează', 'Save'), cancel: L('Anulează', 'Cancel'), delBtn: L('Șterge', 'Delete'),
  name: L('Denumire', 'Name'), kind: L('Tip', 'Type'), applies: L('Se aplică', 'Applies'), price: L('Preț (EUR)', 'Price (EUR)'), basis: L('Pe ce bază', 'Basis'), countriesF: L('Țări (coduri ISO, cu virgulă)', 'Countries (ISO codes, comma-separated)'),
  countriesHelp: L('Toate țările de aici trebuie să fie pe rută ca să propună automat costul (ex. EE,FI pentru Tallinn–Helsinki). Gol = nu se propune automat.', 'All countries listed must be on the route for the cost to be suggested automatically (e.g. EE,FI for Tallinn–Helsinki). Empty = never suggested.'),
  scheme: L('Sistem', 'Scheme'), code: L('Cod', 'Code'), rateOther: L('€ / km alte drumuri', '€ / km other roads'), unit: L('Unitate', 'Unit'), effFrom: L('În vigoare din', 'Effective from'), verifiedOn: L('Verificat la', 'Verified on'), source: L('Sursă', 'Source'), srcUrl: L('Link sursă', 'Source link'), notes: L('Note', 'Notes'),
  rateHelp: L('Tarif în EUR, fără TVA, pentru 40 t / 5 axe / Euro VI, pe autostrăzi și drumuri taxate. La concesionari (Italia, Franța, Spania…) este o medie orientativă.', 'Rate in EUR, excluding VAT, for 40 t / 5 axles / Euro VI on motorways and tolled roads. For concessions (Italy, France, Spain…) it is an indicative average.'),
  legend: L('Verificat = sursă oficială citită · Sursă secundară = presă/ghid · Estimat = ordin de mărime, de confirmat · Lipsă = fără tarif încă.', 'Verified = official source read · Secondary = press/guide · Estimated = order of magnitude, to be confirmed · Missing = no rate yet.'),
  all: L('Toate', 'All'), search: L('Caută…', 'Search…'), empty: L('Nimic găsit.', 'Nothing found.'), needName: L('Completează denumirea.', 'Enter the name.'), needCode: L('Completează țara și codul (2 litere).', 'Enter the country name and 2-letter code.'),
  tkm: L('pe tonă-km', 'per tonne-km'),
  tabCorr: L('Trasee HU-GO', 'HU-GO routes'),
  corrIntro: L('Trasee exacte prin Ungaria (vamă de intrare → vamă de ieșire), calculate pe calculatorul oficial HU-GO pentru J5 · EURO6 · 40 t. Sumele sunt brute, cu TVA 27%, în HUF. Calculatorul de rută alege automat traseul potrivit și îl poți schimba oricând.', 'Exact routes through Hungary (entry border → exit border), calculated on the official HU-GO calculator for J5 · EURO6 · 40 t. Amounts are gross, incl. 27% VAT, in HUF. The route calculator picks the matching route automatically and you can change it at any time.'),
  entry: L('Intrare', 'Entry'), exit: L('Ieșire', 'Exit'), infra: L('Infrastructură (HUF)', 'Infrastructure (HUF)'), ext: L('Costuri externe (HUF)', 'External costs (HUF)'), tot: L('Total brut (HUF)', 'Total gross (HUF)'), perKmHuf: L('HUF / km', 'HUF / km'),
  entryC: L('Țara de intrare (cod)', 'Entry country (code)'), exitC: L('Țara de ieșire (cod)', 'Exit country (code)'), needCorr: L('Completează vama de intrare și de ieșire.', 'Enter the entry and exit borders.'),
  viaTitle: L('Traseu estimat (vămi și orașe)', 'Estimated route (borders and cities)'), viaMaps: L('Verifică în Google Maps ↗', 'Check in Google Maps ↗'), viaBorder: L('graniță', 'border'), viaNote: L('Orientativ: orașele mari din apropierea rutei și vămile detectate, cu km de la plecare. Google Maps folosește rute pentru autoturisme, deci km pot diferi puțin.', 'Indicative: major cities near the route and detected borders, with km from the start. Google Maps uses car routing, so km may differ slightly.'),
  roHwy: L('Km pe autostradă / drum expres', 'Motorway / expressway km'), roOth: L('Alte drumuri (km)', 'Other roads (km)'), roRateH: L('lei/km autostradă', 'RON/km motorway'), roRateO: L('lei/km drum național', 'RON/km national road'), ronRate: L('Curs RON / EUR', 'RON / EUR rate'), ronNote: L('curs BNR zilnic, editabil', 'daily BNR rate, editable'), noRon: L('Cursul RON/EUR lipsește: introdu-l ca să se calculeze taxa TollRO.', 'RON/EUR rate missing: enter it to calculate the TollRO toll.'), roHint: L('TollRO, cu TVA. Km pe autostradă vin din rută (compară cu un calculator TollRO); restul km se taxează ca drum național (variantă acoperitoare).', 'TollRO, incl. VAT. Motorway km come from the route (compare with a TollRO calculator); remaining km are charged as national road (conservative).'),
  localCur: L('Monedă locală (ex. RON)', 'Local currency (e.g. RON)'), rateLocal: L('Tarif autostradă / expres (monedă locală / km)', 'Motorway / expressway rate (local / km)'), rateLocalO: L('Tarif drum național (monedă locală / km)', 'National road rate (local / km)'),
  huRoute: L('Traseu HU-GO', 'HU-GO route'), avgRate: L('— tarif mediu pe km —', '— average rate per km —'), hufRate: L('Curs HUF / EUR', 'HUF / EUR rate'), hufNote: L('curs ECB zilnic, editabil', 'daily ECB rate, editable'), noHuf: L('Curs HUF/EUR indisponibil: introdu-l ca să se calculeze traseul HU-GO.', 'HUF/EUR rate unavailable: enter it to calculate the HU-GO route.'), huVatLbl: L('Taxele din Ungaria fără TVA (dacă o recuperezi)', 'Hungarian tolls excluding VAT (if you reclaim it)'),
  cargo: L('Greutate marfă (t)', 'Cargo weight (t)'), cargoHelp: L('Folosită pentru consumul camionului ales (consumul depinde de greutatea mărfii).', 'Used for the chosen truck’s fuel use (consumption depends on cargo weight).'),
  truck: L('Camion pentru cost', 'Truck for cost'), noTruck: L('— fără camion (doar taxe) —', '— no truck (tolls only) —'),
  extraShort: L('Suplimente', 'Extras'),
  reefer: L('Marfă frigorifică (agregat pornit)', 'Refrigerated cargo (unit running)'), reeferNo: L('Camionul ales nu are remorcă frigorifică.', 'The chosen truck has no refrigerated trailer.'), totalKm: L('Cost total / km', 'Total cost / km'), totalKmFull: L('COST TOTAL CU CAMION', 'TOTAL COST WITH TRUCK'), totalKmSub: L('camion + taxe + suplimente', 'truck + tolls + extras'),
  totalWithTruck: L('Total cu camion', 'Total with truck'),
  variants: L('Variante de rută', 'Route variants'), variantsHint: L('Aceeași rută, dar evitând pe rând țările de tranzit. Țările din afara UE (Ucraina, Elveția, Serbia, Balcanii de Vest, Moldova, Belarus, Rusia, Turcia, Norvegia, Marea Britanie) sunt excluse automat, pentru că cer documente de tranzit vamal, în afară de cazul în care încărcarea sau descărcarea e acolo. Click pe o variantă ca să vezi detaliile.', 'The same route avoiding transit countries one by one. Non-EU countries (Ukraine, Switzerland, Serbia, Western Balkans, Moldova, Belarus, Russia, Turkey, Norway, UK) are always excluded because they require customs transit documents, unless loading or unloading is there. Click a variant to see the details.'),
  routeCol: L('Rută (țări)', 'Route (countries)'), hours: L('Ore', 'Hours'), truckCost: L('Camion', 'Truck'), cheapest: L('cea mai ieftină', 'cheapest'), avoids: L('evită', 'avoids'), fastest: L('ruta cea mai scurtă', 'shortest route'), manualTag: L('manuală', 'manual'), ferryShort: L('feribot', 'ferry'), incomplete: L('țară fără tarif', 'country without a rate'),
  compareTruck: L('Total = taxe + suplimente obligatorii + cost camion (km × cost / km din tool-ul Camioane, la greutatea mărfii). Orele sunt de condus, orientative (fără pauze).', 'Total = tolls + mandatory extras + truck cost (km × cost / km from the Trucks tool, at the cargo weight). Hours are driving time, indicative (no breaks).'),
  compareNoTruck: L('Total = taxe + suplimente obligatorii. Alege un camion ca să adaugi și costul km în plus. Orele sunt de condus, orientative.', 'Total = tolls + mandatory extras. Choose a truck to add the cost of extra km. Hours are driving time, indicative.'),
  manualVar: L('Variantă manuală: evită', 'Manual variant: avoid'), avoidAdd: L('＋ țară de evitat', '＋ country to avoid'), addVariant: L('Adaugă varianta', 'Add variant'),
  impossible: L('Variantă imposibilă', 'Impossible variant'), sameAs: L('Aceeași rută ca varianta', 'Same route as variant'),
  savedRoutes: L('Rute salvate…', 'Saved routes…'), saveRoute: L('Salvează ruta aleasă', 'Save the chosen route'), saveName: L('Nume (ex. Cluj → Olanda via SK–CZ)', 'Name (e.g. Cluj → NL via SK–CZ)'), savedOk: L('Ruta a fost salvată.', 'Route saved.'), kmU: L('pe km', 'per km'),
}
const money = (v, d = 0) => Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d })
const n = (v) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : 0 }

const ConfBadge = ({ c, lang }) => <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${CONF_STYLE[c] || CONF_STYLE.Lipsă}`}>{c}</span>

function Tabs({ tab, setTab, lang }) {
  const items = [['calc', T.tabCalc], ['countries', T.tabCountries], ['extras', T.tabExtras], ['corr', T.tabCorr]]
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
      {items.map(([k, t]) => (
        <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-3.5 py-2 text-[13.5px] font-medium ${tab === k ? 'bg-navy-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{t[lang]}</button>
      ))}
    </div>
  )
}

/* ---------- Calculator rută ---------- */
// Țări din afara UE excluse automat din orice rută (tranzit vamal = timp pierdut), în afară de cazul în care încărcarea sau descărcarea e chiar acolo.
const ALWAYS_AVOID = ['UA', 'CH', 'RS', 'BA', 'MK', 'ME', 'AL', 'MD', 'BY', 'RU', 'TR', 'NO', 'GB']
const viaBorders = (v) => (v.via?.items || []).filter((i) => i.t === 'border').map((i) => i.n || i.pair).join(' · ')
const routeText = (v) => (v.countries || []).map((c) => c.code).join(' → ')

function Calculator({ countries, extras }) {
  const { lang } = useLang()
  const nav = useNavigate()
  const [f, setF] = useState({ load_country: '', load_place: '', unload_country: '', unload_place: '', weight: String(PROFILE_WEIGHT_T), cargo: '24' })
  const [geo, setGeo] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [variants, setVariants] = useState([])
  const [sel, setSel] = useState(0)
  const [rows, setRows] = useState([])
  const [picked, setPicked] = useState({}) // id -> { on, price }
  const [more, setMore] = useState('')
  const [trucks, setTrucks] = useState([])
  const [truckId, setTruckId] = useState('')
  const [reefer, setReefer] = useState(false)
  const [saved, setSaved] = useState([])
  const [saveName, setSaveName] = useState('')
  const [manualAvoid, setManualAvoid] = useState([])
  const [corr, setCorr] = useState([])
  const [huf, setHuf] = useState('')
  const [hufSrc, setHufSrc] = useState('')
  const [huNoVat, setHuNoVat] = useState(false)
  const [ron, setRon] = useState('')
  const [ronSrc, setRonSrc] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => { TRUCKS.api.list().then((r) => { const a = r.filter((x) => x.status !== 'Inactiv'); setTrucks(a); if (a[0]) setTruckId(a[0].id) }).catch(() => {}) }, [])
  useEffect(() => { TOLL_CORRIDORS.api.list().then(setCorr).catch(() => {}) }, [])
  useEffect(() => { fetchEurRate(todayISO(), 'HUF').then((r) => { setHuf(String(Math.round(r.rate * 100) / 100)); setHufSrc(`${r.source} · ${r.date}`) }).catch(() => {}) }, [])
  useEffect(() => { fetchBnrRate(todayISO()).then((r) => { setRon(String(Math.round(r.rate * 10000) / 10000)); setRonSrc(`BNR · ${r.date}`) }).catch(() => {}) }, [])
  const loadSaved = () => TOLL_ROUTES.api.list().then(setSaved).catch(() => {})
  useEffect(() => { loadSaved() }, [])

  const weightT = n(f.weight) || PROFILE_WEIGHT_T
  const truck = trucks.find((x) => x.id === truckId)
  const isReeferTruck = truck?.trailer_type === 'Frigorific'
  const useReefer = reefer && isReeferTruck
  // Cost/km al camionului la greutatea mărfii din calculator; cu bifa „frigorific” se adaugă agregatul (ca în fișa camionului: marfă generală + agregat).
  const truckPerKm = useMemo(() => { if (!truck) return null; try { const c = calcTruck(truck, { loadT: n(f.cargo) }); return toEur(truck, c.perKmGeneral + (useReefer ? c.reeferPerKm : 0)) } catch { return null } }, [truck, f.cargo, useReefer])
  const od = [f.load_country, f.unload_country].map((x) => String(x || '').trim().toUpperCase())
  const baseAv = ALWAYS_AVOID.filter((c) => !od.includes(c))
  const extraAvoid = (v) => (v.avoid || []).filter((c) => !baseAv.includes(c))

  const tkmFix = (r) => {
    const c = countries.find((x) => x.country_code === r.code)
    return c?.rate_unit === 'tkm' && c.rate_eur != null ? String(Math.round(c.rate_eur * weightT * 10000) / 10000) : null
  }
  const rowsFor = (v) => buildRows(v.countries || [], countries).map((r) => ({ ...r, rate: tkmFix(r) ?? r.rate, corr: r.code === 'HU' ? autoCorridor(v.countries, corr, 'HU')?.id || '' : '' }))
  const corrById = (id) => corr.find((c) => c.id === id)
  const hufN = n(huf)
  const ronN = n(ron)
  // cost pe rând: traseu HU-GO (HUF → EUR), altfel cost fix / km × tarif
  const costOf = (r) => {
    const c = r.corr ? corrById(r.corr) : null
    if (c) { if (!(hufN > 0)) return 0; return (Number(c.fee_total) / (huNoVat && c.vat_included ? 1.27 : 1)) / hufN }
    if (r.split && !(n(r.manual) > 0)) return splitCost(r, ronN)
    return rowCost(r)
  }
  const missingOf = (r) => { const c = r.corr ? corrById(r.corr) : null; if (c) return !(hufN > 0); if (r.split && !(n(r.manual) > 0)) return !(ronN > 0); return rowMissing(r) }
  const payload = () => ({ ...f, extra_loads: [], extra_unloads: [] })
  const askVariants = async (avoidSets) => (await calcKmDetail(payload(), geo, avoidSets.map((avoid) => ({ avoid })))).variants || []

  const pick = (list, i) => { setSel(i); setPicked({}); setMore(''); setRows(list[i] ? rowsFor(list[i]) : []) }
  const show = (list, i = 0) => { setVariants(list); pick(list, i) }

  // Caută variante: ruta de bază (fără țările excluse automat), apoi aceeași rută evitând pe rând țările de tranzit, în mai multe runde.
  const search = async () => {
    setBusy(true); setMsg(''); setVariants([]); setRows([])
    try {
      const b0 = (await askVariants([baseAv]))[0]
      if (b0.error) { setMsg(b0.error); setBusy(false); return }
      if (!b0.countries?.length) { show([b0]); setMsg(T.noSplit[lang]); setBusy(false); return }
      const transit = (v) => (v.countries || []).map((c) => c.code).filter((c) => !od.includes(c) && !c.startsWith('?'))
      const found = new Map(); const tried = new Set([avoidKey(baseAv)])
      const add = (v) => { if (v.error || !v.countries?.length || v.km > b0.km * 1.35) return; const sig = countrySig(v.countries); if (!found.has(sig)) found.set(sig, v) }
      add(b0)
      let frontier = [b0]
      for (let round = 0; round < 3 && frontier.length; round++) {
        const cand = []
        for (const v of [...frontier].sort((x, y) => x.km - y.km)) for (const t of transit(v)) { const a = [...new Set([...v.avoid, t])]; const k = avoidKey(a); if (!tried.has(k)) { tried.add(k); cand.push(a) } }
        if (!cand.length) break
        const before = new Set(found.keys())
        for (let i = 0; i < cand.length && i < 18; i += 6) (await askVariants(cand.slice(i, i + 6))).forEach(add)
        frontier = [...found.entries()].filter(([sig]) => !before.has(sig)).map(([, v]) => v)
      }
      show([...found.values()].slice(0, 8))
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }

  const addManual = async () => {
    if (!manualAvoid.length) return
    setBusy(true); setMsg('')
    try {
      const [v] = await askVariants([[...new Set([...baseAv, ...manualAvoid])]])
      if (v.error) setMsg(`${T.impossible[lang]} (${manualAvoid.join(', ')}): ${v.error}`)
      else {
        const dup = variants.findIndex((x) => countrySig(x.countries) === countrySig(v.countries))
        if (dup >= 0) { setMsg(`${T.sameAs[lang]} ${dup + 1}.`); pick(variants, dup) }
        else show([...variants, { ...v, manual: true }], variants.length)
      }
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }

  const openSaved = async (id) => {
    const r = saved.find((x) => x.id === id)
    if (!r) return
    setF((s) => ({ ...s, load_country: r.load_country || '', load_place: r.load_place || '', unload_country: r.unload_country || '', unload_place: r.unload_place || '' }))
    const g = {}
    if (r.load_lat != null) g.load = { text: r.load_place, lat: Number(r.load_lat), lon: Number(r.load_lon) }
    if (r.unload_lat != null) g.unload = { text: r.unload_place, lat: Number(r.unload_lat), lon: Number(r.unload_lon) }
    setGeo(g); setBusy(true); setMsg('')
    try {
      const bAv = ALWAYS_AVOID.filter((c) => ![r.load_country, r.unload_country].map((x) => String(x || '').toUpperCase()).includes(c))
      const avoid = [...new Set([...bAv, ...String(r.avoid || '').split(',').map((x) => x.trim()).filter(Boolean)])]
      const res = await calcKmDetail({ ...f, load_country: r.load_country || '', load_place: r.load_place || '', unload_country: r.unload_country || '', unload_place: r.unload_place || '', extra_loads: [], extra_unloads: [] }, g, [{ avoid }])
      const v = res.variants?.[0]
      if (!v || v.error) setMsg(v?.error || T.noSplit[lang]); else show([v])
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  const saveRoute = async () => {
    const v = variants[sel]
    if (!v || !saveName.trim()) return
    const gl = geo.load && geo.load.text === f.load_place ? geo.load : null
    const gu = geo.unload && geo.unload.text === f.unload_place ? geo.unload : null
    try {
      await TOLL_ROUTES.api.save(null, { name: saveName.trim(), load_country: f.load_country, load_place: f.load_place, load_lat: gl?.lat ?? '', load_lon: gl?.lon ?? '', unload_country: f.unload_country, unload_place: f.unload_place, unload_lat: gu?.lat ?? '', unload_lon: gu?.lon ?? '', avoid: extraAvoid(v).join(','), notes: routeText(v) })
      setSaveName(''); setMsg(T.savedOk[lang]); loadSaved()
    } catch (e) { setMsg(e.message) }
  }
  const delSaved = async (id) => { try { await TOLL_ROUTES.api.remove(id); loadSaved() } catch (e) { setMsg(e.message) } }

  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const setSplit = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, split: { ...r.split, [k]: v } } : r)))
  const addRow = (code) => {
    if (!code || rows.some((r) => r.code === code)) return
    setRows((rs) => [...rs, ...buildRows([{ code, km: 0 }], countries)])
  }
  const cur = variants[sel]
  const shown = rows.map((r) => ({ ...r, rate: tkmFix(r) ?? r.rate }))
  const codes = rows.map((r) => r.code)
  const sugg = useMemo(() => suggestExtras(extras, codes), [extras, rows])
  const isOn = (e) => (picked[e.id] ? picked[e.id].on : e.applies === 'Obligatoriu pe rută' || e.id === more)
  const priceOf = (e) => (picked[e.id]?.price ?? (e.price_eur == null ? '' : String(e.price_eur)))
  const toggle = (e) => setPicked((p) => ({ ...p, [e.id]: { price: priceOf(e), on: !isOn(e) } }))
  const setPrice = (e, v) => setPicked((p) => ({ ...p, [e.id]: { on: isOn(e), price: v } }))

  const road = shown.reduce((s, r) => s + costOf(r), 0)
  const chosen = [...sugg, ...extras.filter((e) => e.id === more && !sugg.some((x) => x.id === e.id))]
  const extra = chosen.reduce((s, e) => s + (isOn(e) ? n(priceOf(e)) : 0), 0)
  const total = road + extra
  const missing = shown.some(missingOf)
  const usedKm = shown.reduce((s, r) => s + n(r.km), 0) || cur?.km || 0

  // Totaluri pe variantă (tarife implicite; varianta aleasă folosește corecturile tale)
  const stats = variants.map((v, i) => {
    const rs = i === sel ? shown : rowsFor(v)
    const r = i === sel ? road : rs.reduce((s, x) => s + costOf(x), 0)
    const ex = i === sel ? extra : suggestExtras(extras, (v.countries || []).map((c) => c.code)).filter((e) => e.applies === 'Obligatoriu pe rută').reduce((s, e) => s + n(e.price_eur), 0)
    const miss = rs.some(missingOf)
    const tr = truckPerKm != null ? truckPerKm * (v.km || 0) : null
    return { road: r, extra: ex, miss, truck: tr, all: r + ex + (tr || 0) }
  })
  const best = stats.length ? Math.min(...stats.map((x) => x.all)) : 0
  const bestTolls = stats.length ? Math.min(...stats.map((x) => x.road + x.extra)) : 0
  const seen = [...new Set(variants.flatMap((v) => (v.countries || []).map((c) => c.code)).filter((c) => !od.includes(c) && !c.startsWith('?')))]
  const nameOf = (c) => countries.find((x) => x.country_code === c)?.country_name || c

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {saved.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-[13px]" value="" onChange={(e) => openSaved(e.target.value)}>
              <option value="">{T.savedRoutes[lang]}</option>{saved.map((r) => <option key={r.id} value={r.id}>{r.name}{r.avoid ? ` (−${r.avoid})` : ''}</option>)}
            </select>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={`${T.load[lang]}: ${T.country[lang]}`}><input className={input} value={f.load_country} onChange={set('load_country')} placeholder="RO" /></Field>
          <Field label={`${T.load[lang]}: ${T.place[lang]}`}><PlaceInput value={f.load_place} country={f.load_country} onText={(v) => setF((s) => ({ ...s, load_place: v }))} onPick={(it) => { setGeo((g) => ({ ...g, load: { text: it.text, lat: it.lat, lon: it.lon } })); setF((s) => ({ ...s, load_place: it.text, load_country: it.country || s.load_country })) }} /></Field>
          <Field label={`${T.unload[lang]}: ${T.country[lang]}`}><input className={input} value={f.unload_country} onChange={set('unload_country')} placeholder="DE" /></Field>
          <Field label={`${T.unload[lang]}: ${T.place[lang]}`}><PlaceInput value={f.unload_place} country={f.unload_country} onText={(v) => setF((s) => ({ ...s, unload_place: v }))} onPick={(it) => { setGeo((g) => ({ ...g, unload: { text: it.text, lat: it.lat, lon: it.lon } })); setF((s) => ({ ...s, unload_place: it.text, unload_country: it.country || s.unload_country })) }} /></Field>
          <Field label={T.weight[lang]} help={T.weightHelp[lang]}><input inputMode="decimal" className={input} value={f.weight} onChange={set('weight')} /></Field>
          <Field label={T.cargo[lang]} help={T.cargoHelp[lang]}><input inputMode="decimal" className={input} value={f.cargo} onChange={set('cargo')} /></Field>
          <div><Field label={T.truck[lang]}><select className={input} value={truckId} onChange={(e) => setTruckId(e.target.value)}><option value="">{T.noTruck[lang]}</option>{trucks.map((t) => <option key={t.id} value={t.id}>{t.plate}{t.label ? ` · ${t.label}` : ''}</option>)}</select></Field>
            {truck && <label className={`mt-1.5 flex items-center gap-1.5 text-[12.5px] ${isReeferTruck ? 'text-slate-700' : 'text-slate-400'}`} title={isReeferTruck ? '' : T.reeferNo[lang]}><input type="checkbox" checked={useReefer} disabled={!isReeferTruck} onChange={(e) => setReefer(e.target.checked)} className="accent-orange-500" />{T.reefer[lang]}</label>}</div>
          <div className="flex items-end"><button type="button" disabled={busy || !canCalcKm(f)} onClick={search} className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-600 disabled:opacity-40">{busy ? T.busy[lang] : T.calc[lang]}</button></div>
        </div>
        {msg && <p className="text-[13px] text-amber-700">{msg}</p>}
      </div>

      {variants.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-[15px] font-semibold text-navy-800">{T.variants[lang]}</h2>
          <p className="text-[12.5px] text-slate-500">{T.variantsHint[lang]}</p>
          <div className="mt-2 overflow-x-auto">
            {(() => {
              const hasT = truckPerKm != null
              // lățimi fixe: coloana „Rută” are lățime limitată, iar cifrele rămân lângă ea, separate prin linii
              const W = [26, 270, 58, 66, 74, 80, ...(hasT ? [74] : []), 86, ...(hasT ? [78] : []), 66]
              const TH = 'border-l border-slate-200 px-2 pb-1.5 text-right align-bottom font-medium leading-tight'
              const TD = 'border-l border-slate-200 px-2 text-right tabular-nums'
              return (
            <table className="table-fixed text-[13px]" style={{ width: W.reduce((x, y) => x + y, 0) }}>
              <colgroup>{W.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead><tr className="text-left text-[11px] uppercase text-slate-500"><th className="py-1.5" /><th className="pb-1.5 pl-1 align-bottom font-medium">{T.routeCol[lang]}</th><th className={TH}>{T.km[lang]}</th><th className={TH}>{T.hours[lang]}</th><th className={TH}>{T.totalRoad[lang]}</th><th className={TH}>{T.extraShort[lang]}</th>{hasT && <th className={TH}>{T.truckCost[lang]}</th>}<th className={TH}>{hasT ? T.totalWithTruck[lang] : T.total[lang]}</th>{hasT && <th className={TH}>{T.totalKm[lang]}</th>}<th className={TH}>Δ</th></tr></thead>
              <tbody>
                {variants.map((v, i) => {
                  const st = stats[i]
                  const cmp = hasT ? st.all : st.road + st.extra
                  const ref = hasT ? best : bestTolls
                  return (
                    <tr key={i} onClick={() => pick(variants, i)} className={`cursor-pointer border-t border-slate-200 ${i === sel ? 'bg-brand-500/10' : 'hover:bg-slate-50'}`}>
                      <td className="py-2 pr-1"><input type="radio" readOnly checked={i === sel} className="accent-orange-500" /></td>
                      <td className="py-1.5 pl-1 pr-2 align-middle"><div className="break-words font-medium text-navy-800">{routeText(v)}</div>
                        {cmp === ref && variants.length > 1 && <div className="my-0.5"><span className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] text-emerald-800">{T.cheapest[lang]}</span></div>}
                        <div className="text-[11.5px] text-slate-500">{extraAvoid(v).length ? `${T.avoids[lang]} ${extraAvoid(v).join(', ')}` : T.fastest[lang]}{v.manual ? ` · ${T.manualTag[lang]}` : ''}{v.ferryKm > 0 ? ` · ${T.ferryShort[lang]} ${v.ferryKm} km` : ''}{st.miss ? ` · ⚠ ${T.incomplete[lang]}` : ''}</div>
                        {viaBorders(v) && <div className="break-words text-[11px] text-slate-400">{viaBorders(v)}</div>}</td>
                      <td className={TD}>{money(v.km)}</td>
                      <td className={`${TD} whitespace-nowrap`}>{fmtHours(v.hours)}</td>
                      <td className={TD}>{money(st.road, 0)} €</td>
                      <td className={TD}>{st.extra ? `${money(st.extra, 0)} €` : '—'}</td>
                      {hasT && <td className={TD}>{money(st.truck, 0)} €</td>}
                      <td className={`${TD} font-semibold text-navy-800`}>{money(cmp, 0)} €</td>
                      {hasT && <td className={`${TD} text-navy-800`}>{v.km ? `${st.miss ? '≥ ' : ''}${money(st.all / v.km, 3)}` : '—'}<span className="block text-[10.5px] text-slate-400">€/km</span></td>}
                      <td className={`${TD} ${cmp - ref > 0.5 ? 'text-red-600' : 'text-emerald-700'}`}>{cmp - ref > 0.5 ? `+${money(cmp - ref, 0)} €` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
              )
            })()}
          </div>
          <p className="mt-2 text-[12px] text-slate-500">{truckPerKm != null ? T.compareTruck[lang] : T.compareNoTruck[lang]}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-[13px] text-slate-600">{T.manualVar[lang]}</span>
            {manualAvoid.map((c) => <button key={c} type="button" onClick={() => setManualAvoid((a) => a.filter((x) => x !== c))} className="rounded-full bg-slate-200 px-2.5 py-1 text-[12px] text-slate-700 hover:bg-slate-300">{nameOf(c)} ✕</button>)}
            <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]" value="" onChange={(e) => e.target.value && setManualAvoid((a) => [...new Set([...a, e.target.value])])}>
              <option value="">{T.avoidAdd[lang]}</option>{[...new Set([...seen, ...countries.map((c) => c.country_code)])].filter((c) => !od.includes(c) && !baseAv.includes(c) && !manualAvoid.includes(c)).map((c) => <option key={c} value={c}>{nameOf(c)}</option>)}
            </select>
            <button type="button" disabled={busy || !manualAvoid.length} onClick={addManual} className="rounded-lg border border-brand-500 px-3 py-1.5 text-[13px] font-medium text-brand-600 hover:bg-brand-500/10 disabled:opacity-40">{T.addVariant[lang]}</button>
          </div>
        </div>
      )}

      {cur && (
        <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2"><h2 className="text-[15px] font-semibold text-navy-800">{T.byCountry[lang]} · {routeText(cur)} · {money(cur.km)} km</h2>
                <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]" value="" onChange={(e) => addRow(e.target.value)}>
                  <option value="">{T.addRow[lang]}</option>{countries.filter((c) => !codes.includes(c.country_code)).map((c) => <option key={c.id} value={c.country_code}>{c.country_name}</option>)}
                </select></div>
              {cur.via?.items?.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{T.viaTitle[lang]}</div>
                    {cur.via.gmaps && <a href={cur.via.gmaps} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-brand-500 px-2.5 py-1 text-[12px] font-medium text-brand-600 hover:bg-brand-500/10">{T.viaMaps[lang]}</a>}
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-700">
                    {cur.via.items.map((it, i) => (
                      <Fragment key={i}>
                        {i > 0 && <span className="text-slate-300"> → </span>}
                        {it.t === 'border'
                          ? <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[12px] font-medium text-amber-900" title={`km ${it.km}`}>{it.n || `${T.viaBorder[lang]} ${it.pair}`}</span>
                          : <span className={it.big ? 'font-medium text-navy-800' : ''} title={`km ${it.km}`}>{it.n}</span>}
                      </Fragment>
                    ))}
                  </p>
                  <p className="mt-2 text-[11.5px] text-slate-500">{T.viaNote[lang]}</p>
                </div>
              )}
              {shown.length === 0 ? <p className="mt-3 text-[13px] text-slate-500">{T.noSplit[lang]}</p> : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-[13px]">
                    <thead><tr className="text-left text-[11px] uppercase text-slate-500"><th className="py-1.5">{T.country[lang]}</th><th>{T.km[lang]}</th><th>{T.rate[lang]}</th><th>{T.manual[lang]}</th><th className="text-right">{T.cost[lang]}</th></tr></thead>
                    <tbody>
                      {shown.map((r, i) => (
                        <Fragment key={r.code}>
                          <tr className="border-t border-slate-100">
                            <td className="py-1.5 pr-2"><span className="font-medium text-navy-800">{r.name}</span> <ConfBadge c={r.corr ? 'Verificat' : r.conf} lang={lang} /></td>
                            <td className="pr-2"><input inputMode="decimal" className={`${input} w-[84px] !py-1`} value={r.km} onChange={(e) => setRow(i, 'km', e.target.value)} /></td>
                            <td className="pr-2"><input inputMode="decimal" className={`${input} w-[84px] !py-1`} value={r.corr || r.split ? '' : r.rate} placeholder={r.corr ? 'HU-GO' : r.split ? 'TollRO' : ''} onChange={(e) => setRow(i, 'rate', e.target.value)} disabled={tkmFix(r) != null || !!r.corr || !!r.split} /></td>
                            <td className="pr-2"><input inputMode="decimal" className={`${input} w-[84px] !py-1`} value={r.manual} onChange={(e) => { setRow(i, 'manual', e.target.value); if (r.corr && e.target.value) setRow(i, 'corr', '') }} disabled={!!r.corr} /></td>
                            <td className="text-right tabular-nums">{missingOf(r) ? <span className="text-amber-700">?</span> : money(costOf(r), 2)}</td>
                          </tr>
                          {r.split && (
                            <tr><td colSpan={5} className="pb-2 pt-0.5">
                              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-[12.5px]">
                                <span className="text-slate-600">{T.roHwy[lang]}:</span>
                                <input inputMode="decimal" className={`${input} !w-[80px] !py-1`} value={r.split.hwy} onChange={(e) => setSplit(i, 'hwy', e.target.value)} />
                                <span className="text-slate-500">{T.roOth[lang]}: {money(Math.max(0, n(r.km) - n(r.split.hwy)), 1)}</span>
                                <span className="text-slate-600">{r.split.cur === 'RON' ? T.roRateH[lang] : `${r.split.cur}/km`}:</span>
                                <input inputMode="decimal" className={`${input} !w-[70px] !py-1`} value={r.split.rHwy} onChange={(e) => setSplit(i, 'rHwy', e.target.value)} />
                                <span className="text-slate-600">{r.split.cur === 'RON' ? T.roRateO[lang] : `${r.split.cur}/km`}:</span>
                                <input inputMode="decimal" className={`${input} !w-[70px] !py-1`} value={r.split.rOth} onChange={(e) => setSplit(i, 'rOth', e.target.value)} />
                                <span className="text-slate-600">{r.split.cur === 'RON' ? T.ronRate[lang] : `${r.split.cur} / EUR`}:</span>
                                <input inputMode="decimal" className={`${input} !w-[80px] !py-1`} value={ron} onChange={(e) => setRon(e.target.value)} />
                                <span className="text-slate-500">{ronSrc || T.ronNote[lang]}</span>
                                <span className="w-full text-slate-500">{T.roHint[lang]}</span>
                                {!(ronN > 0) && !(n(r.manual) > 0) && <span className="w-full text-amber-700">{T.noRon[lang]}</span>}
                              </div>
                            </td></tr>
                          )}
                          {r.code === 'HU' && corr.some((c) => c.country_code === 'HU') && (
                            <tr><td colSpan={5} className="pb-2 pt-0.5">
                              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-[12.5px]">
                                <span className="text-slate-600">{T.huRoute[lang]}:</span>
                                <select className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5" value={r.corr} onChange={(e) => setRow(i, 'corr', e.target.value)}>
                                  <option value="">{T.avgRate[lang]}</option>{corr.filter((c) => c.country_code === 'HU').map((c) => <option key={c.id} value={c.id}>{corridorLabel(c)}</option>)}
                                </select>
                                <span className="text-slate-600">{T.hufRate[lang]}:</span>
                                <input inputMode="decimal" className={`${input} !w-[80px] !py-1`} value={huf} onChange={(e) => setHuf(e.target.value)} />
                                <span className="text-slate-500">{hufSrc || T.hufNote[lang]}</span>
                                <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={huNoVat} onChange={(e) => setHuNoVat(e.target.checked)} className="accent-orange-500" />{T.huVatLbl[lang]}</label>
                                {r.corr && !(hufN > 0) && <span className="w-full text-amber-700">{T.noHuf[lang]}</span>}
                              </div>
                            </td></tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  {missing && <p className="mt-2 text-[12.5px] text-amber-700">{T.missing[lang]}</p>}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-[15px] font-semibold text-navy-800">{T.extras[lang]}</h2>
              <p className="text-[12.5px] text-slate-500">{T.extrasHint[lang]}</p>
              {sugg.length === 0 && <p className="mt-2 text-[13px] text-slate-500">{T.extrasNone[lang]}</p>}
              <ul className="mt-2 space-y-2">
                {chosen.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2.5">
                    <input type="checkbox" checked={isOn(e)} onChange={() => toggle(e)} className="h-4 w-4 accent-orange-500" />
                    <div className="min-w-[160px] flex-1"><div className="text-[13.5px] font-medium text-navy-800">{e.name}</div><div className="text-[11.5px] text-slate-500">{e.kind} · {e.applies} · <ConfBadge c={e.confidence} lang={lang} /></div></div>
                    <input inputMode="decimal" className={`${input} w-[96px] !py-1`} value={priceOf(e)} onChange={(ev) => setPrice(e, ev.target.value)} placeholder={T.noPrice[lang]} />
                    <span className="text-[12px] text-slate-500">€</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3"><select className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-[13px]" value={more} onChange={(e) => setMore(e.target.value)}>
                <option value="">{T.moreExtras[lang]}</option>{extras.filter((e) => !sugg.some((x) => x.id === e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select></div>
            </div>
          </div>

          <div className="space-y-3">
            <Stat accent label={T.total[lang].toUpperCase()} value={`${money(total, 2)} €`} sub={usedKm > 0 ? `${money(total / usedKm, 3)} ${T.perKm[lang]}` : ''} />
            <div className="grid grid-cols-2 gap-3">
              <Stat label={T.totalRoad[lang].toUpperCase()} value={`${money(road, 2)} €`} />
              <Stat label={T.totalExtra[lang].toUpperCase()} value={`${money(extra, 2)} €`} />
            </div>
            {truckPerKm != null && stats[sel] && cur?.km > 0 && (
              <Stat accent label={T.totalKmFull[lang]} value={`${money(total + stats[sel].truck, 2)} €`} sub={`${missing ? '≥ ' : ''}${money((total + stats[sel].truck) / cur.km, 3)} €/km · ${T.totalKmSub[lang]}: ${money(stats[sel].truck, 0)} + ${money(road, 0)} + ${money(extra, 0)}`} />
            )}
            <button type="button" disabled={total <= 0} onClick={() => nav('/tools/estimator', { state: { tolls: Math.round(total * 100) / 100, km: cur.km || undefined, load_place: f.load_place, load_country: f.load_country, unload_place: f.unload_place, unload_country: f.unload_country } })} className="w-full rounded-lg border border-brand-500 px-4 py-2.5 text-[14px] font-semibold text-brand-600 hover:bg-brand-500/10 disabled:opacity-40">{T.useEst[lang]}</button>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mono-label text-[9.5px] text-slate-500">{T.saveRoute[lang].toUpperCase()}</div>
              <div className="mt-1.5 flex gap-2"><input className={`${input} !py-1.5`} placeholder={T.saveName[lang]} value={saveName} onChange={(e) => setSaveName(e.target.value)} />
                <button type="button" disabled={!saveName.trim()} onClick={saveRoute} className="shrink-0 rounded-lg bg-navy-800 px-3 text-[13px] font-medium text-white disabled:opacity-40">{T.save[lang]}</button></div>
              {saved.length > 0 && <ul className="mt-2 space-y-1 text-[12.5px] text-slate-600">{saved.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span>{r.name}{r.avoid ? ` (−${r.avoid})` : ''}</span><button type="button" onClick={() => delSaved(r.id)} className="text-red-600 hover:underline">{T.delBtn[lang]}</button></li>)}</ul>}
            </div>
            <p className="text-[12px] leading-relaxed text-slate-500">{T.legend[lang]}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Editare (modal comun) ---------- */
function EditModal({ title, fields, initial, onClose, onSave, onDelete }) {
  const { lang } = useLang()
  const [f, setF] = useState(() => Object.fromEntries(fields.map((x) => [x.key, initial?.[x.key] ?? ''])))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const save = async () => { setBusy(true); setErr(''); try { await onSave(f) } catch (e) { setErr(e.message); setBusy(false) } }
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-3 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative w-full max-w-[640px] rounded-2xl bg-white p-5 shadow-2xl">
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{title}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {fields.map((x) => (
            <Field key={x.key} label={x.label[lang]} help={x.help?.[lang]} className={x.wide ? 'sm:col-span-2' : ''}>
              {x.type === 'select' ? <select className={input} value={f[x.key]} onChange={set(x.key)}>{x.options.map((o) => <option key={o.v ?? o} value={o.v ?? o}>{o.l ?? o}</option>)}</select>
                : x.type === 'textarea' ? <textarea rows={4} className={input} value={f[x.key]} onChange={set(x.key)} />
                : <input type={x.type === 'date' ? 'date' : 'text'} inputMode={x.type === 'number' ? 'decimal' : undefined} className={input} value={f[x.key]} onChange={set(x.key)} />}
            </Field>
          ))}
        </div>
        {err && <p className="mt-3 text-[13px] text-red-600">{err}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div>{initial?.id && (confirm
            ? <span className="text-[13px]">{T.del[lang]} <button type="button" className="font-semibold text-red-600" onClick={async () => { try { await onDelete(initial.id) } catch (e) { setErr(e.message) } }}>{T.delBtn[lang]}</button> · <button type="button" onClick={() => setConfirm(false)} className="text-slate-600">{T.cancel[lang]}</button></span>
            : <button type="button" onClick={() => setConfirm(true)} className="text-[13px] text-red-600 hover:underline">{T.delBtn[lang]}</button>)}</div>
          <div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-[14px] text-slate-700">{T.cancel[lang]}</button>
            <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{T.save[lang]}</button></div>
        </div>
      </div>
    </div>
  )
}

const SrcLink = ({ name, url }) => (url ? <a href={url} target="_blank" rel="noreferrer" className="text-sky-700 underline">{name || 'link'}</a> : <span>{name || '—'}</span>)

function Toolbar({ q, setQ, conf, setConf, onAdd, lang, extraFilter }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input className={`${input} max-w-[260px]`} placeholder={T.search[lang]} value={q} onChange={(e) => setQ(e.target.value)} />
      <select className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-[13px]" value={conf} onChange={(e) => setConf(e.target.value)}>
        <option value="">{T.conf[lang]}: {T.all[lang]}</option>{CONFIDENCE.map((c) => <option key={c}>{c}</option>)}
      </select>
      {extraFilter}
      <button type="button" onClick={onAdd} className="ml-auto rounded-lg bg-brand-500 px-3.5 py-2 text-[13.5px] font-semibold text-white hover:bg-brand-600">＋ {T.add[lang]}</button>
    </div>
  )
}

/* ---------- Tarife pe țară ---------- */
const CF = [
  { key: 'country_name', label: T.name, type: 'text' }, { key: 'country_code', label: L('Cod țară (2 litere)', 'Country code (2 letters)'), type: 'text' },
  { key: 'scheme', label: T.scheme, type: 'select', options: SCHEMES },
  { key: 'rate_unit', label: T.unit, type: 'select', options: [{ v: 'km', l: T.kmU.ro }, { v: 'tkm', l: T.tkm.ro }] },
  { key: 'rate_eur', label: L('Tarif (EUR)', 'Rate (EUR)'), type: 'number', help: T.rateHelp }, { key: 'rate_other_eur', label: T.rateOther, type: 'number' },
  { key: 'currency', label: T.localCur, type: 'text' }, { key: 'rate_local', label: T.rateLocal, type: 'number' }, { key: 'rate_other_local', label: T.rateLocalO, type: 'number' },
  { key: 'effective_from', label: T.effFrom, type: 'date' }, { key: 'verified_on', label: T.verifiedOn, type: 'date' },
  { key: 'confidence', label: T.conf, type: 'select', options: CONFIDENCE }, { key: 'source_name', label: T.source, type: 'text' },
  { key: 'source_url', label: T.srcUrl, type: 'text', wide: true }, { key: 'notes', label: T.notes, type: 'textarea', wide: true },
]
function Countries({ rows, reload }) {
  const { lang } = useLang()
  const [q, setQ] = useState(''); const [conf, setConf] = useState(''); const [edit, setEdit] = useState(null)
  const list = rows.filter((r) => (!conf || r.confidence === conf) && (!q || `${r.country_name} ${r.country_code} ${r.notes || ''}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.country_name.localeCompare(b.country_name))
  return (
    <div>
      <Toolbar q={q} setQ={setQ} conf={conf} setConf={setConf} lang={lang} onAdd={() => setEdit({})} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead><tr className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><th className="p-2.5">{T.country[lang]}</th><th>{T.scheme[lang]}</th><th>{T.rate[lang]}</th><th>{T.rateOther[lang]}</th><th>{T.conf[lang]}</th><th>{T.verifiedOn[lang]}</th><th>{T.source[lang]}</th><th /></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="p-2.5"><div className="font-medium text-navy-800">{r.country_name} <span className="text-slate-400">{r.country_code}</span></div>{r.notes && <div className="mt-0.5 max-w-[360px] text-[12px] leading-snug text-slate-500">{r.notes}</div>}</td>
                <td className="py-2.5 pr-2">{r.scheme}</td>
                <td className="py-2.5 pr-2 tabular-nums">{r.rate_local != null && r.currency ? <>{Number(r.rate_local).toLocaleString('ro-RO')} / {Number(r.rate_other_local ?? r.rate_local).toLocaleString('ro-RO')} <span className="text-[11px] text-slate-500">{r.currency}/km</span></> : r.rate_eur == null ? '—' : <>{Number(r.rate_eur).toLocaleString('ro-RO', { maximumFractionDigits: 4 })}{r.rate_unit === 'tkm' ? <span className="text-[11px] text-slate-500"> /t·km</span> : null}</>}</td>
                <td className="py-2.5 pr-2 tabular-nums">{r.rate_other_eur == null ? '—' : Number(r.rate_other_eur).toLocaleString('ro-RO', { maximumFractionDigits: 4 })}</td>
                <td className="py-2.5 pr-2"><ConfBadge c={r.confidence} lang={lang} /></td>
                <td className="py-2.5 pr-2 whitespace-nowrap">{fmtDate(r.verified_on) || '—'}</td>
                <td className="py-2.5 pr-2"><SrcLink name={r.source_name} url={r.source_url} /></td>
                <td className="py-2.5 pr-2"><button type="button" onClick={() => setEdit(r)} className="text-brand-600 hover:underline">{T.edit[lang]}</button></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={8} className="p-4 text-center text-slate-500">{T.empty[lang]}</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <EditModal title={edit.id ? `${T.edit[lang]}: ${edit.country_name}` : T.add[lang]} fields={CF} initial={edit.id ? edit : { rate_unit: 'km', scheme: 'Pe km', confidence: 'Estimat' }} onClose={() => setEdit(null)}
        onSave={async (f) => { if (!f.country_name.trim() || !/^[A-Za-z]{2}$/.test(f.country_code.trim())) throw new Error(T.needCode[lang]); await TOLL_COUNTRIES.api.save(edit.id || null, { ...f, country_code: f.country_code.trim().toUpperCase() }); setEdit(null); reload() }}
        onDelete={async (id) => { await TOLL_COUNTRIES.api.remove(id); setEdit(null); reload() }} />}
    </div>
  )
}

/* ---------- Costuri suplimentare ---------- */
const XF = [
  { key: 'name', label: T.name, type: 'text', wide: true }, { key: 'kind', label: T.kind, type: 'select', options: EXTRA_KINDS }, { key: 'applies', label: T.applies, type: 'select', options: EXTRA_APPLIES },
  { key: 'price_eur', label: T.price, type: 'number' }, { key: 'price_basis', label: T.basis, type: 'text' },
  { key: 'countries', label: T.countriesF, type: 'text', help: T.countriesHelp, wide: true },
  { key: 'confidence', label: T.conf, type: 'select', options: CONFIDENCE }, { key: 'verified_on', label: T.verifiedOn, type: 'date' },
  { key: 'source_name', label: T.source, type: 'text' }, { key: 'source_url', label: T.srcUrl, type: 'text' }, { key: 'notes', label: T.notes, type: 'textarea', wide: true },
]
function Extras({ rows, reload }) {
  const { lang } = useLang()
  const [q, setQ] = useState(''); const [conf, setConf] = useState(''); const [kind, setKind] = useState(''); const [edit, setEdit] = useState(null)
  const list = rows.filter((r) => (!conf || r.confidence === conf) && (!kind || r.kind === kind) && (!q || `${r.name} ${r.countries || ''} ${r.notes || ''}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  const kindSel = <select className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-[13px]" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">{T.kind[lang]}: {T.all[lang]}</option>{EXTRA_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
  return (
    <div>
      <Toolbar q={q} setQ={setQ} conf={conf} setConf={setConf} lang={lang} onAdd={() => setEdit({})} extraFilter={kindSel} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead><tr className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><th className="p-2.5">{T.name[lang]}</th><th>{T.kind[lang]}</th><th>{T.price[lang]}</th><th>{T.conf[lang]}</th><th>{T.verifiedOn[lang]}</th><th>{T.source[lang]}</th><th /></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="p-2.5"><div className="font-medium text-navy-800">{r.name} {r.countries && <span className="text-[11px] text-slate-400">{r.countries}</span>}</div>{r.notes && <div className="mt-0.5 max-w-[380px] text-[12px] leading-snug text-slate-500">{r.notes}</div>}</td>
                <td className="py-2.5 pr-2">{r.kind}<div className="text-[11.5px] text-slate-500">{r.applies}</div></td>
                <td className="py-2.5 pr-2 tabular-nums">{r.price_eur == null ? '—' : `${money(r.price_eur, 2)} €`}<div className="text-[11.5px] text-slate-500">{r.price_basis}</div></td>
                <td className="py-2.5 pr-2"><ConfBadge c={r.confidence} lang={lang} /></td>
                <td className="py-2.5 pr-2 whitespace-nowrap">{fmtDate(r.verified_on) || '—'}</td>
                <td className="py-2.5 pr-2"><SrcLink name={r.source_name} url={r.source_url} /></td>
                <td className="py-2.5 pr-2"><button type="button" onClick={() => setEdit(r)} className="text-brand-600 hover:underline">{T.edit[lang]}</button></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7} className="p-4 text-center text-slate-500">{T.empty[lang]}</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <EditModal title={edit.id ? `${T.edit[lang]}: ${edit.name}` : T.add[lang]} fields={XF} initial={edit.id ? edit : { kind: EXTRA_KINDS[0], applies: EXTRA_APPLIES[1], confidence: 'Estimat' }} onClose={() => setEdit(null)}
        onSave={async (f) => { if (!f.name.trim()) throw new Error(T.needName[lang]); await TOLL_EXTRAS.api.save(edit.id || null, { ...f, countries: f.countries.toUpperCase().replace(/\s+/g, '') }); setEdit(null); reload() }}
        onDelete={async (id) => { await TOLL_EXTRAS.api.remove(id); setEdit(null); reload() }} />}
    </div>
  )
}

/* ---------- Trasee HU-GO ---------- */
const QF = [
  { key: 'entry_label', label: T.entry, type: 'text', wide: true }, { key: 'exit_label', label: T.exit, type: 'text', wide: true },
  { key: 'entry_country', label: T.entryC, type: 'text' }, { key: 'exit_country', label: T.exitC, type: 'text' },
  { key: 'km', label: T.km, type: 'number' }, { key: 'fee_infra', label: T.infra, type: 'number' }, { key: 'fee_external', label: T.ext, type: 'number' },
  { key: 'verified_on', label: T.verifiedOn, type: 'date' }, { key: 'confidence', label: T.conf, type: 'select', options: CONFIDENCE },
  { key: 'source_name', label: T.source, type: 'text' }, { key: 'source_url', label: T.srcUrl, type: 'text' }, { key: 'notes', label: T.notes, type: 'textarea', wide: true },
]
function Corridors({ rows, reload }) {
  const { lang } = useLang()
  const [edit, setEdit] = useState(null)
  const list = [...rows].sort((a, b) => a.entry_label.localeCompare(b.entry_label) || a.exit_label.localeCompare(b.exit_label))
  const f0 = (x) => (x == null ? '' : x)
  return (
    <div>
      <p className="mb-3 max-w-[820px] text-[13.5px] text-slate-600">{T.corrIntro[lang]}</p>
      <div className="mb-3 flex justify-end"><button type="button" onClick={() => setEdit({})} className="rounded-lg bg-brand-500 px-3.5 py-2 text-[13.5px] font-semibold text-white hover:bg-brand-600">＋ {T.add[lang]}</button></div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead><tr className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><th className="p-2.5">{T.entry[lang]}</th><th>{T.exit[lang]}</th><th className="text-right">{T.km[lang]}</th><th className="text-right">{T.infra[lang]}</th><th className="text-right">{T.ext[lang]}</th><th className="text-right">{T.tot[lang]}</th><th className="text-right">{T.perKmHuf[lang]}</th><th className="pl-3">{T.verifiedOn[lang]}</th><th /></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="p-2.5 font-medium text-navy-800">{r.entry_label}{r.notes && <div className="mt-0.5 max-w-[260px] text-[11.5px] font-normal leading-snug text-slate-500">{r.notes}</div>}</td>
                <td className="py-2.5 pr-2">{r.exit_label}</td>
                <td className="py-2.5 pr-2 text-right tabular-nums">{Number(r.km).toLocaleString('ro-RO', { maximumFractionDigits: 1 })}</td>
                <td className="py-2.5 pr-2 text-right tabular-nums">{Number(r.fee_infra || 0).toLocaleString('ro-RO')}</td>
                <td className="py-2.5 pr-2 text-right tabular-nums">{Number(r.fee_external || 0).toLocaleString('ro-RO')}</td>
                <td className="py-2.5 pr-2 text-right font-semibold tabular-nums text-navy-800">{Number(r.fee_total).toLocaleString('ro-RO')}</td>
                <td className="py-2.5 pr-2 text-right tabular-nums">{r.km > 0 ? Math.round(r.fee_total / r.km) : '—'}</td>
                <td className="py-2.5 pl-3 whitespace-nowrap">{fmtDate(r.verified_on) || '—'}</td>
                <td className="py-2.5 pr-2"><button type="button" onClick={() => setEdit(r)} className="text-brand-600 hover:underline">{T.edit[lang]}</button></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={9} className="p-4 text-center text-slate-500">{T.empty[lang]}</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <EditModal title={edit.id ? `${T.edit[lang]}: ${edit.entry_label} → ${edit.exit_label}` : T.add[lang]} fields={QF} initial={edit.id ? edit : { entry_country: 'RO', confidence: 'Verificat', source_name: 'HU-GO – calculator oficial', source_url: 'https://utdijkalkulacio.hu/', verified_on: todayISO() }} onClose={() => setEdit(null)}
        onSave={async (f) => {
          if (!f.entry_label.trim() || !f.exit_label.trim()) throw new Error(T.needCorr[lang])
          const infra = n(f.fee_infra), ext = n(f.fee_external)
          await TOLL_CORRIDORS.api.save(edit.id || null, { ...f, country_code: 'HU', entry_country: String(f.entry_country).toUpperCase().trim(), exit_country: String(f.exit_country).toUpperCase().trim(), fee_infra: infra, fee_external: ext, fee_total: infra + ext, currency: 'HUF', vat_included: true, profile: edit.profile || 'J5 · EURO6 · 40 t' })
          setEdit(null); reload()
        }}
        onDelete={async (id) => { await TOLL_CORRIDORS.api.remove(id); setEdit(null); reload() }} />}
    </div>
  )
}

export default function ToolTolls() {
  const { lang } = useLang()
  const [tab, setTab] = useState('calc')
  const [countries, setCountries] = useState([])
  const [extras, setExtras] = useState([])
  const [corridors, setCorridors] = useState([])
  const [err, setErr] = useState('')
  const reload = () => Promise.all([TOLL_COUNTRIES.api.list(), TOLL_EXTRAS.api.list(), TOLL_CORRIDORS.api.list().catch(() => [])]).then(([c, e, q]) => { setCountries(c); setExtras(e); setCorridors(q); setErr('') }).catch((e) => setErr(`${e.message} — rulează migrarea 015 în Supabase.`))
  useEffect(() => { reload() }, [])
  return (
    <ToolShell title={T.title} intro={T.intro} wide>
      {err && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13.5px] text-amber-800">{err}</p>}
      <Tabs tab={tab} setTab={setTab} lang={lang} />
      <div className="mt-4">
        {tab === 'calc' && <Calculator countries={countries} extras={extras} />}
        {tab === 'countries' && <Countries rows={countries} reload={reload} />}
        {tab === 'extras' && <Extras rows={extras} reload={reload} />}
        {tab === 'corr' && <Corridors rows={corridors} reload={reload} />}
      </div>
    </ToolShell>
  )
}
