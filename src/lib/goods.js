// Marfă pe fiecare punct de încărcare / descărcare: rânduri separate (ex. 2 Europaleți + 1 Block pallet + 1 palet atipic).
const L = (ro, en) => ({ ro, en })

// dims = dimensiunea standard (cm), editabilă; l, w (m) servesc la calculul orientativ al LDM; manual = dimensiunea se trece de mână
export const GOODS_TYPES = [
  { key: 'euro', label: L('Europalet', 'Europallet'), dims: '120×80', l: 1.2, w: 0.8, pallet: true },
  { key: 'industrial', label: L('Industrial pallet', 'Industrial pallet'), dims: '120×100', l: 1.2, w: 1.0, pallet: true },
  { key: 'block', label: L('Block pallet', 'Block pallet'), dims: '120×120', l: 1.2, w: 1.2, pallet: true },
  { key: 'atypical', label: L('Palet atipic', 'Non-standard pallet'), dims: '', manual: true, pallet: true },
  { key: 'boxes', label: L('Cutii', 'Boxes'), dims: '', manual: true },
  { key: 'bulk', label: L('Vrac', 'Bulk'), dims: '', manual: true },
  { key: 'bigbags', label: L('Big bags', 'Big bags'), dims: '', manual: true },
  { key: 'other', label: L('Altele', 'Other'), dims: '', manual: true },
]
export const goodsType = (key) => GOODS_TYPES.find((g) => g.key === key)
export const goodsLabel = (key, lang = 'ro') => goodsType(key)?.label[lang === 'en' ? 'en' : 'ro'] || key || ''

export const emptyGoods = () => ({ type: 'euro', qty: '', dims: '120×80', weight: '', ldm: '', ldmManual: false, vol: '', desc: '' })

const num = (x) => {
  const n = Number(String(x ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const r2 = (n) => Math.round(n * 100) / 100

// LDM orientativ = nr. × lungime × lățime / 2,4 m (lățimea utilă a remorcii); doar pentru dimensiuni cunoscute sau trecute ca „120×80”
export function suggestLdm(g) {
  const q = num(g.qty)
  if (!(q > 0)) return ''
  const m = String(g.dims || '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i)
  if (!m) return ''
  const a = num(m[1]) / 100
  const b = num(m[2]) / 100
  if (!(a > 0 && b > 0)) return ''
  return String(r2((q * a * b) / 2.4))
}

export const hasGoods = (g) => !!g && ['qty', 'weight', 'ldm', 'vol', 'desc'].some((k) => String(g[k] ?? '').trim() !== '')
export const cleanGoods = (arr) => (Array.isArray(arr) ? arr.filter(hasGoods).map((g) => ({ ...emptyGoods(), ...g })) : [])

export function goodsTotals(arr) {
  const rows = Array.isArray(arr) ? arr : []
  const pallets = rows.filter((g) => goodsType(g.type)?.pallet).reduce((s, g) => s + num(g.qty), 0)
  return { pallets, weight: r2(rows.reduce((s, g) => s + num(g.weight), 0)), ldm: r2(rows.reduce((s, g) => s + num(g.ldm), 0)), vol: r2(rows.reduce((s, g) => s + num(g.vol), 0)) }
}

// o linie de text pentru un rând, ex. „2 × Europalet 120×80 · 800 kg · 0,8 LDM · 1,5 m³”
export function goodsLine(g, lang = 'ro') {
  const n = (x) => String(x).replace('.', lang === 'en' ? '.' : ',')
  const parts = [[g.qty ? `${g.qty} ×` : '', goodsLabel(g.type, lang), g.dims].filter(Boolean).join(' ')]
  if (String(g.weight ?? '').trim()) parts.push(`${n(g.weight)} kg`)
  if (String(g.ldm ?? '').trim()) parts.push(`${n(g.ldm)} LDM`)
  if (String(g.vol ?? '').trim()) parts.push(`${n(g.vol)} m³`)
  if (String(g.desc ?? '').trim()) parts.push(g.desc)
  return parts.join(' · ')
}
