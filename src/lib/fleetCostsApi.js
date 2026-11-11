// Etapa 4: citirea / salvarea costurilor flotei și pregătirea datelor pentru calculul profitului (src/lib/fleetCosts.js).
import { supabase, isDemo } from './supabase'
import { makeEntityApi } from './entityApi'
import { getCompany } from './company'
import { TRIPS_API } from './trips'
import { CLIENT_ORDERS_API } from './clientOrders'
import { CT_GOODS_API, ORDERS_API } from './orders'
import { DRIVERS_API, PAY_API, PER_DIEM_API, TRUCKS_API } from './fleet'
import { costsApi } from './costsApi'
import { costValue, fuelLedger, overheadInMonth, monthReport, splitByTrip, tripPnL } from './fleetCosts'

export const COSTS_API = makeEntityApi({
  table: 'costs', prefix: 'CO', pad: 4, seed: [], orderBy: 'occurred_at',
  fields: [
    { key: 'occurred_at' }, { key: 'category' }, { key: 'paid_by' }, { key: 'vendor' }, { key: 'doc_no' },
    { key: 'amount', type: 'number' }, { key: 'vat_amount', type: 'number' }, { key: 'currency' }, { key: 'fx_rate', type: 'number' },
    { key: 'truck_id' }, { key: 'driver_id' }, { key: 'trip_id' }, { key: 'alloc_mode' }, { key: 'country' },
    { key: 'liters', type: 'number' }, { key: 'odometer', type: 'number' }, { key: 'source' }, { key: 'import_key' }, { key: 'notes' },
  ],
})

export const FUEL_API = makeEntityApi({
  table: 'fuel_stock_movements', prefix: 'RZ', pad: 4, seed: [], orderBy: 'moved_at',
  fields: [
    { key: 'moved_at' }, { key: 'kind' }, { key: 'liters', type: 'number' }, { key: 'unit_price', type: 'number' }, { key: 'currency' },
    { key: 'fx_rate', type: 'number' }, { key: 'vendor' }, { key: 'doc_no' }, { key: 'truck_id' }, { key: 'odometer', type: 'number' },
    { key: 'trip_id' }, { key: 'alloc_mode' }, { key: 'notes' },
  ],
})

export const FIXED_API = makeEntityApi({
  table: 'fixed_costs', prefix: 'CF', pad: 3, seed: [],
  fields: [
    { key: 'truck_id' }, { key: 'trailer_id' }, { key: 'kind' }, { key: 'amount_month', type: 'number' }, { key: 'currency' },
    { key: 'fx_rate', type: 'number' }, { key: 'valid_from', type: 'date' }, { key: 'valid_to', type: 'date' }, { key: 'notes' },
  ],
})

// Salarii pe lună: protejate în baza de date (doar patron; contabil dacă e permis)
export const PAYROLL_API = makeEntityApi({
  table: 'payroll_months', prefix: 'SL', pad: 3, seed: [], orderBy: 'month', noUpdatedAt: false,
  fields: [
    { key: 'driver_id' }, { key: 'month', type: 'date' }, { key: 'gross', type: 'number' }, { key: 'employer_taxes', type: 'number' },
    { key: 'bonus', type: 'number' }, { key: 'total_cost', type: 'number' }, { key: 'currency' }, { key: 'fx_rate', type: 'number' }, { key: 'notes' },
  ],
})

const safe = (p, fallback = []) => p.catch(() => fallback)

// Tot ce trebuie pentru profit, o singură dată. Erorile pe tabele lipsă (ex. demo) dau liste goale.
export async function loadFleetData() {
  const canPay = await PAY_API.canSee().catch(() => false)
  const [trips, orders, cts, links, costs, moves, rates, trucks, drivers, fixed, payroll, pay, overhead] = await Promise.all([
    safe(TRIPS_API.list()), safe(CLIENT_ORDERS_API.list()), safe(ORDERS_API.list()), safe(CT_GOODS_API.list()),
    safe(COSTS_API.list()), safe(FUEL_API.list()), safe(PER_DIEM_API.list()), safe(TRUCKS_API.list()), safe(DRIVERS_API.list()),
    safe(FIXED_API.list()), canPay ? safe(PAYROLL_API.list()) : [], canPay ? safe(PAY_API.list()) : [], safe(costsApi.list()),
  ])
  return { trips, orders, cts, links, costs, moves, rates, trucks, drivers, fixed, payroll, pay, overhead, canPay }
}

// Cursul de rezervă pentru sumele fără curs propriu (diurnă, salarii în RON): ultimul curs de pe comenzi
const fallbackFx = (orders) => {
  const o = [...(orders || [])].filter((x) => Number(x.fx_rate) > 0).sort((a, b) => String(b.order_date || '').localeCompare(String(a.order_date || '')))[0]
  return o ? Number(o.fx_rate) : null
}

// Calculează profitul tuturor curselor + ce a rămas nealocat. cur = moneda de raportare.
export function computeFleet(data, cur = getCompany().report_currency || 'EUR', now = Date.now()) {
  const fx = fallbackFx(data.orders)
  const defaultBasis = getCompany().cost_allocation_basis || 'ldm'
  const ledger = fuelLedger(data.moves, cur)
  const outs = (data.moves || []).filter((m) => m.kind === 'out')
  const costSplit = splitByTrip(data.costs, data.trips, now)
  const fuelSplit = splitByTrip(outs, data.trips, now)
  const truckById = Object.fromEntries((data.trucks || []).map((t) => [t.id, t]))
  const pnlById = {}
  const rows = []
  for (const trip of data.trips || []) {
    const pnl = tripPnL(trip, {
      orders: (data.orders || []).filter((o) => o.trip_id === trip.id),
      costs: costSplit.byTrip[trip.id] || [],
      fuelOuts: (fuelSplit.byTrip[trip.id] || []).map((m) => ({ id: m.id, ...(ledger.outs[m.id] || { liters: Number(m.liters) || 0, cost: 0 }) })),
      cts: (data.cts || []).filter((c) => c.trip_id === trip.id),
      links: data.links,
      rates: data.rates,
      fx,
      refConsumption: truckById[trip.truck_id]?.ref_consumption,
      defaultBasis,
      cur,
      now,
    })
    pnlById[trip.id] = pnl
    rows.push({ trip, pnl })
  }
  // costurile camionului care nu țin de o cursă: marcate „lunar" + cele nealocate (valoare în moneda de raportare)
  const toItem = (it) => ({ item: it, value: it.kind === 'out' ? ledger.outs[it.id]?.cost || 0 : costValue(it, cur).value })
  const truckItems = [...costSplit.truckMonth, ...costSplit.unallocated, ...fuelSplit.truckMonth, ...fuelSplit.unallocated].map(toItem)
  return {
    cur, fx, ledger, pnlById, rows, truckItems,
    unallocated: [...costSplit.unallocated, ...fuelSplit.unallocated],
    month: (ym) => monthReport({ ym, cur, fx, trips: rows, truckItems, fixedCosts: data.fixed, payrollMonths: data.payroll, pay: data.pay, drivers: data.drivers, trucks: data.trucks, overhead: overheadInMonth(data.overhead, ym, cur) }),
  }
}

// Mutare rapidă din lista „Nealocate": legat de o cursă sau „cost lunar al camionului"
export async function setAllocation(item, mode, tripId = null) {
  const table = item.kind ? 'fuel_stock_movements' : 'costs'
  const patch = { alloc_mode: mode, trip_id: mode === 'trip' ? tripId : null, updated_at: new Date().toISOString() }
  if (isDemo) {
    const api = item.kind ? FUEL_API : COSTS_API
    return api.save(item.id, { ...item, ...patch })
  }
  const { error } = await supabase.from(table).update(patch).eq('id', item.id)
  if (error) throw new Error(error.message)
}
