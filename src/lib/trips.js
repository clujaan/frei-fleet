// Curse: constante și calcule (aceleași reguli ca foaia "Curse" din Excel).
import { round2 } from './format'
import { makeEntityApi } from './entityApi'

export const SERVICE_TYPES = ['FTL intern', 'FTL internațional', 'LTL intern', 'LTL internațional']
export const TRIP_STATUSES = ['Planificată', 'În curs', 'Livrată', 'Facturată', 'Încasată', 'Anulată']
export const TRIP_STYLE = {
  Planificată: 'border-slate-300 bg-slate-100 text-slate-600',
  'În curs': 'border-sky-300 bg-sky-50 text-sky-700',
  Livrată: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  Facturată: 'border-amber-300 bg-amber-50 text-amber-700',
  Încasată: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  Anulată: 'border-rose-300 bg-rose-50 text-rose-700',
}

const num = (x) => {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

// Convertește o sumă în RON și EUR. Cursul e necesar doar dacă moneda sumei diferă de moneda cerută.
const conv = (amount, cur, fx) => {
  const a = num(amount)
  if (!a) return { ron: 0, eur: 0, missing: false, ronOk: true, eurOk: true }
  const f = num(fx)
  if (cur === 'EUR') return { ron: f > 0 ? round2(a * f) : 0, eur: a, missing: !(f > 0), ronOk: f > 0, eurOk: true }
  return { ron: a, eur: f > 0 ? round2(a / f) : 0, missing: false, ronOk: true, eurOk: f > 0 }
}

export function calcTrip(t) {
  const rev = conv(t.revenue, t.revenue_currency || 'RON', t.fx_rate)
  const cost = conv(t.cost, t.cost_currency || 'RON', t.fx_rate)
  const marginRon = round2(rev.ron - cost.ron)
  const marginEur = round2(rev.eur - cost.eur)
  return {
    revenueRon: rev.ron, revenueEur: rev.eur, costRon: cost.ron, costEur: cost.eur,
    marginRon, marginEur, marginPct: rev.ron ? marginRon / rev.ron : null,
    fxMissing: rev.missing || cost.missing,
    // RON / EUR se pot afișa doar dacă toate sumele sunt în acea monedă sau există curs
    ronOk: rev.ronOk && cost.ronOk, eurOk: rev.eurOk && cost.eurOk,
    marginPctEur: rev.eur ? marginEur / rev.eur : null,
  }
}

export function checkTrip(t, calc = calcTrip(t)) {
  const w = []
  if (!t.client_id) w.push('client')
  if (!t.load_date) w.push('load')
  if (!t.service_type) w.push('service')
  if (!calc.ronOk && !calc.eurOk) w.push('fx') // sume în monede diferite, fără curs
  if (t.unload_date && t.load_date && t.unload_date < t.load_date) w.push('dates')
  if (t.status !== 'Anulată' && t.status !== 'Planificată' && num(t.cost) === 0) w.push('noCost')
  return w
}

// Cursul BNR: vezi lib/bnr.js
export { fetchBnrRate } from './bnr'

const TRIPS_BASE = makeEntityApi({
  table: 'trips', prefix: 'CR', pad: 4, seed: [],
  fields: [
    { key: 'client_id' }, { key: 'carrier_id' }, { key: 'offer_id' },
    { key: 'load_date', type: 'date' }, { key: 'unload_date', type: 'date' }, { key: 'load_date_alt', type: 'date' }, { key: 'unload_date_alt', type: 'date' },
    { key: 'load_company' }, { key: 'load_street' }, { key: 'load_zip' }, { key: 'load_city' }, { key: 'load_county' }, { key: 'load_country' }, { key: 'load_contact' }, { key: 'load_phone' },
    { key: 'unload_company' }, { key: 'unload_street' }, { key: 'unload_zip' }, { key: 'unload_city' }, { key: 'unload_county' }, { key: 'unload_country' }, { key: 'unload_contact' }, { key: 'unload_phone' },
    { key: 'extra_loads', type: 'json' }, { key: 'extra_unloads', type: 'json' },
    { key: 'load_window' }, { key: 'unload_window' }, { key: 'load_ref' }, { key: 'unload_ref' }, { key: 'load_goods', type: 'json' }, { key: 'unload_goods', type: 'json' },
    { key: 'km', type: 'number' },
    { key: 'service_type' },
    { key: 'revenue_currency' }, { key: 'revenue', type: 'number' },
    { key: 'cost_currency' }, { key: 'cost', type: 'number' }, { key: 'fx_rate', type: 'number' },
    { key: 'carrier_paid_on', type: 'date' }, { key: 'client_invoice_no' },
    { key: 'status' }, { key: 'notes' },
    // cursa-circuit (migrarea 0003)
    { key: 'kind' }, { key: 'truck_id' }, { key: 'trailer_id' }, { key: 'driver_id' }, { key: 'driver2_id' },
    { key: 'start_at' }, { key: 'end_at' }, { key: 'km_start', type: 'number' }, { key: 'km_end', type: 'number' },
    { key: 'countries', type: 'json' }, { key: 'allocation_basis' },
  ],
})

// Cursa proprie (bază -> ... -> bază): 4 stări. Valorile din baza de date rămân cele vechi; pe ecran se văd etichetele noi.
export const OWN_STATUSES = ['Planificată', 'În curs', 'Livrată', 'Anulată']

export const TRIPS_API = TRIPS_BASE

// Valorile din baza de date rămân neschimbate; pe ecran „În curs" se vede „În desfășurare" și „Livrată" se vede „Încheiată".
const STATUS_LABEL = { Planificată: ['Planificată', 'Planned'], 'În curs': ['În desfășurare', 'In progress'], Livrată: ['Încheiată', 'Completed'], Facturată: ['Facturată', 'Invoiced'], Încasată: ['Încasată', 'Paid'], Anulată: ['Anulată', 'Cancelled'] }
export const tripStatusLabel = (s, lang = 'ro') => (STATUS_LABEL[s] || [s, s])[lang === 'en' ? 1 : 0]

// Corespondența statusurilor: comandă de transport → cursă. Facturată / Încasată / Anulată ale cursei nu se ating din comandă.
export const TRIP_FROM_ORDER = { Ciornă: 'Planificată', Trimisă: 'Planificată', Confirmată: 'Planificată', 'Semnată încărcată': 'În curs', Executată: 'Livrată' }
export const TRIP_OPERATIONAL = ['Planificată', 'În curs', 'Livrată']

// Transportatorul, costul și statusul operațional al cursei vin din comanda de transport activă.
// order = rândul comenzii; gone = true dacă s-a șters. Comanda Anulată sau ștearsă eliberează transportatorul și costul (statusul cursei nu se schimbă).
export async function syncTripFromOrder(order, gone = false) {
  // doar CT-ul care subcontractează o cursă întreagă; CT-urile de distribuție nu ating cursa proprie
  if (!order?.trip_id || (order.purpose && order.purpose !== 'subcontracted_trip')) return
  const rows = await TRIPS_BASE.list()
  const trip = rows.find((x) => x.id === order.trip_id)
  if (!trip || trip.kind !== 'subcontracted') return
  const active = !gone && order.status !== 'Anulată'
  const patch = {}
  if (active) {
    const price = num(order.price)
    const cost = price > 0 ? price : null
    const cur = order.currency || 'EUR'
    const carrier = order.carrier_id || null
    if ((trip.cost == null ? null : num(trip.cost)) !== cost || trip.cost_currency !== cur || (trip.carrier_id || null) !== carrier) Object.assign(patch, { cost, cost_currency: cur, carrier_id: carrier })
    const st = TRIP_FROM_ORDER[order.status]
    if (st && TRIP_OPERATIONAL.includes(trip.status) && trip.status !== st) patch.status = st
  } else if (num(trip.cost) > 0 || trip.carrier_id) {
    Object.assign(patch, { cost: null, carrier_id: null })
  }
  if (Object.keys(patch).length) await TRIPS_BASE.save(trip.id, { ...trip, ...patch })
}
