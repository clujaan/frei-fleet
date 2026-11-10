import { supabase, isDemo } from './supabase'
import { demoApi } from './deconturiDemo'
import { computeTotals, normDocNo, sameDocument } from './format'

const BUCKET = 'documents'

const safeName = (name) =>
  String(name || 'fisier')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')

const fail = (error) => {
  if (error) throw new Error(error.message || 'Eroare la baza de date.')
}

const supa = {
  async listReports() {
    const { data, error } = await supabase.from('expense_reports').select('*').order('code', { ascending: false })
    fail(error)
    return data
  },

  async getReport(id) {
    const { data: report, error } = await supabase.from('expense_reports').select('*').eq('id', id).single()
    fail(error)
    const { data: items, error: e2 } = await supabase.from('expense_items').select('*').eq('report_id', id).order('line_no')
    fail(e2)
    let docs = []
    if (items.length) {
      const { data, error: e3 } = await supabase
        .from('documents')
        .select('*')
        .eq('entity', 'expense_item')
        .in('entity_id', items.map((i) => i.id))
      fail(e3)
      docs = data
    }
    return { report, items, docs }
  },

  async createReport({ employee, report_date, purpose, payment_method }) {
    const { data, error } = await supabase
      .from('expense_reports')
      .insert({ employee, report_date, purpose, payment_method })
      .select()
      .single()
    fail(error)
    return data
  },

  async saveReport(id, fields, items) {
    const { error } = await supabase
      .from('expense_reports')
      .update({ ...fields, ...computeTotals(items) })
      .eq('id', id)
    fail(error)

    const { data: existing, error: e1 } = await supabase.from('expense_items').select('id').eq('report_id', id)
    fail(e1)
    const keep = new Set(items.map((i) => i.id))
    const removed = existing.map((r) => r.id).filter((x) => !keep.has(x))
    if (removed.length) {
      const { error: e2 } = await supabase.from('expense_items').delete().in('id', removed)
      fail(e2)
    }
    if (items.length) {
      const rows = items.map((it, idx) => ({ ...it, report_id: id, line_no: idx + 1 }))
      const { error: e3 } = await supabase.from('expense_items').upsert(rows, { onConflict: 'id' })
      fail(e3)
    }
    const { data, error: e4 } = await supabase.from('expense_reports').select('*').eq('id', id).single()
    fail(e4)
    return data
  },

  async setStatus(id, status, extra = {}) {
    const { data, error } = await supabase.from('expense_reports').update({ status, ...extra }).eq('id', id).select().single()
    fail(error)
    return data
  },

  async findDuplicates(item, excludeReportId) {
    const cols = 'doc_no, vendor, doc_date, amount_gross, cui_ok, report_id, expense_reports(code, status)'
    const found = []
    const core = normDocNo(item.doc_no)
    if (core.length >= 2) {
      const { data, error } = await supabase.from('expense_items').select(cols).ilike('doc_no', `%${core}%`).neq('report_id', excludeReportId)
      fail(error)
      found.push(...data)
    }
    if (item.doc_date && Number(item.amount_gross) > 0) {
      const { data, error } = await supabase
        .from('expense_items')
        .select(cols)
        .eq('doc_date', item.doc_date)
        .eq('amount_gross', Number(item.amount_gross))
        .neq('report_id', excludeReportId)
      fail(error)
      found.push(...data)
    }
    const out = new Map()
    for (const r of found) {
      const reason = sameDocument(item, r)
      if (!reason || !r.expense_reports || r.expense_reports.status === 'Anulat' || r.cui_ok === false) continue
      out.set(`${r.expense_reports.code}|${reason}`, { code: r.expense_reports.code, reason })
    }
    return [...out.values()]
  },

  async uploadFile(reportCode, itemId, file) {
    const path = `deconturi/${reportCode}/${itemId}-${Date.now()}-${safeName(file.name)}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
    fail(error)
    const { data, error: e2 } = await supabase
      .from('documents')
      .insert({ entity: 'expense_item', entity_id: itemId, path, filename: file.name, mime: file.type, size_bytes: file.size })
      .select()
      .single()
    fail(e2)
    return data
  },

  async deleteFile(doc) {
    await supabase.storage.from(BUCKET).remove([doc.path])
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    fail(error)
  },

  async fileUrl(doc) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.path, 3600)
    fail(error)
    return data.signedUrl
  },

  async uploadPdf(reportId, code, blob) {
    const path = `deconturi/${code}/${code}.pdf`
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: true })
    fail(error)
    const { error: e2 } = await supabase.from('expense_reports').update({ pdf_path: path }).eq('id', reportId)
    fail(e2)
    return path
  },
}

export const api = isDemo ? demoApi : supa
