import { EMPLOYEES, nameFromEmail } from './people'
// Formatări și calcule comune pentru deconturi.

export const DEFAULT_VAT = 0.21 // cota standard (modificabilă ulterior din Setări)
export const MAX_LINES = 10 // rânduri pe o foaie de decont

export { EMPLOYEES }
export const PAYMENT_METHODS = ['Card personal', 'Numerar', 'Altă metodă']
export const DEFAULT_PURPOSE = 'Echipamente și achiziții pentru birou'

const roMoney = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const enMoney = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtMoney = (n) => roMoney.format(Number(n) || 0) // 1.894,90 (în aplicație)
export const fmtMoneyPdf = (n) => enMoney.format(Number(n) || 0) // 1,894.90 (identic cu foaia din Excel)

export function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return d && m && y ? `${d}.${m}.${y}` : ''
}

export const todayISO = () => {
  const d = new Date()
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Acceptă "1799.97", "1799,97", "1.799,97", "1,799.97". Returnează număr sau NaN.
export function parseNum(raw) {
  if (typeof raw === 'number') return raw
  let s = String(raw ?? '').trim().replace(/\s/g, '')
  if (!s) return NaN
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // ultimul separator este cel zecimal
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma > -1) {
    s = s.replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export const vatFromGross = (gross, rate = DEFAULT_VAT) => round2((gross * rate) / (1 + rate))

// Rândurile care intră în foaie: au sumă și CUI-ul firmei pe document.
export const isIncluded = (it) => it.cui_ok !== false && Number(it.amount_gross) > 0

export function computeTotals(items) {
  const inc = items.filter(isIncluded)
  return {
    total_gross: round2(inc.reduce((s, it) => s + Number(it.amount_gross), 0)),
    total_vat: round2(inc.reduce((s, it) => s + Number(it.vat_amount || 0), 0)),
    doc_count: inc.filter((it) => String(it.doc_no || '').trim() !== '').length,
  }
}

export const STATUS_STYLE = {
  Ciornă: 'border-slate-300 bg-slate-100 text-slate-600',
  Emis: 'border-sky-300 bg-sky-50 text-sky-700',
  'Trimis contabilă': 'border-amber-300 bg-amber-50 text-amber-700',
  Rambursat: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  Anulat: 'border-rose-300 bg-rose-50 text-rose-700',
}

// Angajatul implicit după adresa de email (potrivire cu utilizatorii din echipă).
export function employeeFromEmail(email) {
  return nameFromEmail(email)
}

// ---------------------------------------------------------------------
// Detectarea documentelor deja decontate
// ---------------------------------------------------------------------
const stripDia = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// "Bon fiscal: 0032" -> "32"; "F225068726-43691" -> "f22506872643691"
export function normDocNo(raw) {
  return stripDia(raw)
    .toLowerCase()
    .replace(/bon\s*fiscal|factura|nr\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+(?=\d)/, '')
}

export function normVendor(raw) {
  return stripDia(raw)
    .toLowerCase()
    .replace(/\b(s\.?r\.?l\.?|s\.?a\.?|romania)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Returnează 'numar' | 'valori' | null. a, b au: doc_no, vendor, doc_date, amount_gross.
export function sameDocument(a, b) {
  const n1 = normDocNo(a.doc_no)
  const n2 = normDocNo(b.doc_no)
  const v1 = normVendor(a.vendor)
  const v2 = normVendor(b.vendor)
  const vendorMatch = v1 && v2 && (v1.includes(v2) || v2.includes(v1))
  if (n1 && n1 === n2 && (n1.length >= 7 || vendorMatch)) return 'numar'
  const amt = Number(a.amount_gross)
  if (vendorMatch && a.doc_date && a.doc_date === b.doc_date && amt > 0 && Math.abs(amt - Number(b.amount_gross)) < 0.005) return 'valori'
  return null
}
