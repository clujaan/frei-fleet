import { companyCuiDigits } from './company'
// Citește o factură e-Factura (UBL 2.1 XML, descărcată din SPV – fișier .xml sau .zip).
// Datele vin direct din XML, fără AI: furnizor, număr, dată, TVA și total sunt exacte.
const digits = (s) => String(s || '').replace(/\D/g, '')

// primul element descendent cu numele local dat (ignoră prefixul cbc:/cac:)
const all = (root, name) => Array.from(root.getElementsByTagName('*')).filter((n) => n.localName === name)
const first = (root, name) => (root ? all(root, name)[0] || null : null)
const text = (root, name) => (first(root, name)?.textContent || '').trim()
const child = (root, name) => (root ? Array.from(root.children).find((n) => n.localName === name) || null : null)
const num = (s) => {
  const n = Number(String(s || '').trim())
  return Number.isFinite(n) ? n : 0
}

export function parseEFactura(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const root = doc.documentElement
  if (!root || root.getElementsByTagName('parsererror').length || !['Invoice', 'CreditNote'].includes(root.localName)) return null

  const supplier = first(child(root, 'AccountingSupplierParty'), 'Party')
  const buyer = first(child(root, 'AccountingCustomerParty'), 'Party')
  const nameOf = (p) => text(first(p, 'PartyLegalEntity'), 'RegistrationName') || text(first(p, 'PartyName'), 'Name')
  const cuiOf = (p) => text(first(p, 'PartyTaxScheme'), 'CompanyID') || text(first(p, 'PartyLegalEntity'), 'CompanyID')

  const currency = text(root, 'DocumentCurrencyCode') || 'RON'
  const taxCurrency = text(root, 'TaxCurrencyCode')
  const taxTotals = Array.from(root.children).filter((n) => n.localName === 'TaxTotal')
  const inDocCur = taxTotals.find((n) => child(n, 'TaxAmount')?.getAttribute('currencyID') === currency) || taxTotals[0]
  const inTaxCur = taxCurrency && taxCurrency !== currency ? taxTotals.find((n) => child(n, 'TaxAmount')?.getAttribute('currencyID') === taxCurrency) : null
  const vat = num(text(inDocCur, 'TaxAmount'))
  const vatTaxCur = inTaxCur ? num(text(inTaxCur, 'TaxAmount')) : 0

  const monetary = child(root, 'LegalMonetaryTotal')
  const payable = num(text(monetary, 'PayableAmount'))
  const inclusive = num(text(monetary, 'TaxInclusiveAmount'))
  const exclusive = num(text(monetary, 'TaxExclusiveAmount'))
  const gross = inclusive || payable || exclusive + vat

  const breakdown = all(inDocCur || root, 'TaxSubtotal').map((s) => ({
    rate: num(text(s, 'Percent')),
    net: num(text(s, 'TaxableAmount')),
    vat: num(text(s, 'TaxAmount')),
  }))
  const items = Array.from(root.children)
    .filter((n) => n.localName === 'InvoiceLine' || n.localName === 'CreditNoteLine')
    .map((l) => text(first(l, 'Item'), 'Name') || text(first(l, 'Item'), 'Description'))
    .filter(Boolean)
  const sign = root.localName === 'CreditNote' ? -1 : 1

  const buyerCui = cuiOf(buyer)
  return {
    doc_no: text(root, 'ID'),
    doc_date: text(root, 'IssueDate'),
    due_date: text(root, 'DueDate'),
    vendor: nameOf(supplier),
    vendor_cui: cuiOf(supplier),
    buyer_name: nameOf(buyer),
    buyer_cui: buyerCui,
    has_company_cui: companyCuiDigits() ? digits(buyerCui) === companyCuiDigits() : null,
    currency,
    total_gross: sign * gross,
    vat_total: sign * vat,
    vat_ron: vatTaxCur ? sign * vatTaxCur : null, // TVA în RON când factura e în valută
    vat_breakdown: breakdown,
    description: items.slice(0, 3).join(', ').slice(0, 70),
    credit_note: sign < 0,
  }
}

// Acceptă .xml sau .zip (SPV). Returnează { invoice, pdf } sau null.
export async function readSpvFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xml')) {
    const invoice = parseEFactura(await file.text())
    return invoice && { invoice, extra: [] }
  }
  if (name.endsWith('.zip')) {
    const { unzipSync, strFromU8 } = await import('fflate')
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
    let invoice = null
    const extra = []
    for (const [fname, bytes] of Object.entries(entries)) {
      const low = fname.toLowerCase()
      if (low.endsWith('.xml') && !invoice) invoice = parseEFactura(strFromU8(bytes))
      else if (low.endsWith('.pdf')) extra.push(new File([bytes], fname.split('/').pop(), { type: 'application/pdf' }))
    }
    return invoice && { invoice, extra }
  }
  return null
}
