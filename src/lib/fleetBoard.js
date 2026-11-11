// Etapa 4b: Tabla flotei (rând = camion, coloane = zile) și găsirea returului.
// Funcții pure, fără acces la baza de date (testate în tests/fleetBoard.test.mjs). Decizie: DECIZII „Plan extins".
import { convert, isLiveOrder, tripKm } from './tripMoney.js'

const num = (x) => {
  const n = Number(String(x ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// ---- zile (date locale, „YYYY-MM-DD") ----
const pad = (n) => String(n).padStart(2, '0')
export const dayOf = (x) => {
  if (!x) return ''
  if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) return x
  const d = new Date(x)
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const dn = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000 }
export const addDay = (iso, n) => new Date((dn(iso) + n) * 86400000).toISOString().slice(0, 10)
export const dayDiff = (a, b) => dn(a) - dn(b) // a − b, în zile
export const dayRange = (from, days) => Array.from({ length: days }, (_, i) => addDay(from, i))

// Țări vecine (pentru retur: dacă nu e ofertă în țara de descărcare, se caută și alături)
export const NEIGHBORS = {
  AT: ['DE', 'CZ', 'SK', 'HU', 'SI', 'IT', 'CH'], BE: ['NL', 'DE', 'FR', 'LU'], BG: ['RO', 'GR', 'TR', 'RS', 'MK'],
  CH: ['DE', 'AT', 'IT', 'FR'], CZ: ['DE', 'PL', 'SK', 'AT'], DE: ['AT', 'CH', 'CZ', 'PL', 'DK', 'NL', 'BE', 'LU', 'FR'],
  DK: ['DE', 'SE'], ES: ['FR', 'PT'], FR: ['BE', 'LU', 'DE', 'CH', 'IT', 'ES'], GR: ['BG', 'MK'], HR: ['SI', 'HU', 'RS', 'BA'],
  HU: ['AT', 'SK', 'UA', 'RO', 'RS', 'HR', 'SI'], IT: ['FR', 'CH', 'AT', 'SI'], LT: ['LV', 'PL'], LU: ['BE', 'DE', 'FR'],
  LV: ['LT', 'EE'], EE: ['LV', 'FI'], FI: ['SE', 'EE'], NL: ['BE', 'DE'], NO: ['SE'], PL: ['DE', 'CZ', 'SK', 'LT'],
  PT: ['ES'], RO: ['HU', 'BG', 'RS', 'MD', 'UA'], RS: ['HU', 'RO', 'BG', 'HR'], SE: ['NO', 'FI', 'DK'], SI: ['IT', 'AT', 'HU', 'HR'],
  SK: ['CZ', 'PL', 'HU', 'AT', 'UA'],
}
const up = (c) => String(c || '').trim().toUpperCase()

// Punctele comenzilor active ale cursei, în ordine: după dată; la aceeași dată (sau fără dată) încărcările înaintea descărcărilor.
export function tripStops(orders) {
  const out = []
  for (const o of (orders || []).filter(isLiveOrder)) {
    for (const [i, s] of (Array.isArray(o.stops) ? o.stops : []).entries()) {
      if (!s || (s.side !== 'load' && s.side !== 'unload')) continue
      out.push({ orderId: o.id, side: s.side, date: dayOf(s.date), country: up(s.country), city: String(s.city || '').trim(), i })
    }
  }
  return out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.side === b.side ? a.i - b.i : a.side === 'load' ? -1 : 1))
}

// Planul unei curse pe tablă: zilele ocupate, unde și când se eliberează camionul, dacă îi lipsește returul.
// baseCountry = țara bazei (implicit RO). Returul lipsește dacă ultima descărcare e în străinătate și cursa nu s-a întors.
export function tripPlan(trip, orders, baseCountry = 'RO') {
  const stops = tripStops(orders)
  const dated = stops.filter((s) => s.date)
  const unloads = stops.filter((s) => s.side === 'unload')
  const lastUnload = unloads[unloads.length - 1] || null
  const startDay = dayOf(trip?.start_at) || dayOf(trip?.load_date) || dated[0]?.date || ''
  const lastDate = dated[dated.length - 1]?.date || ''
  const endDay = dayOf(trip?.end_at) || [lastDate, startDay].filter(Boolean).sort().pop() || ''
  const own = trip?.kind !== 'subcontracted'
  const open = trip?.status !== 'Anulată' && trip?.status !== 'Livrată' && !trip?.end_at
  const base = up(baseCountry) || 'RO'
  const endsAbroad = !!lastUnload && !!lastUnload.country && lastUnload.country !== base
  return {
    startDay,
    endDay,
    estimatedEnd: !trip?.end_at,
    stops,
    lastUnload,
    freeAt: lastUnload ? { date: lastUnload.date || endDay, country: lastUnload.country, city: lastUnload.city } : null,
    needsReturn: own && open && endsAbroad && !trip?.no_return_ok,
    countries: [...new Set(stops.map((s) => s.country).filter(Boolean))],
  }
}

// Rândurile tablei: câte un rând pe camion activ, cu barele curselor tăiate la fereastra [from, from+days).
export function boardRows({ trucks, trips, ordersByTrip, from, days, baseCountry = 'RO', today }) {
  const last = addDay(from, days - 1)
  const rows = []
  for (const truck of (trucks || []).filter((t) => t.status !== 'Inactiv')) {
    const bars = []
    for (const trip of (trips || []).filter((t) => t.truck_id === truck.id && t.kind !== 'subcontracted' && t.status !== 'Anulată')) {
      const plan = tripPlan(trip, ordersByTrip?.[trip.id] || [], baseCountry)
      if (!plan.startDay) continue
      // cursa încă pe drum fără dată de sfârșit cunoscută: până azi
      const end = plan.endDay < plan.startDay ? plan.startDay : (trip.status === 'În curs' && !trip.end_at && today && plan.endDay < today ? today : plan.endDay)
      if (end < from || plan.startDay > last) continue
      const a = plan.startDay < from ? from : plan.startDay
      const b = end > last ? last : end
      bars.push({ trip, plan, start: dayDiff(a, from), span: dayDiff(b, a) + 1, cutLeft: plan.startDay < from, cutRight: end > last })
    }
    bars.sort((x, y) => x.start - y.start)
    // rânduri suprapuse (două curse în aceleași zile) = de verificat
    const overlap = bars.some((b, i) => i > 0 && b.start <= bars[i - 1].start + bars[i - 1].span - 1)
    const busyToday = today ? bars.some((b) => { const d = dayDiff(today, from); return d >= b.start && d < b.start + b.span }) : false
    rows.push({ truck, bars, overlap, busyToday, needsReturn: bars.filter((b) => b.plan.needsReturn) })
  }
  return rows
}

// Costul pe km folosit la estimare: media curselor proprii ale camionului (costuri directe / km), altfel media flotei.
// rows = [{ trip, pnl }] (din computeFleet). Doar cursele încheiate, cu km.
export function avgCostPerKm(rows, truckId) {
  const pick = (r) => r.trip.kind !== 'subcontracted' && r.trip.status !== 'Anulată' && r.trip.end_at && r.pnl?.km > 0
  const sum = (list) => { const km = list.reduce((s, r) => s + r.pnl.km, 0); return km > 0 ? r2(list.reduce((s, r) => s + r.pnl.direct, 0) / km * 100) / 100 : null }
  const own = (rows || []).filter((r) => pick(r) && r.trip.truck_id === truckId)
  const val = sum(own)
  if (val != null) return { value: val, source: 'truck' }
  const all = sum((rows || []).filter(pick))
  return all != null ? { value: all, source: 'fleet' } : { value: null, source: 'none' }
}

const OPEN_OFFER = ['Cerută', 'Ofertată', 'Fără răspuns', '', null, undefined]
const offerUnloadCountries = (o) => [o.unload_country, ...(Array.isArray(o.extra_unloads) ? o.extra_unloads.map((x) => x?.country) : [])].map(up).filter(Boolean)

// Ofertele din Burse potrivite pentru retur: încarcă în țara unde se eliberează camionul (sau alături),
// în jurul datei (cu o zi înainte până la `after` zile după), și descarcă în țara bazei.
// opts = { baseCountry, cur, costPerKm, fx, before = 1, after = 3 }
// Rezultat (cele mai bune primele): [{ offer, sameCountry, dayDiff, revenue, cost, profit, perKm, fxOk }]
export function returnCandidates(freeAt, offers, opts = {}) {
  if (!freeAt?.country) return []
  const base = up(opts.baseCountry) || 'RO'
  const before = opts.before ?? 1
  const after = opts.after ?? 3
  const near = NEIGHBORS[freeAt.country] || []
  const out = []
  for (const o of offers || []) {
    if (!OPEN_OFFER.includes(o.status)) continue
    const lc = up(o.load_country)
    const same = lc === freeAt.country
    if (!same && !near.includes(lc)) continue
    if (!offerUnloadCountries(o).includes(base)) continue
    let diff = null
    if (o.load_date && freeAt.date) {
      // dacă oferta are interval (load_date … load_date_alt), contează cea mai apropiată zi din interval
      const a = dayDiff(o.load_date, freeAt.date)
      const b = o.load_date_alt ? dayDiff(o.load_date_alt, freeAt.date) : a
      diff = a <= 0 && b >= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b
      if (diff < -before || diff > after) continue
    }
    const money = ['EUR', 'RON'].includes(o.currency) ? convert(o.price, o.currency, opts.cur || 'EUR', opts.fx) : { value: 0, ok: false }
    const km = num(o.km)
    const cpk = num(opts.costPerKm)
    const cost = km > 0 && cpk > 0 ? r2(km * cpk) : null
    out.push({
      offer: o, sameCountry: same, dayDiff: diff,
      revenue: money.ok ? money.value : null, fxOk: money.ok,
      cost, profit: money.ok && cost != null ? r2(money.value - cost) : null,
      perKm: money.ok && km > 0 ? Math.round((money.value / km) * 100) / 100 : null,
    })
  }
  const rank = (x) => [x.sameCountry ? 0 : 1, x.dayDiff == null ? 9 : Math.abs(x.dayDiff), -(x.profit ?? x.revenue ?? 0)]
  return out.sort((a, b) => { const A = rank(a); const B = rank(b); return A[0] - B[0] || A[1] - B[1] || A[2] - B[2] })
}

// Km goi pe camion într-o lună (curse după luna plecării): { [truckId]: { km, empty, pct, trips, missing } }
// missing = curse cu km, dar fără „km goi" trecuți (nu intră în procent)
export function emptyKmByTruck(trips, ym) {
  const out = {}
  for (const t of trips || []) {
    if (t.kind === 'subcontracted' || t.status === 'Anulată' || !t.truck_id) continue
    if (dayOf(t.start_at || t.load_date).slice(0, 7) !== ym) continue
    const km = tripKm(t)
    const r = (out[t.truck_id] ||= { km: 0, empty: 0, pct: null, trips: 0, missing: 0 })
    r.trips += 1
    if (!km) continue
    if (t.km_empty == null || t.km_empty === '') { r.missing += 1; continue }
    r.km += km
    r.empty += Math.min(num(t.km_empty), km)
  }
  for (const r of Object.values(out)) r.pct = r.km > 0 ? Math.round((r.empty / r.km) * 1000) / 10 : null
  return out
}
