// Mod demo: același API ca cel Supabase, dar datele stau în localStorage.
// Pornește cu două foi FICTIVE (FD-2026-001 și FD-2026-002), ca să poți încerca aplicația fără Supabase.
import { STORAGE_PREFIX } from '../config/brand'
import { computeTotals, sameDocument, todayISO } from './format'

const KEY = `${STORAGE_PREFIX}_demo_deconturi_v1`
const files = new Map() // doc.id -> File (doar în memorie în demo)

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))

function seed() {
  const mk = (code, employee, items) => {
    const id = uid()
    const its = items.map((it, i) => ({
      id: uid(),
      report_id: id,
      line_no: i + 1,
      cui_ok: true,
      vat_overridden: false,
      original_amount: null,
      original_currency: null,
      fx_rate: null,
      ...it,
    }))
    return {
      report: {
        id,
        code,
        employee,
        report_date: '2026-10-07',
        purpose: 'Echipamente și achiziții pentru birou',
        payment_method: 'Card personal',
        status: 'Emis',
        ...computeTotals(its),
        sent_on: null,
        reimbursed_on: null,
        pdf_path: null,
        notes: null,
        created_at: '2026-10-07T09:00:00Z',
      },
      items: its,
    }
  }
  // Date FICTIVE, doar pentru modul demo.
  const a = mk('FD-2026-001', 'Demo User', [
    { doc_date: '2026-10-06', vendor: 'Magazin Exemplu SRL', doc_no: 'EX-0001', description: 'Imprimantă (exemplu)', amount_gross: 1210, vat_amount: 210 },
    { doc_date: '2026-10-06', vendor: 'Papetărie Demo SRL', doc_no: 'Bon fiscal: 0006', description: 'Ștampilă (exemplu)', amount_gross: 121, vat_amount: 21 },
  ])
  const b = mk('FD-2026-002', 'Demo User', [
    { doc_date: '2026-10-02', vendor: 'Magazin Exemplu SRL', doc_no: 'EX-0002', description: 'Monitor (exemplu)', amount_gross: 605, vat_amount: 105 },
    { doc_date: '2026-10-06', vendor: 'Papetărie Demo SRL', doc_no: 'Bon fiscal: 0032', description: 'Hârtie copiator A4 (exemplu)', amount_gross: 60.5, vat_amount: 10.5 },
  ])
  return { reports: [a.report, b.report], items: [...a.items, ...b.items], docs: [], counters: { 'FD-2026': 2 } }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* localStorage indisponibil: continuăm cu datele inițiale */
  }
  return seed()
}

let db = load()
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* ignorat */
  }
}

const itemsOf = (reportId) => db.items.filter((i) => i.report_id === reportId).sort((a, b) => a.line_no - b.line_no)

export const demoApi = {
  async listReports() {
    return [...db.reports].sort((a, b) => b.code.localeCompare(a.code))
  },

  async getReport(id) {
    const report = db.reports.find((r) => r.id === id)
    if (!report) throw new Error('Foaia nu există.')
    const items = itemsOf(id)
    const ids = new Set(items.map((i) => i.id))
    return { report: { ...report }, items, docs: db.docs.filter((d) => ids.has(d.entity_id)) }
  },

  async createReport({ employee, report_date, purpose, payment_method }) {
    const year = (report_date || todayISO()).slice(0, 4)
    const key = `FD-${year}`
    db.counters[key] = (db.counters[key] || 0) + 1
    const report = {
      id: uid(),
      code: `${key}-${String(db.counters[key]).padStart(3, '0')}`,
      employee,
      report_date: report_date || todayISO(),
      purpose: purpose || '',
      payment_method: payment_method || 'Card personal',
      status: 'Ciornă',
      total_gross: 0,
      total_vat: 0,
      doc_count: 0,
      sent_on: null,
      reimbursed_on: null,
      pdf_path: null,
      notes: null,
      created_at: new Date().toISOString(),
    }
    db.reports.push(report)
    save()
    return { ...report }
  },

  async saveReport(id, fields, items) {
    const r = db.reports.find((x) => x.id === id)
    if (!r) throw new Error('Foaia nu există.')
    Object.assign(r, fields, computeTotals(items))
    const keep = new Set(items.map((i) => i.id))
    db.items = db.items.filter((i) => i.report_id !== id || keep.has(i.id))
    items.forEach((it, idx) => {
      const row = { ...it, report_id: id, line_no: idx + 1 }
      const at = db.items.findIndex((x) => x.id === it.id)
      if (at >= 0) db.items[at] = row
      else db.items.push(row)
    })
    save()
    return { ...r }
  },

  async setStatus(id, status, extra = {}) {
    const r = db.reports.find((x) => x.id === id)
    Object.assign(r, { status }, extra)
    save()
    return { ...r }
  },

  async findDuplicates(item, excludeReportId) {
    const out = []
    for (const it of db.items) {
      if (it.report_id === excludeReportId) continue
      const reason = sameDocument(item, it)
      if (!reason) continue
      const r = db.reports.find((x) => x.id === it.report_id)
      if (r && r.status !== 'Anulat' && it.cui_ok !== false) out.push({ code: r.code, reason })
    }
    return out
  },

  async uploadFile(_reportCode, itemId, file) {
    const doc = { id: uid(), entity: 'expense_item', entity_id: itemId, path: `demo/${uid()}`, filename: file.name, mime: file.type, size_bytes: file.size }
    files.set(doc.id, file)
    db.docs.push(doc)
    save()
    return doc
  },

  async deleteFile(doc) {
    db.docs = db.docs.filter((d) => d.id !== doc.id)
    files.delete(doc.id)
    save()
  },

  async fileUrl(doc) {
    const f = files.get(doc.id)
    return f ? URL.createObjectURL(f) : null // după reîncărcare, în demo atașamentele nu se mai păstrează
  },

  async uploadPdf(reportId, code) {
    const path = `demo/${code}.pdf`
    const r = db.reports.find((x) => x.id === reportId)
    r.pdf_path = path
    save()
    return path
  },
}
