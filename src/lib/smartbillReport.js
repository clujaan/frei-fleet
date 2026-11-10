// Citește raportul "Documente furnizor" exportat din SmartBill (.xls / .xlsx).
// Coloane: Document | Denumire furnizor | CIF | Data doc | Data scadentei | Categoria | Valoare fara TVA | TVA | Valoare totala | Moneda | Observatii | Status
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const num = (v) => {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim().replace(/\s/g, '')
  if (!s) return 0
  const n = Number(s.includes(',') && s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function toISO(v, XLSX) {
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : ''
  }
  const m = String(v ?? '').trim().match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : ''
}

// "Fact PRE2600345" -> "PRE2600345"; "Bon fiscal 0032" -> "0032"
const cleanDocNo = (s) => String(s ?? '').trim().replace(/^(fact(ura)?|bon fiscal|bf|aviz|proforma)\.?\s+/i, '').trim()

export async function parseSmartbillReport(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })
  const h = rows.findIndex((r) => fold(r[0]) === 'document' && fold(r[1]).includes('furnizor'))
  if (h < 0) throw new Error('Nu am găsit antetul raportului „Documente furnizor” (Document, Denumire furnizor, CIF…).')
  const head = rows[h].map(fold)
  const col = (name) => head.findIndex((x) => x.startsWith(name))
  const c = { doc: col('document'), vendor: col('denumire'), cui: col('cif'), date: col('data doc'), due: col('data scad'), net: col('valoare fara'), vat: col('tva'), total: col('valoare totala'), cur: col('moneda'), status: col('status'), obs: col('observatii') }
  if (c.doc < 0 || c.vendor < 0 || c.total < 0) throw new Error('Raportul nu are coloanele așteptate (Document, Denumire furnizor, Valoare totală).')

  const out = []
  for (const r of rows.slice(h + 1)) {
    if (!String(r[c.doc] ?? '').trim() || !String(r[c.vendor] ?? '').trim()) continue
    const status = fold(r[c.status])
    out.push({
      doc_no: cleanDocNo(r[c.doc]),
      vendor: String(r[c.vendor]).trim(),
      vendor_cui: String(r[c.cui] ?? '').trim(),
      doc_date: toISO(r[c.date], XLSX),
      net: num(r[c.net]),
      vat: num(r[c.vat]),
      total: num(r[c.total]),
      currency: String(r[c.cur] || 'RON').trim().toUpperCase(),
      status: String(r[c.status] ?? '').trim(),
      cancelled: status.includes('anulat') || status.includes('stornat'),
      notes: String(r[c.obs] ?? '').trim(),
    })
  }
  return out
}
