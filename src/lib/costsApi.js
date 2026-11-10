import { STORAGE_PREFIX } from '../config/brand'
import { supabase, isDemo } from './supabase'
import { bnrRateOrNull, fetchBnrRate } from './bnr'
import { addDays, addMonths } from './costs'
import { normVendor } from './format'

const BUCKET = 'documents'
const safeName = (name) => String(name || 'fisier').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
const FIELDS = [
  'description', 'category', 'cost_type', 'vendor', 'doc_no', 'doc_date', 'amount_gross', 'currency', 'fx_rate', 'vat_rate',
  'vat_amount', 'vat_deductible', 'start_on', 'period_unit', 'period_count', 'end_on', 'expense_report_id', 'expense_item_id', 'notes',
]
const clean = (f) => {
  const o = {}
  for (const k of FIELDS) if (k in f) o[k] = f[k] === '' ? null : f[k]
  o.amount_gross = Number(o.amount_gross) || 0
  if (o.cost_type !== 'Unic - amortizat') {
    o.period_unit = null
    o.period_count = null
  }
  if (o.cost_type !== 'Recurent lunar' && o.cost_type !== 'Recurent anual') o.end_on = null
  return o
}
const fail = (error) => {
  if (error) throw new Error(error.message || 'Eroare la baza de date.')
}

// ---------------- Supabase ----------------
const supa = {
  async list() {
    const { data, error } = await supabase.from('general_costs').select('*, expense_reports(code)').order('start_on', { ascending: false })
    fail(error)
    return data.map(({ expense_reports, ...c }) => ({ ...c, report_code: expense_reports?.code || null }))
  },
  async save(id, fields) {
    const row = { ...clean(fields), updated_at: new Date().toISOString() }
    const q = id ? supabase.from('general_costs').update(row).eq('id', id) : supabase.from('general_costs').insert(row)
    const { data, error } = await q.select().single()
    fail(error)
    return data
  },
  async remove(id) {
    const { error } = await supabase.from('general_costs').delete().eq('id', id)
    fail(error)
  },
  async insertMany(rows) {
    const { data, error } = await supabase.from('general_costs').insert(rows.map(clean)).select()
    fail(error)
    return data
  },
  async uploadFile(cost, file) {
    const path = `costuri/${cost.code}/${Date.now()}-${safeName(file.name)}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
    fail(error)
    const { data, error: e2 } = await supabase.from('documents').insert({ entity: 'general_cost', entity_id: cost.id, path, filename: file.name, mime: file.type, size_bytes: file.size }).select().single()
    fail(e2)
    return data
  },
  async listFiles(costId) {
    const { data, error } = await supabase.from('documents').select('*').eq('entity', 'general_cost').eq('entity_id', costId).order('created_at')
    fail(error)
    return data
  },
  async fileUrl(doc) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.path, 3600)
    fail(error)
    return data.signedUrl
  },
  async deleteFile(doc) {
    await supabase.storage.from(BUCKET).remove([doc.path])
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    fail(error)
  },
  // care linii de decont au fost deja trecute în costuri (ca să nu le adăugăm de două ori)
  async linkedItems() {
    const { data, error } = await supabase.from('general_costs').select('code, expense_report_id, expense_item_id').not('expense_report_id', 'is', null)
    fail(error)
    return data
  },
}

// ---------------- Demo (localStorage) ----------------
const KEY = `${STORAGE_PREFIX}_demo_costs_v1`
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))
function seed() {
  const mk = (n, f) => ({ id: uid(), code: `CG-${String(n).padStart(3, '0')}`, currency: 'RON', fx_rate: null, vat_rate: 0.21, vat_amount: null, vat_deductible: true, vendor: null, doc_no: null, doc_date: null, period_unit: null, period_count: null, end_on: null, expense_report_id: null, expense_item_id: null, report_code: null, notes: null, created_at: new Date().toISOString(), ...f })
  return {
    n: 4,
    rows: [
      mk(1, { description: 'Chirie birou Pro Invest Real Estate', category: 'Chirie / birou', cost_type: 'Recurent lunar', amount_gross: 1602.85, start_on: '2026-10-12', vendor: 'Pro Invest Real Estate' }),
      mk(2, { description: 'Digi Romania internet', category: 'Telecom', cost_type: 'Recurent lunar', amount_gross: 81.15, start_on: '2026-10-06', vendor: 'Digi Romania' }),
      mk(3, { description: 'Monitoare + prelungitoare', category: 'Echipamente birou', cost_type: 'Unic - amortizat', amount_gross: 2510, period_unit: 'Luni', period_count: 24, start_on: '2026-10-05' }),
    ],
  }
}
let db
try {
  db = JSON.parse(localStorage.getItem(KEY)) || seed()
} catch {
  db = seed()
}
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* ignorat */
  }
}
const demoFiles = new Map()
let demoDocs = []
const demo = {
  async list() {
    return [...db.rows].sort((a, b) => String(b.start_on).localeCompare(String(a.start_on)))
  },
  async save(id, fields) {
    const row = clean(fields)
    if (id) {
      const at = db.rows.findIndex((r) => r.id === id)
      db.rows[at] = { ...db.rows[at], ...row }
      persist()
      return db.rows[at]
    }
    const r = { id: uid(), code: `CG-${String(db.n++).padStart(3, '0')}`, report_code: null, created_at: new Date().toISOString(), ...row }
    db.rows.push(r)
    persist()
    return r
  },
  async remove(id) {
    db.rows = db.rows.filter((r) => r.id !== id)
    persist()
  },
  async insertMany(rows) {
    const out = []
    for (const f of rows) out.push(await demo.save(null, f))
    return out
  },
  async uploadFile(cost, file) {
    const doc = { id: uid(), entity: 'general_cost', entity_id: cost.id, path: `demo/${uid()}`, filename: file.name, mime: file.type, size_bytes: file.size }
    demoFiles.set(doc.id, file)
    demoDocs.push(doc)
    return doc
  },
  async listFiles(costId) {
    return demoDocs.filter((d) => d.entity_id === costId)
  },
  async fileUrl(doc) {
    const f = demoFiles.get(doc.id)
    return f ? URL.createObjectURL(f) : null
  },
  async deleteFile(doc) {
    demoDocs = demoDocs.filter((d) => d.id !== doc.id)
    demoFiles.delete(doc.id)
  },
  async linkedItems() {
    return db.rows.filter((r) => r.expense_report_id).map((r) => ({ code: r.code, expense_report_id: r.expense_report_id, expense_item_id: r.expense_item_id }))
  },
}

const base0 = isDemo ? demo : supa
const fxDate = (c) => String(c.doc_date || c.start_on || '').slice(0, 10)
// La un cost nou fără curs, completează cursul BNR din data documentului (sau data de start); dacă BNR nu răspunde, se salvează fără curs.
const base = {
  ...base0,
  async save(id, fields) {
    let f = fields
    if (!id && !(Number(f.fx_rate) > 0) && fxDate(f)) {
      const r = await bnrRateOrNull(fxDate(f))
      if (r) f = { ...f, fx_rate: r.rate }
    }
    return base0.save(id, f)
  },
}

export const costsApi = {
  ...base,
  // Completează cursul BNR la costurile fără curs. Întoarce { done: [coduri], failed: [coduri] }.
  async fillMissingFx(rows) {
    const done = []
    const failed = []
    let error = ''
    for (const c of rows) {
      if (Number(c.fx_rate) > 0 || !fxDate(c)) continue
      try {
        const r = await fetchBnrRate(fxDate(c))
        await base0.save(c.id, { ...c, fx_rate: r.rate })
        done.push(c.code)
      } catch (e) {
        failed.push(c.code)
        error = error || e.message
        if (!done.length && failed.length >= 2) { failed.push(...rows.filter((x) => !(Number(x.fx_rate) > 0)).map((x) => x.code).filter((k) => !failed.includes(k))); break } // BNR nu răspunde deloc: ne oprim
      }
    }
    return { done, failed, error }
  },
  // Un cost recurent nou de la același furnizor încheie rândul recurent anterior rămas deschis (ca să nu se numere de două ori).
  async closePrevious(saved, rows) {
    if (saved.cost_type !== 'Recurent lunar' && saved.cost_type !== 'Recurent anual') return []
    const v = normVendor(saved.vendor)
    if (!v) return []
    const prev = rows.filter((c) => c.id !== saved.id && c.cost_type === saved.cost_type && !c.end_on && normVendor(c.vendor) === v && String(c.start_on) < String(saved.start_on))
    for (const c of prev) await base.save(c.id, { ...c, end_on: addDays(saved.start_on, -1) })
    return prev.map((c) => c.code)
  },
  // Rând nou pentru luna următoare (factura lunii următoare are alt număr și alt curs);
  // rândul vechi, dacă nu are dată de sfârșit, se încheie în ziua dinainte.
  async nextMonth(c) {
    const start = addMonths(c.start_on, c.cost_type === 'Recurent anual' ? 12 : 1)
    if (!c.end_on) await base.save(c.id, { ...c, end_on: addDays(start, -1) })
    return base.save(null, {
      ...c,
      doc_no: null,
      doc_date: null,
      fx_rate: null, // cursul BNR se completează automat pentru noua dată
      start_on: start,
      end_on: null,
      expense_report_id: null,
      expense_item_id: null,
    })
  },
}
