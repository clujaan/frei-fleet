// Jurnal de activitate: citire din Supabase (scrierea o fac declanșatoarele din baza de date) + demo (localStorage).
import { STORAGE_PREFIX } from '../config/brand'
import { supabase, isDemo } from './supabase'

export const ENTITY_LABEL = {
  clients: 'Clienți', carriers: 'Transportatori', trips: 'Curse', transport_orders: 'Comenzi de transport', client_orders: 'Comenzi client', freight_offers: 'Burse și oferte',
  general_costs: 'Cheltuieli generale', expense_reports: 'Deconturi', expense_items: 'Linii de decont', documents: 'Fișiere', leads: 'Lead-uri',
  interactions: 'Interacțiuni', trucks: 'Camioane (Tools)', toll_countries: 'Taxe de drum – țări', toll_extras: 'Taxe de drum – suplimentare', offers: 'Oferte', invoices: 'Facturi emise', settings: 'Setări',
}
const FIELD_LABEL = {
  status: 'Status', price: 'Preț', currency: 'Monedă', payment_terms_days: 'Termen plată (zile)', payment_terms_from: 'Termen plată – de la', uit: 'Cod UIT', load_date: 'Data încărcării', unload_date: 'Data descărcării',
  load_address: 'Adresă încărcare', unload_address: 'Adresă descărcare', load_company: 'Încărcare - companie', load_street: 'Încărcare - stradă', load_zip: 'Încărcare - cod poștal',
  load_city: 'Încărcare - localitate', load_country: 'Încărcare - țară', unload_company: 'Descărcare - companie', unload_street: 'Descărcare - stradă', unload_zip: 'Descărcare - cod poștal',
  load_county: 'Încărcare - județ', unload_county: 'Descărcare - județ', load_contact: 'Încărcare - contact', unload_contact: 'Descărcare - contact', load_phone: 'Încărcare - telefon', unload_phone: 'Descărcare - telefon', client_type: 'Tip', zip: 'Cod poștal', city: 'Localitate', county: 'Județ', address: 'Stradă și număr',
  unload_city: 'Descărcare - localitate', unload_country: 'Descărcare - țară', extra_loads: 'Încărcări suplimentare', extra_unloads: 'Descărcări suplimentare', km: 'Km',
  revenue: 'Venit', cost: 'Cost', revenue_currency: 'Monedă venit', cost_currency: 'Monedă cost', fx_rate: 'Curs', service_type: 'Tip serviciu', carrier_paid_on: 'Data plății transportatorului',
  client_invoice_no: 'Nr. factură client', notes: 'Observații', company: 'Firmă', cui: 'CUI', country: 'Țară', email: 'Email', phone: 'Telefon', contact_name: 'Persoană de contact',
  plate_truck: 'Nr. cap tractor', plate_trailer: 'Nr. remorcă', driver_name: 'Șofer', driver_phone: 'Telefon șofer', cargo: 'Marfă', weight_kg: 'Greutate (kg)', lang: 'Limbă',
  sent_on: 'Data trimiterii', confirmed_on: 'Data confirmării', special_conditions: 'Detalii suplimentare', description: 'Descriere', category: 'Categorie', cost_type: 'Tip cost',
  amount_gross: 'Sumă brută', vendor: 'Furnizor', doc_no: 'Nr. document', doc_date: 'Data documentului', vat_amount: 'TVA', filename: 'Fișier',
}
export const fieldLabel = (k) => FIELD_LABEL[k] || k.replace(/_/g, ' ')
export const EVENT_LABEL = { pdf_download: 'PDF descărcat', email_sent: 'Mail trimis', file_open: 'Fișier deschis', cancel_reason: 'Motiv anulare', delete_reason: 'Motiv ștergere' }

const KEY = `${STORAGE_PREFIX}_demo_activity_v1`
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))
const readDemo = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}
const writeDemo = (rows) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 500)))
  } catch {
    /* ignorat */
  }
}
// folosit de entityApi (demo) ca să existe un jurnal și fără baza de date
export function demoLog(entry) {
  if (!isDemo) return
  writeDemo([{ id: uid(), at: new Date().toISOString(), user_email: 'demo@example.test', user_name: 'Demo', ...entry }, ...readDemo()])
}
export function diffRows(a, b) {
  const ch = {}
  for (const k of Object.keys(b)) {
    if (['updated_at', 'created_at', 'created_by'].includes(k)) continue
    if (JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b[k] ?? null)) ch[k] = [a?.[k] ?? null, b[k] ?? null]
  }
  return ch
}

export const PAGE = 100

export const ACTIVITY_API = {
  // filters: { entity, entityId, action, userEmail, from, to }
  async list(filters = {}, offset = 0) {
    if (isDemo) {
      let r = readDemo()
      if (filters.entity) r = r.filter((x) => x.entity === filters.entity)
      if (filters.entityId) r = r.filter((x) => x.entity_id === filters.entityId || x.detail?.entity_id === filters.entityId)
      if (filters.action) r = r.filter((x) => x.action === filters.action)
      if (filters.userEmail) r = r.filter((x) => x.user_email === filters.userEmail)
      if (filters.from) r = r.filter((x) => x.at >= filters.from)
      if (filters.to) r = r.filter((x) => x.at < filters.to)
      return r.slice(offset, offset + PAGE)
    }
    let q = supabase.from('activity_log').select('*').order('at', { ascending: false }).range(offset, offset + PAGE - 1)
    if (filters.entity) q = q.eq('entity', filters.entity)
    if (filters.entityId) q = q.or(`entity_id.eq.${filters.entityId},detail->>entity_id.eq.${filters.entityId}`)
    if (filters.action) q = q.eq('action', filters.action)
    if (filters.userEmail) q = q.eq('user_email', filters.userEmail)
    if (filters.from) q = q.gte('at', filters.from)
    if (filters.to) q = q.lt('at', filters.to)
    const { data, error } = await q
    if (error) throw new Error(error.message || 'Eroare la baza de date.')
    return data
  },
  // eveniment care nu e modificare de date (nu aruncă eroare dacă nu reușește)
  async event(entity, entityId, code, summary, detail = null) {
    try {
      if (isDemo) return demoLog({ action: 'event', entity, entity_id: entityId, record_code: code, summary, detail })
      await supabase.rpc('log_event', { p_entity: entity, p_entity_id: entityId, p_code: code, p_summary: summary, p_detail: detail })
    } catch {
      /* jurnalul nu trebuie să blocheze lucrul */
    }
  },
}
