import { useEffect, useState } from 'react'
import { supabase, isDemo } from './supabase'
import { TRIPS_API } from './trips'
import { ORDERS_API } from './orders'
import { CLIENTS } from './entities'
import { routeLabel } from './places'
import { costsApi } from './costsApi'
import { calcCost, mondayOf } from './costs'
import { computePeriod, weekInfo, weeksOfYear } from './pl'
import { todayISO } from './format'

// Valorile din dashboard. `null` = încă nu avem date pentru acel indicator
// (modulul respectiv nu e construit sau tabelul e gol). Pe măsură ce construim
// modulele, completăm câte un indicator.
const EMPTY = {
  weekProfit: null,
  cumProfit: null,
  weekRevenue: null,
  weekCost: null,
  receivable: null,
  overdue: null,
  recurring: null,
  leadsNew: null,
  clientsNew: null,
  tripsWeek: null,
  offersActive: null,
  dueSteps: [],
  tripsRunning: [],
  alerts: [],
  weeks: [],
  updatedAt: new Date(),
}

const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString()

async function count(table, build) {
  try {
    const q = build(supabase.from(table).select('id', { count: 'exact', head: true }))
    const { count: c, error } = await q
    return error ? null : c
  } catch {
    return null
  }
}

const monthEnd = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

// Casetele Financiar, în EUR, din aceleași date ca P&L-ul (curse după data încărcării + cheltuieli generale)
async function loadFinance() {
  try {
    const [trips, costs, orders, clients] = await Promise.all([TRIPS_API.list(), costsApi.list(), ORDERS_API.list().catch(() => null), CLIENTS.api.list().catch(() => [])])
    const ctTrips = orders ? new Set(orders.filter((x) => x.trip_id && x.status !== 'Anulată').map((x) => x.trip_id)) : undefined
    const data = { trips, costs, ctTrips }
    const cName = Object.fromEntries(clients.map((c) => [c.id, c.company]))
    // „în desfășurare" = curse cu statusul În desfășurare (stocat „În curs"): camionul a plecat din bază și nu s-a întors
    const tripsRunning = trips.filter((x) => x.status === 'În curs')
      .sort((a, b) => String(a.start_at || a.load_date).localeCompare(String(b.start_at || b.load_date)))
      .map((x) => ({ title: `${x.code}${routeLabel(x) ? ' · ' + routeLabel(x) : cName[x.client_id] ? ' · ' + cName[x.client_id] : ''}`, meta: `${String(x.start_at || x.load_date || '').slice(0, 10)} · ÎN DESFĂȘURARE`, to: '/curse' }))
    const nowMonday = mondayOf(todayISO())
    const weeks = weeksOfYear(weekInfo(nowMonday).year).filter((w) => w.monday <= nowMonday)
    const week = weeks.filter((w) => w.monday === nowMonday)
    const w = computePeriod(week, data, 'EUR')
    const ytd = computePeriod(weeks, data, 'EUR')
    // costuri recurente active în luna curentă (net, fără TVA deductibil), în EUR; anualele se împart la 12
    const ym = todayISO().slice(0, 7)
    const recurring = costs.reduce((s, c) => {
      if (c.cost_type !== 'Recurent lunar' && c.cost_type !== 'Recurent anual') return s
      if (!c.start_on || c.start_on > monthEnd(ym) || (c.end_on && c.end_on < `${ym}-01`)) return s
      const k = calcCost(c)
      return s + (c.cost_type === 'Recurent anual' ? k.netEur / 12 : k.netEur)
    }, 0)
    return {
      weekProfit: w.profit,
      cumProfit: ytd.profit,
      weekRevenue: w.totalSales,
      weekCost: w.totalCosts + w.totalOverhead,
      recurring,
      tripsWeek: w.trips,
      tripsRunning,
    }
  } catch {
    return {}
  }
}

export function useDashboard() {
  const [data, setData] = useState(EMPTY)

  useEffect(() => {
    let alive = true
    loadFinance().then((f) => alive && setData((d) => ({ ...d, ...f, updatedAt: new Date() })))
    if (isDemo) return () => { alive = false }
    ;(async () => {
      const [leadsNew, clientsNew] = await Promise.all([
        count('leads', (q) => q.gte('created_at', daysAgo(7))),
        count('clients', (q) => q.gte('created_at', daysAgo(30))),
      ])
      let alerts = []
      try {
        const { data: unsent } = await supabase.from('expense_reports').select('code, employee, total_gross').eq('status', 'Emis')
        alerts = (unsent || []).map((r) => ({ title: `${r.code} · ${r.employee}`, meta: 'NETRIMIS' }))
      } catch {
        /* tabel indisponibil */
      }
      try {
        const { data: due } = await supabase.from('leads').select('code, company, next_step, next_step_date').in('stage', ['Nou', 'Contactat', 'Ofertă trimisă', 'Negociere']).lte('next_step_date', new Date().toISOString().slice(0, 10)).order('next_step_date').limit(10)
        alerts = [...alerts, ...(due || []).map((r) => ({ title: `${r.code} · ${r.company}${r.next_step ? ' · ' + r.next_step : ''}`, meta: 'PAS SCADENT' }))]
      } catch {
        /* lead-uri indisponibile */
      }
      if (alive) setData((d) => ({ ...d, leadsNew, clientsNew, alerts, updatedAt: new Date() }))
    })()
    return () => {
      alive = false
    }
  }, [])

  return data
}
