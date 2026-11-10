// Datele firmei care folosește aplicația (din tabelul company_settings), disponibile sincron în PDF-uri și ecrane.
// Se încarcă o dată după autentificare (loadCompany). Până atunci, sau dacă firma nu și-a completat datele,
// documentele folosesc valori neutre, niciodată date ale altei firme.
import { supabase, isDemo } from './supabase'
import { ASSETS, COLORS, PLACEHOLDER_COMPANY } from '../config/brand'
import { normalizeHex, tintOf } from './companyForm'

const EMPTY = {
  name: '', cui: '', reg_com: '', address: '', address_en: '', country: 'RO', phone: '', email: '', website: '',
  ibans: [], base_name: '', base_address: '', base_lat: null, base_lng: null,
  logo_path: null, stamp_path: null, signature_path: null,
  color_primary: COLORS.primary, color_secondary: COLORS.secondary,
  default_currency: 'EUR', report_currency: 'EUR',
  numbering_prefixes: { ct: 'CT', cc: 'CC', trip: 'CR', fd: 'FD' },
  active_languages: ['ro', 'en'], signers: [], terms_ro: '', terms_en: '',
  default_payment_days: 30, mail_provider: 'microsoft', mail_from: '', accountant_sees_payroll: true,
  cost_allocation_basis: 'ldm',
}

// Date FICTIVE pentru modul demo (fără bază de date)
const DEMO = { ...EMPTY, name: 'Demo Transport SRL', cui: 'RO00000000', reg_com: 'J00/0000/2000', address: 'Str. Exemplu nr. 1, Oraș Exemplu, România', address_en: '1 Example St., Example City, Romania', phone: '+40 000 000 000', email: 'office@example.test' }

// Culorile firmei, ca „live bindings": PDF-urile le importă și văd mereu valoarea curentă, după încărcarea sau salvarea setărilor.
export let BRAND_PRIMARY = COLORS.primary
export let BRAND_SECONDARY = COLORS.secondary
export let BRAND_TINT = COLORS.tint

let current = { ...EMPTY }
function syncColors() {
  BRAND_PRIMARY = normalizeHex(current.color_primary) || COLORS.primary
  BRAND_SECONDARY = normalizeHex(current.color_secondary) || COLORS.secondary
  BRAND_TINT = BRAND_SECONDARY === COLORS.secondary ? COLORS.tint : tintOf(BRAND_SECONDARY) || COLORS.tint
}
export const getCompany = () => current
export const setCompany = (c) => {
  current = { ...EMPTY, ...Object.fromEntries(Object.entries(c || {}).filter(([, v]) => v !== null && v !== undefined)) }
  syncColors()
}

export async function loadCompany() {
  if (isDemo) { setCompany(DEMO); return current }
  const { data, error } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
  setCompany(error ? null : data)
  return current
}

export const companyName = (lang = 'ro') => current.name || PLACEHOLDER_COMPANY[lang === 'en' ? 'en' : 'ro']
export const companyAddress = (lang = 'ro') => (lang === 'en' && current.address_en ? current.address_en : current.address) || ''
export const companyIds = (lang = 'ro') => {
  const en = lang === 'en'
  return [current.cui && `${en ? 'VAT ID' : 'CUI'}: ${current.cui}`, current.reg_com && `${en ? 'Trade Reg. No.' : 'Nr. Reg. Com.'}: ${current.reg_com}`].filter(Boolean).join(en ? ' · ' : ' · ')
}
export const companyCuiDigits = () => String(current.cui || '').replace(/\D/g, '')

// Înlocuiește {company} / {COMPANY} în orice text sau structură de texte (șabloane de PDF, condiții generale).
export function fillCompany(x, lang = 'ro') {
  const name = companyName(lang)
  const walk = (v) => {
    if (typeof v === 'string') return v.replaceAll('{company}', name).replaceAll('{COMPANY}', name.toUpperCase())
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val)]))
    return v
  }
  return walk(x)
}

// ---- Imagini de brand (logo, ștampilă) ----
const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader()
  fr.onload = () => resolve(fr.result)
  fr.onerror = reject
  fr.readAsDataURL(blob)
})
const cache = {}

async function fetchBlob(kind, path, fallback) {
  if (path && !isDemo) {
    const { data } = await supabase.storage.from('branding').download(path)
    if (data) return data
  }
  if (!fallback) return null
  const r = await fetch(fallback)
  return r.ok ? r.blob() : null
}

// Returnează { logo, stamp } ca data-URL (pentru pdfmake). Ștampila nu are valoare implicită: dacă nu e încărcată, PDF-ul o omite.
export async function brandingDataUrls() {
  const key = `${current.logo_path}|${current.stamp_path}`
  if (cache[key]) return cache[key]
  const [logoBlob, stampBlob] = await Promise.all([fetchBlob('logo', current.logo_path, ASSETS.logo), fetchBlob('stamp', current.stamp_path, null)])
  const out = { logo: logoBlob ? await toDataUrl(logoBlob) : null, stamp: stampBlob ? await toDataUrl(stampBlob) : null }
  cache[key] = out
  return out
}

// Pentru Excel: { buffer, ratio } sau null
export async function brandingImages() {
  const { logo, stamp } = await brandingDataUrls()
  const conv = async (url) => {
    if (!url) return null
    const buffer = await (await fetch(url)).arrayBuffer()
    const bmp = await createImageBitmap(new Blob([buffer]))
    return { buffer, ratio: bmp.width / bmp.height }
  }
  return { logo: await conv(logo), stamp: await conv(stamp) }
}
