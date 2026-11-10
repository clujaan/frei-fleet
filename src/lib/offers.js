// Burse și oferte: constante, calcule, import din excelul „Freight Offers Database”.
import { round2, todayISO } from './format'
import { makeEntityApi } from './entityApi'
import { foldText } from './costs'

export const EXCHANGES = ['Trans.eu', 'Timocom', 'Bursatransport.ro', 'Altă']
export const VEHICLES = ['Prelată', 'Frigorific', 'Megatrailer', 'Alt tip']
export const CURRENCIES = ['EUR', 'RON', 'SEK', 'NOK', 'DKK', 'PLN', 'Altă']
export const OFFER_STATUSES = ['Cerută', 'Ofertată', 'Acceptată', 'Respinsă', 'Fără răspuns', 'Expirată']
export const OFFER_STYLE = {
  Cerută: 'border-slate-300 bg-slate-100 text-slate-600',
  Ofertată: 'border-sky-300 bg-sky-50 text-sky-700',
  Acceptată: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  Respinsă: 'border-rose-300 bg-rose-50 text-rose-700',
  'Fără răspuns': 'border-amber-300 bg-amber-50 text-amber-700',
  Expirată: 'border-slate-300 bg-slate-100 text-slate-500',
}

export const OFFERS_API = makeEntityApi({
  table: 'freight_offers',
  prefix: 'OF',
  pad: 5,
  fields: [
    ['received_on', 'date'], ['exchange', 'text'], ['company', 'text'], ['contact_name', 'text'], ['phone', 'text'], ['email', 'text'],
    ['load_country', 'text'], ['load_place', 'text'], ['load_date', 'date'], ['load_date_alt', 'date'], ['unload_date_alt', 'date'], ['unload_country', 'text'], ['unload_place', 'text'], ['unload_date', 'date'],
    ['km', 'number'], ['cargo', 'text'], ['weight_t', 'number'], ['vehicle_type', 'text'], ['price', 'number'], ['currency', 'text'], ['status', 'text'], ['notes', 'text'],
    ['extra_loads', 'json'], ['extra_unloads', 'json'], ['carrier_quotes', 'json'],
  ].map(([key, type]) => ({ key, type })),
  seed: [
    { received_on: '2026-10-01', exchange: 'Trans.eu', company: 'UAB Gestus', contact_name: 'Jurek Masaro', load_country: 'DE', load_place: 'Hamburg 20095', load_date: '2026-10-05', unload_country: 'RO', unload_place: 'Cluj-Napoca 400001', unload_date: '2026-10-08', km: 1980, cargo: 'Marfă paletizată', weight_t: 24, vehicle_type: 'Prelată', price: 1650, currency: 'EUR', status: 'Ofertată' },
    { received_on: '2026-10-01', exchange: 'Trans.eu', company: 'UAB Gestus', contact_name: 'Jurek Masaro', load_country: 'RO', load_place: 'Râmnicu Vâlcea 240002', load_date: '2026-10-05', unload_country: 'LV', unload_place: 'Riga LV-1058', unload_date: '2026-10-07', km: 1935, cargo: 'Congelate', weight_t: 22, vehicle_type: 'Frigorific', price: 2200, currency: 'EUR', status: 'Ofertată' },
    { received_on: '2026-10-01', exchange: 'Timocom', company: 'Heinloth Transport GmbH', contact_name: 'Cetric Muller', load_country: 'RO', load_place: 'Bacău', load_date: '2026-10-05', unload_country: 'FI', unload_place: 'Siilinjärvi 71', unload_date: '2026-10-09', km: 2850, cargo: 'Marfă generală', weight_t: 20, vehicle_type: 'Prelată', price: 3600, currency: 'EUR', status: 'Ofertată' },
    { received_on: '2026-10-02', exchange: 'Timocom', company: 'UAB Baltic Transline', load_country: 'RO', load_place: 'Sighetu Marmației 435500', load_date: '2026-10-05', unload_country: 'DE', unload_place: 'Erfurt 99098', km: 1271, cargo: 'Frigo', weight_t: 15, vehicle_type: 'Frigorific', price: 1800, currency: 'EUR' },
  ],
})

const num = (x) => {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}
// Locuri suplimentare: [{ country, place, date, lat?, lon? }]
export const extraStops = (a) => (Array.isArray(a) ? a : [])
export const cleanExtraStops = (a) => extraStops(a)
  .map((x) => ({ country: String(x.country || '').trim().toUpperCase(), place: String(x.place || '').trim(), date: x.date || '', ...(Number.isFinite(x.lat) && Number.isFinite(x.lon) ? { lat: x.lat, lon: x.lon } : {}) }))
  .filter((x) => x.place || x.country)
// Rutul complet pentru listă: „Cluj + Oradea → Hamburg + Berlin”
export const routePlaces = (o) => ({
  from: [o.load_place, ...extraStops(o.extra_loads).map((x) => x.place)].filter(Boolean).join(' + '),
  to: [o.unload_place, ...extraStops(o.extra_unloads).map((x) => x.place)].filter(Boolean).join(' + '),
})
// Oferte primite de la transportatori pentru această ofertă (mai multe, de la firme care nu sunt neapărat în pagina Transportatori)
// [{ carrier, price, currency, curManual, exchange, ext_id, contact, email, phone }]
export const emptyQuote = (currency = 'EUR', exchange = '') => ({ carrier: '', price: '', currency, curManual: false, exchange, ext_id: '', contact: '', email: '', phone: '' })
const pnum = (x) => num(String(x ?? '').replace(',', '.'))
export const cleanQuotes = (a) => (Array.isArray(a) ? a : [])
  .map((q) => ({ ...emptyQuote(), ...q, carrier: String(q.carrier || '').trim(), price: String(q.price ?? '').trim() === '' ? null : pnum(q.price), ext_id: String(q.ext_id || '').trim(), contact: String(q.contact || '').trim(), email: String(q.email || '').trim(), phone: String(q.phone || '').trim() }))
  .filter((q) => q.carrier || q.price != null || q.ext_id || q.contact || q.email || q.phone)
export const quotesOf = (o) => (Array.isArray(o.carrier_quotes) ? o.carrier_quotes : []).filter((q) => q && (q.carrier || pnum(q.price) > 0))
// cea mai ieftină ofertă de transportator (în moneda ofertei dacă există, altfel cea mai mică valoare)
export const bestQuote = (o) => {
  const priced = quotesOf(o).filter((q) => pnum(q.price) > 0)
  if (!priced.length) return null
  const same = priced.filter((q) => q.currency === o.currency)
  const pool = same.length ? same : priced
  return pool.reduce((m, q) => (pnum(q.price) < pnum(m.price) ? q : m))
}
// marja = preț oferit − cea mai ieftină ofertă de transportator, doar când sunt în aceeași monedă
export const marginOf = (o) => {
  const b = bestQuote(o)
  if (!b || b.currency !== o.currency || !(num(o.price) > 0)) return null
  return round2(num(o.price) - pnum(b.price))
}
export const sortedQuotes = (o) => [...quotesOf(o)].sort((a, b) => (pnum(a.price) || Infinity) - (pnum(b.price) || Infinity))
export const ratePerKm = (o) => (num(o.price) > 0 && num(o.km) > 0 ? round2(num(o.price) / num(o.km)) : null)

export function checkOffer(o) {
  const w = []
  if (!o.received_on) w.push('received')
  if (!o.load_country || !o.unload_country) w.push('country')
  if (!(num(o.price) > 0)) w.push('price')
  if (!(num(o.km) > 0)) w.push('km')
  if (o.load_date && o.unload_date && o.unload_date < o.load_date) w.push('dates')
  return w
}

export const offerHaystack = (o) => foldText([
  o.code, o.exchange, o.company, o.contact_name, o.phone, o.email, o.load_country, o.load_place, o.unload_country, o.unload_place,
  `${o.load_country}-${o.unload_country}`, `${o.load_country} ${o.unload_country}`, o.cargo, o.vehicle_type, o.currency, o.status, o.notes,
  o.price, o.km, o.received_on, o.load_date, o.unload_date,
  ...quotesOf(o).flatMap((q) => [q.carrier, q.price, q.exchange, q.ext_id, q.contact, q.email, q.phone]),
  ...extraStops(o.extra_loads).flatMap((x) => [x.country, x.place]), ...extraStops(o.extra_unloads).flatMap((x) => [x.country, x.place]),
].join(' | '))

// semnătură pentru dubluri: aceeași dată, bursă, firmă, rută și preț
export const offerKey = (o) => foldText([o.received_on, o.exchange, o.company, o.load_country, o.load_place, o.unload_country, o.unload_place, o.price].join('|')).replace(/\s+/g, '')

// ---- import din excel ----
const EXCH_MAP = { 'trans.eu': 'Trans.eu', transeu: 'Trans.eu', timocom: 'Timocom', 'bursa transport': 'Bursatransport.ro', bursatransport: 'Bursatransport.ro', 'bursatransport.ro': 'Bursatransport.ro' }
const VEH_MAP = { tarpaulin: 'Prelată', prelata: 'Prelată', reefer: 'Frigorific', frigorific: 'Frigorific', 'mega trailer': 'Megatrailer', megatrailer: 'Megatrailer', other: 'Alt tip', 'alt tip': 'Alt tip' }
const STAT_MAP = { requested: 'Cerută', cerută: 'Cerută', cerut: 'Cerută', quoted: 'Ofertată', ofertata: 'Ofertată', accepted: 'Acceptată', acceptata: 'Acceptată', rejected: 'Respinsă', respinsa: 'Respinsă', 'no answer': 'Fără răspuns', 'fara raspuns': 'Fără răspuns', expired: 'Expirată', expirata: 'Expirată' }
const CARGO_MAP = { 'palletised goods': 'Marfă paletizată', 'gen goods': 'Marfă generală', 'general goods': 'Marfă generală', frigo: 'Frigo' }
const HEAD = {
  'date received': 'received_on', exchange: 'exchange', 'posting company': 'company', 'contact name': 'contact_name', 'contact phone': 'phone', 'contact email': 'email',
  'loading country': 'load_country', 'loading city / postcode': 'load_place', 'loading date': 'load_date', 'unloading country': 'unload_country', 'unloading city / postcode': 'unload_place',
  'unloading date': 'unload_date', 'distance (km)': 'km', 'cargo type': 'cargo', 'weight (t)': 'weight_t', 'vehicle type': 'vehicle_type', 'price offered': 'price', currency: 'currency', status: 'status', notes: 'notes',
}

const pad2 = (n) => String(n).padStart(2, '0')
function toIso(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
const txt = (v) => (v == null ? '' : String(v).trim().replace(/\s+/g, ' '))
const numOf = (v) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Citește primul sheet cu antetul „Date received”; ignoră rândurile goale și rândul-exemplu din șablon.
export async function parseOffersExcel(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  const at = grid.findIndex((r) => r.some((c) => foldText(c) === 'date received'))
  if (at < 0) throw new Error('Nu găsesc antetul „Date received”. Folosește șablonul Freight_Offers_Database.xlsx.')
  const cols = {}
  grid[at].forEach((h, i) => { const k = HEAD[foldText(h).replace(/\s+/g, ' ')]; if (k) cols[k] = i })
  const out = []
  const skipped = []
  for (const r of grid.slice(at + 1)) {
    const g = (k) => (cols[k] == null ? null : r[cols[k]])
    if (![g('company'), g('load_place'), g('unload_place'), g('price')].some((v) => v != null && v !== '')) continue
    if (/example row/i.test(txt(g('notes')))) { skipped.push('exemplu'); continue }
    const exch = txt(g('exchange'))
    const veh = txt(g('vehicle_type'))
    const st = txt(g('status'))
    const cargo = txt(g('cargo'))
    out.push({
      received_on: toIso(g('received_on')) || todayISO(),
      exchange: EXCH_MAP[foldText(exch)] || (exch ? 'Altă' : null),
      company: txt(g('company')),
      contact_name: txt(g('contact_name')),
      phone: txt(g('phone')),
      email: txt(g('email')),
      load_country: txt(g('load_country')).toUpperCase(),
      load_place: txt(g('load_place')),
      load_date: toIso(g('load_date')),
      unload_country: txt(g('unload_country')).toUpperCase(),
      unload_place: txt(g('unload_place')),
      unload_date: toIso(g('unload_date')),
      km: numOf(g('km')),
      cargo: CARGO_MAP[foldText(cargo)] || cargo,
      weight_t: numOf(g('weight_t')),
      vehicle_type: VEH_MAP[foldText(veh)] || (veh ? 'Alt tip' : null),
      price: numOf(g('price')),
      currency: CURRENCIES.includes(txt(g('currency')).toUpperCase()) ? txt(g('currency')).toUpperCase() : txt(g('currency')) ? 'Altă' : 'EUR',
      status: STAT_MAP[foldText(st)] || null,
      notes: txt(g('notes')),
    })
  }
  return { rows: out, skipped }
}

// Analiza pe rute: țară încărcare -> țară descărcare (și tip camion), doar în moneda aleasă
export function laneStats(offers, currency = 'EUR') {
  const m = new Map()
  for (const o of offers) {
    const r = ratePerKm(o)
    if (r == null || o.currency !== currency) continue
    const key = `${o.load_country || '?'}→${o.unload_country || '?'}|${o.vehicle_type || '—'}`
    const e = m.get(key) || { from: o.load_country || '?', to: o.unload_country || '?', vehicle: o.vehicle_type || '—', rates: [], prices: [], last: '' }
    e.rates.push(r)
    e.prices.push(num(o.price))
    if (String(o.received_on) > e.last) e.last = o.received_on
    m.set(key, e)
  }
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length
  return [...m.values()].map((e) => ({
    from: e.from, to: e.to, vehicle: e.vehicle, n: e.rates.length, avg: round2(avg(e.rates)), min: Math.min(...e.rates), max: Math.max(...e.rates), avgPrice: round2(avg(e.prices)), last: e.last,
  })).sort((a, b) => b.n - a.n || a.from.localeCompare(b.from))
}
