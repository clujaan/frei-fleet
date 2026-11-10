// Funcție serverless Vercel: calculează distanța rutieră (camion, profil HGV) între locul de încărcare și cel de descărcare.
// Folosește OpenRouteService; cheia rămâne doar pe server.
//
// Variabile de mediu necesare în Vercel:
//   ORS_API_KEY         cheia gratuită de la openrouteservice.org (Dashboard -> Request a token)
//   SUPABASE_URL        la fel ca VITE_SUPABASE_URL
//   SUPABASE_ANON_KEY   la fel ca VITE_SUPABASE_ANON_KEY

import { routeVia } from './_geo.js'

const ORS = 'https://api.openrouteservice.org'
const MAX_STOPS = 6

async function verifyUser(token) {
  const base = process.env.SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY
  if (!base || !anon) throw Object.assign(new Error('Serverul nu are SUPABASE_URL / SUPABASE_ANON_KEY.'), { status: 500 })
  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
  if (!who.ok) throw Object.assign(new Error('Sesiune invalidă.'), { status: 401 })
  const user = await who.json()
  const row = await fetch(`${base}/rest/v1/app_users?select=user_id&user_id=eq.${user.id}`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
  const rows = row.ok ? await row.json() : []
  if (!rows.length) throw Object.assign(new Error('Acces interzis.'), { status: 403 })
}

// Variante de căutare pentru un loc scris liber (ex. „Aarhus N 8200, Aarhus Kommune”): textul întreg, apoi forme tot mai simple.
// Se încearcă pe rând, doar dacă cea dinainte nu a găsit nimic.
export function geoCandidates(place) {
  const raw = String(place || '').trim().replace(/\s+/g, ' ')
  const segs = raw.split(',').map((x) => x.trim()).filter(Boolean)
  const zip = (raw.match(/\b\d{3,6}\b/) || [])[0]
  const clean = (x) => x
    .replace(/\b\d{2,6}(?:-\d{2,3})?\b/g, ' ')
    .replace(/\b(kommune|municipality|county|region|gmina|powiat|district|distrikt|landkreis|kreis|comune|provincia)\b/gi, ' ')
    .replace(/(?<![\p{L}])\p{Lu}(?![\p{L}])/gu, ' ')
    .replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
  const city = clean(segs[0] || raw)
  const out = [raw]
  if (segs.length > 1) out.push(segs[0])
  if (zip && city) out.push(`${zip} ${city}`)
  if (city) out.push(city)
  if (zip) out.push(zip)
  return [...new Set(out.filter(Boolean))].slice(0, 5)
}

async function geocodeOnce(key, country, text) {
  const u = new URL(`${ORS}/geocode/search`)
  u.searchParams.set('api_key', key)
  u.searchParams.set('text', text)
  u.searchParams.set('size', '1')
  if (/^[A-Za-z]{2,3}$/.test(country || '')) u.searchParams.set('boundary.country', country.toUpperCase())
  const r = await orsFetch(u)
  if (!r.ok) throw Object.assign(new Error(`Serviciul de hărți nu a răspuns (geocodare, eroarea ${r.status}). Încearcă din nou peste un minut.`), { status: 502 })
  const j = await r.json()
  const f = j.features?.[0]
  return f ? f.geometry.coordinates : null // [lon, lat]
}

async function geocode(key, country, place) {
  for (const text of geoCandidates(place)) {
    const c = await geocodeOnce(key, country, text)
    if (c) return c
  }
  return null
}

const ISO3 = { AUT: 'AT', BEL: 'BE', BGR: 'BG', HRV: 'HR', CZE: 'CZ', DNK: 'DK', EST: 'EE', FIN: 'FI', FRA: 'FR', DEU: 'DE', GRC: 'GR', HUN: 'HU', IRL: 'IE', ITA: 'IT', LVA: 'LV', LTU: 'LT', LUX: 'LU', NLD: 'NL', POL: 'PL', PRT: 'PT', ROU: 'RO', SVK: 'SK', SVN: 'SI', ESP: 'ES', SWE: 'SE', CHE: 'CH', NOR: 'NO', GBR: 'GB', SRB: 'RS', BIH: 'BA', MKD: 'MK', MNE: 'ME', ALB: 'AL', TUR: 'TR', XKX: 'XK', MDA: 'MD', UKR: 'UA', LIE: 'LI', CYP: 'CY', MLT: 'MT', BLR: 'BY' }
const TO3 = Object.fromEntries(Object.entries(ISO3).map(([a, b]) => [b, a]))

// Memorează id-urile numerice ORS -> țară, ca să nu geocodăm invers de fiecare dată (rămâne între apeluri pe aceeași instanță).
const ID2CODE = new Map()

// Decodifică un polyline Google (precizie 5), cum îl întoarce ORS implicit.
function decodePolyline(str) {
  const pts = []
  let i = 0, lat = 0, lon = 0
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b
      do { b = str.charCodeAt(i++) - 63; result |= (b & 31) << shift; shift += 5 } while (b >= 32)
      const d = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += d; else lon += d
    }
    pts.push([lon / 1e5, lat / 1e5])
  }
  return pts
}

const haversine = ([lo1, la1], [lo2, la2]) => {
  const R = 6371, rad = Math.PI / 180
  const dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Id-urile numerice de țară din ORS (countryinfo), din lista oficială ORS: docs/technical-details/country-list.md.
// Fără geocodare inversă: rapid și fără limite de cereri. 75 = zonă de graniță DE–BE, 141 = NL–BE (le socotim la DE / NL).
const ORS_COUNTRY_IDS = { 2: 'AL', 4: 'AD', 11: 'AT', 16: 'BY', 17: 'BE', 23: 'BA', 30: 'BG', 49: 'HR', 51: 'CY', 52: 'CZ', 53: 'DK', 63: 'EE', 69: 'FI', 70: 'FR', 74: 'DE', 75: 'DE', 78: 'GR', 88: 'HU', 89: 'IS', 94: 'IE', 97: 'IT', 106: 'XK', 110: 'LV', 115: 'LI', 116: 'LT', 117: 'LU', 118: 'MK', 124: 'MT', 129: 'MD', 130: 'MC', 132: 'ME', 141: 'NL', 148: 'NO', 159: 'PL', 160: 'PT', 162: 'RO', 171: 'SM', 175: 'RS', 179: 'SK', 180: 'SI', 187: 'ES', 192: 'SE', 193: 'CH', 200: 'NL', 206: 'TR', 211: 'UA', 213: 'GB', 163: 'RU' }
const KNOWN_IDS = ORS_COUNTRY_IDS
const ID_PENDING = new Map() // id -> Promise (variantele rulează în paralel: o singură căutare per id)

// Doar pentru id-uri care nu sunt în tabelul de mai sus: o singură încercare de geocodare inversă.
async function reverseCountry(key, lon, lat) {
  try {
    const u = new URL(`${ORS}/geocode/reverse`)
    u.searchParams.set('api_key', key); u.searchParams.set('point.lon', lon); u.searchParams.set('point.lat', lat); u.searchParams.set('layers', 'country'); u.searchParams.set('size', '1')
    const r = await orsFetch(u)
    if (!r.ok) return null
    const j = await r.json()
    const p = j?.features?.[0]?.properties
    return ISO3[p?.country_a] || (p?.country_code && String(p.country_code).length === 2 ? p.country_code : null)
  } catch { return null }
}

// Țara unui id numeric ORS: geocodare inversă în mai multe puncte ale celui mai lung segment; rezultatul bun se reține.
function resolveId(key, pts, seg, id) {
  if (KNOWN_IDS[id]) { ID2CODE.set(id, KNOWN_IDS[id]); return Promise.resolve(KNOWN_IDS[id]) }
  if (ID_PENDING.has(id)) return ID_PENDING.get(id)
  const job = (async () => {
    const i = Math.min(pts.length - 1, Math.floor((seg[0] + seg[1]) / 2))
    const code = await reverseCountry(key, pts[i][0], pts[i][1])
    if (code) ID2CODE.set(id, code)
    return code
  })().finally(() => ID_PENDING.delete(id))
  ID_PENDING.set(id, job)
  return job
}

// Kilometri pe autostradă (drum marcat „Highway” de ORS, categoria waycategory, bit 1) pe fiecare țară.
function highwayByCountry(route, pts, totalKm, idCode) {
  const wc = route.extras?.waycategory?.values, ci = route.extras?.countryinfo?.values
  if (!wc?.length || !ci?.length) return null
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]))
  const scale = totalKm / (cum[cum.length - 1] || 1)
  const out = {}
  for (const [a, b, v] of wc) {
    if (!(v & 1)) continue
    for (const [c, d, id] of ci) {
      const lo = Math.max(a, c), hi = Math.min(b, d)
      if (hi <= lo) continue
      const code = idCode[id]
      if (!code) continue
      out[code] = (out[code] || 0) + (cum[Math.min(hi, cum.length - 1)] - cum[Math.min(lo, cum.length - 1)]) * scale
    }
  }
  return out
}

// Kilometri pe țară, în ordinea în care ruta intră în fiecare țară.
async function splitByCountry(key, route, totalKm) {
  const ci = route.extras?.countryinfo
  if (!ci?.summary?.length || typeof route.geometry !== 'string') return { countries: null, ferryKm: 0 }
  const pts = decodePolyline(route.geometry)
  const longest = {}, first = {}
  for (const [a, b, id] of ci.values || []) {
    if (!longest[id] || b - a > longest[id][1] - longest[id][0]) longest[id] = [a, b]
    if (first[id] === undefined || a < first[id]) first[id] = a
  }
  const sum = ci.summary.reduce((s, x) => s + x.distance, 0) || 1
  const byCode = {}
  const idCode = {}
  for (const s of ci.summary) {
    let code = ID2CODE.get(s.value)
    if (!code) {
      const seg = longest[s.value]
      if (!seg) continue
      code = await resolveId(key, pts, seg, s.value)
      if (!code) code = `?${s.value}`
    }
    idCode[s.value] = code
    const o = byCode[code] || (byCode[code] = { km: 0, at: first[s.value] ?? 0 })
    o.km += (s.distance / sum) * totalKm
    o.at = Math.min(o.at, first[s.value] ?? o.at)
  }
  let hwy = null
  try { hwy = highwayByCountry(route, pts, totalKm, idCode) } catch { /* ignorat */ }
  const countries = Object.entries(byCode).sort((a, b) => a[1].at - b[1].at).map(([code, o]) => {
    const row = { code, km: Math.round(o.km * 10) / 10 }
    if (hwy) row.hwyKm = Math.round(Math.min(o.km, hwy[code] || 0) * 10) / 10
    return row
  })
  const wt = route.extras?.waytype?.summary || []
  const wsum = wt.reduce((q, x) => q + x.distance, 0) || 1
  let ferryKm = 0
  for (const s of wt) if (s.value === 9) ferryKm += (s.distance / wsum) * totalKm
  // Traseul pe scurt (vămi, orașe, link Google Maps): doar informativ; o eroare aici nu afectează calculul.
  let via = null
  try { via = routeVia(pts, (ci.values || []).map(([a, b, id]) => [a, b, idCode[id]]), totalKm) } catch { /* ignorat */ }
  return { countries, ferryKm: Math.round(ferryKm), via }
}

// Cerere către ORS cu limită de timp, ca funcția să răspundă mereu cu JSON (nu cu o eroare 504 a platformei).
const orsOnce = (url, opts = {}) => fetch(url, { ...opts, signal: AbortSignal.timeout(12000) })
// Serviciul gratuit ORS mai răspunde uneori 429/502/503/504 (supraîncărcat): reîncercăm de până la 3 ori, cu pauză scurtă.
const orsFetch = async (url, opts = {}) => {
  const t0 = Date.now()
  let r
  for (let i = 0; i < 3; i++) {
    try { r = await orsOnce(url, opts) } catch (e) { if (i === 2 || Date.now() - t0 > 18000) throw e; await new Promise((ok) => setTimeout(ok, 1000)); continue }
    if (![429, 502, 503, 504].includes(r.status) || Date.now() - t0 > 18000) return r
    await new Promise((ok) => setTimeout(ok, 1200 * (i + 1)))
  }
  return r
}

// Formatul de coduri care a mers ultima dată (ISO2 sau ISO3), reținut între apeluri pe aceeași instanță.
let AVOID_FMT = null

// O singură rută; `avoid` = coduri ISO2 de țări de evitat. ORS acceptă coduri de țară; încercăm ISO2, apoi ISO3.
async function oneRoute(key, coords, avoid) {
  const fmts = avoid.length ? (AVOID_FMT ? [AVOID_FMT] : ['iso2', 'iso3']) : ['iso2']
  let last = 'Nu am putut calcula ruta.'
  for (const fmt of fmts) {
    const av = fmt === 'iso3' ? avoid.map((c) => TO3[c] || c) : avoid
    const body = { coordinates: coords, radiuses: coords.map(() => -1), units: 'km', extra_info: ['countryinfo', 'waytype', 'waycategory'] }
    if (av.length) body.options = { avoid_countries: av }
    try {
      const call = async (b) => {
        const rr = await orsFetch(`${ORS}/v2/directions/driving-hgv`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: key }, body: JSON.stringify(b) })
        const txt = await rr.text().catch(() => '')
        let o = null
        try { o = JSON.parse(txt) } catch { /* non-JSON */ }
        return { r: rr, out: o, txt }
      }
      let { r, out, txt } = await call(body)
      // Rute foarte lungi pot depăși ce acceptă serviciul gratuit cu detalii extra: reîncerc doar pentru distanță (fără defalcare pe țări).
      if (!r.ok && r.status >= 500) {
        const lean = { ...body }
        delete lean.extra_info
        const again = await call(lean)
        if (again.r.ok) { r = again.r; out = again.out; txt = again.txt } else { txt = again.txt || txt; r = again.r }
      }
      if (!r.ok) { last = out?.error?.message || `Serviciul de hărți a răspuns cu eroarea ${r.status}${txt && !out ? ` (${String(txt).replace(/\s+/g, ' ').slice(0, 120)})` : ''}.`; continue }
      const route = out?.routes?.[0]
      const km = route?.summary?.distance
      if (!Number.isFinite(km)) { last = 'Nu am primit o distanță de la serviciul de hărți.'; continue }
      if (avoid.length) AVOID_FMT = fmt
      let countries = null, ferryKm = 0, via = null
      try { ({ countries, ferryKm, via } = await splitByCountry(key, route, km)) } catch { /* ignorat */ }
      return { avoid, km: Math.round(km), hours: Math.round((route.summary.duration / 3600) * 10) / 10, countries, ferryKm, via }
    } catch (e) {
      last = e?.name === 'TimeoutError' ? 'Serviciul de hărți nu a răspuns la timp.' : 'Serviciul de hărți nu este disponibil acum.'
      break
    }
  }
  return { avoid, error: last }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodă nepermisă.' })
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Lipsește autentificarea.' })
    await verifyUser(token)
    const key = process.env.ORS_API_KEY
    if (!key) return res.status(500).json({ error: 'Serverul nu are ORS_API_KEY (vezi Vercel → Settings → Environment Variables).' })

    // stops: [{country, place}] în ordinea rutei
    const stops = Array.isArray(req.body?.stops) ? req.body.stops.filter((s) => s?.place?.trim()).slice(0, MAX_STOPS) : []
    if (stops.length < 2) return res.status(400).json({ error: 'Lipsesc locul de încărcare sau de descărcare.' })

    const coords = []
    for (const s of stops) {
      if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) { coords.push([s.lon, s.lat]); continue }
      const c = await geocode(key, s.country, s.place.trim())
      if (!c) return res.status(422).json({ error: `Nu am găsit locul „${s.place.trim()}”${s.country ? ` (${s.country})` : ''}. Verifică scrierea sau adaugă codul poștal.` })
      coords.push(c)
    }

    // Variante: [{avoid:['AT','CZ']}, ...] (max 6) — fiecare e o rută cu țări evitate.
    const reqV = Array.isArray(req.body?.variants) ? req.body.variants.slice(0, 6) : null
    if (reqV) {
      const clean = (v) => (Array.isArray(v?.avoid) ? v.avoid.map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)) : [])
      const variants = await Promise.all(reqV.map((v) => oneRoute(key, coords, clean(v))))
      return res.status(200).json({ variants })
    }
    const one = await oneRoute(key, coords, [])
    if (one.error) return res.status(422).json({ error: one.error })
    return res.status(200).json(one)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Eroare internă.' })
  }
}
