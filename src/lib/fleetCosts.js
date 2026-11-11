// Etapa 4: costurile flotei și profitul (pe cursă, camion, șofer, client, lună).
// Funcții pure, fără acces la baza de date (testate în tests/fleetCosts.test.mjs).
// Reguli: docs/SPEC-APLICATIE-TRANSPORTATOR.md secț. 6 + docs/DECIZII-grupaj-ltl.md („Plan extins"):
//  - un cost cu camion se leagă automat de cursa acelui camion dacă data e între plecare și întoarcere;
//  - costurile directe ale cursei se repartizează pe mărfuri după criteriul cursei (LDM implicit);
//  - salariile și costurile fixe sunt lunare; cursa intră în luna plecării din bază.
import { allocateAmount, allocationShares, convert, distributionCosts, isLiveOrder, pickPerDiemRate, tripDays, tripKm, tripRevenue } from './tripMoney.js'

const num = (x) => {
  const n = Number(String(x ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const ms = (x) => (x ? new Date(x).getTime() : NaN)

export const COST_CATEGORIES = ['fuel_card', 'toll', 'driver_expense', 'per_diem', 'service', 'tires', 'parking', 'fine', 'other']
export const CATEGORY_LABEL = {
  fuel_card: ['Combustibil (card)', 'Fuel (card)'],
  fuel_base: ['Combustibil (rezervor bază)', 'Fuel (base tank)'],
  toll: ['Taxe de drum', 'Tolls'],
  driver_expense: ['Cheltuieli șofer', 'Driver expenses'],
  per_diem: ['Diurnă', 'Per diem'],
  service: ['Service / reparații', 'Service / repairs'],
  tires: ['Anvelope', 'Tyres'],
  parking: ['Parcări', 'Parking'],
  fine: ['Amenzi', 'Fines'],
  other: ['Altele', 'Other'],
  subcontract: ['Cursă subcontractată (CT)', 'Subcontracted trip (CT)'],
  distribution: ['Distribuție subcontractată (CT)', 'Subcontracted distribution (CT)'],
}
export const categoryLabel = (c, lang = 'ro') => (CATEGORY_LABEL[c] || [c, c])[lang === 'en' ? 1 : 0]
// Ordinea liniilor de cost pe cursă
export const TRIP_LINES = ['fuel_card', 'fuel_base', 'toll', 'per_diem', 'driver_expense', 'parking', 'service', 'tires', 'fine', 'other', 'subcontract', 'distribution']

export const FIXED_KINDS = ['Leasing', 'Rată credit', 'RCA', 'CASCO', 'Asigurare CMR', 'Impozit', 'Rovinietă / vinietă', 'ITP', 'Revizie planificată', 'GPS / telematică', 'Altele']
export const ALLOC_MODES = ['auto', 'trip', 'truck']

// ---------------------------------------------------------------------
// Alocarea pe cursă
// ---------------------------------------------------------------------
const ownTrip = (t) => t && t.kind !== 'subcontracted' && t.status !== 'Anulată'
const whenOf = (item) => item?.occurred_at ?? item?.moved_at

// Cursa căreia îi aparține un cost / o alimentare. Manual (alloc_mode='trip') câștigă; 'truck' = cost lunar al camionului.
// Automat: aceeași mașină, data între plecare și întoarcere (cursa încă pe drum = până acum).
export function matchTrip(item, trips, now = Date.now()) {
  if (!item) return null
  if (item.alloc_mode === 'trip') return item.trip_id || null
  if (item.alloc_mode === 'truck' || !item.truck_id) return null
  const at = ms(whenOf(item))
  if (!Number.isFinite(at)) return null
  const hits = (trips || []).filter((t) => ownTrip(t) && t.truck_id === item.truck_id && t.start_at && at >= ms(t.start_at) && at <= (t.end_at ? ms(t.end_at) : now))
  hits.sort((a, b) => ms(b.start_at) - ms(a.start_at))
  return hits[0]?.id || null
}

// Împarte costurile (și ieșirile din rezervor) pe curse.
// Rezultat: { byTrip: { [tripId]: [item] }, truckMonth: [item], unallocated: [item] }
//  - truckMonth   = marcate „cost al camionului pe lună"
//  - unallocated  = automat, dar fără cursă potrivită (de verificat; intră totuși în costul camionului pe lună)
export function splitByTrip(items, trips, now = Date.now()) {
  const byTrip = {}
  const truckMonth = []
  const unallocated = []
  for (const it of items || []) {
    if (it?.kind === 'in') continue // intrările în rezervor nu sunt costuri de cursă
    const id = matchTrip(it, trips, now)
    if (id) (byTrip[id] ||= []).push(it)
    else if (it.alloc_mode === 'truck') truckMonth.push(it)
    else unallocated.push(it)
  }
  return { byTrip, truckMonth, unallocated }
}

// Valoarea unui cost în moneda de raportare
export const costValue = (c, cur = 'EUR') => convert(c?.amount, c?.currency || 'EUR', cur, c?.fx_rate)

// ---------------------------------------------------------------------
// Rezervorul bazei: cost mediu ponderat
// ---------------------------------------------------------------------
// moves = [{ id, moved_at, kind: 'in'|'out', liters, unit_price, currency, fx_rate }]
// Rezultat: { outs: { [id]: { liters, unitCost, cost } }, stockLiters, avgPrice, stockValue, negative: [id], missingFx: [id] }
// La aceeași oră, intrările se socotesc înaintea ieșirilor. O ieșire fără stoc folosește ultimul preț mediu cunoscut.
export function fuelLedger(moves, cur = 'EUR') {
  const list = [...(moves || [])].sort((a, b) => ms(a.moved_at) - ms(b.moved_at) || (a.kind === 'in' ? -1 : 1) - (b.kind === 'in' ? -1 : 1))
  let liters = 0
  let value = 0
  let lastAvg = 0
  const outs = {}
  const negative = []
  const missingFx = []
  for (const m of list) {
    const l = num(m.liters)
    if (!(l > 0)) continue
    if (m.kind === 'in') {
      const v = convert(l * num(m.unit_price), m.currency || 'EUR', cur, m.fx_rate)
      if (!v.ok) { missingFx.push(m.id); continue }
      liters += l
      value += v.value
      lastAvg = liters > 0 ? value / liters : lastAvg
    } else {
      const avg = liters > 0 ? value / liters : lastAvg
      if (l > liters + 1e-9) negative.push(m.id)
      const cost = r2(l * avg)
      outs[m.id] = { liters: l, unitCost: Math.round(avg * 10000) / 10000, cost }
      if (liters > 0) {
        const take = Math.min(l, liters)
        value -= take * avg
        liters -= take
      }
      if (liters <= 1e-9) { liters = 0; value = 0 }
      lastAvg = avg
    }
  }
  return { outs, stockLiters: r2(liters), stockValue: r2(value), avgPrice: Math.round((liters > 0 ? value / liters : lastAvg) * 10000) / 10000, negative, missingFx }
}

// ---------------------------------------------------------------------
// Diurnă pe cursă (calcul de ajutor; regulile se validează cu contabilul clientului)
// ---------------------------------------------------------------------
// Zilele de la plecare la întoarcere (cursa încă pe drum: până azi), pentru șoferul 1 și 2.
export function perDiemForTrip(trip, rates, cur = 'EUR', fx = null, now = Date.now()) {
  const end = trip?.end_at || (trip?.start_at ? new Date(now).toISOString() : null)
  const days = tripDays(trip?.start_at, end)
  const out = { total: 0, days, estimated: !trip?.end_at, byDriver: [], missingRate: [], missingFx: false }
  for (const d of [trip?.driver_id, trip?.driver2_id].filter(Boolean)) {
    const rate = pickPerDiemRate(rates, d, null, trip.start_at)
    if (!rate) { out.missingRate.push(d); continue }
    const v = convert(num(rate.amount_day) * days, rate.currency || 'EUR', cur, fx)
    if (!v.ok) out.missingFx = true
    out.byDriver.push({ driver_id: d, days, rate: num(rate.amount_day), currency: rate.currency || 'EUR', amount: v.value })
    out.total = r2(out.total + v.value)
  }
  return out
}

// ---------------------------------------------------------------------
// Profitul unei curse (contribuția)
// ---------------------------------------------------------------------
// ctx = {
//   orders,                       comenzile cursei
//   costs,                        costurile alocate cursei (din splitByTrip)
//   fuelOuts,                     ieșirile din rezervor alocate cursei, cu cost: [{ id, liters, cost }]
//   cts, links,                   CT-urile cursei și legăturile CT ↔ marfă
//   rates, fx,                    tarife de diurnă; cursul de rezervă (RON/EUR) pentru diurnă
//   refConsumption,               consumul de referință al camionului (l/100 km)
//   cur, now
// }
export function tripPnL(trip, ctx = {}) {
  const cur = ctx.cur === 'RON' ? 'RON' : 'EUR'
  const orders = (ctx.orders || []).filter(isLiveOrder)
  const revenue = tripRevenue(orders, cur)
  const lines = Object.fromEntries(TRIP_LINES.map((k) => [k, 0]))
  const missingFx = [...revenue.missingFx]
  let litersCard = 0
  let manualPerDiem = false

  for (const c of ctx.costs || []) {
    const v = costValue(c, cur)
    if (!v.ok) { missingFx.push(c.id); continue }
    const k = COST_CATEGORIES.includes(c.category) ? c.category : 'other'
    lines[k] = r2(lines[k] + v.value)
    if (k === 'fuel_card') litersCard += num(c.liters)
    if (k === 'per_diem') manualPerDiem = true
  }
  let litersBase = 0
  for (const f of ctx.fuelOuts || []) { lines.fuel_base = r2(lines.fuel_base + num(f.cost)); litersBase += num(f.liters) }

  // diurna automată doar dacă nu s-a trecut deja una de mână (din decont)
  const perDiem = trip?.kind === 'subcontracted' || manualPerDiem ? null : perDiemForTrip(trip, ctx.rates, cur, ctx.fx, ctx.now)
  if (perDiem) lines.per_diem = r2(lines.per_diem + perDiem.total)

  const liveCts = (ctx.cts || []).filter((x) => x && x.status !== 'Anulată')
  for (const ct of liveCts) {
    const v = convert(ct.price, ct.currency || 'EUR', cur, ct.fx_rate)
    if (!v.ok) { missingFx.push(ct.id); continue }
    const k = ct.purpose === 'distribution' ? 'distribution' : 'subcontract'
    lines[k] = r2(lines[k] + v.value)
  }

  const direct = r2(Object.values(lines).reduce((s, v) => s + v, 0))
  const contribution = r2(revenue.total - direct)
  const km = tripKm(trip)
  const liters = r2(litersCard + litersBase)
  const consumption = km > 0 && liters > 0 ? Math.round((liters / km) * 10000) / 100 : null
  const ref = num(ctx.refConsumption) || null

  // pe mărfuri: costul propriu (tot, fără distribuție) după criteriul cursei; distribuția după marfa pe care o duce fiecare CT
  const ordersById = Object.fromEntries(orders.map((o) => [o.id, o]))
  const basisReq = trip?.allocation_basis || ctx.defaultBasis || 'ldm'
  const alloc = allocationShares(orders, basisReq, cur)
  const ownPart = allocateAmount(r2(direct - lines.distribution), alloc.shares)
  const distCts = liveCts.filter((x) => x.purpose === 'distribution')
  const dist = distributionCosts(distCts, ctx.links, ordersById, alloc.basis === 'equal' ? 'ldm' : alloc.basis, cur)
  const distAssigned = r2(Object.values(dist.byOrder).reduce((s, v) => s + v, 0))
  // distribuția fără marfă bifată se împarte ca restul costurilor
  const distLeft = allocateAmount(r2(lines.distribution - distAssigned), alloc.shares)
  const byOrder = {}
  for (const o of orders) {
    const rv = revenue.byOrder.find((x) => x.id === o.id)
    const own = r2((ownPart[o.id] || 0) + (distLeft[o.id] || 0))
    const d = dist.byOrder[o.id] || 0
    const rev = rv?.ok ? rv.value : 0
    byOrder[o.id] = { client_id: o.client_id || null, revenue: rev, ownCost: own, distribution: d, cost: r2(own + d), profit: r2(rev - own - d), share: alloc.shares[o.id] || 0 }
  }

  const warnings = []
  if (missingFx.length) warnings.push('fx')
  if (perDiem?.missingRate.length) warnings.push('perDiemRate')
  if (perDiem?.missingFx) warnings.push('perDiemFx')
  if (trip?.kind !== 'subcontracted' && !trip?.end_at) warnings.push('running')
  if (consumption && ref && consumption > ref * 1.1) warnings.push('consumption')

  return {
    currency: cur,
    revenue: revenue.total,
    orders: revenue.count,
    lines,
    direct,
    contribution,
    marginPct: revenue.total > 0 ? Math.round((contribution / revenue.total) * 1000) / 10 : null,
    km,
    liters,
    consumption,
    refConsumption: ref,
    costPerKm: km > 0 ? Math.round((direct / km) * 1000) / 1000 : null,
    revenuePerKm: km > 0 ? Math.round((revenue.total / km) * 1000) / 1000 : null,
    perDiem,
    basis: alloc.basis,
    basisFallback: alloc.fallback,
    byOrder,
    missingFx,
    warnings,
  }
}

// ---------------------------------------------------------------------
// Luni, zile, costuri lunare
// ---------------------------------------------------------------------
export const monthKey = (x) => (x ? (typeof x === 'string' && /^\d{4}-\d{2}/.test(x) && x.length <= 10 ? x.slice(0, 7) : localDay(x).slice(0, 7)) : '')
const localDay = (x) => { const d = new Date(x); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const dayNum = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000 }
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  const first = `${ym}-01`
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { first, last, days: dayNum(last) - dayNum(first) + 1 }
}
// Câte zile calendaristice (inclusiv) dintr-un interval [from, to] cad în luna ym. Date ISO (YYYY-MM-DD) sau momente.
export function daysInMonth(from, to, ym) {
  if (!from) return 0
  const { first, last } = monthRange(ym)
  const a = Math.max(dayNum(asDay(from)), dayNum(first))
  const b = Math.min(dayNum(asDay(to || '9999-12-31')), dayNum(last))
  return b >= a ? b - a + 1 : 0
}
const asDay = (x) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : localDay(x))

// Partea dintr-un cost fix care cade în lună (proporțional cu zilele de valabilitate din lună)
export function fixedCostInMonth(fc, ym, cur = 'EUR') {
  const days = daysInMonth(fc.valid_from, fc.valid_to, ym)
  if (!days) return { value: 0, ok: true }
  const part = num(fc.amount_month) * (days / monthRange(ym).days)
  return convert(part, fc.currency || 'EUR', cur, fc.fx_rate)
}

// Costul angajatorului pe lună dintr-o fișă de salariu: cel trecut explicit sau brut × (1 + procent taxe)
export function monthlyEmployerCost(p) {
  if (!p) return 0
  const explicit = num(p.employer_cost_month)
  if (explicit > 0) return explicit
  return r2(num(p.monthly_gross) * (1 + num(p.employer_pct) / 100))
}
// Costul unui șofer într-o lună: rândul din „Salarii pe lună" (dacă există), altfel fișa de salariu
export function driverMonthCost(driverId, ym, payrollMonths, pay, cur = 'EUR', fx = null) {
  const pm = (payrollMonths || []).find((p) => p.driver_id === driverId && String(p.month).slice(0, 7) === ym)
  if (pm) {
    const total = num(pm.total_cost) > 0 ? num(pm.total_cost) : num(pm.gross) + num(pm.employer_taxes) + num(pm.bonus)
    return { ...convert(total, pm.currency || 'RON', cur, pm.fx_rate || fx), source: 'month' }
  }
  const p = (pay || []).find((x) => x.driver_id === driverId)
  if (!p) return { value: 0, ok: true, source: 'none' }
  return { ...convert(monthlyEmployerCost(p), p.currency || 'RON', cur, fx), source: 'pay' }
}

// Cheltuielile generale ale firmei (pagina Cheltuieli) care cad în lună, net de TVA deductibil
export function overheadInMonth(rows, ym, cur = 'EUR') {
  const { first, last, days: mDays } = monthRange(ym)
  let total = 0
  for (const c of rows || []) {
    const gross = num(c.amount_gross)
    if (!gross || !c.start_on) continue
    let vat = 0
    if (num(c.vat_amount) > 0) vat = num(c.vat_amount)
    else if (num(c.vat_rate) > 0) vat = gross - gross / (1 + num(c.vat_rate))
    const net = c.vat_deductible === false ? gross : gross - vat
    let part = 0
    if (c.cost_type === 'Recurent lunar' || c.cost_type === 'Recurent anual') {
      const d = daysInMonth(c.start_on, c.end_on, ym)
      part = (c.cost_type === 'Recurent anual' ? net / 12 : net) * (d / mDays)
    } else if (c.cost_type === 'Unic - one time cost') {
      part = c.start_on >= first && c.start_on <= last ? net : 0
    } else if (c.cost_type === 'Unic - amortizat') {
      const n = num(c.period_count)
      if (n > 0) {
        const span = c.period_unit === 'Luni' ? n * 30.4375 : n * 7
        const endDay = new Date((dayNum(c.start_on) + Math.round(span) - 1) * 86400000).toISOString().slice(0, 10)
        part = net * (daysInMonth(c.start_on, endDay, ym) / Math.round(span))
      }
    }
    if (part) total += convert(part, c.currency || 'RON', cur, c.fx_rate).value
  }
  return r2(total)
}

// ---------------------------------------------------------------------
// Profitul pe lună: camioane, șoferi, clienți, flotă
// ---------------------------------------------------------------------
// input = {
//   ym, cur, fx,
//   trips: [{ trip, pnl }]        toate cursele (pnl = tripPnL), nu doar cele din lună
//   truckItems: [{ item, value }] costurile camioanelor nelegate de cursă (truckMonth + unallocated), deja în moneda de raportare
//   fixedCosts, payrollMonths, pay, drivers, trucks, overhead (număr, în moneda de raportare)
// }
export function monthReport(input) {
  const { ym, cur = 'EUR', fx = null } = input
  const inMonth = (input.trips || []).filter(({ trip }) => trip.status !== 'Anulată' && monthKey(trip.start_at || trip.load_date) === ym)
  const truckRow = (id) => ({ truck_id: id, trips: 0, km: 0, revenue: 0, direct: 0, contribution: 0, fixed: 0, other: 0, salary: 0, profit: 0 })
  const trucks = {}
  const T = (id) => (trucks[id] ||= truckRow(id))
  for (const t of input.trucks || []) if (t.status !== 'Inactiv') T(t.id)

  const drivers = {}
  const D = (id) => (drivers[id] ||= { driver_id: id, trips: 0, days: 0, revenue: 0, contribution: 0, salary: 0, profit: 0 })
  const clients = {}
  const C = (id) => (clients[id || 'none'] ||= { client_id: id || null, orders: 0, revenue: 0, cost: 0, profit: 0 })

  let sub = { trips: 0, revenue: 0, direct: 0, contribution: 0 }
  for (const { trip, pnl } of inMonth) {
    const own = trip.kind !== 'subcontracted' && trip.truck_id
    if (own) {
      const r = T(trip.truck_id)
      r.trips += 1; r.km += pnl.km; r.revenue = r2(r.revenue + pnl.revenue); r.direct = r2(r.direct + pnl.direct); r.contribution = r2(r.contribution + pnl.contribution)
    } else {
      sub = { trips: sub.trips + 1, revenue: r2(sub.revenue + pnl.revenue), direct: r2(sub.direct + pnl.direct), contribution: r2(sub.contribution + pnl.contribution) }
    }
    const ds = [trip.driver_id, trip.driver2_id].filter(Boolean)
    ds.forEach((d) => {
      const r = D(d)
      r.trips += 1
      r.revenue = r2(r.revenue + pnl.revenue / ds.length)
      r.contribution = r2(r.contribution + pnl.contribution / ds.length)
    })
    for (const o of Object.values(pnl.byOrder || {})) {
      const r = C(o.client_id)
      r.orders += 1; r.revenue = r2(r.revenue + o.revenue); r.cost = r2(r.cost + o.cost); r.profit = r2(r.profit + o.profit)
    }
  }

  // costuri fixe și alte costuri ale camionului în lună
  let fixedTotal = 0
  const missingFx = []
  for (const fc of input.fixedCosts || []) {
    const v = fixedCostInMonth(fc, ym, cur)
    if (!v.ok) { missingFx.push(fc.id); continue }
    if (!v.value) continue
    fixedTotal = r2(fixedTotal + v.value)
    if (fc.truck_id) T(fc.truck_id).fixed = r2(T(fc.truck_id).fixed + v.value)
  }
  let otherNoTruck = 0
  for (const { item, value } of input.truckItems || []) {
    if (monthKey(whenOf(item)) !== ym) continue
    if (item.truck_id) T(item.truck_id).other = r2(T(item.truck_id).other + value)
    else otherNoTruck = r2(otherNoTruck + value)
  }

  // salariul fiecărui șofer, împărțit pe camioane după zilele condusă în lună (toate cursele care ating luna)
  const daysOn = {} // driver -> truck -> zile
  for (const { trip } of input.trips || []) {
    if (!ownTrip(trip) || !trip.truck_id || !trip.start_at) continue
    const end = trip.end_at || new Date().toISOString()
    const n = daysInMonth(trip.start_at, end, ym)
    if (!n) continue
    for (const d of [trip.driver_id, trip.driver2_id].filter(Boolean)) {
      ((daysOn[d] ||= {})[trip.truck_id] = (daysOn[d][trip.truck_id] || 0) + n)
    }
  }
  let salaries = 0
  let unassignedSalary = 0
  const driverIds = new Set([...(input.drivers || []).filter((d) => d.status !== 'Inactiv').map((d) => d.id), ...Object.keys(drivers), ...Object.keys(daysOn)])
  for (const d of driverIds) {
    const c = driverMonthCost(d, ym, input.payrollMonths, input.pay, cur, fx)
    if (!c.ok) { missingFx.push(d); continue }
    if (!c.value && !drivers[d]) continue
    salaries = r2(salaries + c.value)
    const r = D(d)
    r.salary = c.value
    const per = daysOn[d] || {}
    const total = Object.values(per).reduce((s, v) => s + v, 0)
    r.days = total
    if (!total) { unassignedSalary = r2(unassignedSalary + c.value); continue }
    const parts = allocateAmount(c.value, Object.fromEntries(Object.entries(per).map(([tk, n]) => [tk, n / total])))
    for (const [tk, v] of Object.entries(parts)) T(tk).salary = r2(T(tk).salary + v)
  }

  for (const r of Object.values(trucks)) r.profit = r2(r.contribution - r.fixed - r.other - r.salary)
  for (const r of Object.values(drivers)) r.profit = r2(r.contribution - r.salary)

  const ownRows = Object.values(trucks)
  const sum = (k) => r2(ownRows.reduce((s, r) => s + r[k], 0))
  const contribution = r2(sum('contribution') + sub.contribution)
  const truckOther = r2(sum('other') + otherNoTruck)
  const fleetProfit = r2(contribution - fixedTotal - truckOther - salaries)
  const overhead = r2(num(input.overhead))
  return {
    ym,
    currency: cur,
    trucks: ownRows,
    drivers: Object.values(drivers),
    clients: Object.values(clients).sort((a, b) => b.profit - a.profit),
    subcontracted: sub,
    total: {
      trips: inMonth.length,
      revenue: r2(sum('revenue') + sub.revenue),
      direct: r2(sum('direct') + sub.direct),
      contribution,
      fixed: fixedTotal,
      truckOther,
      salaries,
      unassignedSalary,
      fleetProfit,
      overhead,
      netProfit: r2(fleetProfit - overhead),
      km: sum('km'),
    },
    missingFx,
  }
}
