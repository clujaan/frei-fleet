// Logică pură pentru formularul „Setări firmă": normalizare și validare. Fără acces la rețea sau la React, ca să poată fi testată cu Node.

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

// "14213d" / "#14213D" / "#abc" -> "#14213D"; valoare invalidă -> null
export function normalizeHex(v) {
  let s = String(v ?? '').trim()
  if (!s) return null
  if (!s.startsWith('#')) s = `#${s}`
  if (/^#[0-9a-fA-F]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
  return HEX_RE.test(s) ? s.toUpperCase() : null
}

// IBAN: fără spații, litere mari; validare mod 97 (ISO 13616)
export const normalizeIban = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase()
export function isValidIban(v) {
  const s = normalizeIban(v)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false
  const moved = s.slice(4) + s.slice(0, 4)
  let rem = 0
  for (const ch of moved) {
    const n = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of n) rem = (rem * 10 + Number(d)) % 97
  }
  return rem === 1
}

// CUI românesc: opțional prefix RO, 2–10 cifre, cifra de control (algoritm oficial, cheia 753217532).
// Pentru firme din alte țări se acceptă orice cod alfanumeric de 4–14 caractere.
export function normalizeCui(v) {
  return String(v ?? '').replace(/\s+/g, '').toUpperCase()
}
export function isValidRoCui(v) {
  const digits = normalizeCui(v).replace(/^RO/, '')
  if (!/^\d{2,10}$/.test(digits)) return false
  const key = [7, 5, 3, 2, 1, 7, 5, 3, 2]
  const body = digits.slice(0, -1).padStart(9, '0')
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * key[i]
  let control = (sum * 10) % 11
  if (control === 10) control = 0
  return control === Number(digits.at(-1))
}
export function isValidCui(v, country = 'RO') {
  const s = normalizeCui(v)
  if (!s) return true // câmp opțional
  if (country === 'RO') return isValidRoCui(s)
  return /^[A-Z0-9]{4,14}$/.test(s)
}

// Prefix de numerotare: 1–6 litere mari sau cifre (ex. CT, CMD, DEC)
export const normalizePrefix = (v) => String(v ?? '').trim().toUpperCase()
export const isValidPrefix = (v) => /^[A-Z0-9]{1,6}$/.test(normalizePrefix(v))

export const isEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim())

// Fișier de branding: PNG/JPG/WebP, maxim 1 MB
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_IMAGE_BYTES = 1024 * 1024
export function validateImageFile(file) {
  if (!file) return 'no_file'
  if (!IMAGE_TYPES.includes(file.type)) return 'type'
  if (file.size > MAX_IMAGE_BYTES) return 'size'
  return null
}
export const imageExt = (file) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file?.type] || 'png')

// Valideazează formularul; returnează { câmp: cod_eroare }. Gol = valid.
export function validateCompany(f) {
  const e = {}
  if (!String(f.name ?? '').trim()) e.name = 'required'
  if (!isValidCui(f.cui, f.country || 'RO')) e.cui = 'cui'
  if (!isEmail(f.email)) e.email = 'email'
  if (!isEmail(f.mail_from)) e.mail_from = 'email'
  if (f.color_primary && !normalizeHex(f.color_primary)) e.color_primary = 'color'
  if (f.color_secondary && !normalizeHex(f.color_secondary)) e.color_secondary = 'color'
  const bad = (f.ibans || []).map((r, i) => (r.iban && !isValidIban(r.iban) ? i : -1)).filter((i) => i >= 0)
  if (bad.length) e.ibans = bad
  for (const k of ['ct', 'cc', 'trip', 'fd']) {
    if (!isValidPrefix(f.numbering_prefixes?.[k])) { e.prefixes = [...(e.prefixes || []), k] }
  }
  const prefixes = ['ct', 'cc', 'trip', 'fd'].map((k) => normalizePrefix(f.numbering_prefixes?.[k]))
  if (new Set(prefixes).size !== prefixes.length) e.prefixes_unique = true
  const days = Number(f.default_payment_days)
  if (!Number.isInteger(days) || days < 0 || days > 365) e.default_payment_days = 'days'
  const lat = f.base_lat === '' || f.base_lat == null ? null : Number(f.base_lat)
  const lng = f.base_lng === '' || f.base_lng == null ? null : Number(f.base_lng)
  if (lat != null && !(lat >= -90 && lat <= 90)) e.base_lat = 'range'
  if (lng != null && !(lng >= -180 && lng <= 180)) e.base_lng = 'range'
  if (!(f.active_languages || []).length) e.active_languages = 'required'
  return e
}

const clean = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s }

// Transformă formularul în rândul care se salvează în company_settings
export function buildCompanyPatch(f) {
  return {
    name: clean(f.name),
    cui: clean(normalizeCui(f.cui)),
    reg_com: clean(f.reg_com),
    address: clean(f.address),
    address_en: clean(f.address_en),
    country: clean(f.country)?.toUpperCase() || 'RO',
    phone: clean(f.phone),
    email: clean(f.email),
    website: clean(f.website),
    ibans: (f.ibans || [])
      .filter((r) => r.iban || r.bank)
      .map((r) => ({ bank: String(r.bank ?? '').trim(), iban: normalizeIban(r.iban), currency: r.currency === 'RON' ? 'RON' : 'EUR' })),
    base_name: clean(f.base_name),
    base_address: clean(f.base_address),
    base_lat: f.base_lat === '' || f.base_lat == null ? null : Number(f.base_lat),
    base_lng: f.base_lng === '' || f.base_lng == null ? null : Number(f.base_lng),
    logo_path: f.logo_path || null,
    stamp_path: f.stamp_path || null,
    signature_path: f.signature_path || null,
    color_primary: normalizeHex(f.color_primary) || '#14213D',
    color_secondary: normalizeHex(f.color_secondary) || '#2A9D8F',
    default_currency: f.default_currency === 'RON' ? 'RON' : 'EUR',
    report_currency: f.report_currency === 'RON' ? 'RON' : 'EUR',
    numbering_prefixes: Object.fromEntries(['ct', 'cc', 'trip', 'fd'].map((k) => [k, normalizePrefix(f.numbering_prefixes?.[k])])),
    active_languages: (f.active_languages || []).filter((l) => l === 'ro' || l === 'en'),
    signers: (f.signers || [])
      .filter((s) => String(s.name ?? '').trim())
      .map((s) => ({ name: String(s.name).trim(), role: String(s.role ?? '').trim(), email: String(s.email ?? '').trim() })),
    terms_ro: clean(f.terms_ro),
    terms_en: clean(f.terms_en),
    default_payment_days: Number(f.default_payment_days),
    mail_provider: ['microsoft', 'google', 'smtp_service'].includes(f.mail_provider) ? f.mail_provider : 'microsoft',
    mail_from: clean(f.mail_from),
    accountant_sees_payroll: f.accountant_sees_payroll !== false,
    cost_allocation_basis: ['ldm', 'weight', 'pallets', 'revenue'].includes(f.cost_allocation_basis) ? f.cost_allocation_basis : 'ldm',
  }
}

// Luminanța relativă (WCAG) și o verificare simplă: textul alb se citește pe culoarea aleasă?
export function luminance(hex) {
  const h = normalizeHex(hex)
  if (!h) return null
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export function whiteTextReadable(hex) {
  const L = luminance(hex)
  return L != null && 1.05 / (L + 0.05) >= 4.5
}

// Culoarea deschisă pentru fundaluri de tabel derivată din culoarea secundară (amestec cu alb)
export function tintOf(hex, ratio = 0.88) {
  const h = normalizeHex(hex)
  if (!h) return null
  const out = [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - ratio) + 255 * ratio))
  return `#${out.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}
