// Cheltuieli generale: constante și calcule (aceleași reguli ca foaia "Cheltuieli generale" din Excel).
import { round2 } from './format'

export const AMORT_THRESHOLD = 500 // RON, cost P&L fără TVA deductibil
export const CATEGORIES = [
  'Leasing', 'Asigurări', 'Software / abonamente', 'Burse transport', 'Contabilitate', 'Chirie / birou', 'Telecom',
  'Echipamente birou', 'Consumabile birou', 'Taxe / impozite', 'Salarii', 'Marketing', 'Altele',
]
export const COST_TYPES = ['Recurent lunar', 'Recurent anual', 'Unic - amortizat', 'Unic - one time cost']
export const VAT_RATES = [0.21, 0.11, 0]
export const TYPE_STYLE = {
  'Recurent lunar': 'border-sky-300 bg-sky-50 text-sky-700',
  'Recurent anual': 'border-indigo-300 bg-indigo-50 text-indigo-700',
  'Unic - amortizat': 'border-amber-300 bg-amber-50 text-amber-700',
  'Unic - one time cost': 'border-slate-300 bg-slate-100 text-slate-600',
}

// ---- date (ISO yyyy-mm-dd, calcul în UTC ca să nu depindă de fusul orar) ----
const toUTC = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const toISO = (dt) => dt.toISOString().slice(0, 10)
export const addDays = (iso, n) => {
  const d = toUTC(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}
// EDATE din Excel: aceeași zi, cu n luni mai târziu (ziua se limitează la ultima zi a lunii)
export const addMonths = (iso, n) => {
  const d = toUTC(iso)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return toISO(d)
}
const weekday = (iso) => ((toUTC(iso).getUTCDay() + 6) % 7) + 1 // luni=1 … duminică=7
export const mondayOf = (iso) => addDays(iso, 1 - weekday(iso))
const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000)

const num = (x) => {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

// Calculează tot ce afișăm pentru un rând de cost. Sumele "net" sunt în moneda rândului.
export function calcCost(c) {
  const gross = num(c.amount_gross)
  let vat = 0
  if (gross) {
    if (num(c.vat_amount) > 0) vat = num(c.vat_amount)
    else if (num(c.vat_rate) > 0) vat = gross - gross / (1 + num(c.vat_rate))
  }
  const net = c.vat_deductible === false ? gross : gross - vat
  const fx = num(c.fx_rate)
  const eur = c.currency === 'EUR'
  const netRon = round2(!net ? 0 : eur ? (fx > 0 ? net * fx : 0) : net)
  const netEur = round2(!net ? 0 : eur ? net : fx > 0 ? net / fx : 0)

  let weeks = 0
  let firstWeek = null
  let lastWeek = null
  let perWeekRon = 0
  let perWeekEur = 0
  if (c.start_on) {
    firstWeek = mondayOf(c.start_on)
    if (c.cost_type === 'Unic - amortizat') {
      const n = num(c.period_count)
      if (n > 0) weeks = c.period_unit === 'Luni' ? Math.max(1, Math.round(diffDays(addMonths(c.start_on, n), c.start_on) / 7)) : n
    } else if (c.cost_type === 'Unic - one time cost') weeks = 1
    if (c.cost_type === 'Unic - amortizat' || c.cost_type === 'Unic - one time cost') {
      if (weeks > 0) lastWeek = addDays(firstWeek, 7 * weeks - 1)
    } else if (c.end_on) lastWeek = addDays(mondayOf(c.end_on), 6)
    else lastWeek = '2099-12-31'

    const ok = netRon > 0 || netEur > 0
    if (ok && lastWeek) {
      const f = { 'Recurent lunar': 12 / 52, 'Recurent anual': 1 / 52, 'Unic - amortizat': weeks ? 1 / weeks : 0, 'Unic - one time cost': 1 }[c.cost_type] || 0
      perWeekRon = round2(netRon * f)
      perWeekEur = round2(netEur * f)
    }
  }
  return { vat: round2(vat), net: round2(net), netRon, netEur, weeks, firstWeek, lastWeek, perWeekRon, perWeekEur }
}

// Mesaje de verificare (în limba română; cheile se traduc în pagină)
export function checkCost(c, calc = calcCost(c)) {
  const w = []
  if (!c.description || !String(c.description).trim()) w.push('desc')
  if (!(num(c.amount_gross) > 0)) w.push('amount')
  if (!c.start_on) w.push('start')
  if (c.currency === 'EUR' && !(num(c.fx_rate) > 0)) w.push('fx')
  if (c.currency !== 'EUR' && !(num(c.fx_rate) > 0)) w.push('fxRon') // RON fără curs: nu intră în P&L în EUR
  if (c.cost_type === 'Unic - one time cost' && calc.netRon >= AMORT_THRESHOLD) w.push('overThreshold')
  if (c.cost_type === 'Unic - amortizat') {
    if (calc.netRon > 0 && calc.netRon < AMORT_THRESHOLD) w.push('underThreshold')
    if (!(num(c.period_count) > 0)) w.push('periodCount')
    if (!c.period_unit) w.push('periodUnit')
  }
  if (c.end_on && c.start_on && c.end_on < c.start_on) w.push('endBeforeStart')
  return w
}

export const defaultTypeFor = (item) => {
  const net = num(item.amount_gross) - num(item.vat_amount)
  return net >= AMORT_THRESHOLD ? 'Unic - amortizat' : 'Unic - one time cost'
}

// Categorie propusă după text (se poate modifica oricând)
const GUESS = [
  [/imprimant|monitor|laptop|calculator|birou(ri)?\b|scaun|docking|tastatur|mouse|camera|telefon|stampil|ștampil|prelungitor|dulap/i, 'Echipamente birou'],
  [/hartie|hârtie|biblioraft|pix|cafea|capsul|gunoi|tavit|dosar|folie|toner|cartus|cartuș|agrafe|consumabil|apa\b|apă/i, 'Consumabile birou'],
  [/licen|abonament|software|microsoft|m365|office|domeniu|hosting|smartbill/i, 'Software / abonamente'],
  [/asigur|rca|casco|cmr/i, 'Asigurări'],
  [/internet|telefon mobil|digi|orange|vodafone|telekom/i, 'Telecom'],
  [/chirie|garan[tț]ie/i, 'Chirie / birou'],
  [/contabil|notar|registru|onrc|infiin[tț]are|taxa timbru/i, 'Contabilitate'],
  [/trans\.?eu|timocom|burs/i, 'Burse transport'],
  [/leasing/i, 'Leasing'],
  [/publicitate|marketing|reclam|flyer|vizit/i, 'Marketing'],
]
export const guessCategory = (text) => (GUESS.find(([re]) => re.test(String(text || ''))) || [null, 'Altele'])[1]

// Căutare "în orice formă": fără diacritice, mai mulți termeni (toți trebuie să existe), inclusiv sume și date
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function searchHaystack(c, calc, reportCode) {
  const d = (iso) => (iso ? `${iso} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(0, 7)}` : '')
  const money = (n) => `${n} ${Number(n).toFixed(2)} ${Number(n).toFixed(2).replace('.', ',')}`
  return fold([
    c.code, c.description, c.category, c.cost_type, c.vendor, c.doc_no, c.notes, c.currency, reportCode,
    d(c.start_on), d(c.doc_date), d(c.end_on), money(c.amount_gross), money(calc.netRon), c.vat_deductible === false ? 'tva nedeductibil' : 'tva deductibil',
  ].join(' | '))
}
export const foldText = fold

// Suma efectiv plătită (cu TVA) în moneda cerută; EUR <-> RON cu cursul rândului. missing = lipsește cursul pentru conversie.
export function grossIn(c, cur = 'RON') {
  const g = num(c.amount_gross)
  const fx = num(c.fx_rate)
  if (!g) return { amount: 0, vat: 0, missing: false }
  const k = calcCost(c)
  const own = c.currency === 'EUR' ? 'EUR' : 'RON'
  if (own === cur) return { amount: g, vat: k.vat, missing: false }
  if (!(fx > 0)) return { amount: 0, vat: 0, missing: true }
  return own === 'EUR' ? { amount: round2(g * fx), vat: round2(k.vat * fx), missing: false } : { amount: round2(g / fx), vat: round2(k.vat / fx), missing: false }
}
