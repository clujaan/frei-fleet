// Date de test FICTIVE pentru dezvoltarea locală (Supabase local). Nu folosi pe un proiect real.
//   npx supabase start        (o dată)
//   npm run seed:dev
// Creează: 3 utilizatori (patron, dispecer, contabil), datele firmei de test, 3 clienți, 1 transportator,
// 4 camioane, 3 remorci, 3 șoferi (cu salariu și diurnă), 4 curse (încheiată, în desfășurare, planificată, subcontractată),
// lead-uri, interacțiuni, adrese, transportatori, oferte de la burse, cheltuieli, deconturi și costurile camioanelor (Tools).
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

// ---- Restul paginilor (Vânzări, Burse, Transportatori, Adrese, Cheltuieli, Deconturi, Tools) — totul FICTIV ----
const insertMissing = async (table, col, rows) => {
  const out = []
  for (const r of rows) out.push(await ensure(table, col, r))
  return out
}
const dayRel = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const OWN1 = 'Ana Patron'
const OWN2 = 'Dan Dispecer'

// Clienți în plus + adrese de încărcare/descărcare
await insertMissing('clients', 'company', [
  { company: 'Exemplu Mobila SRL', cui: 'RO10000005', country: 'RO', city: 'Oraș Exemplu', contact_name: 'Radu Exemplu', email: 'client4@demo.test', phone: '+40 700 000 104', payment_terms_days: 30, preferred_currency: 'EUR', owner: OWN1, credit_limit: 20000 },
  { company: 'Przykład Trans Sp. z o.o.', cui: 'PL1000000006', country: 'PL', city: 'Miasto Przykład', contact_name: 'Jan Przykład', email: 'client5@demo.test', payment_terms_days: 60, preferred_currency: 'EUR', owner: OWN2 },
  { company: 'Agro Demo Coop', cui: 'RO10000007', country: 'RO', city: 'Comuna Demo', contact_name: 'Elena Demo', email: 'client6@demo.test', payment_terms_days: 30, preferred_currency: 'RON', owner: OWN2, status: 'Inactiv', notes: 'Client inactiv (demo)' },
])
await insertMissing('clients', 'company', [
  { client_type: 'Loading/unloading place', company: 'Depozit Demo Nord', street: undefined, address: 'Str. Depozitelor 10', zip: '000010', city: 'Oraș Exemplu', country: 'RO', contact_name: 'Recepție Nord', phone: '+40 700 000 201', notes: 'Rampă 3, program 07–15 (demo)' },
  { client_type: 'Loading/unloading place', company: 'Lager Beispiel Süd', address: 'Beispielweg 5', zip: '00005', city: 'Beispielstadt', country: 'DE', contact_name: 'Wareneingang', phone: '+49 000 000 202' },
  { client_type: 'Loading/unloading place', company: 'Magazyn Przykład', address: 'ul. Przykładowa 7', zip: '00-007', city: 'Miasto Przykład', country: 'PL', contact_name: 'Magazyn', phone: '+48 000 000 203' },
  { client_type: 'Loading/unloading place', company: 'Platformă Logistică Demo', address: 'Șos. Exemplu km 5', zip: '000050', city: 'Oraș Demo', country: 'RO', contact_name: 'Dispecerat platformă', phone: '+40 700 000 204' },
].map(({ street, ...r }) => r))

// Transportatori
await insertMissing('carriers', 'company', [
  { company: 'Cărăuș Demo SRL', cui: 'RO10000011', country: 'RO', contact_name: 'Mihai Cărăuș', email: 'carrier2@demo.test', phone: '+40 700 000 301', truck_types: ['Prelată', 'Megatrailer'], truck_count: 8, cmr_insurance_until: dayRel(200), payment_terms_days: 45, currency: 'EUR', rating: 4, status: 'Activ' },
  { company: 'Fracht Beispiel GmbH', cui: 'DE100000012', country: 'DE', contact_name: 'Klaus Beispiel', email: 'carrier3@demo.test', truck_types: ['Frigorific'], truck_count: 15, cmr_insurance_until: dayRel(20), payment_terms_days: 30, currency: 'EUR', rating: 5, status: 'Activ', notes: 'Asigurarea CMR expiră curând (demo)' },
  { company: 'Transport Nou Demo SRL', cui: 'RO10000013', country: 'RO', contact_name: 'Andrei Nou', email: 'carrier4@demo.test', truck_types: ['Prelată'], truck_count: 2, payment_terms_days: 60, currency: 'RON', status: 'Nou' },
  { company: 'Blocat Exemplu SRL', cui: 'RO10000014', country: 'RO', contact_name: 'Sorin Blocat', email: 'carrier5@demo.test', truck_types: ['Prelată'], truck_count: 3, currency: 'EUR', rating: 1, status: 'Blocat', notes: 'Marfă livrată cu întârziere repetat (demo)' },
])

// Lead-uri pe toate etapele (unele cu pasul următor depășit)
const c4 = await client('Exemplu Mobila SRL')
const leads = await insertMissing('leads', 'company', [
  { company: 'Lead Demo Unu SRL', country: 'RO', contact_name: 'Ioana Lead', contact_role: 'Logistică', phone: '+40 700 000 401', email: 'lead1@demo.test', source: 'Recomandare', interest: 'Grupaj RO–DE săptămânal', est_volume: 4, stage: 'Nou', next_step: 'Primul telefon', next_step_date: dayRel(1), owner: OWN1, added_on: dayRel(-2) },
  { company: 'Lead Demo Doi GmbH', country: 'DE', contact_name: 'Peter Lead', contact_role: 'Einkauf', email: 'lead2@demo.test', source: 'Bursă (Trans.eu, TimoCom…)', interest: 'Camion complet DE–RO', est_volume: 6, stage: 'Contactat', next_step: 'Trimite prezentarea firmei', next_step_date: dayRel(-1), owner: OWN2, added_on: dayRel(-9) },
  { company: 'Lead Demo Trei SRL', country: 'RO', contact_name: 'Cristi Lead', email: 'lead3@demo.test', source: 'LinkedIn', interest: 'Frigorific RO–HU', est_volume: 2, stage: 'Ofertă trimisă', next_step: 'Revino pe ofertă', next_step_date: dayRel(2), owner: OWN1, added_on: dayRel(-15) },
  { company: 'Lead Demo Patru Kft', country: 'HU', contact_name: 'Gábor Lead', email: 'lead4@demo.test', source: 'Eveniment', interest: 'Retururi HU–RO', est_volume: 8, stage: 'Negociere', next_step: 'Negociere preț final', next_step_date: dayRel(-3), owner: OWN1, added_on: dayRel(-25) },
  { company: 'Lead Demo Cinci SRL', country: 'RO', contact_name: 'Laura Lead', email: 'lead5@demo.test', source: 'Site', interest: 'Distribuție locală', est_volume: 1, stage: 'Pierdut', lost_reason: 'Preț prea mare față de concurență', owner: OWN2, added_on: dayRel(-40) },
  { company: 'Exemplu Mobila SRL (lead)', country: 'RO', contact_name: 'Radu Exemplu', email: 'client4@demo.test', source: 'Telefon', interest: 'Mobilier RO–DE', est_volume: 5, stage: 'Convertit în client', client_id: c4, owner: OWN1, added_on: dayRel(-60) },
  { company: 'Lead Demo Șapte AB', country: 'SE', contact_name: 'Erik Lead', email: 'lead7@demo.test', source: 'Email', interest: 'Camion complet RO–SE', est_volume: 2, stage: 'Nou', owner: OWN2, added_on: dayRel(0) },
  { company: 'Lead Demo Opt Sp. z o.o.', country: 'PL', contact_name: 'Anna Lead', email: 'lead8@demo.test', source: 'Bursă (Trans.eu, TimoCom…)', interest: 'Grupaj PL–RO', est_volume: 3, stage: 'Contactat', next_step: 'Cere volumele lunare', next_step_date: dayRel(5), owner: OWN1, added_on: dayRel(-6) },
])
const L_ = (i) => leads[i].id

// Interacțiuni (cu lead-uri și cu clienți)
await insertMissing('interactions', 'summary', [
  { occurred_on: dayRel(-9), lead_id: L_(1), channel: 'Bursă', direction: 'Primit', summary: 'Demo: a cerut preț pe bursă pentru DE–RO', owner: OWN2 },
  { occurred_on: dayRel(-8), lead_id: L_(1), channel: 'Telefon', direction: 'Inițiat', summary: 'Demo: discuție despre volume, vrea prezentarea firmei', next_step: 'Trimite prezentarea firmei', next_step_date: dayRel(-1), owner: OWN2 },
  { occurred_on: dayRel(-15), lead_id: L_(2), channel: 'LinkedIn', direction: 'Inițiat', summary: 'Demo: primul mesaj pe LinkedIn', owner: OWN1 },
  { occurred_on: dayRel(-12), lead_id: L_(2), channel: 'Email', direction: 'Inițiat', summary: 'Demo: ofertă trimisă 1.250 EUR / cursă frigorific', next_step: 'Revino pe ofertă', next_step_date: dayRel(2), owner: OWN1 },
  { occurred_on: dayRel(-25), lead_id: L_(3), channel: 'Întâlnire', direction: 'Inițiat', summary: 'Demo: întâlnire la târgul de logistică', owner: OWN1 },
  { occurred_on: dayRel(-10), lead_id: L_(3), channel: 'Email', direction: 'Primit', summary: 'Demo: contraofertă primită, cer -5%', next_step: 'Negociere preț final', next_step_date: dayRel(-3), owner: OWN1 },
  { occurred_on: dayRel(-35), lead_id: L_(4), channel: 'Telefon', direction: 'Primit', summary: 'Demo: au ales alt transportator, preț mai mic', owner: OWN2 },
  { occurred_on: dayRel(-6), lead_id: L_(7), channel: 'WhatsApp', direction: 'Inițiat', summary: 'Demo: contact inițial pe WhatsApp', next_step: 'Cere volumele lunare', next_step_date: dayRel(5), owner: OWN1 },
  { occurred_on: dayRel(-20), client_id: c1, channel: 'Telefon', direction: 'Primit', summary: 'Demo: clientul confirmă comenzile pentru noiembrie', owner: OWN1 },
  { occurred_on: dayRel(-4), client_id: c2, channel: 'Email', direction: 'Primit', summary: 'Demo: a cerut CMR-ul semnat pentru retur', owner: OWN2 },
  { occurred_on: dayRel(-1), client_id: c4, channel: 'Întâlnire', direction: 'Inițiat', summary: 'Demo: vizită la client, discutat contract anual', next_step: 'Trimite contractul', next_step_date: dayRel(3), owner: OWN1 },
  { occurred_on: dayRel(0), client_id: c3, channel: 'WhatsApp', direction: 'Primit', summary: 'Demo: întreabă de ora încărcării de mâine', owner: OWN2 },
])

// Oferte de la burse
const fo = (n, row) => ({ notes: `Ofertă demo ${n}`, currency: 'EUR', ...row })
await insertMissing('freight_offers', 'notes', [
  fo(1, { received_on: dayRel(-1), exchange: 'Trans.eu', company: 'Expeditor Demo A', contact_name: 'Contact A', email: 'bursa1@demo.test', load_country: 'RO', load_place: 'Oraș Exemplu', load_date: dayRel(3), unload_country: 'DE', unload_place: 'Beispielstadt', unload_date: dayRel(5), km: 1450, cargo: 'Marfă paletizată', weight_t: 12, vehicle_type: 'Prelată', price: 1550, status: 'Cerută' }),
  fo(2, { received_on: dayRel(-2), exchange: 'Timocom', company: 'Expeditor Demo B', contact_name: 'Contact B', load_country: 'DE', load_place: 'Beispielstadt', load_date: dayRel(2), unload_country: 'RO', unload_place: 'Oraș Demo', unload_date: dayRel(4), km: 1500, cargo: 'Piese auto', weight_t: 18, vehicle_type: 'Megatrailer', price: 1400, status: 'Ofertată', carrier_quotes: [{ carrier: 'Cărăuș Demo SRL', price: 1200, currency: 'EUR', curManual: false, exchange: 'Timocom', ext_id: '', contact: 'Mihai Cărăuș', email: '', phone: '' }] }),
  fo(3, { received_on: dayRel(-5), exchange: 'Bursatransport.ro', company: 'Expeditor Demo C', contact_name: 'Contact C', load_country: 'RO', load_place: 'Oraș Exemplu', load_date: dayRel(-2), unload_country: 'HU', unload_place: 'Példaváros', unload_date: dayRel(-1), km: 600, cargo: 'Congelate', weight_t: 20, vehicle_type: 'Frigorific', price: 900, status: 'Acceptată' }),
  fo(4, { received_on: dayRel(-6), exchange: 'Trans.eu', company: 'Expeditor Demo D', load_country: 'PL', load_place: 'Miasto Przykład', load_date: dayRel(-3), unload_country: 'RO', unload_place: 'Oraș Exemplu', km: 1100, cargo: 'Materiale construcții', weight_t: 24, vehicle_type: 'Prelată', price: 1150, status: 'Respinsă' }),
  fo(5, { received_on: dayRel(-8), exchange: 'Timocom', company: 'Expeditor Demo E', load_country: 'RO', load_place: 'Oraș Demo', load_date: dayRel(-4), unload_country: 'SE', unload_place: 'Exempelstad', km: 2600, cargo: 'Marfă generală', weight_t: 15, vehicle_type: 'Prelată', price: 3200, status: 'Fără răspuns', extra_unloads: [{ country: 'DK', place: 'Eksempelby', date: '' }] }),
  fo(6, { received_on: dayRel(-20), exchange: 'Altă', company: 'Expeditor Demo F', load_country: 'RO', load_place: 'Oraș Exemplu', unload_country: 'AT', unload_place: 'Beispielort', km: 1000, cargo: 'Mobilier', weight_t: 8, vehicle_type: 'Prelată', price: 4600, currency: 'RON', status: 'Expirată' }),
])

// Cheltuieli generale (pentru P&L și dashboard)
const yearStart = `${new Date().getFullYear()}-01-01`
await insertMissing('general_costs', 'description', [
  { description: 'Demo: leasing autoutilitară birou', category: 'Leasing', cost_type: 'Recurent lunar', amount_gross: 450, currency: 'EUR', fx_rate: 4.97, vat_rate: 0.21, start_on: yearStart, vendor: 'Leasing Demo IFN', vat_deductible: true },
  { description: 'Demo: abonament program contabilitate', category: 'Software / abonamente', cost_type: 'Recurent lunar', amount_gross: 242, currency: 'RON', vat_rate: 0.21, start_on: yearStart, vendor: 'Soft Demo SRL', vat_deductible: true },
  { description: 'Demo: abonament bursă transport', category: 'Burse transport', cost_type: 'Recurent lunar', amount_gross: 190, currency: 'EUR', fx_rate: 4.97, vat_rate: 0, start_on: yearStart, vendor: 'Bursă Demo', vat_deductible: true },
  { description: 'Demo: servicii contabilitate', category: 'Contabilitate', cost_type: 'Recurent lunar', amount_gross: 1500, currency: 'RON', vat_rate: 0, start_on: yearStart, vendor: 'Contabil Demo PFA', vat_deductible: true },
  { description: 'Demo: chirie birou', category: 'Chirie / birou', cost_type: 'Recurent lunar', amount_gross: 2420, currency: 'RON', vat_rate: 0.21, start_on: yearStart, vendor: 'Imobiliare Demo SRL', vat_deductible: true },
  { description: 'Demo: asigurare răspundere civilă firmă', category: 'Asigurări', cost_type: 'Recurent anual', amount_gross: 3600, currency: 'RON', vat_rate: 0, start_on: yearStart, vendor: 'Asigurator Demo SA', vat_deductible: true },
  { description: 'Demo: laptoape dispecerat', category: 'Echipamente birou', cost_type: 'Unic - amortizat', amount_gross: 9680, currency: 'RON', vat_rate: 0.21, start_on: dayRel(-90), period_unit: 'Luni', period_count: 24, vendor: 'IT Demo SRL', doc_no: 'DEMO-001', doc_date: dayRel(-90), vat_deductible: true },
  { description: 'Demo: consumabile birou', category: 'Consumabile birou', cost_type: 'Unic - one time cost', amount_gross: 290, currency: 'RON', vat_rate: 0.21, start_on: dayRel(-3), vendor: 'Papetărie Demo', doc_no: 'DEMO-002', doc_date: dayRel(-3), vat_deductible: true },
])

// Deconturi (unul trimis, unul ciornă)
const ensureReport = async (purpose, row, items) => {
  let r = await one('expense_reports', 'purpose', purpose)
  if (r) return r
  const total_gross = items.reduce((s, x) => s + x.amount_gross, 0)
  const total_vat = items.reduce((s, x) => s + x.vat_amount, 0)
  const { data, error } = await db.from('expense_reports').insert({ purpose, ...row, total_gross, total_vat, doc_count: items.length }).select().single()
  if (error) throw new Error(`expense_reports: ${error.message}`)
  const { error: e } = await db.from('expense_items').insert(items.map((x, i) => ({ report_id: data.id, line_no: i + 1, ...x })))
  if (e) throw new Error(`expense_items: ${e.message}`)
  return data
}
await ensureReport('Demo: drum la client pentru contract', { employee: OWN1, report_date: dayRel(-6), status: 'Trimis contabilă', sent_on: dayRel(-5) }, [
  { doc_date: dayRel(-7), vendor: 'Benzinărie Demo', doc_no: 'BF-101', description: 'Motorină mașină de serviciu', amount_gross: 363, vat_amount: 63 },
  { doc_date: dayRel(-7), vendor: 'Restaurant Demo', doc_no: 'BF-102', description: 'Masă cu clientul', amount_gross: 242, vat_amount: 42 },
])
await ensureReport('Demo: cheltuieli mărunte birou', { employee: OWN2, report_date: dayRel(-1), status: 'Ciornă' }, [
  { doc_date: dayRel(-2), vendor: 'Papetărie Demo', doc_no: 'BF-201', description: 'Toner imprimantă', amount_gross: 181.5, vat_amount: 31.5 },
])

// Tools → Camioane: costuri de exploatare pentru camioanele demo (doar unde lipsesc)
for (const [i, t] of trucks.entries()) {
  if (t.purchase_price) continue
  const { error } = await db.from('trucks').update({
    fx_rate: 4.97, purchase_price: 90000 + i * 5000, residual_value: 30000, depr_years: 5, interest_pct: 6, leasing_monthly: 1650 + i * 50,
    road_tax: 450, eurovignet: 1250, casco: 2800, rca: 2400, cmr: 600, phone_year: 240, local_taxes: 300, papers_year: 200,
    driver_salary_month: 1100, driver_burden_pct: 2.25, perdiem_abroad_day: 75, perdiem_abroad_days: 200, perdiem_ro_day: 5, perdiem_ro_days: 20,
    cons_light: 26, cons_heavy: 32, cons_empty: 24, avg_load_t: 14, diesel_price: 1.45, adblue_pct: 5,
    tyres_count: 12, tyre_life_km: 150000, tyre_cost: 450, maint_per_km: 0.06, road_costs_per_km: 0.18,
    annual_km: 125000 + i * 5000, empty_pct: 10, avg_speed: 65, overhead_pct: 10, profit_pct: 8,
  }).eq('id', t.id)
  if (error) throw new Error(`trucks: ${error.message}`)
}

// Încă 3 curse: una în desfășurare (grupaj, 2 comenzi), una planificată, una subcontractată
const [c5] = [await client('Przykład Trans Sp. z o.o.')]
const carrier2 = await one('carriers', 'company', 'Cărăuș Demo SRL')
const ensureTrip = async (notes, row) => (await one('trips', 'notes', notes)) || (await (async () => {
  const { data, error } = await db.from('trips').insert({ notes, ...row }).select().single()
  if (error) throw new Error(`trips: ${error.message}`)
  return data
})())
const tRun = await ensureTrip('DEMO: cursă în desfășurare (grupaj)', { kind: 'own', truck_id: trucks[1].id, trailer_id: trailers[1].id, driver_id: drivers[1].id, start_at: `${dayRel(-1)}T05:00:00Z`, km_start: 288100, countries: ['RO', 'HU', 'SK', 'PL'], status: 'În curs', load_date: dayRel(-1) })
await ensureOrder('DEMO-GRUPAJ-1', { trip_id: tRun.id, client_id: c4, price: 1450, currency: 'EUR', fx_rate: 4.97, order_date: dayRel(-4), lang: 'ro', cargo: 'Mobilier (demo)', stops: [stop('load', 'Oraș Exemplu', 'RO', dayRel(-1), [euro(16, 5200, 6.4)]), stop('unload', 'Miasto Przykład', 'PL', dayRel(1))] })
await ensureOrder('DEMO-GRUPAJ-2', { trip_id: tRun.id, client_id: c5, price: 650, currency: 'EUR', fx_rate: 4.97, order_date: dayRel(-3), lang: 'en', cargo: 'Paleți mixți (demo)', stops: [stop('load', 'Oraș Demo', 'RO', dayRel(-1), [euro(6, 2100, 2.4)]), stop('unload', 'Miasto Przykład', 'PL', dayRel(1))] })
const tPlan = await ensureTrip('DEMO: cursă planificată', { kind: 'own', truck_id: trucks[2].id, trailer_id: trailers[2].id, driver_id: drivers[2].id, start_at: `${dayRel(3)}T04:00:00Z`, countries: ['RO', 'HU', 'AT', 'DE'], status: 'Planificată', load_date: dayRel(3) })
await ensureOrder('DEMO-PLANIFICAT', { trip_id: tPlan.id, client_id: c2, price: 2100, currency: 'EUR', fx_rate: 4.97, order_date: dayRel(-1), lang: 'en', cargo: 'Congelate (demo)', stops: [stop('load', 'Oraș Exemplu', 'RO', dayRel(3), [euro(33, 21000, 13.2)]), stop('unload', 'Beispielstadt', 'DE', dayRel(5))] })
const tSub = await ensureTrip('DEMO: cursă subcontractată', { kind: 'subcontracted', carrier_id: carrier2?.id || null, status: 'Livrată', load_date: dayRel(-8), unload_date: dayRel(-6), countries: ['RO', 'AT'] })
const subOrder = await ensureOrder('DEMO-SUBCONTRACTAT', { trip_id: tSub.id, client_id: c1, price: 1600, currency: 'EUR', fx_rate: 4.97, order_date: dayRel(-10), lang: 'ro', cargo: 'Echipamente (demo)', stops: [stop('load', 'Oraș Exemplu', 'RO', dayRel(-8), [euro(10, 6000, 4)]), stop('unload', 'Beispielort', 'AT', dayRel(-6))] })
if (!(await one('transport_orders', 'notes', 'DEMO: cursă dată la subcontractor'))) {
  const { data: ct, error } = await db.from('transport_orders').insert({ purpose: 'subcontracted_trip', trip_id: tSub.id, carrier_id: carrier2?.id || null, price: 1300, currency: 'EUR', fx_rate: 4.97, status: 'Executată', order_date: dayRel(-10), load_date: dayRel(-8), unload_date: dayRel(-6), notes: 'DEMO: cursă dată la subcontractor' }).select().single()
  if (error) throw new Error(`transport_orders: ${error.message}`)
  const { error: e2 } = await db.from('transport_order_goods').insert({ transport_order_id: ct.id, client_order_id: subOrder.id })
  if (e2) throw e2
}

console.log('Gata. Conturi de test (parola pentru toate: %s):', PASSWORD)
for (const u of USERS) console.log(`  ${u.role.padEnd(10)} ${u.email}`)
