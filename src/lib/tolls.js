// Tools → Taxe de drum: acces la date (țări, costuri suplimentare) și calculul taxelor pe o rută.
import { makeEntityApi } from './entityApi'
import { parseNum } from './format'
import { COUNTRY_SEED, EXTRA_SEED, EXTRA_KINDS, EXTRA_APPLIES, CORRIDOR_SEED } from './tollsSeed'

export { EXTRA_KINDS, EXTRA_APPLIES }
export const CONFIDENCE = ['Verificat', 'Sursă secundară', 'Estimat', 'Lipsă']
export const SCHEMES = ['Pe km', 'Pe tonă-km', 'Concesionar', 'Vinietă (timp)', 'Fără taxă']
export const CONF_STYLE = {
  Verificat: 'bg-emerald-100 text-emerald-800',
  'Sursă secundară': 'bg-sky-100 text-sky-800',
  Estimat: 'bg-amber-100 text-amber-800',
  Lipsă: 'bg-slate-200 text-slate-600',
}
export const PROFILE_WEIGHT_T = 40

export const TOLL_COUNTRIES = {
  key: 'toll_countries',
  table: 'toll_countries',
  prefix: 'TC',
  pad: 3,
  fields: [
    { key: 'country_code', type: 'text' }, { key: 'country_name', type: 'text' }, { key: 'scheme', type: 'text' },
    { key: 'rate_eur', type: 'number' }, { key: 'rate_other_eur', type: 'number' }, { key: 'rate_unit', type: 'text' },
    { key: 'currency', type: 'text' }, { key: 'rate_local', type: 'number' }, { key: 'rate_other_local', type: 'number' },
    { key: 'effective_from', type: 'text' }, { key: 'source_name', type: 'text' }, { key: 'source_url', type: 'text' },
    { key: 'verified_on', type: 'text' }, { key: 'confidence', type: 'text' }, { key: 'notes', type: 'text' },
  ],
  seed: COUNTRY_SEED,
}
TOLL_COUNTRIES.api = makeEntityApi(TOLL_COUNTRIES)

export const TOLL_EXTRAS = {
  key: 'toll_extras',
  table: 'toll_extras',
  prefix: 'TX',
  pad: 3,
  fields: [
    { key: 'name', type: 'text' }, { key: 'kind', type: 'text' }, { key: 'countries', type: 'text' }, { key: 'applies', type: 'text' },
    { key: 'price_eur', type: 'number' }, { key: 'price_basis', type: 'text' }, { key: 'source_name', type: 'text' }, { key: 'source_url', type: 'text' },
    { key: 'verified_on', type: 'text' }, { key: 'confidence', type: 'text' }, { key: 'notes', type: 'text' },
  ],
  seed: EXTRA_SEED,
}
TOLL_EXTRAS.api = makeEntityApi(TOLL_EXTRAS)

const num = (v) => { const x = parseNum(v); return Number.isFinite(x) ? x : 0 }

// Costul pe km al unei țări, la greutatea dată (taxa pe tonă-km se înmulțește cu greutatea).
export function ratePerKm(c, weightT = PROFILE_WEIGHT_T) {
  if (c == null || c.rate_eur == null || c.rate_eur === '') return null
  const r = Number(c.rate_eur)
  if (!Number.isFinite(r)) return null
  return c.rate_unit === 'tkm' ? r * weightT : r
}

// Rânduri de calcul: { code, name, km, rate (€/km, șir editabil), manual (cost fix introdus), cost, missing }
export function buildRows(routeCountries, countries) {
  const by = Object.fromEntries(countries.map((c) => [c.country_code, c]))
  return routeCountries.map(({ code, km, hwyKm }) => {
    const c = by[code]
    const r = c ? ratePerKm(c) : null
    const row = { code, name: c?.country_name || code, km: String(km), rate: r == null ? '' : String(Math.round(r * 10000) / 10000), manual: '', conf: c?.confidence || 'Lipsă' }
    // Țări cu două tarife în monedă locală (ex. TollRO: autostradă / drum național), cu km pe autostradă din rută
    if (c && c.rate_local != null && c.rate_local !== '' && c.currency && c.currency !== 'EUR') {
      row.split = { cur: c.currency, hwy: String(hwyKm == null ? 0 : hwyKm), rHwy: String(c.rate_local), rOth: String(c.rate_other_local ?? c.rate_local) }
    }
    return row
  })
}

// Cost (EUR) al unui rând cu două tarife; `fx` = unități de monedă locală pentru 1 EUR.
export function splitCost(r, fx) {
  const sp = r.split
  if (!sp || !(fx > 0)) return 0
  const km = num(r.km), h = Math.min(km, num(sp.hwy))
  return (h * num(sp.rHwy) + Math.max(0, km - h) * num(sp.rOth)) / fx
}

export const rowCost = (r) => (num(r.manual) > 0 ? num(r.manual) : num(r.km) * num(r.rate))
export const rowMissing = (r) => !(num(r.manual) > 0) && !(num(r.rate) > 0) && r.rate === ''

// Costurile suplimentare propuse pe o rută: toate țările din `countries` trebuie să fie pe rută.
export function suggestExtras(extras, routeCodes) {
  const set = new Set(routeCodes)
  return extras.filter((e) => {
    const need = String(e.countries || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    return need.length > 0 && need.every((c) => set.has(c))
  })
}

// Rute salvate: o pereche încărcare → descărcare + țările de evitat (ex. „AT,CZ” = merge prin SK și PL).
export const TOLL_ROUTES = {
  key: 'toll_routes',
  table: 'toll_routes',
  prefix: 'TR',
  pad: 3,
  fields: [
    { key: 'name', type: 'text' }, { key: 'load_country', type: 'text' }, { key: 'load_place', type: 'text' }, { key: 'load_lat', type: 'number' }, { key: 'load_lon', type: 'number' },
    { key: 'unload_country', type: 'text' }, { key: 'unload_place', type: 'text' }, { key: 'unload_lat', type: 'number' }, { key: 'unload_lon', type: 'number' },
    { key: 'avoid', type: 'text' }, { key: 'notes', type: 'text' },
  ],
  seed: [],
}
TOLL_ROUTES.api = makeEntityApi(TOLL_ROUTES)

export const fmtHours = (h) => {
  if (!Number.isFinite(h) || h <= 0) return '—'
  const m = Math.round(h * 60)
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}
export const avoidKey = (a) => [...(a || [])].map((x) => x.toUpperCase()).sort().join(',')
export const countrySig = (countries) => [...new Set((countries || []).map((c) => c.code))].sort().join(',')

// Trasee exacte (vamă de intrare → vamă de ieșire) calculate pe calculatoare oficiale, pentru țara `country_code`.
export const TOLL_CORRIDORS = {
  key: 'toll_corridors',
  table: 'toll_corridors',
  prefix: 'TQ',
  pad: 3,
  fields: [
    { key: 'country_code', type: 'text' }, { key: 'entry_label', type: 'text' }, { key: 'exit_label', type: 'text' }, { key: 'entry_country', type: 'text' }, { key: 'exit_country', type: 'text' },
    { key: 'km', type: 'number' }, { key: 'fee_infra', type: 'number' }, { key: 'fee_external', type: 'number' }, { key: 'fee_total', type: 'number' },
    { key: 'currency', type: 'text' }, { key: 'vat_included', type: 'bool' }, { key: 'profile', type: 'text' },
    { key: 'source_name', type: 'text' }, { key: 'source_url', type: 'text' }, { key: 'verified_on', type: 'text' }, { key: 'confidence', type: 'text' }, { key: 'notes', type: 'text' },
  ],
  seed: CORRIDOR_SEED,
}
TOLL_CORRIDORS.api = makeEntityApi(TOLL_CORRIDORS)

export const corridorLabel = (c) => `${c.entry_label} → ${c.exit_label} · ${Math.round(Number(c.km))} km · ${Number(c.fee_total).toLocaleString('ro-RO')} ${c.currency}`

// Alege automat traseul care se potrivește cu ruta: țara de dinainte / de după țara cercetată și km cei mai apropiați de cei din rută.
export function autoCorridor(routeCountries, corridors, countryCode) {
  const list = routeCountries || []
  const i = list.findIndex((c) => c.code === countryCode)
  if (i <= 0 || i >= list.length - 1) return null // țara e la capătul rutei: nu putem ghici vama
  const prev = list[i - 1].code, next = list[i + 1].code
  const km = Number(list[i].km)
  const cands = corridors.filter((c) => c.country_code === countryCode && (!c.entry_country || c.entry_country === prev) && (!c.exit_country || c.exit_country === next))
  if (!cands.length) return null
  return cands.reduce((a, b) => (Math.abs(Number(a.km) - km) <= Math.abs(Number(b.km) - km) ? a : b))
}
