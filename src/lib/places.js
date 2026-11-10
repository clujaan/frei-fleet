import { cleanGoods, hasGoods } from './goods'
// Adrese de încărcare / descărcare: 5 câmpuri (firmă, stradă, cod poștal, localitate, țară) + puncte suplimentare.
export const EUROPE = ['RO', 'AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'TR', 'UA', 'GB', 'VA']

export const RO_COUNTIES = ['Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani', 'Brăila', 'Brașov', 'București', 'Buzău', 'Călărași', 'Caraș-Severin', 'Cluj', 'Constanța', 'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj', 'Harghita', 'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș', 'Neamț', 'Olt', 'Prahova', 'Sălaj', 'Satu Mare', 'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea', 'Vâlcea', 'Vaslui', 'Vrancea']

export const countryName = (code, lang = 'ro') => {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

// RO primul, restul în ordine alfabetică după nume
export const countryOptions = (lang = 'ro') => {
  const rest = EUROPE.filter((c) => c !== 'RO').map((c) => ({ code: c, name: countryName(c, lang) })).sort((a, b) => a.name.localeCompare(b.name, lang))
  return [{ code: 'RO', name: countryName('RO', lang) }, ...rest]
}

export const emptyStop = () => ({ company: '', street: '', zip: '', city: '', county: '', country: '', contact: '', phone: '', date: '', date_alt: '', window: '', ref: '', goods: [] })
const hasData = (s) => !!s && ['company', 'street', 'zip', 'city', 'county', 'country', 'contact', 'phone'].some((k) => String(s[k] || '').trim())
export const cleanStops = (arr) => (Array.isArray(arr) ? arr.filter((s) => hasData(s) || hasGoods(s?.goods?.[0]) || (s?.goods || []).some(hasGoods)).map((s) => ({ ...emptyStop(), ...s, goods: cleanGoods(s.goods) })) : [])

// adresa pe linii (fără contact): firmă, stradă, cod poștal + localitate, județ, țară
export const stopLines = (s, lang = 'ro') => [s.company, s.street, [s.zip, s.city].filter(Boolean).join(' '), s.county, s.country ? countryName(s.country, lang) : ''].map((x) => String(x || '').trim()).filter(Boolean)
export const contactLine = (s) => [s.contact, s.phone].map((x) => String(x || '').trim()).filter(Boolean).join(', ')

// toate punctele unei părți: principal + suplimentare. side = 'load' | 'unload'
export const tripStops = (trip, side) => {
  const main = { company: trip[`${side}_company`], street: trip[`${side}_street`], zip: trip[`${side}_zip`], city: trip[`${side}_city`], county: trip[`${side}_county`], country: trip[`${side}_country`], contact: trip[`${side}_contact`], phone: trip[`${side}_phone`], date: trip[`${side}_date`] || '', date_alt: trip[`${side}_date_alt`] || '', window: trip[`${side}_window`] || '', ref: trip[`${side}_ref`] || '', goods: Array.isArray(trip[`${side}_goods`]) ? trip[`${side}_goods`] : [] }
  return [main, ...(Array.isArray(trip[`extra_${side}s`]) ? trip[`extra_${side}s`] : [])].filter(hasData)
}

// text multi-linie pentru comandă (puncte separate printr-o linie goală)
// (contactul punctului principal merge în câmpul „Persoană de contact" al comenzii; la punctele suplimentare apare în text)
export const stopsText = (trip, side, lang = 'ro') => {
  const list = tripStops(trip, side)
  const word = side === 'load' ? (lang === 'en' ? 'Loading' : 'Încărcare') : (lang === 'en' ? 'Unloading' : 'Descărcare')
  return list.map((s, i) => [list.length > 1 && `${word} ${i + 1}:`, ...stopLines(s, lang), i > 0 && contactLine(s) ? `Contact: ${contactLine(s)}` : ''].filter(Boolean).join('\n')).join('\n\n')
}
export const mainContact = (trip, side) => contactLine({ contact: trip[`${side}_contact`], phone: trip[`${side}_phone`] })

const cityOf = (s) => (s.city ? `${s.city}${s.country ? ` (${s.country})` : ''}` : s.company || '')
// „Cluj-Napoca (RO) → Bladel (NL)”, cu „+n” când există puncte suplimentare
export const routeLabel = (trip) => {
  const side = (k) => {
    const st = tripStops(trip, k)
    if (!st.length) return ''
    return cityOf(st[0]) + (st.length > 1 ? ` +${st.length - 1}` : '')
  }
  const a = side('load')
  const b = side('unload')
  return a && b ? `${a} → ${b}` : a || b
}

// text pentru căutare
export const tripPlacesHaystack = (trip) => ['load', 'unload'].flatMap((k) => tripStops(trip, k).flatMap((s) => [s.company, s.street, s.zip, s.city, s.county, s.contact, s.phone, s.country, s.country ? countryName(s.country, 'ro') : ''])).join(' ')
