// Tabla flotei (Etapa 4b): rând = camion, coloane = zile; cursele ca bare; camioanele fără retur marcate,
// cu ofertele potrivite din Burse și profitul estimat. Calculele: src/lib/fleetBoard.js.
import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLang } from '../i18n'
import { getCompany } from '../lib/company'
import { TRIPS_API, tripStatusLabel } from '../lib/trips'
import { OFFERS_API } from '../lib/offers'
import { computeFleet, loadFleetData } from '../lib/fleetCostsApi'
import { addDay, avgCostPerKm, boardRows, dayDiff, dayRange, emptyKmByTruck, returnCandidates, tripPlan } from '../lib/fleetBoard'
import { countryName } from '../lib/places'
import { fmtDate, fmtMoney, todayISO } from '../lib/format'

const useTx = () => { const { lang } = useLang(); return (ro, en) => (lang === 'en' ? en : ro) }
const BAR = {
  Planificată: 'border-sky-300 bg-sky-100 text-sky-900',
  'În curs': 'border-amber-300 bg-amber-100 text-amber-900',
  Livrată: 'border-slate-300 bg-slate-100 text-slate-600',
}
const WD = { ro: ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'], en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] }
const weekday = (iso) => new Date(`${iso}T12:00:00`).getDay()
const LABEL_W = 170

export default function TablaFlotei() {
  const tx = useTx()
  const { lang } = useLang()
  const nav = useNavigate()
  const today = todayISO()
  const [from, setFrom] = useState(addDay(today, -3))
  const [days, setDays] = useState(21)
  const [data, setData] = useState(null)
  const [offers, setOffers] = useState([])
  const [err, setErr] = useState('')
  const [openRet, setOpenRet] = useState(null)
  const cur = getCompany().report_currency || 'EUR'
  const baseCountry = String(getCompany().country || 'RO').toUpperCase()

  const load = () => {
    loadFleetData().then(setData).catch((e) => setErr(e.message))
    OFFERS_API.list().then(setOffers).catch(() => setOffers([]))
  }
  useEffect(() => { load() }, [])
  const fleet = useMemo(() => (data ? computeFleet(data, cur) : null), [data, cur])
  const ordersByTrip = useMemo(() => { const m = {}; for (const o of data?.orders || []) if (o.trip_id) (m[o.trip_id] ||= []).push(o); return m }, [data])
  const range = useMemo(() => dayRange(from, days), [from, days])
  const rows = useMemo(() => (data ? boardRows({ trucks: data.trucks, trips: data.trips, ordersByTrip, from, days, baseCountry, today }) : []), [data, ordersByTrip, from, days, baseCountry, today])
  const driverById = useMemo(() => Object.fromEntries((data?.drivers || []).map((d) => [d.id, d])), [data])
  const truckById = useMemo(() => Object.fromEntries((data?.trucks || []).map((t) => [t.id, t])), [data])
  const empty = useMemo(() => (data ? emptyKmByTruck(data.trips, today.slice(0, 7)) : {}), [data, today])

  // toate cursele deschise fără retur (nu doar cele din fereastră), cu ofertele potrivite
  const returns = useMemo(() => {
    if (!data || !fleet) return []
    return data.trips
      .filter((t) => t.kind !== 'subcontracted' && t.truck_id)
      .map((trip) => ({ trip, plan: tripPlan(trip, ordersByTrip[trip.id] || [], baseCountry) }))
      .filter((x) => x.plan.needsReturn)
      .map((x) => {
        const cpk = avgCostPerKm(fleet.rows, x.trip.truck_id)
        return { ...x, cpk, candidates: returnCandidates(x.plan.freeAt, offers, { baseCountry, cur, costPerKm: cpk.value, fx: fleet.fx }) }
      })
      .sort((a, b) => String(a.plan.freeAt?.date || '').localeCompare(String(b.plan.freeAt?.date || '')))
  }, [data, fleet, offers, ordersByTrip, baseCountry, cur])

  if (!data) return <div className="p-8 text-slate-500">{err || '…'}</div>
  const todayIdx = dayDiff(today, from)
  const freeToday = rows.filter((r) => !r.busyToday)
  const cols = `${LABEL_W}px repeat(${days}, minmax(38px, 1fr))`
  const route = (plan) => {
    const seq = []
    for (const s of plan.stops) if (s.country && seq[seq.length - 1] !== s.country) seq.push(s.country)
    return seq.join('→')
  }
  const markEmpty = async (trip) => {
    try { await TRIPS_API.save(trip.id, { ...trip, no_return_ok: true }); load() } catch (e) { setErr(e.message) }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {tx('TABLA FLOTEI', 'FLEET BOARD')}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{tx('Tabla flotei', 'Fleet board')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFrom(addDay(from, -7))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px] hover:bg-slate-50" title={tx('O săptămână înapoi', 'One week back')}>◀</button>
          <button onClick={() => setFrom(addDay(today, -3))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px] hover:bg-slate-50">{tx('Azi', 'Today')}</button>
          <button onClick={() => setFrom(addDay(from, 7))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px] hover:bg-slate-50" title={tx('O săptămână înainte', 'One week ahead')}>▶</button>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px]">
            {[14, 21, 28, 42].map((n) => <option key={n} value={n}>{n} {tx('zile', 'days')}</option>)}
          </select>
          <Link to="/curse" className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">{tx('Curse →', 'Trips →')}</Link>
        </div>
      </div>
      {err && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-[13px] text-rose-700">{err}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className={`rounded-xl border p-4 shadow-sm ${freeToday.length ? 'border-sky-300 bg-sky-50/60' : 'border-slate-200 bg-white'}`}>
          <div className="mono-label text-[10px] text-slate-500">{tx('CAMIOANE LIBERE AZI', 'TRUCKS FREE TODAY')}</div>
          <div className="mt-1 text-[24px] font-semibold text-navy-800">{freeToday.length} <span className="text-[13px] font-normal text-slate-500">/ {rows.length}</span></div>
          <div className="truncate text-[11.5px] text-slate-500">{freeToday.map((r) => r.truck.plate).join(', ') || '—'}</div>
        </div>
        <a href="#retururi" className={`rounded-xl border p-4 shadow-sm ${returns.length ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200 bg-white'}`}>
          <div className="mono-label text-[10px] text-slate-500">{tx('CURSE FĂRĂ RETUR', 'TRIPS WITHOUT RETURN')}</div>
          <div className={`mt-1 text-[24px] font-semibold ${returns.length ? 'text-rose-600' : 'text-navy-800'}`}>{returns.length}</div>
          <div className="text-[11.5px] text-slate-500">{tx('ultima descărcare e în străinătate', 'last unload is abroad')}</div>
        </a>
        <a href="#retururi" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mono-label text-[10px] text-slate-500">{tx('OFERTE DE RETUR POTRIVITE', 'MATCHING RETURN OFFERS')}</div>
          <div className="mt-1 text-[24px] font-semibold text-navy-800">{returns.reduce((s, r) => s + r.candidates.length, 0)}</div>
          <div className="text-[11.5px] text-slate-500">{tx('din Burse, spre', 'from Offers, towards')} {baseCountry}</div>
        </a>
      </div>

      {/* tabla */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div style={{ minWidth: LABEL_W + days * 38 }}>
          <div className="grid border-b border-slate-200 bg-slate-50 text-[11px] text-slate-500" style={{ gridTemplateColumns: cols }}>
            <div className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium uppercase tracking-wider">{tx('Camion', 'Truck')}</div>
            {range.map((d, i) => {
              const wd = weekday(d)
              return (
                <div key={d} className={`border-l border-slate-200 py-1 text-center ${wd === 0 || wd === 6 ? 'bg-slate-100' : ''} ${i === todayIdx ? 'bg-brand-500/15 font-semibold text-brand-700' : ''}`}>
                  <div>{WD[lang === 'en' ? 'en' : 'ro'][wd]}</div>
                  <div className="tabular-nums">{d.slice(8)}{d.slice(8) === '01' || i === 0 ? `.${d.slice(5, 7)}` : ''}</div>
                </div>
              )
            })}
          </div>
          {rows.map((r) => {
            const cur0 = r.bars.find((b) => { const t = Math.max(0, Math.min(days - 1, todayIdx)); return t >= b.start && t < b.start + b.span }) || r.bars.find((b) => b.start >= todayIdx) || r.bars[r.bars.length - 1]
            const drv = driverById[cur0?.trip.driver_id]?.full_name
            const ek = empty[r.truck.id]
            return (
              <div key={r.truck.id} className="grid min-h-[52px] border-b border-slate-100" style={{ gridTemplateColumns: cols }}>
                <div className="sticky left-0 z-10 row-start-1 bg-white px-3 py-2" style={{ gridColumn: 1 }}>
                  <div className="text-[13.5px] font-medium text-navy-800">{r.truck.plate}</div>
                  <div className="truncate text-[11px] text-slate-500">{drv || '—'}</div>
                  {ek?.pct != null && <div className={`text-[10.5px] ${ek.pct > 15 ? 'text-amber-700' : 'text-slate-400'}`}>{tx('km goi luna', 'empty km month')}: {ek.pct}%</div>}
                </div>
                {range.map((d, i) => {
                  const wd = weekday(d)
                  return <div key={d} className={`row-start-1 border-l border-slate-100 ${wd === 0 || wd === 6 ? 'bg-slate-50' : ''} ${i === todayIdx ? 'bg-brand-500/5' : ''}`} style={{ gridColumn: i + 2 }} />
                })}
                {r.bars.map((b) => (
                  <button
                    key={b.trip.id}
                    onClick={() => nav(`/curse?open=${b.trip.id}`)}
                    title={`${b.trip.code} · ${tripStatusLabel(b.trip.status, lang)} · ${route(b.plan) || '—'}${b.plan.estimatedEnd ? ` · ${tx('sfârșit estimat', 'estimated end')}` : ''}`}
                    className={`row-start-1 z-[1] m-1 flex min-w-0 items-center gap-1 overflow-hidden rounded-md border px-1.5 text-left text-[11.5px] leading-tight hover:brightness-95 ${BAR[b.trip.status] || BAR.Planificată} ${b.cutLeft ? 'rounded-l-none' : ''} ${b.cutRight ? 'rounded-r-none' : ''} ${b.plan.needsReturn ? 'border-r-4 border-r-rose-500' : ''} ${b.plan.estimatedEnd && b.trip.status !== 'Livrată' ? 'border-dashed' : ''}`}
                    style={{ gridColumn: `${b.start + 2} / span ${b.span}` }}
                  >
                    <span className="truncate"><b>{b.trip.code}</b> {route(b.plan)}</span>
                    {b.plan.needsReturn && <span className="ml-auto shrink-0 rounded bg-rose-500 px-1 text-[9.5px] font-semibold uppercase text-white">{tx('fără retur', 'no return')}</span>}
                  </button>
                ))}
                {r.overlap && <div className="row-start-1 z-[2] self-start justify-self-end px-1 text-[11px] text-amber-700" style={{ gridColumn: 1 }} title={tx('Două curse ale camionului se suprapun', 'Two trips of this truck overlap')}>⚠</div>}
              </div>
            )
          })}
          {rows.length === 0 && <p className="p-5 text-slate-500">{tx('Niciun camion activ. Adaugă camioane în', 'No active trucks. Add trucks under')} <Link to="/flota" className="text-brand-600 underline">{tx('Flotă', 'Fleet')}</Link>.</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-slate-500">
        {Object.entries(BAR).map(([s, c]) => <span key={s} className="flex items-center gap-1"><span className={`inline-block h-3 w-5 rounded border ${c}`} />{tripStatusLabel(s, lang)}</span>)}
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded border border-dashed border-slate-400" />{tx('sfârșit estimat (din comenzi)', 'estimated end (from orders)')}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded border-r-4 border-r-rose-500 bg-slate-100" />{tx('fără retur', 'no return')}</span>
        <span>{tx('Clic pe o cursă o deschide.', 'Click a trip to open it.')}</span>
      </div>

      {/* retururi */}
      <h2 id="retururi" className="mt-8 text-[20px] font-semibold text-navy-800">{tx('Retururi de găsit', 'Returns to find')}</h2>
      <p className="mt-1 text-[12.5px] text-slate-500">{tx(`Cursele deschise a căror ultimă descărcare e în străinătate. Ofertele vin din Burse: încarcă în aceeași țară sau alături, cu o zi înainte până la 3 zile după descărcare, și descarcă în ${baseCountry}. Profitul estimat = prețul ofertei − km × costul pe km al camionului (din cursele încheiate). Nu include km goi până la încărcare.`, `Open trips whose last unload is abroad. Offers come from Offers: loading in the same or a neighbouring country, from one day before to 3 days after the unload, unloading in ${baseCountry}. Estimated profit = offer price − km × the truck’s cost per km (from finished trips). Excludes empty km to the loading point.`)}</p>
      <div className="mt-3 space-y-3">
        {returns.map(({ trip, plan, cpk, candidates }) => {
          const open = openRet === trip.id
          const fa = plan.freeAt
          return (
            <div key={trip.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="text-[13.5px]">
                  <b className="text-navy-800">{truckById[trip.truck_id]?.plate || '—'}</b> · <Link to={`/curse?open=${trip.id}`} className="text-brand-600 hover:underline">{trip.code}</Link>
                  <span className="text-slate-600"> · {tx('se eliberează în', 'free in')} <b>{fa?.city || '—'} ({fa?.country}{fa?.country ? ` · ${countryName(fa.country, lang)}` : ''})</b> {fa?.date ? `${tx('pe', 'on')} ${fmtDate(fa.date)}` : ''}</span>
                  <div className="text-[11.5px] text-slate-500">{tx('Cost/km pentru estimare', 'Cost/km for estimate')}: {cpk.value != null ? `${fmtMoney(cpk.value)} ${cur} (${cpk.source === 'truck' ? tx('camionul', 'this truck') : tx('media flotei', 'fleet average')})` : tx('lipsă — nu sunt curse încheiate cu km și costuri', 'missing — no finished trips with km and costs')}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setOpenRet(open ? null : trip.id)} className={`rounded-lg border px-3 py-1.5 text-[13px] ${candidates.length ? 'border-brand-500 text-brand-600 hover:bg-brand-500/10' : 'border-slate-300 text-slate-500'}`}>{candidates.length} {tx('oferte potrivite', 'matching offers')} {open ? '▲' : '▼'}</button>
                  <Link to="/oferte" className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50">＋ {tx('Ofertă din bursă', 'Offer from exchange')}</Link>
                  <button onClick={() => markEmpty(trip)} className="rounded-lg px-3 py-1.5 text-[13px] text-slate-500 hover:bg-slate-100" title={tx('Cursa nu mai apare aici', 'The trip no longer shows here')}>{tx('Se întoarce gol', 'Returns empty')}</button>
                </div>
              </div>
              {open && (
                <div className="overflow-x-auto border-t border-slate-100">
                  {candidates.length === 0 ? <p className="p-3 text-[13px] text-slate-500">{tx('Nicio ofertă potrivită în Burse. Caută pe bursă și adaug-o în pagina Oferte; apare aici singură.', 'No matching offer in Offers. Search the exchange and add it on the Offers page; it shows here by itself.')}</p> : (
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">{tx('Ofertă', 'Offer')}</th><th className="px-3 py-2">{tx('Traseu', 'Route')}</th><th className="px-3 py-2">{tx('Încărcare', 'Loading')}</th><th className="px-3 py-2 text-right">{tx('Preț', 'Price')}</th><th className="px-3 py-2 text-right">km</th><th className="px-3 py-2 text-right">{cur}/km</th><th className="px-3 py-2 text-right">{tx('Cost estimat', 'Est. cost')}</th><th className="px-3 py-2 text-right">{tx('Profit estimat', 'Est. profit')}</th></tr></thead>
                      <tbody>
                        {candidates.map((c) => (
                          <tr key={c.offer.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => nav(`/oferte?open=${c.offer.id}`)}>
                            <td className="whitespace-nowrap px-3 py-2"><span className="font-medium text-sky-700">{c.offer.code}</span><div className="text-[11px] text-slate-500">{c.offer.exchange || '—'} · {c.offer.status || '—'}</div></td>
                            <td className="px-3 py-2">{c.offer.load_place || '—'} ({c.offer.load_country}) → {c.offer.unload_place || '—'} ({c.offer.unload_country}){!c.sameCountry && <div className="text-[11px] text-amber-700">{tx('țară vecină', 'neighbouring country')}</div>}</td>
                            <td className="whitespace-nowrap px-3 py-2">{c.offer.load_date ? fmtDate(c.offer.load_date) : '—'}{c.dayDiff != null && <div className="text-[11px] text-slate-500">{c.dayDiff === 0 ? tx('aceeași zi', 'same day') : c.dayDiff > 0 ? `+${c.dayDiff} ${tx('zile', 'days')}` : `${c.dayDiff} ${tx('zi', 'day')}`}</div>}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{c.offer.price ? `${fmtMoney(c.offer.price)} ${c.offer.currency}` : '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{c.offer.km || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{c.perKm != null ? fmtMoney(c.perKm) : '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{c.cost != null ? fmtMoney(c.cost) : '—'}</td>
                            <td className={`px-3 py-2 text-right font-medium tabular-nums ${c.profit == null ? '' : c.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{c.profit != null ? fmtMoney(c.profit) : <span className="text-[11.5px] font-normal text-slate-400">{!c.fxOk ? tx('monedă neconvertibilă', 'currency not convertible') : tx('lipsesc km', 'km missing')}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {returns.length === 0 && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-800">✓ {tx('Toate cursele deschise au retur (sau sunt marcate „se întoarce gol").', 'All open trips have a return (or are marked “returns empty”).')}</p>}
      </div>
    </div>
  )
}
