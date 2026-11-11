// Import generic de tranzacții (card combustibil, taxe de drum) din CSV: utilizatorul alege ce coloană e data, numărul
// camionului, litrii, suma etc. Funcții pure (testate în tests/costImport.test.mjs). Decizie: SPEC secț. 15.

const num = (raw) => {
  let s = String(raw ?? '').trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (!s) return NaN
  const c = s.lastIndexOf(',')
  const d = s.lastIndexOf('.')
  if (c > -1 && d > -1) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (c > -1) s = /,\d{3}$/.test(s) && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}
export const parseAmount = num

// Împarte textul CSV în rânduri și coloane. Separatorul (; , tab) se ghicește din primul rând. Suportă ghilimele.
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '')
  const first = src.split(/\r?\n/).find((l) => l.trim()) || ''
  const sep = [';', '\t', ','].map((s) => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = []
  let cell = ''
  let q = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === sep) { row.push(cell.trim()); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell.trim()); cell = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell.trim())
  if (row.some((x) => x !== '')) rows.push(row)
  return { sep, header: rows[0] || [], rows: rows.slice(1) }
}

// Data (și ora, opțional) din formatele obișnuite: 2026-11-04, 04.11.2026, 04/11/2026, 4.11.26, cu „ 14:35" după.
// Rezultat: „YYYY-MM-DDTHH:MM" (ora locală) sau null.
export function parseDateTime(dateRaw, timeRaw = '') {
  const s = String(dateRaw || '').trim()
  let y, m, d, rest
  let mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/)
  if (mt) [, y, m, d, rest] = mt
  else if ((mt = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(.*)$/))) { [, d, m, y, rest] = mt; if (y.length === 2) y = `20${y}` }
  else return null
  const Y = Number(y); const M = Number(m); const D = Number(d)
  if (!(M >= 1 && M <= 12 && D >= 1 && D <= 31)) return null
  const tm = `${String(timeRaw || '')} ${rest || ''}`.match(/(\d{1,2}):(\d{2})/)
  const hh = tm ? Math.min(23, Number(tm[1])) : 12 // fără oră: mijlocul zilei
  const mm = tm ? Number(tm[2]) : 0
  return `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export const normPlate = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// Câmpurile pe care le poate avea un rând importat
export const IMPORT_FIELDS = ['date', 'time', 'plate', 'liters', 'amount', 'vat', 'currency', 'vendor', 'country', 'doc_no', 'odometer']
export const IMPORT_REQUIRED = ['date', 'plate', 'amount']

// Ghicește coloanele după numele din antet (RO/EN/DE, ca în rapoartele de card obișnuite)
const GUESS = {
  date: /^(data|date|datum|transaction ?date|data tranz)/i,
  time: /^(ora|time|zeit|uhrzeit)/i,
  plate: /(nr\.? ?(auto|înmatriculare|inmatriculare)|plate|registration|kennzeichen|vehicle|vehicul|camion)/i,
  liters: /(litri|liters|litres|menge|quantity|cantitate|volum)/i,
  amount: /(sum[aă]|amount|betrag|valoare|total|net)/i,
  vat: /(tva|vat|mwst|ust)/i,
  currency: /(moned[aă]|currency|w[aä]hrung|valuta)/i,
  vendor: /(sta[tț]ie|station|tankstelle|furnizor|vendor|loca[tț]ie|location|merchant)/i,
  country: /(țar[aă]|tara|country|land)/i,
  doc_no: /(document|bon|receipt|beleg|nr\.? ?doc|factur)/i,
  odometer: /(km|kilometraj|odometer|kilometerstand)/i,
}
export function guessMapping(header) {
  const map = {}
  const used = new Set()
  for (const f of IMPORT_FIELDS) {
    const i = (header || []).findIndex((h, idx) => !used.has(idx) && GUESS[f].test(String(h || '').trim()))
    if (i > -1) { map[f] = i; used.add(i) }
  }
  return map
}

// Transformă rândurile CSV în costuri. opts = { map, category, currency (implicit), trucks:[{id, plate}], existingKeys:Set, vatIncluded }
// Rezultat: { ok: [rânduri pentru tabelul costs], errors: [{ line, reason }], duplicates }
export function buildCostRows(csvRows, opts) {
  const { map = {}, category = 'fuel_card', currency = 'EUR', trucks = [], existingKeys = new Set(), vatIncluded = false } = opts || {}
  const byPlate = Object.fromEntries(trucks.map((t) => [normPlate(t.plate), t.id]))
  const get = (r, f) => (map[f] == null || map[f] === '' ? '' : r[Number(map[f])] ?? '')
  const ok = []
  const errors = []
  let duplicates = 0
  const seen = new Set(existingKeys)
  csvRows.forEach((r, i) => {
    const line = i + 2 // +1 antet, +1 numerotare de la 1
    const at = parseDateTime(get(r, 'date'), get(r, 'time'))
    if (!at) return errors.push({ line, reason: 'date' })
    const plate = normPlate(get(r, 'plate'))
    const truckId = byPlate[plate]
    if (!truckId) return errors.push({ line, reason: 'plate', value: get(r, 'plate') })
    let amount = num(get(r, 'amount'))
    if (!Number.isFinite(amount)) return errors.push({ line, reason: 'amount' })
    const vat = Number.isFinite(num(get(r, 'vat'))) ? num(get(r, 'vat')) : 0
    if (vatIncluded && vat > 0) amount -= vat
    const liters = num(get(r, 'liters'))
    const cur = String(get(r, 'currency') || currency).trim().toUpperCase()
    if (cur !== 'EUR' && cur !== 'RON') return errors.push({ line, reason: 'currency', value: cur })
    const key = ['imp', at, plate, Math.round(amount * 100), Number.isFinite(liters) ? Math.round(liters * 100) : '', String(get(r, 'doc_no')).trim()].join('|')
    if (seen.has(key)) { duplicates += 1; return }
    seen.add(key)
    const odo = num(get(r, 'odometer'))
    ok.push({
      occurred_at: at, category, paid_by: 'company', source: 'import', alloc_mode: 'auto', import_key: key,
      truck_id: truckId, amount: Math.round(amount * 100) / 100, vat_amount: Math.round(vat * 100) / 100, currency: cur,
      liters: Number.isFinite(liters) && liters > 0 ? liters : null, odometer: Number.isFinite(odo) && odo > 0 ? Math.round(odo) : null,
      vendor: String(get(r, 'vendor')).trim() || null, country: String(get(r, 'country')).trim().toUpperCase().slice(0, 2) || null,
      doc_no: String(get(r, 'doc_no')).trim() || null,
    })
  })
  return { ok, errors, duplicates }
}
