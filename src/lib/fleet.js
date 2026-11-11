// Flotă: camioane (tabelul din Tools, extins), remorci, șoferi, salarii (protejate), diurnă.
import { STORAGE_PREFIX } from '../config/brand'
import { supabase, isDemo } from './supabase'
import { makeEntityApi } from './entityApi'
import { TRUCKS } from './trucks'

export const TRUCKS_API = TRUCKS.api
export const TRAILER_TYPES = ['Prelată', 'Frigorific', 'Megatrailer', 'Platformă', 'Alt tip']

export const TRAILERS_API = makeEntityApi({
  table: 'trailers', prefix: 'RM', pad: 3, seed: [],
  fields: [{ key: 'plate' }, { key: 'trailer_type' }, { key: 'status' }, { key: 'notes' }],
})

export const DRIVERS_API = makeEntityApi({
  table: 'drivers', prefix: 'SF', pad: 3, seed: [],
  fields: [{ key: 'full_name' }, { key: 'phone' }, { key: 'email' }, { key: 'status' }, { key: 'default_truck_id' }, { key: 'notes' }],
})

// Diurnă: driver_id gol = tarif implicit al firmei; country gol = oricare țară
const RATES = makeEntityApi({
  table: 'per_diem_rates', prefix: 'DI', pad: 3, seed: [],
  fields: [{ key: 'driver_id' }, { key: 'country' }, { key: 'amount_day', type: 'number' }, { key: 'currency' }, { key: 'valid_from', type: 'date' }, { key: 'notes' }],
})
export const PER_DIEM_API = {
  ...RATES,
  async list() {
    if (isDemo) return RATES.list()
    const { data, error } = await supabase.from('per_diem_rates').select('*').order('valid_from', { ascending: false })
    if (error) throw new Error(error.message)
    return data
  },
}

// Salarii: tabel separat, vizibil doar pentru patron (și contabil, dacă patronul permite). Regula e în baza de date (RLS).
const DEMO_PAY_KEY = `${STORAGE_PREFIX}_demo_driver_pay_v1`
const demoPay = () => { try { return JSON.parse(localStorage.getItem(DEMO_PAY_KEY)) || [] } catch { return [] } }
export const PAY_API = {
  async canSee() {
    if (isDemo) return true
    const { data, error } = await supabase.rpc('can_see_payroll')
    return !error && data === true
  },
  async list() {
    if (isDemo) return demoPay()
    const { data, error } = await supabase.from('driver_pay').select('*')
    if (error) throw new Error(error.message)
    return data
  },
  async save(driverId, f) {
    const n = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))
    const row = { driver_id: driverId, monthly_gross: n(f.monthly_gross), employer_cost_month: n(f.employer_cost_month), employer_pct: n(f.employer_pct), currency: f.currency === 'EUR' ? 'EUR' : 'RON' }
    if (isDemo) {
      const rows = demoPay().filter((r) => r.driver_id !== driverId)
      rows.push(row)
      try { localStorage.setItem(DEMO_PAY_KEY, JSON.stringify(rows)) } catch { /* ignorat */ }
      return row
    }
    const { data, error } = await supabase.from('driver_pay').upsert(row, { onConflict: 'driver_id' }).select().single()
    if (error) throw new Error(error.message)
    return data
  },
}

// Costul lunar al angajatorului (calculul e în fleetCosts.js, testat)
export { monthlyEmployerCost } from './fleetCosts'

export const truckLabel = (t) => (t ? [t.plate, [t.make, t.model].filter(Boolean).join(' ') || t.label].filter(Boolean).join(' · ') : '')
export const activeOr = (rows, id) => (rows || []).filter((r) => r.status !== 'Inactiv' || r.id === id)
