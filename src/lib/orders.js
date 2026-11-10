// Comenzi de transport către transportatori: constante, API, verificări.
import { supabase, isDemo } from './supabase'
import { makeEntityApi } from './entityApi'
import { foldText } from './costs'
import { syncTripFromOrder } from './trips'

// Codurile UIT dintr-un câmp (unul pe rând sau separate prin spațiu / virgulă)
export const uitList = (u) => String(u || '').split(/[\s,;]+/).filter(Boolean)

// Valoarea din baza de date rămâne „Semnată încărcată”; pe ecran se afișează „Încărcat” / „Loaded”.
export const orderStatusLabel = (s, lang = 'ro') => (s === 'Semnată încărcată' ? (lang === 'en' ? 'Loaded' : 'Încărcat') : s === 'Executată' ? (lang === 'en' ? 'Delivered' : 'Livrat') : s)
export const ORDER_STATUSES = ['Ciornă', 'Trimisă', 'Confirmată', 'Semnată încărcată', 'Executată', 'Anulată']
export const ORDER_STYLE = {
  Ciornă: 'border-slate-300 bg-slate-100 text-slate-600',
  Trimisă: 'border-sky-300 bg-sky-50 text-sky-700',
  Confirmată: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  'Semnată încărcată': 'border-amber-300 bg-amber-50 text-amber-700',
  Executată: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  Anulată: 'border-rose-300 bg-rose-50 text-rose-700',
}

const YEAR = new Date().getFullYear()
const F = [
  ['status', 'text'], ['lang', 'text'], ['order_date', 'date'], ['trip_id', 'text'], ['carrier_id', 'text'],
  ['load_date', 'date'], ['load_address', 'text'], ['load_contact', 'text'], ['load_window', 'text'], ['load_ref', 'text'],
  ['unload_date', 'date'], ['unload_address', 'text'], ['unload_contact', 'text'], ['unload_window', 'text'], ['unload_ref', 'text'],
  ['cargo', 'text'], ['weight_kg', 'number'], ['packages', 'text'], ['ldm', 'number'], ['adr', 'bool'], ['temperature', 'text'], ['truck_type', 'text'],
  ['price', 'number'], ['currency', 'text'], ['payment_terms_days', 'number'], ['payment_terms_from', 'text'], ['uit', 'text'], ['plate_truck', 'text'], ['plate_trailer', 'text'],
  ['stops', 'json'], ['driver_name', 'text'], ['driver_phone', 'text'], ['special_conditions', 'text'], ['sent_on', 'date'], ['confirmed_on', 'date'], ['notes', 'text'],
  ['purpose', 'text'], ['fx_rate', 'number'],
]
// distribution = livrare subcontractată a uneia sau mai multor mărfuri (implicit); subcontracted_trip = toată cursa dată unui transportator
export const CT_PURPOSES = { distribution: ['Distribuție (mărfuri din bază)', 'Distribution (goods from base)'], subcontracted_trip: ['Cursă subcontractată', 'Subcontracted trip'] }
const ORDERS_BASE = makeEntityApi({
  table: 'transport_orders',
  prefix: `CT-${YEAR}`,
  pad: 3,
  fields: F.map(([key, type]) => ({ key, type })),
  seed: [],
})

export const ORDERS_API = {
  ...ORDERS_BASE,
  async save(id, fields) {
    const r = await ORDERS_BASE.save(id, fields)
    await syncTripFromOrder(r).catch(() => {})
    return r
  },
  async remove(id) {
    const row = (await ORDERS_BASE.list()).find((o) => o.id === id)
    await ORDERS_BASE.remove(id)
    if (row) await syncTripFromOrder(row, true).catch(() => {})
  },
}

// Corespondența inversă: statusul cursei → comanda de transport activă. Planificată readuce la Confirmată o comandă deja Încărcat / Livrat.
export async function syncOrderFromTripStatus(trip, order) {
  if (!trip || !order || order.status === 'Anulată') return null
  let next = null
  if (trip.status === 'În curs') next = 'Semnată încărcată'
  else if (trip.status === 'Livrată') next = 'Executată'
  else if (trip.status === 'Planificată' && ['Semnată încărcată', 'Executată'].includes(order.status)) next = 'Confirmată'
  if (!next || next === order.status) return null
  const row = { ...order, status: next }
  if ((next === 'Confirmată' || next === 'Semnată încărcată') && !row.confirmed_on) row.confirmed_on = new Date().toISOString().slice(0, 10)
  return ORDERS_API.save(order.id, row)
}

export function checkOrder(o, trip, carrier) {
  const w = []
  if (!o.carrier_id) w.push('carrier')
  if (!(Number(o.price) > 0)) w.push('price')
  if (!o.load_date) w.push('loadDate')
  if (!o.load_address || !o.unload_address) w.push('address')
  if (o.load_date && o.unload_date && o.unload_date < o.load_date) w.push('dates')
  if (trip && trip.kind === 'subcontracted' && Number(o.price) > 0 && Number(trip.cost) > 0 && Number(o.price) !== Number(trip.cost)) w.push('tripPrice')
  // asigurarea CMR a transportatorului: lipsă sau expirată la data încărcării
  if (carrier && o.carrier_id && (!carrier.cmr_insurance_until || String(carrier.cmr_insurance_until) < String(o.load_date || new Date().toISOString().slice(0, 10)))) w.push('cmr')
  return w
}

export const orderHaystack = (o, carrier, trip) => foldText([
  o.code, o.status, carrier, trip?.code, o.load_address, o.unload_address, o.load_contact, o.unload_contact, o.load_ref, o.unload_ref, o.cargo, o.truck_type,
  o.uit, o.plate_truck, o.plate_trailer, o.driver_name, o.driver_phone, o.special_conditions, o.notes, o.price, o.currency, o.order_date, o.load_date, o.unload_date,
].join(' | '))

// ---- mărfurile (comenzi client) duse de un CT ----
const GOODS_KEY = 'demo_transport_order_goods_v1'
const demoLinks = () => { try { return JSON.parse(localStorage.getItem(GOODS_KEY)) || [] } catch { return [] } }
export const CT_GOODS_API = {
  async list() {
    if (isDemo) return demoLinks()
    const { data, error } = await supabase.from('transport_order_goods').select('transport_order_id, client_order_id')
    if (error) throw new Error(error.message)
    return data
  },
  // înlocuiește lista de mărfuri a unui CT
  async setFor(ctId, ccIds) {
    const want = [...new Set((ccIds || []).filter(Boolean))]
    if (isDemo) {
      const rows = demoLinks().filter((l) => l.transport_order_id !== ctId).concat(want.map((id) => ({ transport_order_id: ctId, client_order_id: id })))
      try { localStorage.setItem(GOODS_KEY, JSON.stringify(rows)) } catch { /* ignorat */ }
      return
    }
    const { data: cur, error } = await supabase.from('transport_order_goods').select('id, client_order_id').eq('transport_order_id', ctId)
    if (error) throw new Error(error.message)
    const gone = cur.filter((r) => !want.includes(r.client_order_id)).map((r) => r.id)
    const add = want.filter((id) => !cur.some((r) => r.client_order_id === id))
    if (gone.length) { const { error: e } = await supabase.from('transport_order_goods').delete().in('id', gone); if (e) throw new Error(e.message) }
    if (add.length) { const { error: e } = await supabase.from('transport_order_goods').insert(add.map((id) => ({ transport_order_id: ctId, client_order_id: id }))); if (e) throw new Error(e.message) }
  },
}

// ---- atașamente (comanda semnată, CMR etc.) ----
const BUCKET = 'documents'
const safeName = (name) => String(name || 'fisier').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))
const fail = (error) => {
  if (error) throw new Error(error.message || 'Eroare la baza de date.')
}
const demoDocs = []
const demoFiles = new Map()
export const ORDER_FILES = isDemo
  ? {
    async list(id) { return demoDocs.filter((d) => d.entity_id === id) },
    async upload(order, file) {
      const d = { id: uid(), entity: 'transport_order', entity_id: order.id, path: `demo/${uid()}`, filename: file.name, mime: file.type, size_bytes: file.size }
      demoDocs.push(d)
      demoFiles.set(d.id, file)
      return d
    },
    async url(d) { const f = demoFiles.get(d.id); return f ? URL.createObjectURL(f) : null },
    async remove(d) { const i = demoDocs.findIndex((x) => x.id === d.id); if (i >= 0) demoDocs.splice(i, 1) },
  }
  : {
    async list(id) {
      const { data, error } = await supabase.from('documents').select('*').eq('entity', 'transport_order').eq('entity_id', id).order('created_at')
      fail(error)
      return data
    },
    async upload(order, file) {
      const path = `comenzi/${order.code}/${Date.now()}-${safeName(file.name)}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
      fail(error)
      const { data, error: e2 } = await supabase.from('documents').insert({ entity: 'transport_order', entity_id: order.id, path, filename: file.name, mime: file.type, size_bytes: file.size }).select().single()
      fail(e2)
      return data
    },
    async url(d) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.path, 3600)
      fail(error)
      return data.signedUrl
    },
    async remove(d) {
      await supabase.storage.from(BUCKET).remove([d.path])
      const { error } = await supabase.from('documents').delete().eq('id', d.id)
      fail(error)
    },
  }
