// Import „Formular client” (PDF completabil al firmei): citește câmpurile, le normalizează și le pregătește pentru ecranul de verificare.
// Funcționează cu formularul vechi (adresa pe un singur rând: l_address / u_address) și cu cel nou (l_street, l_zip, l_city, l_country...).
import { supabase, isDemo } from './supabase'
import { countryName, EUROPE } from './places'
import { foldText } from './costs'
import { todayISO } from './format'

const p2 = (n) => String(n).padStart(2, '0')
const s = (v) => (v == null ? '' : String(v).trim())

export async function readFormFields(file) {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } = await import('pdf-lib')
  let doc
  try { doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true }) } catch { throw new Error('Nu pot deschide fișierul PDF.') }
  const out = {}
  let form
  try { form = doc.getForm() } catch { throw new Error('PDF-ul nu are câmpuri completabile.') }
  for (const f of form.getFields()) {
    const name = f.getName()
    try {
      if (f instanceof PDFTextField) out[name] = s(f.getText())
      else if (f instanceof PDFCheckBox) out[name] = f.isChecked()
      else if (f instanceof PDFDropdown) out[name] = s((f.getSelected() || [])[0])
      else if (f instanceof PDFRadioGroup) out[name] = s(f.getSelected())
    } catch { /* câmp ilizibil: îl ignor */ }
  }
  if (!('c_company' in out) && !('l_address' in out) && !('l_street' in out)) throw new Error('Nu pare formularul client al firmei (lipsesc câmpurile așteptate).')
  return out
}

// ---- date: „26-27.10”, „3-4.11.2026”, „26.10 sau 27.10”, „2026-10-26” → [prima, a doua?] ISO ----
export function parseDates(text, refISO) {
  const t = s(text)
  if (!t) return []
  const ref = refISO && /^\d{4}/.test(refISO) ? refISO : todayISO()
  const ry = Number(ref.slice(0, 4))
  const mk = (d, m, y) => {
    d = Number(d); m = Number(m)
    let yy = y ? Number(y) : ry
    if (yy < 100) yy += 2000
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
    let iso = `${yy}-${p2(m)}-${p2(d)}`
    if (!y && iso < ref.slice(0, 10) && new Date(ref) - new Date(iso) > 45 * 864e5) iso = `${yy + 1}-${p2(m)}-${p2(d)}` // fără an și mult în trecut → anul următor
    return iso
  }
  const isoTokens = [...t.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`)
  if (isoTokens.length) return isoTokens.slice(0, 2)
  const toks = [...t.matchAll(/(\d{1,2})\s*[./]\s*(\d{1,2})(?:\s*[./]\s*(\d{2,4}))?/g)]
  if (toks.length >= 2) return toks.slice(0, 2).map((m) => mk(m[1], m[2], m[3])).filter(Boolean)
  if (toks.length === 1) {
    const m = toks[0]
    const before = t.slice(0, m.index)
    const pre = before.match(/(\d{1,2})\s*(?:-|–|—|\/|și|si|sau|or|and)\s*$/i)
    const a = mk(m[1], m[2], m[3])
    const first = pre ? mk(pre[1], m[2], m[3]) : null
    return [first, a].filter(Boolean)
  }
  return []
}

export function parseWeightKg(text) {
  const t = s(text).toLowerCase().replace(/\s+/g, '')
  const m = t.match(/(\d+(?:[.,]\d+)*)(kg|tone|tona|to|t)?/)
  if (!m) return ''
  let num = m[1].replace(/\.(?=\d{3}(?!\d))/g, '').replace(',', '.')
  let v = Number(num)
  if (!Number.isFinite(v) || v <= 0) return ''
  if (m[2] && m[2] !== 'kg') v *= 1000
  return String(Math.round(v * 100) / 100)
}

export const parsePrice = (text) => {
  const m = s(text).replace(/\s/g, '').match(/\d+(?:[.,]\d+)*/)
  if (!m) return ''
  const n = Number(m[0].replace(/\.(?=\d{3}(?!\d))/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? String(n) : ''
}
export const parseCurrency = (text) => {
  const t = foldText(text)
  if (/ron|lei|leu/.test(t)) return 'RON'
  if (/eur|euro/.test(t)) return 'EUR'
  return t ? text.trim().toUpperCase().slice(0, 3) : 'EUR'
}
// „30”, „30 zile” → 30; „in ziua descarcarii” / „la descărcare” → 0; altfel gol
export function parseTerms(text) {
  const t = foldText(text)
  if (!t) return ''
  if (/descarc|livrare|unloading|delivery|cash|numerar|ramburs/.test(t)) return '0'
  const m = t.match(/\d+/)
  return m ? m[0] : ''
}
export function parsePackages(text) {
  const t = foldText(text)
  const m = t.match(/\d+/)
  return { qty: m ? m[0] : '', pallet: /palet|pallet/.test(t) || !t }
}

// ---- adresă pe un singur rând: euristică de rezervă (când citirea AI nu e disponibilă) ----
export function guessCountry(text) {
  const t = foldText(text)
  for (const lang of ['ro', 'en']) {
    for (const c of EUROPE) {
      const n = foldText(countryName(c, lang))
      if (n.length >= 4 && t.includes(n)) return c
    }
  }
  if (/\bfranta\b|\bfrance\b/.test(t)) return 'FR'
  return ''
}
export function guessAddress(text, hint = '') {
  const raw = s(text).replace(/\s+/g, ' ')
  const country = guessCountry(raw) || hint || ''
  const zip = (raw.match(/\b\d{4,6}\b/) || [])[0] || ''
  let street = raw
  let city = ''
  let county = ''
  const segs = String(text || '').split(',').map((x) => x.trim()).filter(Boolean)
  const sat = segs.find((x) => /^(sat|satul|com\.?|comuna|oras|orașul|mun\.?|municipiul)\s/i.test(x))
  const jud = segs.find((x) => /^(jud\.?|județul|judetul)\s/i.test(x))
  if (sat || jud) {
    city = sat ? sat.replace(/^(sat|satul|com\.?|comuna|oras|orașul|mun\.?|municipiul)\s+/i, '') : ''
    county = jud ? jud.replace(/^(jud\.?|județul|judetul)\s+/i, '') : ''
    street = segs.filter((x) => x !== sat && x !== jud).join(', ')
  } else if (zip) {
    const i = raw.indexOf(zip)
    street = raw.slice(0, i).replace(/[,\s]+$/, '')
    city = raw.slice(i + zip.length).replace(/^[,\s]+/, '').replace(/\b(france|franța|franta|romania|românia|germany|germania|italy|italia|spain|spania)\b.*$/i, '').trim()
  }
  return { company: '', street, zip: sat || jud ? '' : zip, city, county, country: country || (sat || jud ? 'RO' : '') }
}

// Adresele de pe un rând → câmpuri, prin /api/parse-client-form; la eșec rămâne euristica.
export async function parseAddressesAI(items) {
  if (isDemo || !items.length) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  try {
    const r = await fetch('/api/parse-client-form', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ addresses: items }) })
    if (!r.ok) return null
    const b = await r.json()
    return Object.fromEntries((b.addresses || []).map((a) => [a.key, a]))
  } catch { return null }
}

const stopFrom = (f, p, ai, hint) => {
  const separate = !!(s(f[`${p}_street`]) || s(f[`${p}_city`]) || s(f[`${p}_zip`]) || s(f[`${p}_company`]))
  const text = s(f[`${p}_address`])
  let a
  if (separate) a = { company: s(f[`${p}_company`]), street: s(f[`${p}_street`]), zip: s(f[`${p}_zip`]), city: s(f[`${p}_city`]), county: s(f[`${p}_county`]), country: s(f[`${p}_country`]) }
  else if (ai && ai[p]) a = { company: s(ai[p].company), street: s(ai[p].street), zip: s(ai[p].zip), city: s(ai[p].city), county: s(ai[p].county), country: s(ai[p].country).toUpperCase() }
  else a = guessAddress(text, hint)
  if (a.country && a.country.length > 2) a.country = guessCountry(a.country) || a.country.slice(0, 2).toUpperCase()
  return { ...a, country: (a.country || '').toUpperCase(), contact: s(f[`${p}_person`]), phone: s(f[`${p}_phone`]), dateText: s(f[`${p}_date`]), window: s(f[`${p}_window`]), ref: s(f[`${p}_ref`]), rawAddress: text }
}

// Întoarce ciorna pentru ecranul de verificare
export async function buildDraft(f) {
  const orderDate = (parseDates(f.c_date)[0]) || todayISO()
  const needAI = [['l', f.l_address], ['u', f.u_address]].filter(([p, t]) => s(t) && !(s(f[`${p}_street`]) || s(f[`${p}_city`])))
  const ai = needAI.length ? await parseAddressesAI(needAI.map(([p, t]) => ({ key: p, text: s(t), hint: p === 'u' ? 'RO' : '' }))) : null
  const load = stopFrom(f, 'l', ai, '')
  const unload = stopFrom(f, 'u', ai, 'RO')
  const mkDates = (st) => { const [d1, d2] = parseDates(st.dateText, orderDate); return { date: d1 || '', date_alt: d2 || '' } }
  const pk = parsePackages(f.g_pkgs)
  const notes = [
    s(f.g_desc) && `Marfă declarată de client: ${s(f.g_desc)}`,
    s(f.g_pkgs) && `Colete / paleți (client): ${s(f.g_pkgs)}`,
    s(f.g_ldm) && `LDM / volum (client): ${s(f.g_ldm)}`,
    s(f.g_vehicle) && `Tip vehicul cerut: ${s(f.g_vehicle)}`,
    s(f.g_temp) && `Temperatură: ${s(f.g_temp)}`,
    f.g_adr && 'Marfă ADR',
    s(f.g_uit) && `Cod UIT: ${s(f.g_uit)}`,
    s(f.g_req) && `Cerințe speciale: ${s(f.g_req)}`,
    s(f.p_terms) && `Termen de plată (client): ${s(f.p_terms)}`,
  ].filter(Boolean).join('\n')
  return {
    client: { company: s(f.c_company), cui: s(f.c_cui), contact_name: s(f.c_person), phone: s(f.c_phone), email: s(f.c_email), payment_terms_days: parseTerms(f.p_terms) },
    load: { ...load, ...mkDates(load) },
    unload: { ...unload, ...mkDates(unload) },
    goods: { type: 'euro', qty: pk.qty, weight: parseWeightKg(f.g_weight), desc: 'Marfă generală' },
    price: parsePrice(f.p_price), currency: parseCurrency(s(f.p_cur) || 'EUR'),
    service_type: load.country && unload.country && load.country === 'RO' && unload.country === 'RO' ? 'FTL intern' : 'FTL internațional',
    notes,
    raw: { ref: s(f.c_ref), orderDate: s(f.c_date) },
    aiUsed: !!ai,
  }
}
