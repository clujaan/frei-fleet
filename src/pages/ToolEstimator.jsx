import { useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../i18n'
import { calcKm, canCalcKm } from '../lib/km'
import { fetchBnrRate } from '../lib/bnr'
import { fmtMoney, parseNum, todayISO } from '../lib/format'
import { TRUCKS, calcTruck, fmt3, toEur } from '../lib/trucks'
import { PlaceInput } from './Burse'
import ToolShell, { Field, Stat, toolInput as input } from '../components/ToolShell'

const L = (ro, en) => ({ ro, en })
const T = {
  title: L('Estimator de ofertă', 'Offer estimator'),
  intro: L('Din rută, greutate și un camion de referință (sau un €/km introdus de tine) estimează costul probabil al transportatorului și prețul de vânzare pentru marja țintă. Taxele de drum se pot calcula în „Taxe de drum” și trimite aici.', 'From route, weight and a reference truck (or your own €/km) it estimates the carrier’s probable cost and the sale price for the target margin. Road tolls can be calculated in “Road tolls” and sent here.'),
  truck: L('Camion de referință', 'Reference truck'), manual: L('— €/km introdus manual —', '— manual €/km —'), manualKm: L('€/km (cost de referință)', '€/km (reference cost)'),
  load: L('Încărcare', 'Loading'), unload: L('Descărcare', 'Unloading'), country: L('Țară', 'Country'), place: L('Localitate / cod poștal', 'City / postcode'),
  km: L('Km încărcat (pe rută)', 'Loaded km (route)'), calc: L('Calculează km', 'Calculate km'), busy: L('Se calculează…', 'Calculating…'), emptyKm: L('Km goi suplimentari (ex. întoarcere)', 'Extra empty km (e.g. return)'),
  weight: L('Greutate marfă (t)', 'Cargo weight (t)'), tolls: L('Taxe de drum (EUR)', 'Road tolls (EUR)'), cp: L('Profit transportator partener (%)', 'Partner carrier profit (%)'), mg: L('Marja noastră țintă (% din preț)', 'Our target margin (% of price)'), known: L('Preț transportator cunoscut (EUR), opțional', 'Known carrier price (EUR), optional'),
  ref: L('Cost de referință', 'Reference cost'), carrier: L('Preț probabil transportator', 'Probable carrier price'), sale: L('Preț de vânzare client', 'Client sale price'), margin: L('Marja noastră', 'Our margin'), perKmSale: L('Preț vânzare / km încărcat', 'Sale price / loaded km'), perKmCarrier: L('Transportator / km încărcat', 'Carrier / loaded km'),
  needKm: L('Introdu km (sau calculează-i din rută).', 'Enter km (or calculate it from the route).'), needRef: L('Alege un camion sau introdu un €/km.', 'Choose a truck or enter a €/km.'), noFx: L('Camionul e în RON și lipsește cursul: completează-l pe camion.', 'Truck is in RON and the rate is missing: set it on the truck.'),
  reefer: L('Marfă la temperatură controlată (agregat frigorific pornit)', 'Temperature-controlled cargo (refrigeration unit running)'), reeferDays: L('Zile cu agregat pornit (gol = estimare din km)', 'Days with unit running (empty = estimated from km)'), reeferIncl: L('din care agregat frigorific', 'of which refrigeration unit'), days: L('zile', 'days'),
  basis: L('Calcul', 'Basis'), basisTxt: L('cost camion la greutatea aleasă × km totali + taxe, apoi + profit partener, apoi marja noastră', 'truck cost at the chosen weight × total km + tolls, then + partner profit, then our margin'),
}
const n = (v) => { const x = parseNum(v); return Number.isFinite(x) ? x : 0 }
const money = (v) => Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ToolEstimator() {
  const { lang } = useLang()
  const [trucks, setTrucks] = useState([])
  const [truckId, setTruckId] = useState('')
  const [manualKm, setManualKm] = useState('')
  const incoming = useLocation().state
  const [f, setF] = useState({ load_country: incoming?.load_country || '', load_place: incoming?.load_place || '', unload_country: incoming?.unload_country || '', unload_place: incoming?.unload_place || '', km: incoming?.km ? String(incoming.km) : '', emptyKm: '0', reefer: false, reeferDays: '', weight: '18', tolls: incoming?.tolls != null ? String(incoming.tolls) : '0', cp: '10', mg: '10', known: '' })
  const [geo, setGeo] = useState({})
  const [kmBusy, setKmBusy] = useState(false)
  const [kmMsg, setKmMsg] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  useEffect(() => { TRUCKS.api.list().then((r) => { const a = r.filter((x) => x.status !== 'Inactiv'); setTrucks(a); if (a[0]) setTruckId(a[0].id) }).catch(() => {}) }, [])
  const truck = trucks.find((x) => x.id === truckId)

  const doKm = async () => {
    setKmBusy(true); setKmMsg('')
    try { const km = await calcKm({ ...f, extra_loads: [], extra_unloads: [] }, geo); setF((s) => ({ ...s, km: String(km) })); setKmMsg(`✓ ${km} km`) } catch (e) { setKmMsg(e.message) }
    setKmBusy(false)
  }

  const r = useMemo(() => {
    const km = n(f.km), empty = n(f.emptyKm)
    if (!km) return { err: 'needKm' }
    let perKmEur
    let reeferCost = 0, reeferDaysUsed = 0
    if (truck) {
      const c = calcTruck(truck, { loadT: n(f.weight) })
      const e = toEur(truck, c.perKmGeneral)
      if (e == null) return { err: 'noFx' }
      perKmEur = e
      if (f.reefer && c.isReefer) {
        // zile cu agregat pornit: introduse de tine sau estimate din km / (km pe zi)
        const days = n(f.reeferDays) > 0 ? n(f.reeferDays) : Math.max(1, Math.ceil((km + empty) / (c.kmPerDay || 500)))
        const rd = toEur(truck, c.reeferPerDayFull)
        reeferCost = rd == null ? 0 : rd * days
        reeferDaysUsed = days
      }
    } else if (n(manualKm)) perKmEur = n(manualKm)
    else return { err: 'needRef' }
    const ref = perKmEur * (km + empty) + n(f.tolls) + reeferCost
    const carrier = f.known !== '' && n(f.known) > 0 ? n(f.known) : ref * (1 + n(f.cp) / 100)
    const mg = Math.min(Math.max(n(f.mg), 0), 95) / 100
    const sale = carrier / (1 - mg)
    return { ref, carrier, sale, margin: sale - carrier, perKmEur, km, reeferCost, reeferDaysUsed }
  }, [f, truck, manualKm])

  return (
    <ToolShell title={T.title} intro={T.intro}>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={T.truck[lang]} className="sm:col-span-2">
              <select className={input} value={truckId} onChange={(e) => setTruckId(e.target.value)}>
                <option value="">{T.manual[lang]}</option>
                {trucks.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.plate}{x.label ? ` · ${x.label}` : ''}</option>)}
              </select>
            </Field>
            {truck?.trailer_type === 'Frigorific' && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 sm:col-span-2">
                <label className="flex items-center gap-2 text-[13px] text-sky-900"><input type="checkbox" checked={f.reefer} onChange={(e) => setF((s) => ({ ...s, reefer: e.target.checked }))} />{T.reefer[lang]}</label>
                {f.reefer && <Field label={T.reeferDays[lang]} className="mt-2"><input inputMode="decimal" className={input} value={f.reeferDays} onChange={set('reeferDays')} placeholder="auto" /></Field>}
              </div>
            )}
            {!truck && <Field label={T.manualKm[lang]}><input inputMode="decimal" className={input} value={manualKm} onChange={(e) => setManualKm(e.target.value)} /></Field>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`${T.load[lang]}: ${T.country[lang]}`}><input className={input} list="est-countries" value={f.load_country} onChange={set('load_country')} placeholder="RO" /></Field>
            <Field label={`${T.load[lang]}: ${T.place[lang]}`}><PlaceInput value={f.load_place} country={f.load_country} onText={(v) => setF((s) => ({ ...s, load_place: v }))} onPick={(it) => { setGeo((g) => ({ ...g, load: { text: it.text, lat: it.lat, lon: it.lon } })); setF((s) => ({ ...s, load_place: it.text, load_country: it.country || s.load_country })) }} /></Field>
            <Field label={`${T.unload[lang]}: ${T.country[lang]}`}><input className={input} list="est-countries" value={f.unload_country} onChange={set('unload_country')} placeholder="DE" /></Field>
            <Field label={`${T.unload[lang]}: ${T.place[lang]}`}><PlaceInput value={f.unload_place} country={f.unload_country} onText={(v) => setF((s) => ({ ...s, unload_place: v }))} onPick={(it) => { setGeo((g) => ({ ...g, unload: { text: it.text, lat: it.lat, lon: it.lon } })); setF((s) => ({ ...s, unload_place: it.text, unload_country: it.country || s.unload_country })) }} /></Field>
            <datalist id="est-countries">{['RO', 'DE', 'NL', 'PL', 'IT', 'HU', 'AT', 'BG', 'FR', 'ES', 'BE', 'CZ', 'SK', 'GR'].map((c) => <option key={c} value={c} />)}</datalist>
            <Field label={T.km[lang]}>
              <div className="flex gap-2"><input inputMode="decimal" className={input} value={f.km} onChange={set('km')} />
                <button type="button" disabled={kmBusy || !canCalcKm(f)} onClick={doKm} className="shrink-0 rounded-lg border border-slate-300 px-3 text-[13px] text-brand-600 hover:bg-brand-500/10 disabled:opacity-40">{kmBusy ? T.busy[lang] : T.calc[lang]}</button></div>
              {kmMsg && <span className="mt-1 block text-[12px] text-slate-500">{kmMsg}</span>}
            </Field>
            <Field label={T.emptyKm[lang]}><input inputMode="decimal" className={input} value={f.emptyKm} onChange={set('emptyKm')} /></Field>
            <Field label={T.weight[lang]}><input inputMode="decimal" className={input} value={f.weight} onChange={set('weight')} /></Field>
            <Field label={T.tolls[lang]}><input inputMode="decimal" className={input} value={f.tolls} onChange={set('tolls')} /></Field>
            <Field label={T.cp[lang]}><input inputMode="decimal" className={input} value={f.cp} onChange={set('cp')} /></Field>
            <Field label={T.mg[lang]}><input inputMode="decimal" className={input} value={f.mg} onChange={set('mg')} /></Field>
            <Field label={T.known[lang]} className="sm:col-span-2"><input inputMode="decimal" className={input} value={f.known} onChange={set('known')} /></Field>
          </div>
        </div>
        <div className="space-y-3">
          {r.err ? <p className="rounded-xl border border-slate-200 bg-white p-4 text-[14px] text-slate-600">{T[r.err][lang]}</p> : (
            <>
              <Stat accent label={T.sale[lang].toUpperCase()} value={`${money(r.sale)} EUR`} sub={`${fmt3(r.sale / r.km)} EUR / km`} />
              <div className="grid grid-cols-2 gap-3">
                <Stat label={T.carrier[lang].toUpperCase()} value={`${money(r.carrier)} EUR`} sub={`${fmt3(r.carrier / r.km)} EUR / km`} />
                <Stat label={T.margin[lang].toUpperCase()} value={`${money(r.margin)} EUR`} sub={`${((r.margin / r.sale) * 100).toFixed(1)}%`} />
              </div>
              <Stat label={T.ref[lang].toUpperCase()} value={`${money(r.ref)} EUR`} sub={`${fmt3(r.perKmEur)} EUR / km${r.reeferCost ? ` · ${T.reeferIncl[lang]}: ${money(r.reeferCost)} EUR (${r.reeferDaysUsed} ${T.days[lang]})` : ''}`} />
              <p className="text-[12px] text-slate-500">{T.basis[lang]}: {T.basisTxt[lang]}.</p>
            </>
          )}
        </div>
      </div>
    </ToolShell>
  )
}
