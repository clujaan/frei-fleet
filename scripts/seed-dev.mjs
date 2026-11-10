// Date de test FICTIVE pentru dezvoltarea locală (Supabase local). Nu folosi pe un proiect real.
//   npx supabase start        (o dată)
//   npm run seed:dev
// Creează: 3 utilizatori (patron, dispecer, contabil), datele firmei de test, 3 clienți, 1 transportator,
// 4 camioane, 3 remorci, 3 șoferi (cu salariu și diurnă), o cursă cu 2 comenzi (EUR + RON), o comandă fără cursă, un CT de distribuție.
// Cheia „service role” a bazei LOCALE se citește automat din `npx supabase status`.
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

function localKeys() {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const get = (k) => (out.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm')) || [])[1]
  return { url: get('API_URL'), service: get('SERVICE_ROLE_KEY') }
}

const { url, service } = process.env.SERVICE_ROLE_KEY && process.env.API_URL ? { url: process.env.API_URL, service: process.env.SERVICE_ROLE_KEY } : localKeys()
if (!url || !service) throw new Error('Nu găsesc URL-ul / cheia bazei locale. Rulează mai întâi `npx supabase start`.')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) throw new Error(`Refuz să încarc date de test pe ${url}: scriptul rulează doar pe baza locală.`)

const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
const PASSWORD = 'Demo-12345!'
const USERS = [
  { email: 'patron@demo.test', full_name: 'Ana Patron', role: 'owner' },
  { email: 'dispecer@demo.test', full_name: 'Dan Dispecer', role: 'dispatcher' },
  { email: 'contabil@demo.test', full_name: 'Maria Contabil', role: 'accountant' },
]

async function ensureUser(u) {
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  let user = list?.users?.find((x) => x.email === u.email)
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email: u.email, password: PASSWORD, email_confirm: true })
    if (error) throw error
    user = data.user
  }
  const { error } = await db.from('app_users').upsert({ user_id: user.id, role: u.role, full_name: u.full_name, email: u.email, active: true })
  if (error) throw error
}

for (const u of USERS) await ensureUser(u)

const { error: e1 } = await db.from('company_settings').update({
  name: 'Demo Transport SRL', cui: 'RO00000000', reg_com: 'J00/0000/2000',
  address: 'Str. Exemplu nr. 1, Oraș Exemplu, România', address_en: '1 Example St., Example City, Romania',
  phone: '+40 000 000 000', email: 'office@demo.test', base_name: 'Baza demo', base_address: 'Str. Exemplu nr. 1, Oraș Exemplu',
}).not('id', 'is', null)
if (e1) throw e1

const have = async (table, company) => (await db.from(table).select('id').eq('company', company).limit(1)).data?.length > 0
const clients = [
  { company: 'Client Exemplu SRL', cui: 'RO10000001', country: 'RO', city: 'Oraș Exemplu', contact_name: 'Ion Exemplu', email: 'client1@demo.test', payment_terms_days: 30, preferred_currency: 'EUR' },
  { company: 'Beispiel Logistik GmbH', cui: 'DE100000002', country: 'DE', city: 'Beispielstadt', contact_name: 'Anna Beispiel', email: 'client2@demo.test', payment_terms_days: 45, preferred_currency: 'EUR' },
  { company: 'Producător Demo SA', cui: 'RO10000003', country: 'RO', city: 'Oraș Demo', contact_name: 'Maria Demo', email: 'client3@demo.test', payment_terms_days: 15, preferred_currency: 'RON' },
]
for (const c of clients) if (!(await have('clients', c.company))) { const { error } = await db.from('clients').insert(c); if (error) throw error }
const carrier = { company: 'Transportator Exemplu SRL', cui: 'RO10000004', country: 'RO', contact_name: 'Vasile Exemplu', email: 'transportator@demo.test', status: 'Activ', payment_terms_days: 30, currency: 'EUR' }
if (!(await have('carriers', carrier.company))) { const { error } = await db.from('carriers').insert(carrier); if (error) throw error }

// ---- Flotă și curse (Etapa 3) — totul FICTIV ----
const one = async (table, col, val) => (await db.from(table).select('*').eq(col, val).limit(1)).data?.[0] || null
const ensure = async (table, col, row) => {
  const cur = await one(table, col, row[col])
  if (cur) return cur
  const { data, error } = await db.from(table).insert(row).select().single()
  if (error) throw new Error(`${table}: ${error.message}`)
  return data
}

const trailers = []
for (const t of [{ plate: 'XX01RMA', trailer_type: 'Prelată' }, { plate: 'XX02RMB', trailer_type: 'Megatrailer' }, { plate: 'XX03RMC', trailer_type: 'Frigorific' }]) trailers.push(await ensure('trailers', 'plate', t))
const trucks = []
for (const [i, t] of [{ plate: 'XX10ABC', make: 'Marcă A', model: 'Model 1', year: 2021, ref_consumption: 29.5 }, { plate: 'XX20DEF', make: 'Marcă B', model: 'Model 2', year: 2019, ref_consumption: 31 }, { plate: 'XX30GHI', make: 'Marcă A', model: 'Model 3', year: 2023, ref_consumption: 28 }, { plate: 'XX40JKL', make: 'Marcă C', model: 'Model 4', year: 2018, ref_consumption: 32 }].entries()) {
  trucks.push(await ensure('trucks', 'plate', { ...t, label: `${t.make} ${t.model}`, status: 'Activ', currency: 'EUR', default_trailer_id: trailers[i]?.id || null }))
}
const drivers = []
for (const [i, d] of [{ full_name: 'Șofer Unu', phone: '+40 700 000 001' }, { full_name: 'Șofer Doi', phone: '+40 700 000 002' }, { full_name: 'Șofer Trei', phone: '+40 700 000 003' }].entries()) {
  const row = await ensure('drivers', 'full_name', { ...d, default_truck_id: trucks[i].id })
  drivers.push(row)
  if (!(await one('driver_pay', 'driver_id', row.id))) { const { error } = await db.from('driver_pay').insert({ driver_id: row.id, monthly_gross: 5000 + i * 250, employer_pct: 2.25, currency: 'RON' }); if (error) throw error }
  if (!(await one('per_diem_rates', 'driver_id', row.id))) { const { error } = await db.from('per_diem_rates').insert({ driver_id: row.id, amount_day: 75 + i * 5, currency: 'EUR', valid_from: '2026-01-01' }); if (error) throw error }
}
if (!(await db.from('per_diem_rates').select('id').is('driver_id', null).limit(1)).data?.length) {
  const { error } = await db.from('per_diem_rates').insert([{ amount_day: 70, currency: 'EUR', valid_from: '2026-01-01', notes: 'Implicit firmă (fictiv)' }, { country: 'RO', amount_day: 23, currency: 'RON', valid_from: '2026-01-01', notes: 'România (fictiv)' }])
  if (error) throw error
}

const client = async (company) => (await one('clients', 'company', company))?.id
const [c1, c2, c3] = [await client('Client Exemplu SRL'), await client('Beispiel Logistik GmbH'), await client('Producător Demo SA')]
const stop = (side, city, country, date, goods = []) => ({ side, company: `Firmă demo ${city}`, street: 'Str. Exemplu 1', zip: '000000', city, country, date, goods })
const euro = (qty, weight, ldm) => ({ type: 'euro', qty: String(qty), dims: '120×80', weight: String(weight), ldm: String(ldm), desc: '' })

// Cursa de acceptare: tur (EUR) + retur (RON), curs fictiv 4,97 -> venit 2.800 EUR
let trip = await one('trips', 'notes', 'DEMO: cursă de test Etapa 3')
if (!trip) {
  const { data, error } = await db.from('trips').insert({ kind: 'own', truck_id: trucks[0].id, trailer_id: trailers[0].id, driver_id: drivers[0].id, start_at: '2026-11-02T04:00:00Z', end_at: '2026-11-07T16:00:00Z', km_start: 412300, km_end: 416050, countries: ['RO', 'HU', 'AT', 'DE'], status: 'Livrată', load_date: '2026-11-02', unload_date: '2026-11-07', notes: 'DEMO: cursă de test Etapa 3' }).select().single()
  if (error) throw error
  trip = data
}
const ensureOrder = async (ref, row) => ensure('client_orders', 'client_ref', { client_ref: ref, ...row })
await ensureOrder('DEMO-TUR', { trip_id: trip.id, client_id: c1, price: 1800, currency: 'EUR', fx_rate: 4.97, order_date: '2026-10-30', lang: 'ro', cargo: 'Marfă generală (demo)', stops: [stop('load', 'Oraș Exemplu', 'RO', '2026-11-02', [euro(12, 4800, 4.8)]), stop('unload', 'Beispielstadt', 'DE', '2026-11-04')] })
const retur = await ensureOrder('DEMO-RETUR', { trip_id: trip.id, client_id: c2, price: 4970, currency: 'RON', fx_rate: 4.97, order_date: '2026-11-03', lang: 'en', cargo: 'Piese (demo)', stops: [stop('load', 'Beispielstadt', 'DE', '2026-11-05', [euro(8, 3200, 3.2)]), stop('unload', 'Oraș Demo', 'RO', '2026-11-07')] })
await ensureOrder('DEMO-FARA-CURSA', { client_id: c3, price: 2500, currency: 'RON', fx_rate: 4.97, order_date: '2026-11-08', lang: 'ro', cargo: 'Paleți (demo)', stops: [stop('load', 'Oraș Demo', 'RO', '2026-11-12', [euro(4, 1200, 1.6)]), stop('unload', 'Oraș Exemplu', 'RO', '2026-11-12')] })

// CT de distribuție fictiv: marfa din retur, dusă de la bază de transportatorul de test
const carrierRow = await one('carriers', 'company', 'Transportator Exemplu SRL')
if (!(await one('transport_orders', 'notes', 'DEMO: distribuție'))) {
  const { data: ct, error } = await db.from('transport_orders').insert({ purpose: 'distribution', trip_id: trip.id, carrier_id: carrierRow?.id || null, price: 600, currency: 'RON', fx_rate: 4.97, status: 'Confirmată', order_date: '2026-11-07', load_date: '2026-11-07', notes: 'DEMO: distribuție' }).select().single()
  if (error) throw error
  const { error: e2 } = await db.from('transport_order_goods').insert({ transport_order_id: ct.id, client_order_id: retur.id })
  if (e2) throw e2
}

console.log('Gata. Conturi de test (parola pentru toate: %s):', PASSWORD)
for (const u of USERS) console.log(`  ${u.role.padEnd(10)} ${u.email}`)
