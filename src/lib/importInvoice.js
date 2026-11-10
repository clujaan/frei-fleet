// Importă facturi (SPV: XML/ZIP, sau PDF/poză citite cu AI) și pregătește un cost prefăcut, de confirmat în formular.
import { readSpvFile } from './efactura'
import { readDocument } from './readDocument'
import { defaultTypeFor, guessCategory } from './costs'
import { sameDocument, normVendor } from './format'

const isXmlLike = (f) => /\.(xml|zip)$/i.test(f.name)

// Furnizor cunoscut: preia categoria, tipul și TVA-ul deductibil din ultimul cost de la același furnizor.
function fromKnownVendor(vendor, existing) {
  const v = normVendor(vendor)
  if (!v) return null
  const hit = [...existing].filter((c) => normVendor(c.vendor) && (normVendor(c.vendor).includes(v) || v.includes(normVendor(c.vendor)))).sort((a, b) => String(b.start_on).localeCompare(String(a.start_on)))[0]
  return hit || null
}

function buildDraft(inv, files, warnings, existing) {
  const ron = !inv.currency || inv.currency === 'RON'
  const known = fromKnownVendor(inv.vendor, existing)
  const draft = {
    description: inv.description || inv.vendor || '',
    vendor: inv.vendor || '',
    doc_no: inv.doc_no || '',
    doc_date: /^\d{4}-\d{2}-\d{2}$/.test(inv.doc_date || '') ? inv.doc_date : '',
    amount_gross: String(inv.total_gross ?? ''),
    currency: ron ? 'RON' : inv.currency === 'EUR' ? 'EUR' : 'RON',
    fx_rate: '',
    vat_rate: inv.vat_total ? 0.21 : 0,
    vat_amount: inv.vat_total ? String(inv.vat_total) : '',
    vat_deductible: known ? known.vat_deductible !== false : true,
    start_on: /^\d{4}-\d{2}-\d{2}$/.test(inv.doc_date || '') ? inv.doc_date : undefined,
    category: known?.category || guessCategory(`${inv.description} ${inv.vendor}`),
    cost_type: known?.cost_type || defaultTypeFor({ amount_gross: inv.total_gross, vat_amount: inv.vat_total }),
    period_unit: known?.period_unit || 'Luni',
    period_count: known?.period_count || 12,
    notes: '',
  }
  const notes = [...warnings]
  if (!ron && inv.currency !== 'EUR') {
    notes.push(`Factura e în ${inv.currency}: convertește suma în RON sau EUR înainte de salvare.`)
  }
  if (inv.currency === 'EUR') {
    if (inv.vat_ron && inv.vat_total) {
      draft.fx_rate = String(Math.round((inv.vat_ron / inv.vat_total) * 10000) / 10000)
      notes.push('Cursul RON/EUR e dedus din TVA-ul în RON de pe factură: verifică-l.')
    } else notes.push('Factură în EUR: completează cursul RON/EUR din ziua facturii.')
  }
  if (inv.credit_note) notes.push('Aceasta este o notă de credit (sumă negativă).')
  if (inv.has_company_cui === false) notes.push('Nu apare CUI-ul firmei ca cumpărător pe factură: verifică.')
  if (known) notes.push(`Furnizor cunoscut (${known.code}): am preluat categoria și tipul de cost.`)
  const dup = existing.map((c) => ({ c, reason: sameDocument({ doc_no: draft.doc_no, vendor: draft.vendor, doc_date: draft.doc_date, amount_gross: inv.total_gross }, c) })).find((x) => x.reason)
  return { fields: draft, files, warnings: notes, duplicate: dup ? { code: dup.c.code, reason: dup.reason } : null, name: files[0]?.name || inv.doc_no }
}

// Returnează lista de drafturi (unul per factură) și lista de erori pe fișier.
export async function importInvoices(fileList, existing) {
  const drafts = []
  const errors = []
  const loose = [] // PDF-uri și poze, citite cu AI, câte un document per fișier
  for (const f of fileList) {
    try {
      if (isXmlLike(f)) {
        const r = await readSpvFile(f)
        if (!r) throw new Error('nu e o factură e-Factura (UBL) validă.')
        drafts.push(buildDraft(r.invoice, [f, ...r.extra], [], existing))
      } else loose.push(f)
    } catch (e) {
      errors.push(`${f.name}: ${e.message}`)
    }
  }
  for (const f of loose) {
    try {
      const { data: r, warnings } = await readDocument([f])
      const own = (warnings || []).filter((w) => !/CUI-ul firmei/.test(w))
      drafts.push(buildDraft({ ...r, vat_total: r.vat_total }, [f], own, existing))
    } catch (e) {
      errors.push(`${f.name}: ${e.message}`)
    }
  }
  return { drafts, errors }
}
