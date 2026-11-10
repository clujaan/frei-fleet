// P&L săptămânal / lunar / anual. Veniturile și costurile de transport intră în săptămâna DATEI DE ÎNCĂRCARE;
// overheads = Cheltuieli generale alocate pe săptămâni (inclusiv amortizările). Săptămâni ISO (luni–duminică).
import { addDays, calcCost, mondayOf } from './costs'
import { todayISO } from './format'
import { calcTrip, SERVICE_TYPES } from './trips'
import { CATEGORIES } from './costs'

const toUTC = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
// Informații ISO pentru o zi de luni: an ISO, nr. săptămână, luna (după joi), data de duminică
export function weekInfo(monday) {
  const thu = addDays(monday, 3)
  const jan1 = `${thu.slice(0, 4)}-01-01`
  const day = Math.round((toUTC(thu) - toUTC(jan1)) / 86400000) + 1
  return { monday, sunday: addDays(monday, 6), year: Number(thu.slice(0, 4)), week: Math.ceil(day / 7), month: thu.slice(0, 7) }
}
// Anul ISO al săptămânii curente (în primele zile din ianuarie poate fi încă anul trecut)
export const YEAR = weekInfo(mondayOf(todayISO())).year
export const FIRST_YEAR = 2026
export const weeksOfYear = (year = YEAR) => {
  const out = []
  let m = mondayOf(`${year}-01-04`) // 4 ian e mereu în săptămâna ISO 1
  while (weekInfo(m).year === year) { out.push(weekInfo(m)); m = addDays(m, 7) }
  return out
}
export const weeksOfMonth = (month) => weeksOfYear(Number(month.slice(0, 4))).filter((w) => w.month === month)

// perioada = listă de săptămâni consecutive
export function periodOf(kind, key) {
  if (kind === 'week') return weeksOfYear(weekInfo(key).year).filter((w) => w.monday === key)
  if (kind === 'month') return weeksOfMonth(key)
  return weeksOfYear(Number(key) || YEAR)
}

export function previousPeriod(kind, key) {
  if (kind === 'week') { const p = addDays(key, -7); return { kind, key: p, weeks: periodOf('week', p) } }
  if (kind === 'month') {
    const [y, m] = key.split('-').map(Number)
    const p = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    return y - 1 < FIRST_YEAR && m === 1 ? { kind, key: null, weeks: [] } : { kind, key: p, weeks: periodOf('month', p) }
  }
  const py = (Number(key) || YEAR) - 1
  return py < FIRST_YEAR ? { kind, key: null, weeks: [] } : { kind, key: String(py), weeks: periodOf('year', String(py)) }
}

export const UNTYPED = 'Fără tip'

// data: { trips:[], costs:[] } ; weeks: [{monday,sunday}] ; cur: 'RON' | 'EUR'
export function computePeriod(weeks, data, cur = 'RON') {
  const out = { sales: {}, costs: {}, overhead: {}, trips: 0, noCt: 0, fxTrips: 0, fxCosts: 0 }
  SERVICE_TYPES.forEach((s) => { out.sales[s] = 0; out.costs[s] = 0 })
  if (!weeks.length) return finish(out)
  const from = weeks[0].monday
  const to = weeks[weeks.length - 1].sunday
  const key = cur === 'EUR' ? 'Eur' : 'Ron'
  for (const t of data.trips) {
    if (t.status === 'Anulată' || !t.load_date || t.load_date < from || t.load_date > to) continue
    // intră în P&L doar cursele care au comandă de transport activă (cost și transportator confirmate)
    if (data.ctTrips && !data.ctTrips.has(t.id)) { out.noCt += 1; continue }
    const c = calcTrip(t)
    const s = t.service_type || UNTYPED
    out.sales[s] = (out.sales[s] || 0) + c[`revenue${key}`]
    out.costs[s] = (out.costs[s] || 0) + c[`cost${key}`]
    out.trips += 1
    if (c.fxMissing) out.fxTrips += 1
  }
  for (const g of data.costs) {
    const c = calcCost(g)
    if (!c.firstWeek || !c.lastWeek) continue
    const perWeek = cur === 'EUR' ? c.perWeekEur : c.perWeekRon
    if (cur === 'EUR' && c.perWeekEur === 0 && c.perWeekRon > 0) out.fxCosts += 1
    if (!perWeek) continue
    const cat = g.category || 'Altele'
    for (const w of weeks) {
      if (w.monday >= c.firstWeek && w.monday <= c.lastWeek) out.overhead[cat] = (out.overhead[cat] || 0) + perWeek
    }
  }
  return finish(out)
}

const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0)
function finish(o) {
  o.totalSales = sum(o.sales)
  o.totalCosts = sum(o.costs)
  o.grossMargin = o.totalSales - o.totalCosts
  o.totalOverhead = sum(o.overhead)
  o.profit = o.grossMargin - o.totalOverhead
  o.salaries = o.overhead.Salarii || 0
  return o
}

const pct = (v, base) => (base ? v / base : null)
// variație procentuală limitată la ±200% (ca în foaia de referință)
export function varPct(cur, prev) {
  if (!prev) return null
  const v = (cur - prev) / Math.abs(prev)
  return Math.max(-2, Math.min(2, v))
}

// Construiește rândurile raportului: { kind:'section'|'line'|'total'|'key', label, cur, prev, pctCur, pctPrev, varAbs, varPct }
export function buildRows(cur, prev) {
  const rows = []
  const add = (kind, label, c, p, base = true) => rows.push({
    kind, label, cur: c, prev: p,
    pctCur: base ? pct(c, cur.totalSales) : null, pctPrev: base ? pct(p, prev.totalSales) : null,
    varAbs: c - p, varPct: varPct(c, p),
  })
  rows.push({ kind: 'section', label: 'SALES · Vânzări' })
  const svc = [...SERVICE_TYPES, ...(cur.sales[UNTYPED] || prev.sales[UNTYPED] ? [UNTYPED] : [])]
  svc.forEach((s) => add('line', s, cur.sales[s] || 0, prev.sales[s] || 0))
  add('total', 'TOTAL SALES', cur.totalSales, prev.totalSales)
  rows.push({ kind: 'section', label: 'LESS · Costuri transport' })
  svc.forEach((s) => add('line', `Costuri ${s}`, cur.costs[s] || 0, prev.costs[s] || 0))
  add('total', 'TOTAL COSTS', cur.totalCosts, prev.totalCosts)
  add('key', 'GROSS MARGIN', cur.grossMargin, prev.grossMargin)
  rows.push({ kind: 'section', label: 'LESS · Overheads (Cheltuieli generale)' })
  const cats = [...new Set([...CATEGORIES, ...Object.keys(cur.overhead), ...Object.keys(prev.overhead)])].filter((c) => (cur.overhead[c] || 0) || (prev.overhead[c] || 0))
  cats.forEach((c) => add('line', c, cur.overhead[c] || 0, prev.overhead[c] || 0))
  add('total', 'TOTAL OVERHEAD', cur.totalOverhead, prev.totalOverhead)
  add('key', 'PROFIT', cur.profit, prev.profit)
  rows.push({
    kind: 'ratio', label: 'ROR (profit / vânzări)', cur: pct(cur.profit, cur.totalSales), prev: pct(prev.profit, prev.totalSales),
  })
  rows.push({
    kind: 'ratio', label: 'Salarii ca % din marja brută', cur: pct(cur.salaries, cur.grossMargin), prev: pct(prev.salaries, prev.grossMargin),
  })
  return rows
}
