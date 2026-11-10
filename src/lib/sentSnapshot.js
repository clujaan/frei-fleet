// Amprente „trimis": ce date aveau cursa și comanda în momentul trimiterii. Dacă ulterior se schimbă ceva important, apare o avertizare.
// Stocate în tabelul separat sent_snapshots (migrarea 027). Dacă tabelul nu există încă, nu apare nicio avertizare și nimic nu se strică.
import { STORAGE_PREFIX } from '../config/brand'
import { useCallback, useEffect, useState } from 'react'
import { supabase, isDemo } from './supabase'
import { tripToStops } from './orderStops'
import { cleanGoods } from './goods'

const TABLE = { ct: 'transport_orders', cc: 'client_orders' }
const LABEL = {
  loadDate: ['data încărcării', 'loading date'],
  unloadDate: ['data descărcării', 'unloading date'],
  stops: ['adresele / punctele', 'addresses / stops'],
  goods: ['marfa (paleți, greutate)', 'goods (pallets, weight)'],
  price: ['prețul', 'price'],
  party_ct: ['transportatorul', 'carrier'],
  party_cc: ['clientul', 'customer'],
}
const norm = (x) => String(x || '').trim().toLowerCase()
const nz = (v) => (v == null || v === '' ? null : Number(v))
const sig = (s) => ['side', 'company', 'street', 'zip', 'city', 'country', 'date'].map((k) => norm(s?.[k])).join('|')

// Marfa de pe puncte: tip, număr, greutate, dimensiuni, LDM, descriere
const goodsSig = (stops) => (Array.isArray(stops) ? stops : []).flatMap((s) => cleanGoods(s?.goods).map((g) => [g.type, norm(g.qty), norm(g.weight), norm(g.dims), norm(g.ldm), norm(g.desc)].join(':')))

function orderStopSigs(o) {
  const list = Array.isArray(o.stops) ? o.stops : []
  if (list.length) return list.map(sig)
  return [norm(o.load_address), norm(o.unload_address)].filter(Boolean)
}

// Amprenta unei comenzi (după datele ei). În modelul cursă-circuit, punctele și prețul stau pe comandă, nu pe cursă,
// deci se compară doar comanda; partea „trip" se mai face doar pentru cursele vechi care au încă puncte proprii.
export function fpOf(kind, order, trip) {
  const o = order
  const party = kind === 'cc' ? 'client_id' : 'carrier_id'
  const out = {
    order: { loadDate: o.load_date || '', unloadDate: o.unload_date || '', stops: orderStopSigs(o), goods: goodsSig(o.stops), price: [nz(o.price), o.currency || ''], [`party_${kind}`]: o[party] || '' },
  }
  if (trip && tripToStops(trip).some((x) => x.company || x.city || x.date)) {
    const [pv, pc] = kind === 'cc' ? [trip.revenue, trip.revenue_currency] : [trip.cost, trip.cost_currency]
    out.trip = { loadDate: trip.load_date || '', unloadDate: trip.unload_date || '', stops: tripToStops(trip).map(sig), goods: goodsSig(tripToStops(trip)), price: [nz(pv), pc || ''], [`party_${kind}`]: trip[party] || '' }
  }
  return out
}

export function staleKeys(snap, cur) {
  const keys = new Set()
  for (const part of ['trip', 'order']) {
    const a = snap?.[part]
    const b = cur?.[part]
    if (!a || !b) continue
    // amprentele vechi (făcute înainte să urmărim marfa) nu au cheia: nu se compară, ca să nu apară avertizări false
    for (const k of Object.keys(b)) if (a[k] !== undefined && JSON.stringify(a[k]) !== JSON.stringify(b[k])) keys.add(k)
  }
  return [...keys]
}

export const staleLabels = (keys, lang = 'ro') => keys.map((k) => (LABEL[k] || [k, k])[lang === 'en' ? 1 : 0])

export const isSent = (kind, o) => (kind === 'cc' ? !!o.sent_at : !!o.sent_on && !['Ciornă', 'Anulată', 'Executată'].includes(o.status))

// Labels (listă) cu ce s-a schimbat după trimitere; [] dacă nu e trimisă, nu are amprentă sau nu s-a schimbat nimic.
export function changesFor(kind, o, trip, snap, lang) {
  if (!o || !snap || !isSent(kind, o)) return []
  return staleLabels(staleKeys(snap, fpOf(kind, o, trip)), lang)
}

const DEMO_KEY = `${STORAGE_PREFIX}_demo_sent_snapshots`
const demoRead = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || [] } catch { return [] } }
const ping = () => { try { window.dispatchEvent(new Event(`${STORAGE_PREFIX}-snaps`)) } catch { /* ignorat */ } }

export const SNAPS = {
  async list(entity) {
    if (isDemo) return demoRead().filter((r) => r.entity === entity)
    const { data, error } = await supabase.from('sent_snapshots').select('entity_id, snapshot').eq('entity', entity)
    return error ? [] : data
  },
  async set(entity, id, snapshot, { onlyIfMissing = false } = {}) {
    if (!id) return
    if (isDemo) {
      const rows = demoRead()
      const at = rows.findIndex((r) => r.entity === entity && r.entity_id === id)
      if (at >= 0 && onlyIfMissing) return
      const row = { entity, entity_id: id, snapshot }
      if (at >= 0) rows[at] = row; else rows.push(row)
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(rows)) } catch { /* ignorat */ }
      ping()
      return
    }
    const { error } = await supabase.from('sent_snapshots').upsert({ entity, entity_id: id, snapshot, taken_at: new Date().toISOString() }, { onConflict: 'entity,entity_id', ignoreDuplicates: onlyIfMissing })
    if (!error) ping()
  },
}

// La trimitere sau la „Am verificat": reține datele de acum
export const takeSnapshot = (kind, o, trip) => SNAPS.set(TABLE[kind], o.id, fpOf(kind, o, trip)).catch(() => {})

// Hook: amprentele unui tip de comenzi { [orderId]: snapshot } + reload automat când se schimbă
export function useSnaps(kind) {
  const entity = TABLE[kind]
  const [snaps, setSnaps] = useState({})
  const [ready, setReady] = useState(false)
  const reload = useCallback(() => SNAPS.list(entity).then((rows) => { setSnaps(Object.fromEntries(rows.map((r) => [r.entity_id, r.snapshot]))); setReady(true) }).catch(() => setReady(true)), [entity])
  useEffect(() => {
    reload()
    window.addEventListener(`${STORAGE_PREFIX}-snaps`, reload)
    return () => window.removeEventListener(`${STORAGE_PREFIX}-snaps`, reload)
  }, [reload])
  return { snaps, ready, reload }
}

// Comenzile deja trimise înainte de această funcție: amprenta de plecare = datele de acum, dar DOAR dacă cursa nu s-a schimbat după trimitere.
// Nu suprascrie niciodată o amprentă existentă.
export function baselineSnaps(kind, orders, tripById, snaps) {
  for (const o of orders || []) {
    if (snaps[o.id] || !isSent(kind, o)) continue
    const trip = tripById[o.trip_id]
    const unchanged = !trip || (kind === 'cc' ? new Date(trip.updated_at || 0) <= new Date(o.sent_at) : String(trip.updated_at || '').slice(0, 10) <= String(o.sent_on))
    if (unchanged) SNAPS.set(TABLE[kind], o.id, fpOf(kind, o, trip), { onlyIfMissing: true }).catch(() => {})
  }
}
