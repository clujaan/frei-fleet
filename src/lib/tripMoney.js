// Cursa-circuit: venitul (suma comenzilor) în moneda de raportare și repartizarea unui cost pe mărfuri.
// Funcții pure, fără acces la baza de date (testate în tests/tripMoney.test.mjs).
// Decizie: docs/DECIZII-grupaj-ltl.md (implicit LDM; schimbabil pe cursă; criteriu de rezervă dacă lipsesc date).
import { cleanGoods, goodsTotals, goodsType } from './goods.js'

const num = (x) => {
  const n = Number(String(x ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export const ALLOCATION_BASES = ['ldm', 'weight', 'pallets', 'revenue']
export const BASIS_LABEL = {
  ldm: ['LDM (metri de podea)', 'LDM (loading metres)'],
  weight: ['Greutate (kg)', 'Weight (kg)'],
  pallets: ['Paleți', 'Pallets'],
  revenue: ['Pondere din venit', 'Share of revenue'],
}
export const basisLabel = (b, lang = 'ro') => (BASIS_LABEL[b] || [b, b])[lang === 'en' ? 1 : 0]

// Ordinea de rezervă când o comandă nu are valoarea criteriului ales
const FALLBACK = {
  ldm: ['ldm', 'weight', 'pallets', 'revenue'],
  weight: ['weight', 'ldm', 'pallets', 'revenue'],
  pallets: ['pallets', 'ldm', 'weight', 'revenue'],
  revenue: ['revenue'],
}

// Convertește o sumă între RON și EUR. fx = RON pentru 1 EUR. ok = false dacă e nevoie de curs și lipsește.
export function convert(amount, from, to, fx) {
  const a = num(amount)
  const src = from === 'RON' ? 'RON' : 'EUR'
  const dst = to === 'RON' ? 'RON' : 'EUR'
  if (!a || src === dst) return { value: r2(a), ok: true }
  const f = num(fx)
  if (!(f > 0)) return { value: 0, ok: false }
  return { value: r2(src === 'EUR' ? a * f : a / f), ok: true }
}

export const isLiveOrder = (o) => !!o && o.status !== 'Anulată'

// Ce ocupă marfa unei comenzi: LDM, kg, paleți. Din rândurile de marfă (încărcări; dacă lipsesc, descărcări), altfel din câmpurile comenzii.
export function orderMeasures(o) {
  const stops = Array.isArray(o?.stops) ? o.stops : []
  const side = (s) => stops.filter((x) => x?.side === s).flatMap((x) => cleanGoods(x.goods))
  const rows = side('load').length ? side('load') : side('unload')
  const tot = goodsTotals(rows)
  const pallets = rows.filter((g) => goodsType(g.type)?.pallet).reduce((s, g) => s + num(g.qty), 0)
  return {
    ldm: tot.ldm > 0 ? tot.ldm : num(o?.ldm),
    weight: tot.weight > 0 ? tot.weight : num(o?.weight_kg),
    pallets,
  }
}

// Valoarea comenzii în moneda de raportare
export const orderValue = (o, reportCur) => convert(o?.price, o?.currency || 'EUR', reportCur, o?.fx_rate)

// Venitul cursei = suma comenzilor nonanulate, în moneda de raportare.
// missingFx = comenzile la care lipsește cursul (nu intră în total până se completează).
export function tripRevenue(orders, reportCur = 'EUR') {
  const live = (orders || []).filter(isLiveOrder)
  const byOrder = live.map((o) => ({ id: o.id, ...orderValue(o, reportCur) }))
  return {
    currency: reportCur === 'RON' ? 'RON' : 'EUR',
    total: r2(byOrder.reduce((s, x) => s + (x.ok ? x.value : 0), 0)),
    count: live.length,
    byOrder,
    missingFx: byOrder.filter((x) => !x.ok).map((x) => x.id),
  }
}

// Ponderile fiecărei comenzi (sumă = 1) după criteriul cerut, cu rezervă dacă unei comenzi îi lipsește valoarea.
// Rezultat: { requested, basis, fallback, shares: { [id]: fracție } }. Fără comenzi: shares = {}.
export function allocationShares(orders, requested = 'ldm', reportCur = 'EUR') {
  const want = ALLOCATION_BASES.includes(requested) ? requested : 'ldm'
  const live = (orders || []).filter(isLiveOrder)
  if (!live.length) return { requested: want, basis: want, fallback: false, shares: {} }
  const measure = (o, b) => (b === 'revenue' ? orderValue(o, reportCur).value : orderMeasures(o)[b])
  for (const b of FALLBACK[want]) {
    const vals = live.map((o) => measure(o, b))
    const sum = vals.reduce((s, v) => s + v, 0)
    if (vals.every((v) => v > 0) && sum > 0) {
      return { requested: want, basis: b, fallback: b !== want, shares: Object.fromEntries(live.map((o, i) => [o.id, vals[i] / sum])) }
    }
  }
  // nicio valoare comună (ex. comenzi fără preț și fără marfă): în părți egale
  return { requested: want, basis: 'equal', fallback: true, shares: Object.fromEntries(live.map((o) => [o.id, 1 / live.length])) }
}

// Împarte o sumă după ponderi, la ban: suma părților = suma inițială (diferența de rotunjire merge la cele mai mari resturi).
export function allocateAmount(amount, shares) {
  const ids = Object.keys(shares || {})
  if (!ids.length) return {}
  const cents = Math.round(num(amount) * 100)
  const raw = ids.map((id) => ({ id, exact: cents * shares[id] }))
  const base = raw.map((x) => ({ ...x, c: Math.floor(x.exact), rest: x.exact - Math.floor(x.exact) }))
  let left = cents - base.reduce((s, x) => s + x.c, 0)
  ;[...base].sort((a, b) => b.rest - a.rest || a.id.localeCompare(b.id)).forEach((x) => { if (left > 0) { x.c += 1; left -= 1 } })
  return Object.fromEntries(base.map((x) => [x.id, x.c / 100]))
}

// Costul distribuției subcontractate pe fiecare comandă: fiecare CT activ își împarte prețul (în moneda de raportare)
// pe mărfurile pe care le duce, după același criteriu ca al cursei.
// cts = [{ id, price, currency, fx_rate, status }], links = [{ transport_order_id, client_order_id }], ordersById = { id: comandă }
// Rezultat: { byOrder: { [orderId]: sumă }, missingFx: [ctId] }
export function distributionCosts(cts, links, ordersById, basis = 'ldm', reportCur = 'EUR') {
  const byOrder = {}
  const missingFx = []
  for (const ct of cts || []) {
    if (!ct || ct.status === 'Anulată') continue
    const goods = (links || []).filter((l) => l.transport_order_id === ct.id).map((l) => ordersById?.[l.client_order_id]).filter(Boolean)
    if (!goods.length) continue
    const v = convert(ct.price, ct.currency || 'EUR', reportCur, ct.fx_rate)
    if (!v.ok) { missingFx.push(ct.id); continue }
    const parts = allocateAmount(v.value, allocationShares(goods, basis, reportCur).shares)
    for (const [id, amt] of Object.entries(parts)) byOrder[id] = r2((byOrder[id] || 0) + amt)
  }
  return { byOrder, missingFx }
}

// Zilele cursei (de la plecare până la întoarcere, inclusiv), după data calendaristică locală
export function tripDays(startAt, endAt) {
  if (!startAt || !endAt) return 0
  const d = (x) => { const t = new Date(x); return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) }
  const n = Math.round((d(endAt) - d(startAt)) / 86400000) + 1
  return n > 0 ? n : 0
}

// Km din kilometraj (sfârșit − început); altfel km-ul trecut de mână
export function tripKm(t) {
  const a = num(t?.km_start)
  const b = num(t?.km_end)
  if (a > 0 && b > a) return b - a
  return num(t?.km) || 0
}

// Tariful de diurnă valabil la o dată: șofer+țară → șofer → firmă+țară → firmă; cel mai recent valid_from ≤ data.
export function pickPerDiemRate(rates, driverId, country, date) {
  const day = String(date || '9999-12-31').slice(0, 10)
  const ok = (rows) => rows.filter((r) => String(r.valid_from || '2000-01-01') <= day).sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')))[0] || null
  const list = rates || []
  const c = String(country || '').toUpperCase()
  const steps = [
    (r) => driverId && r.driver_id === driverId && c && String(r.country || '').toUpperCase() === c,
    (r) => driverId && r.driver_id === driverId && !r.country,
    (r) => !r.driver_id && c && String(r.country || '').toUpperCase() === c,
    (r) => !r.driver_id && !r.country,
  ]
  for (const s of steps) { const hit = ok(list.filter(s)); if (hit) return hit }
  return null
}

// Avertizări pentru o cursă proprie (cheile se traduc în interfață)
export function checkOwnTrip(t, orders = []) {
  const w = []
  if (t.kind !== 'subcontracted') {
    if (!t.truck_id) w.push('truck')
    if (!t.driver_id) w.push('driver')
    if (t.driver2_id && t.driver2_id === t.driver_id) w.push('sameDriver')
  }
  if (!t.start_at) w.push('start')
  if (t.start_at && t.end_at && new Date(t.end_at) < new Date(t.start_at)) w.push('dates')
  if (num(t.km_start) > 0 && num(t.km_end) > 0 && num(t.km_end) < num(t.km_start)) w.push('km')
  if (t.status !== 'Anulată' && t.status !== 'Planificată' && !(orders || []).some(isLiveOrder)) w.push('noOrders')
  return w
}
