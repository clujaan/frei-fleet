// Calculează distanța rutieră (camion) prin funcția serverless /api/km.
import { supabase, isDemo } from './supabase'

// Locurile pot conține mai multe opriri separate prin "+" (ex. „Flen + Breda”).
// geo = { text, lat, lon }: coordonatele localității alese din sugestii (se folosesc doar dacă textul nu s-a schimbat).
const split = (country, place, geo) => {
  const parts = String(place || '').split(/\s*\+\s*/).map((p) => p.trim()).filter(Boolean)
  return parts.map((p) => {
    const st = { country: String(country || '').trim(), place: p }
    if (geo && parts.length === 1 && geo.text === p && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)) { st.lat = geo.lat; st.lon = geo.lon }
    return st
  })
}

export const canCalcKm = (o) => split(o.load_country, o.load_place).length > 0 && split(o.unload_country, o.unload_place).length > 0

export async function calcKm(o, geo = {}) { return (await calcKmDetail(o, geo)).km }

// Ca calcKm, dar întoarce și km pe țări: { km, hours, countries: [{code, km}] | null, ferryKm }.
// Cu `variants` ([{avoid:['AT']}…]) întoarce { variants: [{avoid, km, hours, countries, ferryKm} | {avoid, error}] }.
export async function calcKmDetail(o, geo = {}, variants = null) {
  if (isDemo) throw new Error('Calculul km nu e disponibil în modul demo.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesiune expirată. Intră din nou în cont.')
  // ordine: încărcarea principală, încărcări suplimentare, descărcarea principală, descărcări suplimentare
  const ex = (a) => (Array.isArray(a) ? a : []).flatMap((x) => split(x.country, x.place, Number.isFinite(x.lat) && Number.isFinite(x.lon) ? { text: String(x.place || '').trim(), lat: x.lat, lon: x.lon } : null))
  const stops = [...split(o.load_country, o.load_place, geo.load), ...ex(o.extra_loads), ...split(o.unload_country, o.unload_place, geo.unload), ...ex(o.extra_unloads)]
  if (stops.length < 2) throw new Error('Completează locul de încărcare și cel de descărcare.')
  const r = await fetch('/api/km', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(variants ? { stops, variants } : { stops }) })
  let body = null
  try { body = await r.json() } catch { /* non-JSON */ }
  if (!r.ok) {
    if (r.status === 404) throw new Error('Calculul km merge doar pe adresa publicată în Vercel (funcția /api/km nu a fost găsită).')
    if (!body) throw new Error(`Serverul a răspuns cu eroarea ${r.status}${r.status === 504 ? ' (timp depășit: calculul a durat prea mult, încearcă din nou)' : ''}. Verifică Vercel → Logs → /api/km.`)
    throw new Error(body.error || 'Eroare la calcul.')
  }
  return body
}

// Sugestii de localități din baza proprie (tabelul postal_places). Eșecurile sunt silențioase: returnează [].
const fold = (x) => String(x).toLowerCase().replace(/[ßøæœłđðþı]/g, (c) => ({ ß: 'ss', ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' }[c])).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

export async function suggestPlaces(q, country) {
  if (isDemo) return []
  try {
    const raw = String(q).trim()
    if (raw.length < 3) return []
    const isCode = /^[0-9]/.test(raw)
    let qb = supabase.from('postal_places').select('place,postcode,region,county,country,lat,lon').limit(12)
    if (/^[A-Za-z]{2}$/.test(String(country || '').trim())) qb = qb.eq('country', country.trim().toUpperCase())
    // curăț caracterele speciale de LIKE
    qb = isCode ? qb.like('pc', `${raw.replace(/[\s%_]/g, '').toUpperCase()}%`).order('pc') : qb.like('search', `${fold(raw).replace(/[%_,]/g, '')}%`).order('search').order('postcode')
    const { data, error } = await qb
    if (error || !data) return []
    return data.map((r) => {
      const area = r.county || r.region || ''
      return { text: `${r.place} ${r.postcode}${area ? ', ' + area : ''}`, name: r.place, post: r.postcode, area, country: r.country, countryName: '', lat: r.lat, lon: r.lon }
    })
  } catch {
    return []
  }
}

// ---- Km pentru curse: locurile au cod poștal + localitate + țară; coordonatele vin din postal_places ----
const SQ = (x) => String(x || '').trim()

async function coordsFor(stop) {
  const country = SQ(stop.country).toUpperCase()
  const zip = SQ(stop.zip).replace(/\s+/g, '').toUpperCase()
  const city = fold(SQ(stop.city))
  const county = fold(SQ(stop.county))
  if (isDemo || !/^[A-Z]{2}$/.test(country) || !(zip || city)) return null
  const pick = (rows) => {
    if (!rows?.length) return null
    const byCity = city ? rows.find((r) => r.search === city) : null
    const byCounty = county ? rows.find((r) => fold(r.county || '') === county || fold(r.region || '') === county) : null
    const r = byCity || byCounty || rows[0]
    return Number.isFinite(r.lat) && Number.isFinite(r.lon) ? { lat: r.lat, lon: r.lon } : null
  }
  try {
    const cols = 'search,county,region,lat,lon'
    if (zip) {
      const pc = country === 'NL' ? zip.slice(0, 4) : zip
      const { data } = await supabase.from('postal_places').select(cols).eq('country', country).eq('pc', pc).limit(20)
      const r = pick(data)
      // același cod poștal dar localitate diferită (cod greșit?) -> nu mă bazez pe el
      if (r && (!city || data.some((d) => d.search === city))) return r
    }
    if (city) {
      const { data } = await supabase.from('postal_places').select(cols).eq('country', country).eq('search', city).limit(50)
      // fără județ și cu mai multe omonime nu aleg la întâmplare
      if (data?.length === 1 || (data?.length > 1 && county)) return pick(data)
      if (data?.length > 1) return null
    }
  } catch { /* trec la geocodare */ }
  return null
}

const stopText = (s) => [SQ(s.street), [SQ(s.zip), SQ(s.city)].filter(Boolean).join(' '), SQ(s.county)].filter(Boolean).join(', ')
const hasPlace = (s) => !!(SQ(s?.city) || SQ(s?.zip))

// trip: câmpurile din formularul de cursă. Ordine: încărcări (principală + suplimentare), apoi descărcări.
export const tripStops = (t) => {
  const main = (side) => ({ street: t[`${side}_street`], zip: t[`${side}_zip`], city: t[`${side}_city`], county: t[`${side}_county`], country: t[`${side}_country`] })
  const extra = (a) => (Array.isArray(a) ? a : [])
  return [main('load'), ...extra(t.extra_loads), main('unload'), ...extra(t.extra_unloads)].filter(hasPlace)
}
export const canCalcTripKm = (t) => hasPlace({ city: t.load_city, zip: t.load_zip }) && hasPlace({ city: t.unload_city, zip: t.unload_zip })

export async function calcTripKm(t) {
  if (isDemo) throw new Error('Calculul km nu e disponibil în modul demo.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesiune expirată. Intră din nou în cont.')
  const src = tripStops(t)
  if (src.length < 2 || !canCalcTripKm(t)) throw new Error('Completează localitatea sau codul poștal la încărcare și la descărcare.')
  const stops = []
  for (const s of src) {
    const c = await coordsFor(s)
    stops.push({ country: SQ(s.country), place: stopText(s), ...(c || {}) })
  }
  const r = await fetch('/api/km', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ stops }) })
  let body = null
  try { body = await r.json() } catch { /* non-JSON */ }
  if (!r.ok) {
    if (r.status === 404) throw new Error('Calculul km merge doar pe adresa publicată în Vercel (funcția /api/km nu a fost găsită).')
    if (!body) throw new Error(`Serverul a răspuns cu eroarea ${r.status}${r.status === 504 ? ' (timp depășit: calculul a durat prea mult, încearcă din nou)' : ''}. Verifică Vercel → Logs → /api/km.`)
    throw new Error(body.error || 'Eroare la calcul.')
  }
  return body.km
}
