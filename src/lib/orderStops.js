// Punctele comenzii de transport: listă unică [{ side: 'load' | 'unload', company, street, zip, city, county, country, contact, phone, date, window, ref, goods }]
// Câmpurile vechi ale comenzii (load_address, load_date...) se păstrează și se deduc din puncte, ca lista și căutarea să meargă ca înainte.
import { cleanGoods, goodsTotals, goodsLabel } from './goods'
import { contactLine, emptyStop, stopLines, tripStops } from './places'

export const tripToStops = (trip) => ['load', 'unload'].flatMap((side) => tripStops(trip, side).map((s) => ({ ...emptyStop(), ...s, side })))
export const sideStops = (stops, side) => (Array.isArray(stops) ? stops : []).filter((s) => s.side === side)
export const mergeSides = (loads, unloads) => [...loads.map((s) => ({ ...s, side: 'load' })), ...unloads.map((s) => ({ ...s, side: 'unload' }))]

const word = (side, lang) => (side === 'load' ? (lang === 'en' ? 'Loading' : 'Încărcare') : (lang === 'en' ? 'Unloading' : 'Descărcare'))
const textOf = (list, side, lang) => list.map((s, i) => [list.length > 1 && `${word(side, lang)} ${i + 1}:`, ...stopLines(s, lang), i > 0 && contactLine(s) ? `Contact: ${contactLine(s)}` : ''].filter(Boolean).join('\n')).join('\n\n')

// câmpurile vechi (text) + totaluri de marfă, deduse din puncte
export function legacyFromStops(stops, lang = 'ro') {
  const out = {}
  for (const side of ['load', 'unload']) {
    const list = sideStops(stops, side)
    const first = list[0] || {}
    out[`${side}_address`] = textOf(list, side, lang)
    out[`${side}_contact`] = contactLine({ contact: first.contact, phone: first.phone })
    out[`${side}_date`] = first.date || ''
    out[`${side}_window`] = first.window || ''
    out[`${side}_ref`] = first.ref || ''
  }
  // marfa se numără o singură dată: la încărcări; dacă nu e trecută acolo, la descărcări
  const loads = sideStops(stops, 'load').flatMap((s) => s.goods || [])
  const goods = cleanGoods(loads).length ? loads : sideStops(stops, 'unload').flatMap((s) => s.goods || [])
  const rows = cleanGoods(goods)
  if (rows.length) {
    const tot = goodsTotals(rows)
    out.weight_kg = tot.weight > 0 ? String(tot.weight) : ''
    out.ldm = tot.ldm > 0 ? String(tot.ldm) : ''
    out.packages = rows.map((g) => [g.qty, goodsLabel(g.type, lang)].filter(Boolean).join(' ')).join(', ')
  }
  return out
}

export const cleanOrderStops = (stops) => (Array.isArray(stops) ? stops : [])
  .map((s) => ({ ...emptyStop(), ...s, goods: cleanGoods(s.goods) }))
  .filter((s) => ['company', 'street', 'zip', 'city', 'county', 'country', 'contact', 'phone', 'date', 'window', 'ref'].some((k) => String(s[k] || '').trim()) || s.goods.length)
