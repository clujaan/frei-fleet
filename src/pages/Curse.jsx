// Curse: cursa-circuit bază -> încărcări / descărcări -> bază, cu camion, remorcă, șofer(i) și mai multe comenzi (grupaj).
// Venitul cursei = suma comenzilor nonanulate, în moneda de raportare. Decizii: docs/DECIZII-grupaj-ltl.md.
import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { backdrop } from '../lib/backdrop'
import { useLang } from '../i18n'
import { getCompany } from '../lib/company'
import { CARRIERS, CLIENTS } from '../lib/entities'
import { OWN_STATUSES, TRIPS_API, TRIP_STYLE, tripStatusLabel } from '../lib/trips'
import { CLIENT_ORDERS_API } from '../lib/clientOrders'
import { CT_GOODS_API, ORDERS_API, orderStatusLabel } from '../lib/orders'
import { DRIVERS_API, TRAILERS_API, TRUCKS_API, activeOr, truckLabel } from '../lib/fleet'
import { ALLOCATION_BASES, allocationShares, basisLabel, checkOwnTrip, distributionCosts, orderMeasures, orderValue, tripDays, tripKm, tripRevenue } from '../lib/tripMoney'
import { bnrRateOrNull } from '../lib/bnr'
import { COSTS_API, FUEL_API, computeFleet } from '../lib/fleetCostsApi'
import { PER_DIEM_API } from '../lib/fleet'
import { TRIP_LINES, categoryLabel } from '../lib/fleetCosts'
import { CostModal } from './CosturiFlota'
import { tripPlan } from '../lib/fleetBoard'
import LockGate from '../lib/editLock'
import { ACTIVITY_API } from '../lib/activity'
import { useReason } from '../components/ReasonModal'
import { CloseX, SaveButtons, useFlash } from '../components/ModalChrome'
import { countryName, countryOptions } from '../lib/places'
import { sideStops } from '../lib/orderStops'
import { foldText } from '../lib/costs'
import { fmtDate, fmtMoney, parseNum, todayISO } from '../lib/format'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const sel = `${input} !w-auto`
const lbl = 'block text-[12px] text-slate-600'
const useTx = () => { const { lang } = useLang(); return (ro, en) => (lang === 'en' ? en : ro) }

// timestamptz <-> <input type="datetime-local"> (ora locală)
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)
const fmtDT = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
const monthOf = (t) => String(t.start_at || t.load_date || '').slice(0, 7)

// Traseul unei comenzi: prima încărcare -> ultima descărcare (oraș, țară)
const place = (s) => (s ? [s.city, s.country && `(${s.country})`].filter(Boolean).join(' ') : '')
const orderRoute = (o) => {
  const l = sideStops(o.stops, 'load')[0]
  const u = sideStops(o.stops, 'unload').slice(-1)[0]
  return [place(l), place(u)].filter(Boolean).join(' → ')
}
const measureText = (o, lang) => {
  const m = orderMeasures(o)
  const n = (x) => fmtMoney(x).replace(/,00$/, '')
  return [m.ldm > 0 && `${n(m.ldm)} LDM`, m.weight > 0 && `${n(m.weight)} kg`, m.pallets > 0 && `${n(m.pallets)} ${lang === 'en' ? 'pal.' : 'pal.'}`].filter(Boolean).join(' · ')
}
const fxDate = (o) => o.order_date || sideStops(o.stops, 'load').map((s) => s.date).filter(Boolean).sort()[0] || todayISO()

// Completează cursul BNR pe comenzile (client sau CT) care nu îl au; întoarce câte au reușit
async function fillFx(rows, api) {
  let ok = 0
  for (const o of rows) {
    const r = await bnrRateOrNull(fxDate(o))
    if (!r) continue
    try { await api.save(o.id, { ...o, fx_rate: r.rate }); ok += 1 } catch { /* rămâne fără curs */ }
  }
  return ok
}

const EMPTY = { kind: 'own', truck_id: '', trailer_id: '', driver_id: '', driver2_id: '', start_at: '', end_at: '', km_start: '', km_end: '', km: '', km_empty: '', no_return_ok: false, countries: [], status: 'Planificată', allocation_basis: '', notes: '' }

function TripModal({ initial, fleet, clients, carriers, ccRows, ctRows, links, pnl, trips, onClose, onSaved, onChanged }) {
  const tx = useTx()
  const { lang } = useLang()
  const reportCur = getCompany().report_currency || 'EUR'
  const companyBasis = getCompany().cost_allocation_basis || 'ldm'
  const [f, setF] = useState(() => {
    const src = { ...EMPTY, ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? EMPTY[k] ?? ''])) }
    return { ...src, start_at: toLocalInput(initial?.start_at), end_at: toLocalInput(initial?.end_at), countries: Array.isArray(initial?.countries) ? initial.countries : [] }
  })
  const [rid, setRid] = useState(initial?.id || null)
  const [code, setCode] = useState(initial?.code || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [flash, ping] = useFlash()
  const [askReason, reasonNode] = useReason()
  const [cancelReason, setCancelReason] = useState('')
  const [addId, setAddId] = useState('')
  const [addCountry, setAddCountry] = useState('')
  const [costModal, setCostModal] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const own = f.kind !== 'subcontracted'

  const truckById = useMemo(() => Object.fromEntries(fleet.trucks.map((x) => [x.id, x])), [fleet.trucks])
  const cName = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.company])), [clients])
  const kName = useMemo(() => Object.fromEntries(carriers.map((c) => [c.id, c.company])), [carriers])
  const orders = useMemo(() => (rid ? ccRows.filter((o) => o.trip_id === rid) : []), [ccRows, rid])
  const free = useMemo(() => ccRows.filter((o) => !o.trip_id && o.status !== 'Anulată'), [ccRows])
  const cts = useMemo(() => (rid ? ctRows.filter((o) => o.trip_id === rid || links.some((l) => l.transport_order_id === o.id && orders.some((x) => x.id === l.client_order_id))) : []), [ctRows, links, orders, rid])

  const basis = f.allocation_basis || companyBasis
  const rev = tripRevenue(orders, reportCur)
  const shares = allocationShares(orders, basis, reportCur)
  const dist = distributionCosts(cts.filter((c) => c.purpose !== 'subcontracted_trip'), links, Object.fromEntries(orders.map((o) => [o.id, o])), basis, reportCur)
  const subCts = cts.filter((c) => c.purpose === 'subcontracted_trip' && c.status !== 'Anulată')
  const model = { ...f, start_at: fromLocalInput(f.start_at), end_at: fromLocalInput(f.end_at) }
  const warns = checkOwnTrip(model, orders)
  const days = tripDays(model.start_at, model.end_at)
  const km = tripKm({ km_start: parseNum(f.km_start), km_end: parseNum(f.km_end), km: parseNum(f.km) })

  // la alegerea camionului: remorca obișnuită și șoferul obișnuit (doar dacă nu sunt deja alese)
  const pickTruck = (id) => setF((s) => {
    const t = truckById[id]
    const drv = fleet.drivers.find((d) => d.default_truck_id === id && d.status !== 'Inactiv')
    return { ...s, truck_id: id, trailer_id: s.trailer_id || t?.default_trailer_id || '', driver_id: s.driver_id || drv?.id || '' }
  })
  const save = async (exit = true) => {
    const hard = warns.filter((w) => ['dates', 'sameDriver', 'km'].includes(w))
    if (hard.length) return setErr({ dates: tx('Întoarcerea e înaintea plecării.', 'Return is before departure.'), sameDriver: tx('Șoferul 2 e același cu șoferul 1.', 'Driver 2 is the same as driver 1.'), km: tx('Km la sosire e mai mic decât la plecare.', 'Arrival km is lower than departure km.') }[hard[0]])
    setBusy(true); setErr('')
    try {
      const row = {
        ...(initial || {}), ...f, ...model,
        truck_id: own ? f.truck_id || null : null, trailer_id: own ? f.trailer_id || null : null, driver_id: own ? f.driver_id || null : null, driver2_id: own ? f.driver2_id || null : null,
        km: f.km === '' ? (km || null) : parseNum(f.km), km_start: f.km_start === '' ? null : parseNum(f.km_start), km_end: f.km_end === '' ? null : parseNum(f.km_end),
        km_empty: f.km_empty === '' || f.km_empty == null ? null : parseNum(f.km_empty), no_return_ok: !!f.no_return_ok,
        allocation_basis: f.allocation_basis || null, load_date: model.start_at ? toLocalInput(model.start_at).slice(0, 10) : (initial?.load_date || null),
        unload_date: model.end_at ? toLocalInput(model.end_at).slice(0, 10) : (initial?.unload_date || null),
      }
      const saved = await TRIPS_API.save(rid, row)
      if (cancelReason && saved?.id) await ACTIVITY_API.event('trips', saved.id, saved.code, 'cancel_reason', { reason: cancelReason }).catch(() => {})
      setCancelReason('')
      setRid(saved.id); setCode(saved.code)
      setBusy(false)
      if (exit) onSaved(saved)
      else { onSaved(saved, true); ping() }
    } catch (e) { setErr(e.message); setBusy(false) }
  }
  const attach = async (id, tripId) => {
    const o = ccRows.find((x) => x.id === id)
    if (!o) return
    setErr('')
    try { await CLIENT_ORDERS_API.save(o.id, { ...o, trip_id: tripId }); setAddId(''); onChanged() } catch (e) { setErr(e.message) }
  }
  const doFx = async () => {
    setNote('…')
    const n1 = await fillFx(orders.filter((o) => rev.missingFx.includes(o.id)), CLIENT_ORDERS_API)
    const n2 = await fillFx(cts.filter((c) => dist.missingFx.includes(c.id)), ORDERS_API)
    setNote(n1 + n2 ? `✓ ${tx('Curs completat pe', 'Rate filled on')} ${n1 + n2}` : tx('Cursul BNR nu e disponibil acum (pornește și serverul local /api). Îl poți trece de mână în comandă.', 'The BNR rate is not available now (start the local /api server too). You can type it in the order.'))
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{rid ? `${tx('Cursa', 'Trip')} ${code}` : tx('Cursă nouă', 'New trip')}</h2>
        <p className="mt-0.5 text-[12.5px] text-slate-500">{tx('Circuit', 'Circuit')}: {getCompany().base_name || tx('baza', 'base')} → {tx('încărcări / descărcări', 'loads / unloads')} → {getCompany().base_name || tx('baza', 'base')}</p>
        {reasonNode}

        <div className="mt-4 flex flex-wrap gap-2">
          {[['own', tx('Cu camion propriu', 'Own truck')], ['subcontracted', tx('Subcontractată (alt transportator)', 'Subcontracted (other carrier)')]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setF((s) => ({ ...s, kind: k }))} className={`rounded-lg border px-3 py-1.5 text-[13px] ${f.kind === k ? 'border-brand-500 bg-brand-500/10 font-medium text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{l}</button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {own ? (
            <>
              <label className={`${lbl} sm:col-span-2`}>{tx('Camion', 'Truck')} *<select className={input} value={f.truck_id || ''} onChange={(e) => pickTruck(e.target.value)}><option value="">—</option>{activeOr(fleet.trucks, f.truck_id).map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}</select></label>
              <label className={`${lbl} sm:col-span-2`}>{tx('Remorcă', 'Trailer')}<select className={input} value={f.trailer_id || ''} onChange={set('trailer_id')}><option value="">—</option>{activeOr(fleet.trailers, f.trailer_id).map((t) => <option key={t.id} value={t.id}>{t.plate} · {t.trailer_type}</option>)}</select></label>
              <label className={`${lbl} sm:col-span-2`}>{tx('Șofer', 'Driver')} *<select className={input} value={f.driver_id || ''} onChange={set('driver_id')}><option value="">—</option>{activeOr(fleet.drivers, f.driver_id).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
              <label className={`${lbl} sm:col-span-2`}>{tx('Șofer 2 (opțional)', 'Driver 2 (optional)')}<select className={input} value={f.driver2_id || ''} onChange={set('driver2_id')}><option value="">—</option>{activeOr(fleet.drivers, f.driver2_id).filter((d) => d.id !== f.driver_id).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
              {fleet.trucks.length === 0 && <p className="text-[12px] text-amber-700 sm:col-span-4">{tx('Nu ai încă camioane și șoferi. Adaugă-i în', 'No trucks and drivers yet. Add them under')} <Link to="/flota" className="underline">{tx('Flotă', 'Fleet')}</Link>.</p>}
            </>
          ) : (
            <div className="rounded-lg bg-slate-50 p-3 text-[12.5px] text-slate-600 sm:col-span-4">
              {subCts.length
                ? <>{tx('Transportator și cost din', 'Carrier and cost from')} {subCts.map((c) => <Link key={c.id} to="/comenzi" className="ml-1 font-medium text-brand-600 hover:underline">{c.code} · {kName[c.carrier_id] || '—'} · {fmtMoney(c.price)} {c.currency}</Link>)}</>
                : <>{tx('Transportatorul și costul vin din comanda de transport (CT).', 'The carrier and the cost come from the transport order (CT).')} {rid ? <Link to={`/comenzi?trip=${rid}&purpose=subcontracted_trip`} className="font-medium text-brand-600 underline">{tx('Creează CT pentru cursă →', 'Create the trip CT →')}</Link> : tx('Salvează cursa, apoi creează CT-ul.', 'Save the trip, then create the CT.')}</>}
            </div>
          )}
          <label className={`${lbl} sm:col-span-2`}>{tx('Plecare din bază', 'Departure from base')} *<input type="datetime-local" className={input} value={f.start_at} onChange={set('start_at')} /></label>
          <label className={`${lbl} sm:col-span-2`}>{tx('Întoarcere în bază', 'Return to base')}<input type="datetime-local" className={input} value={f.end_at} onChange={set('end_at')} /></label>
          {own && <label className={lbl}>{tx('Km la plecare', 'Km at departure')}<input inputMode="numeric" className={input} value={f.km_start} onChange={set('km_start')} /></label>}
          {own && <label className={lbl}>{tx('Km la întoarcere', 'Km at return')}<input inputMode="numeric" className={input} value={f.km_end} onChange={set('km_end')} /></label>}
          <label className={lbl}>{tx('Km total (dacă nu ai kilometraj)', 'Total km (without odometer)')}<input inputMode="numeric" className={input} value={f.km} onChange={set('km')} placeholder={km ? String(km) : ''} /></label>
          {own && <label className={lbl} title={tx('Km parcurși fără marfă (ex. până la prima încărcare, între descărcare și retur)', 'Km driven without goods (e.g. to the first loading, between unload and return)')}>{tx('Km goi (fără marfă)', 'Empty km (no goods)')}<input inputMode="numeric" className={input} value={f.km_empty ?? ''} onChange={set('km_empty')} /></label>}
          <div className="text-[12px] text-slate-600">{tx('Durată / km', 'Duration / km')}<div className="mt-1 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-[14px] text-slate-700">{days ? `${days} ${tx(days === 1 ? 'zi' : 'zile', days === 1 ? 'day' : 'days')}` : '—'} · {km ? `${km} km` : '—'}</div></div>
          <label className={lbl}>{tx('Status', 'Status')}
            <select className={input} value={f.status} onChange={async (e) => {
              const v = e.target.value
              if (v === 'Anulată' && rid && initial?.status !== 'Anulată') {
                const r = await askReason({ title: `${tx('Anulezi cursa', 'Cancel trip')} ${code}`, text: tx('Cursa rămâne cu statusul Anulată. Comenzile din ea rămân legate; le poți muta pe altă cursă.', 'The trip stays with status Cancelled. Its orders stay linked; you can move them to another trip.'), confirmLabel: tx('Anulează cursa', 'Cancel trip') })
                if (!r) return
                setCancelReason(r)
              } else setCancelReason('')
              setF((s) => ({ ...s, status: v }))
            }}>{OWN_STATUSES.map((s) => <option key={s} value={s}>{tripStatusLabel(s, lang)}</option>)}</select>
          </label>
          <label className={`${lbl} sm:col-span-3`}>{tx('Repartizarea costului cursei pe mărfuri', 'Splitting the trip cost across goods')}
            <select className={input} value={f.allocation_basis || ''} onChange={set('allocation_basis')}>
              <option value="">{tx('Ca în Setări firmă', 'As in Company settings')} ({basisLabel(companyBasis, lang)})</option>
              {ALLOCATION_BASES.map((b) => <option key={b} value={b}>{basisLabel(b, lang)}</option>)}
            </select>
          </label>
          <div className={`${lbl} sm:col-span-4`}>{tx('Țări parcurse', 'Countries')}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {f.countries.map((c) => <span key={c} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-[12.5px] text-navy-800" title={countryName(c, lang)}>{c}<button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => setF((s) => ({ ...s, countries: s.countries.filter((x) => x !== c) }))}>✕</button></span>)}
              <select className={sel} value={addCountry} onChange={(e) => { const v = e.target.value; if (v) setF((s) => ({ ...s, countries: s.countries.includes(v) ? s.countries : [...s.countries, v] })); setAddCountry('') }}>
                <option value="">＋ {tx('țară', 'country')}</option>{countryOptions(lang).map((o) => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
              </select>
            </div>
          </div>
          {own && <label className="flex items-center gap-2 text-[13px] text-slate-700 sm:col-span-4"><input type="checkbox" checked={!!f.no_return_ok} onChange={(e) => setF((s) => ({ ...s, no_return_ok: e.target.checked }))} />{tx('Camionul se întoarce gol intenționat (nu mai apare la „fără retur" pe Tabla flotei)', 'The truck returns empty on purpose (no longer flagged “no return” on the Fleet board)')}</label>}
          <label className={`${lbl} sm:col-span-4`}>{tx('Observații', 'Notes')}<textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>
        </div>

        {/* Comenzile (mărfurile) din cursă */}
        <div className="mt-5 rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="mono-label text-[10px] text-slate-500">{tx('COMENZI ÎN CURSĂ (GRUPAJ)', 'ORDERS ON THIS TRIP (GROUPAGE)')} · {rev.count}</div>
            {rid
              ? <div className="flex flex-wrap items-center gap-2">
                  <select className={`${sel} !py-1 text-[13px]`} value={addId} onChange={(e) => { setAddId(e.target.value); if (e.target.value) attach(e.target.value, rid) }}>
                    <option value="">＋ {tx('Adaugă comandă fără cursă', 'Add an order without trip')} ({free.length})</option>
                    {free.map((o) => <option key={o.id} value={o.id}>{o.code} · {cName[o.client_id] || '—'} · {orderRoute(o) || '—'}</option>)}
                  </select>
                  <Link to={`/comanda-client?trip=${rid}`} className="rounded-lg border border-brand-500 px-3 py-1 text-[13px] text-brand-600 hover:bg-brand-500/10">＋ {tx('Comandă nouă', 'New order')}</Link>
                </div>
              : <span className="text-[12px] text-slate-500">{tx('Salvează cursa, apoi adaugă comenzile.', 'Save the trip, then add the orders.')}</span>}
          </div>
          {orders.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[10.5px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">{tx('Comandă', 'Order')}</th><th className="px-3 py-2">{tx('Client / traseu', 'Customer / route')}</th><th className="px-3 py-2">{tx('Marfă', 'Goods')}</th><th className="px-3 py-2 text-right">{tx('Preț', 'Price')}</th><th className="px-3 py-2 text-right">{reportCur}</th><th className="px-3 py-2 text-right" title={tx('Partea din costul cursei', 'Share of the trip cost')}>{tx('Pondere', 'Share')}</th><th className="px-3 py-2 text-right">{tx('Distribuție', 'Distribution')}</th><th className="px-3 py-2 text-right" title={tx('Venit − costul cursei repartizat − distribuția', 'Revenue − allocated trip cost − distribution')}>{tx('Profit', 'Profit')}</th><th /></tr></thead>
                <tbody>
                  {orders.map((o) => {
                    const v = orderValue(o, reportCur)
                    const sh = shares.shares[o.id]
                    return (
                      <tr key={o.id} className={`border-t border-slate-100 ${o.status === 'Anulată' ? 'opacity-50' : ''}`}>
                        <td className="whitespace-nowrap px-3 py-2"><Link to={`/comanda-client?open=${o.id}`} className="font-medium text-sky-700 hover:underline">{o.code}</Link>{o.status === 'Anulată' && <div className="text-[11px] text-rose-600">{tx('Anulată', 'Cancelled')}</div>}</td>
                        <td className="px-3 py-2">{cName[o.client_id] || '—'}<div className="text-[11.5px] text-slate-500">{orderRoute(o) || '—'}</div></td>
                        <td className="px-3 py-2 text-[12px] text-slate-600">{measureText(o, lang) || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{o.price ? `${fmtMoney(o.price)} ${o.currency}` : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{o.status === 'Anulată' ? '—' : v.ok ? fmtMoney(v.value) : <span className="text-amber-700" title={tx('Lipsește cursul RON/EUR', 'RON/EUR rate missing')}>⚠ {tx('fără curs', 'no rate')}</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{sh != null ? `${(sh * 100).toFixed(1)}%` : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{dist.byOrder[o.id] ? fmtMoney(dist.byOrder[o.id]) : '—'}</td>
                        <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${(pnl?.byOrder[o.id]?.profit ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{pnl?.byOrder[o.id] ? fmtMoney(pnl.byOrder[o.id].profit) : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right"><button type="button" title={tx('Scoate din cursă (comanda rămâne)', 'Remove from trip (order stays)')} onClick={() => attach(o.id, null)} className="rounded px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">⤺</button></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-navy-800">
                  <tr><td colSpan={4} className="px-3 py-2 text-right">{tx('Venit cursă', 'Trip revenue')}</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtMoney(rev.total)} {reportCur}</td><td /><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtMoney(Object.values(dist.byOrder).reduce((s, x) => s + x, 0))}</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{pnl ? fmtMoney(pnl.contribution) : ''}</td><td /></tr>
                </tfoot>
              </table>
            </div>
          )}
          <div className="space-y-1 px-3 py-2 text-[12px] text-slate-500">
            {rev.count > 0 && <p>{tx('Repartizare', 'Split')}: <b className="text-navy-800">{shares.basis === 'equal' ? tx('în părți egale', 'equal parts') : basisLabel(shares.basis, lang)}</b>{shares.fallback && <span className="text-amber-700"> · ⚠ {tx(`nu toate comenzile au ${basisLabel(shares.requested, 'ro')}; s-a folosit criteriul următor`, `not all orders have ${basisLabel(shares.requested, 'en')}; the next basis was used`)}</span>}</p>}
            {(rev.missingFx.length > 0 || dist.missingFx.length > 0) && <p className="text-amber-700">⚠ {rev.missingFx.length + dist.missingFx.length} {tx('comenzi fără curs RON/EUR nu intră în total.', 'orders without RON/EUR rate are left out of the total.')} <button type="button" onClick={doFx} className="font-medium text-brand-600 underline">{tx('Completează cursul BNR', 'Fill in the BNR rate')}</button></p>}
            {note && <p>{note}</p>}
          </div>
        </div>

        {/* CT-uri: distribuție subcontractată a mărfurilor */}
        {rid && own && (
          <div className="mt-3 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div className="mono-label text-[10px] text-slate-500">{tx('DISTRIBUȚIE SUBCONTRACTATĂ (CT)', 'SUBCONTRACTED DISTRIBUTION (CT)')} · {cts.length}</div>
              {orders.length > 0 && <Link to={`/comenzi?trip=${rid}`} className="rounded-lg border border-brand-500 px-3 py-1 text-[13px] text-brand-600 hover:bg-brand-500/10">＋ {tx('CT pentru mărfuri din cursă', 'CT for goods on this trip')}</Link>}
            </div>
            {cts.length === 0 ? <p className="px-3 py-2 text-[12px] text-slate-500">{tx('Nicio livrare dată altui transportator.', 'No delivery given to another carrier.')}</p> : (
              <ul className="divide-y divide-slate-100 text-[13px]">
                {cts.map((c) => (
                  <li key={c.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${c.status === 'Anulată' ? 'opacity-50' : ''}`}>
                    <span><Link to="/comenzi" className="font-medium text-emerald-700 hover:underline">{c.code}</Link> · {kName[c.carrier_id] || '—'} <span className="text-slate-500">· {orderStatusLabel(c.status, lang)} · {links.filter((l) => l.transport_order_id === c.id).map((l) => ccRows.find((x) => x.id === l.client_order_id)?.code).filter(Boolean).join(', ') || '—'}</span></span>
                    <span className="tabular-nums">{c.price ? `${fmtMoney(c.price)} ${c.currency}` : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {rid && pnl && <TripCosts pnl={pnl} own={own} reportCur={reportCur} onAdd={() => setCostModal({ truck_id: f.truck_id || null, driver_id: f.driver_id || null, alloc_mode: 'trip', trip_id: rid, occurred_at: model.end_at || new Date().toISOString(), category: 'toll' })} />}
        {costModal && <CostModal initial={costModal} ctx={{ trips, trucks: fleet.trucks, drivers: fleet.drivers, truckById }} onClose={() => setCostModal(null)} onSaved={(_r, stay) => { onChanged(); if (!stay) setCostModal(null) }} />}

        {warns.filter((w) => !['dates', 'sameDriver', 'km'].includes(w)).map((w) => <p key={w} className="mt-1 text-[12.5px] text-amber-700">⚠ {{
          truck: tx('Alege camionul.', 'Pick the truck.'), driver: tx('Alege șoferul.', 'Pick the driver.'), start: tx('Completează plecarea din bază.', 'Fill in the departure from base.'),
          noOrders: tx('Cursa nu are nicio comandă activă.', 'The trip has no active order.'),
        }[w]}</p>)}
        {err && <p className="mt-2 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{tx('Anulează', 'Cancel')}</button>
          <SaveButtons busy={busy} onSave={save} flash={flash} />
        </div>
      </div>
    </div>
  )
}

// Costuri și profit pe cursă (din fleetCosts.tripPnL; se actualizează după salvare)
function TripCosts({ pnl, own, reportCur, onAdd }) {
  const tx = useTx()
  const { lang } = useLang()
  const lines = TRIP_LINES.filter((k) => pnl.lines[k])
  const W = {
    fx: tx('Unele sume nu au curs RON/EUR și nu intră în total.', 'Some amounts have no RON/EUR rate and are left out.'),
    perDiemRate: tx('Un șofer nu are tarif de diurnă (Flotă → Șoferi).', 'A driver has no per diem rate (Fleet → Drivers).'),
    perDiemFx: tx('Diurna în RON nu are curs; trece cursul pe o comandă.', 'Per diem in RON has no rate; set a rate on an order.'),
    running: tx('Cursa nu are întoarcere: costurile și diurna sunt până azi.', 'The trip has no return yet: costs and per diem are up to today.'),
    consumption: tx('Consumul e cu peste 10% mai mare decât cel de referință.', 'Consumption is more than 10% above reference.'),
  }
  return (
    <div className="mt-3 rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="mono-label text-[10px] text-slate-500">{tx('COSTURI ȘI PROFIT', 'COSTS AND PROFIT')} · {reportCur}</div>
        <div className="flex flex-wrap gap-2">
          <Link to="/costuri-flota" className="rounded-lg px-3 py-1 text-[13px] text-slate-600 hover:bg-slate-100">{tx('Toate costurile →', 'All costs →')}</Link>
          <button type="button" onClick={onAdd} className="rounded-lg border border-brand-500 px-3 py-1 text-[13px] text-brand-600 hover:bg-brand-500/10">＋ {tx('Cost pe cursă', 'Trip cost')}</button>
        </div>
      </div>
      <div className="grid gap-4 p-3 sm:grid-cols-[1fr_auto]">
        <table className="w-full text-[13px]">
          <tbody>
            <tr><td className="py-1 text-slate-600">{tx('Venit', 'Revenue')}</td><td className="py-1 text-right font-medium tabular-nums">{fmtMoney(pnl.revenue)}</td></tr>
            {lines.map((k) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="py-1 text-slate-600">− {categoryLabel(k, lang)}{k === 'per_diem' && pnl.perDiem?.byDriver.length > 0 && <span className="text-[11.5px] text-slate-400"> ({pnl.perDiem.byDriver.map((d) => `${d.days} × ${fmtMoney(d.rate)} ${d.currency}`).join(' + ')}{pnl.perDiem.estimated ? `, ${tx('până azi', 'up to today')}` : ''})</span>}</td>
                <td className="py-1 text-right tabular-nums">{fmtMoney(pnl.lines[k])}</td>
              </tr>
            ))}
            {lines.length === 0 && <tr className="border-t border-slate-100"><td colSpan={2} className="py-1 text-slate-500">{tx('Niciun cost legat de cursă încă.', 'No cost linked to the trip yet.')}</td></tr>}
            <tr className="border-t border-slate-200 font-semibold"><td className="py-1.5">{tx('Profit cursă (contribuție)', 'Trip profit (contribution)')}</td><td className={`py-1.5 text-right tabular-nums ${pnl.contribution < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{fmtMoney(pnl.contribution)}{pnl.marginPct != null ? ` · ${pnl.marginPct}%` : ''}</td></tr>
          </tbody>
        </table>
        {own && (
          <div className="grid min-w-[200px] grid-cols-2 gap-2 text-[12px] sm:grid-cols-1">
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">{tx('Cost / km', 'Cost / km')}</div><div className="text-[14px] font-medium tabular-nums">{pnl.costPerKm != null ? `${fmtMoney(pnl.costPerKm)} ${reportCur}` : '—'}</div></div>
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">{tx('Venit / km', 'Revenue / km')}</div><div className="text-[14px] font-medium tabular-nums">{pnl.revenuePerKm != null ? `${fmtMoney(pnl.revenuePerKm)} ${reportCur}` : '—'}</div></div>
            <div className="col-span-2 rounded-lg bg-slate-50 p-2 sm:col-span-1"><div className="text-slate-500">{tx('Consum real / referință', 'Actual / reference consumption')}</div><div className={`text-[14px] font-medium tabular-nums ${pnl.warnings.includes('consumption') ? 'text-amber-700' : ''}`}>{pnl.consumption != null ? `${fmtMoney(pnl.consumption)} l/100` : '—'} / {pnl.refConsumption ? `${fmtMoney(pnl.refConsumption)}` : '—'}</div><div className="text-slate-400">{fmtMoney(pnl.liters)} l · {pnl.km || 0} km</div></div>
          </div>
        )}
      </div>
      {pnl.warnings.length > 0 && <div className="space-y-0.5 border-t border-slate-100 px-3 py-2 text-[12px] text-amber-700">{pnl.warnings.map((w) => <p key={w}>⚠ {W[w]}</p>)}</div>}
      <p className="border-t border-slate-100 px-3 py-2 text-[11.5px] text-slate-500">{tx('Costurile cu camion se leagă singure de cursă dacă data e între plecare și întoarcere. Salariile și costurile fixe sunt lunare (pagina Profit). Cifrele se actualizează după salvare.', 'Truck costs link to the trip by themselves if the date is between departure and return. Salaries and fixed costs are monthly (Profit page). Figures update after saving.')}</p>
    </div>
  )
}

const SORTS = {
  code: (a, b) => a.t.code.localeCompare(b.t.code, 'en', { numeric: true }),
  start: (a, b) => String(a.t.start_at || a.t.load_date || '').localeCompare(String(b.t.start_at || b.t.load_date || '')),
  truck: (a, b) => a.truck.localeCompare(b.truck),
  driver: (a, b) => foldText(a.driver).localeCompare(foldText(b.driver)),
  orders: (a, b) => a.orders.length - b.orders.length,
  revenue: (a, b) => a.rev.total - b.rev.total,
  profit: (a, b) => (a.pnl?.contribution || 0) - (b.pnl?.contribution || 0),
}

export default function Curse() {
  const tx = useTx()
  const { lang } = useLang()
  const reportCur = getCompany().report_currency || 'EUR'
  const [rows, setRows] = useState(null)
  const [clients, setClients] = useState([])
  const [carriers, setCarriers] = useState([])
  const [fleet, setFleet] = useState({ trucks: [], trailers: [], drivers: [] })
  const [ccRows, setCcRows] = useState([])
  const [ctRows, setCtRows] = useState([])
  const [links, setLinks] = useState([])
  const [extra, setExtra] = useState({ costs: [], moves: [], rates: [] })
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null)
  const [askReasonMain, reasonNodeMain] = useReason()
  const [q, setQ] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fMonth, setFMonth] = useState('')
  const [fTruck, setFTruck] = useState('')
  const [fDriver, setFDriver] = useState('')
  const [fWarn, setFWarn] = useState(false)
  const [sort, setSort] = useState({ key: 'code', dir: -1 })

  const load = () => Promise.all([
    TRIPS_API.list(), CLIENTS.api.list().catch(() => []), CARRIERS.api.list().catch(() => []),
    TRUCKS_API.list().catch(() => []), TRAILERS_API.list().catch(() => []), DRIVERS_API.list().catch(() => []),
    CLIENT_ORDERS_API.list().catch(() => []), ORDERS_API.list().catch(() => []), CT_GOODS_API.list().catch(() => []),
    COSTS_API.list().catch(() => []), FUEL_API.list().catch(() => []), PER_DIEM_API.list().catch(() => []),
  ]).then(([r, c, k, tk, tr, dr, cc, ct, ln, co, mv, rt]) => {
    setRows(r); setClients(c); setCarriers(k); setFleet({ trucks: tk, trailers: tr, drivers: dr }); setCcRows(cc); setCtRows(ct); setLinks(ln); setExtra({ costs: co, moves: mv, rates: rt })
  }).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])
  // link direct (ex. din Tabla flotei): /curse?open=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open')
    if (!id || !rows) return
    const t = rows.find((x) => x.id === id)
    if (t) setModal(t)
    window.history.replaceState(null, '', window.location.pathname)
  }, [rows])

  const truckById = useMemo(() => Object.fromEntries(fleet.trucks.map((x) => [x.id, x])), [fleet.trucks])
  const trailerById = useMemo(() => Object.fromEntries(fleet.trailers.map((x) => [x.id, x])), [fleet.trailers])
  const driverById = useMemo(() => Object.fromEntries(fleet.drivers.map((x) => [x.id, x])), [fleet.drivers])
  const cName = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.company])), [clients])
  const ordersByTrip = useMemo(() => { const m = {}; for (const o of ccRows) if (o.trip_id) (m[o.trip_id] ||= []).push(o); return m }, [ccRows])
  const freeOrders = ccRows.filter((o) => !o.trip_id && o.status !== 'Anulată').length
  const calc = useMemo(() => computeFleet({ trips: rows || [], orders: ccRows, cts: ctRows, links, trucks: fleet.trucks, ...extra }, reportCur), [rows, ccRows, ctRows, links, fleet.trucks, extra, reportCur])

  const enriched = useMemo(() => (rows || []).map((t) => {
    const orders = ordersByTrip[t.id] || []
    const rev = tripRevenue(orders, reportCur)
    const truck = truckById[t.truck_id]?.plate || ''
    const driver = [driverById[t.driver_id]?.full_name, driverById[t.driver2_id]?.full_name].filter(Boolean).join(' + ')
    const clientsTxt = [...new Set(orders.filter((o) => o.status !== 'Anulată').map((o) => cName[o.client_id]).filter(Boolean))]
    const warns = checkOwnTrip(t, orders)
    if (rev.missingFx.length) warns.push('fx')
    if (tripPlan(t, orders, getCompany().country || 'RO').needsReturn) warns.push('noReturn')
    const hay = foldText([t.code, truck, trailerById[t.trailer_id]?.plate, driver, ...clientsTxt, ...orders.map((o) => `${o.code} ${orderRoute(o)}`), (t.countries || []).join(' '), t.notes, tripStatusLabel(t.status, lang)].join(' | '))
    const pnl = calc.pnlById[t.id]
    return { t, orders, rev, pnl, truck, driver, clientsTxt, warns, hay }
  }), [rows, ordersByTrip, truckById, trailerById, driverById, cName, reportCur, lang, calc])

  const months = [...new Set(enriched.map((e) => monthOf(e.t)).filter(Boolean))].sort().reverse()
  const terms = foldText(q).split(/\s+/).filter(Boolean)
  const filtered = enriched
    .filter((e) => terms.every((w) => e.hay.includes(w)))
    .filter((e) => (!fStatus || e.t.status === fStatus) && (!fMonth || monthOf(e.t) === fMonth) && (!fTruck || e.t.truck_id === fTruck) && (!fDriver || e.t.driver_id === fDriver || e.t.driver2_id === fDriver))
    .filter((e) => !fWarn || (e.warns.length && e.t.status !== 'Anulată'))
    .sort((a, b) => SORTS[sort.key](a, b) * sort.dir)

  const live = (list) => list.filter((e) => e.t.status !== 'Anulată')
  const month = todayISO().slice(0, 7)
  const thisMonth = live(enriched.filter((e) => monthOf(e.t) === month))
  const running = enriched.filter((e) => e.t.status === 'În curs').length
  const warnCount = enriched.filter((e) => e.warns.length && e.t.status !== 'Anulată').length
  const hasFilters = q || fStatus || fMonth || fTruck || fDriver || fWarn
  const clear = () => { setQ(''); setFStatus(''); setFMonth(''); setFTruck(''); setFDriver(''); setFWarn(false) }
  const th = (key, label, cls = '') => (
    <th className={`cursor-pointer select-none px-3 py-2.5 hover:text-navy-800 ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>{label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
  )
  const setTripStatus = async (tr, v) => {
    if (v === tr.status) return
    let reason = null
    if (v === 'Anulată') {
      reason = await askReasonMain({ title: `${tx('Anulezi cursa', 'Cancel trip')} ${tr.code}`, text: tx('Cursa rămâne cu statusul Anulată. Comenzile din ea rămân legate; le poți muta pe altă cursă.', 'The trip stays with status Cancelled. Its orders stay linked; you can move them to another trip.'), confirmLabel: tx('Anulează cursa', 'Cancel trip') })
      if (!reason) return
    }
    setRows((rs) => rs.map((x) => (x.id === tr.id ? { ...x, status: v } : x)))
    try {
      await TRIPS_API.save(tr.id, { ...tr, status: v })
      if (reason) await ACTIVITY_API.event('trips', tr.id, tr.code, 'cancel_reason', { reason }).catch(() => {})
    } catch (e) { setErr(e.message) }
    load()
  }
  const remove = async (tr) => {
    const n = (ordersByTrip[tr.id] || []).length
    const reason = await askReasonMain({ title: `${tx('Ștergi definitiv cursa', 'Delete trip permanently')} ${tr.code}`, text: `${tx('Ștergerea este definitivă; codul nu se refolosește.', 'Deletion is permanent; the code is not reused.')}${n ? ` ${n} ${tx('comenzi rămân fără cursă.', 'orders will be left without a trip.')}` : ''}`, confirmLabel: tx('Șterge definitiv', 'Delete permanently') })
    if (!reason) return
    await ACTIVITY_API.event('trips', tr.id, tr.code, 'delete_reason', { reason }).catch(() => {})
    await TRIPS_API.remove(tr.id).catch((e) => setErr(e.message))
    load()
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {tx('CURSE', 'TRIPS')}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{tx('Curse', 'Trips')}</h1>
        <button onClick={() => setModal({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {tx('Cursă nouă', 'New trip')}</button>
      </div>
      {reasonNodeMain}
      {err && <p className="mt-3 text-rose-600">{err}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[[tx('CURSE ÎN LUNA ASTA', 'TRIPS THIS MONTH'), thisMonth.length, ''], [tx('VENIT (LUNA ASTA)', 'REVENUE (THIS MONTH)'), fmtMoney(thisMonth.reduce((s, e) => s + e.rev.total, 0)), reportCur], [tx('PROFIT CURSE (LUNA ASTA)', 'TRIP PROFIT (THIS MONTH)'), fmtMoney(thisMonth.reduce((s, e) => s + (e.pnl?.contribution || 0), 0)), reportCur], [tx('ÎN DESFĂȘURARE', 'IN PROGRESS'), running, '']].map(([l, v, u]) => (
          <div key={l} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mono-label text-[10px] text-slate-500">{l}</div>
            <div className="mt-1 text-[24px] font-semibold text-navy-800">{v} <span className="text-[13px] font-normal text-slate-500">{u}</span></div>
          </div>
        ))}
        <Link to="/comanda-client?free=1" className={`rounded-xl border p-4 text-left shadow-sm ${freeOrders ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
          <div className="mono-label text-[10px] text-slate-500">{tx('COMENZI FĂRĂ CURSĂ', 'ORDERS WITHOUT TRIP')}</div>
          <div className={`mt-1 text-[24px] font-semibold ${freeOrders ? 'text-amber-600' : 'text-navy-800'}`}>{freeOrders}</div>
          <div className="text-[11px] text-slate-500">{tx('mărfuri de pus într-o cursă', 'goods to put on a trip')}</div>
        </Link>
        <button onClick={() => setFWarn((v) => !v)} className={`rounded-xl border p-4 text-left shadow-sm ${fWarn ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="mono-label text-[10px] text-slate-500">{tx('DE VERIFICAT', 'TO CHECK')}</div>
          <div className={`mt-1 text-[24px] font-semibold ${warnCount ? 'text-amber-600' : 'text-navy-800'}`}>{warnCount}</div>
        </button>
      </div>
      <p className="mt-1 text-[11.5px] text-slate-500">{tx('Luna curentă, după plecarea din bază:', 'Current month, by departure from base:')} {month} · {tx('moneda de raportare', 'reporting currency')} {reportCur}</p>

      <div className="mt-4"><input className={`${input} !py-2.5`} placeholder={tx('Caută în orice: cod, camion, șofer, client, comandă, oraș, țară…', 'Search anything: code, truck, driver, customer, order, city, country…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select className={sel} value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">{tx('Toate statusurile', 'All statuses')}</option>{OWN_STATUSES.map((s) => <option key={s} value={s}>{tripStatusLabel(s, lang)}</option>)}</select>
        <select className={sel} value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">{tx('Toate lunile', 'All months')}</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
        <select className={sel} value={fTruck} onChange={(e) => setFTruck(e.target.value)}><option value="">{tx('Toate camioanele', 'All trucks')}</option>{fleet.trucks.map((t) => <option key={t.id} value={t.id}>{t.plate}</option>)}</select>
        <select className={sel} value={fDriver} onChange={(e) => setFDriver(e.target.value)}><option value="">{tx('Toți șoferii', 'All drivers')}</option>{fleet.drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select>
        {hasFilters && <button onClick={clear} className="rounded-lg px-3 py-2 text-[13px] text-brand-600 hover:bg-brand-500/10">{tx('Șterge filtrele', 'Clear filters')}</button>}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows === null ? <p className="p-5 text-slate-500">…</p> : filtered.length === 0 ? <p className="p-5 text-slate-500">{tx('Nicio cursă.', 'No trips.')}</p> : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>{th('code', tx('Cod', 'Code'))}{th('start', tx('Plecare → întoarcere', 'Departure → return'))}{th('truck', tx('Camion', 'Truck'), 'hidden md:table-cell')}{th('driver', tx('Șofer', 'Driver'), 'hidden sm:table-cell')}{th('orders', tx('Comenzi', 'Orders'))}{th('revenue', `${tx('Venit', 'Revenue')} (${reportCur})`, 'text-right')}{th('profit', tx('Profit', 'Profit'), 'text-right')}<th className="px-3 py-2.5">{tx('Status', 'Status')}</th><th className="px-3 py-2.5" /></tr>
            </thead>
            <tbody>
              {filtered.map(({ t, orders, rev, pnl, truck, driver, clientsTxt, warns }) => (
                <tr key={t.id} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${t.status === 'Anulată' ? 'opacity-50' : ''}`} onClick={() => setModal(t)}>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-navy-700">{t.code}{t.kind === 'subcontracted' && <div className="mono-label text-[9px] font-normal text-violet-700">{tx('SUBCONTRACTATĂ', 'SUBCONTRACTED')}</div>}</td>
                  <td className="whitespace-nowrap px-3 py-3">{t.start_at ? fmtDT(t.start_at) : fmtDate(t.load_date)}<div className="text-[11.5px] text-slate-500">{t.end_at ? `→ ${fmtDT(t.end_at)}` : '→ …'}{tripDays(t.start_at, t.end_at) ? ` · ${tripDays(t.start_at, t.end_at)} ${tx('zile', 'days')}` : ''}</div></td>
                  <td className="hidden whitespace-nowrap px-3 py-3 md:table-cell">{truck || '—'}<div className="text-[11.5px] text-slate-500">{trailerById[t.trailer_id]?.plate || ''}</div></td>
                  <td className="hidden px-3 py-3 sm:table-cell">{driver || '—'}</td>
                  <td className="px-3 py-3">
                    <span className="font-medium">{rev.count}</span> <span className="text-slate-600">{clientsTxt.slice(0, 3).join(', ')}{clientsTxt.length > 3 ? ` +${clientsTxt.length - 3}` : ''}</span>
                    {(t.countries || []).length > 0 && <div className="text-[11.5px] text-slate-500">{t.countries.join(' · ')}</div>}
                    {warns.length > 0 && t.status !== 'Anulată' && <div className="text-[11.5px] text-amber-600">⚠ {{ truck: tx('fără camion', 'no truck'), driver: tx('fără șofer', 'no driver'), start: tx('fără dată de plecare', 'no departure'), noOrders: tx('fără comenzi', 'no orders'), fx: tx('comenzi fără curs', 'orders without rate'), noReturn: tx('fără retur', 'no return'), dates: tx('date greșite', 'wrong dates'), km: tx('km greșiți', 'wrong km'), sameDriver: tx('același șofer de 2 ori', 'same driver twice') }[warns[0]]}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{fmtMoney(rev.total)}{rev.missingFx.length > 0 && <div className="text-[11px] text-amber-600">+ {rev.missingFx.length} {tx('fără curs', 'no rate')}</div>}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${!pnl || t.status === 'Anulată' ? '' : pnl.contribution < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{pnl && t.status !== 'Anulată' ? fmtMoney(pnl.contribution) : '—'}{pnl?.marginPct != null && t.status !== 'Anulată' && <div className="text-[11px] text-slate-500">{pnl.marginPct}%</div>}</td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}><select aria-label={tx('Status', 'Status')} value={t.status} onChange={(e) => setTripStatus(t, e.target.value)} className={`mono-label cursor-pointer rounded-full border px-2 py-0.5 text-[10px] outline-none ${TRIP_STYLE[t.status] || ''}`}>{[...new Set([...OWN_STATUSES, t.status])].map((x) => <option key={x} value={x}>{tripStatusLabel(x, lang)}</option>)}</select></td>
                  <td className="whitespace-nowrap px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}><button title={tx('Șterge', 'Delete')} onClick={() => remove(t)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-[13px] font-semibold text-navy-800">
              <tr><td colSpan={5} className="px-3 py-2.5 text-right">{tx('Total', 'Total')} ({live(filtered).length})</td><td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(live(filtered).reduce((s, e) => s + e.rev.total, 0))} {reportCur}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(live(filtered).reduce((s, e) => s + (e.pnl?.contribution || 0), 0))}</td><td colSpan={2} /></tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="mt-2 text-[12px] text-slate-500">{tx('Venitul cursei = suma comenzilor neanulate, convertită în moneda de raportare la cursul fiecărei comenzi (RON pentru 1 EUR). Profit = venit − costurile directe ale cursei (combustibil, taxe, diurnă, cheltuieli șofer, CT-uri). Salariile și costurile fixe sunt lunare: le vezi în pagina Profit.', 'Trip revenue = sum of non-cancelled orders, converted to the reporting currency at each order’s rate (RON per 1 EUR). Profit = revenue − the trip’s direct costs (fuel, tolls, per diem, driver expenses, CTs). Salaries and fixed costs are monthly: see the Profit page.')}</p>
      {modal && <LockGate entity="trips" id={modal.id} label={modal.code} onClose={() => setModal(null)}><TripModal initial={modal.id ? modal : null} pnl={modal.id ? calc.pnlById[modal.id] : null} trips={rows || []} fleet={fleet} clients={clients} carriers={carriers} ccRows={ccRows} ctRows={ctRows} links={links} onClose={() => setModal(null)} onSaved={(_, keep) => { if (!keep) setModal(null); load() }} onChanged={load} /></LockGate>}
    </div>
  )
}
