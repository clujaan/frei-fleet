import { useLang } from '../i18n'
import { GOODS_TYPES, emptyGoods, goodsTotals, goodsType, suggestLdm } from '../lib/goods'

const inp = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13.5px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const lbl = 'block text-[11.5px] text-slate-600'

// Rânduri de marfă ale unui punct (încărcare sau descărcare)
export default function GoodsEditor({ value, onChange }) {
  const { t, lang } = useLang()
  const rows = Array.isArray(value) ? value : []
  const setRow = (i, patch) => onChange(rows.map((r, j) => {
    if (j !== i) return r
    const n = { ...r, ...patch }
    if ('type' in patch) {
      const ty = goodsType(patch.type)
      n.dims = ty?.dims || ''
      n.ldmManual = false
    }
    if (!n.ldmManual && ('type' in patch || 'qty' in patch || 'dims' in patch)) n.ldm = suggestLdm(n)
    if ('ldm' in patch) n.ldmManual = String(patch.ldm).trim() !== ''
    return n
  }))
  const tot = goodsTotals(rows)
  const fmt = (x) => String(x).replace('.', ',')
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-2">
      <div className="mono-label text-[10px] text-slate-500">{t('goods.title')}</div>
      {rows.map((g, i) => {
        const ty = goodsType(g.type)
        return (
          <div key={i} className="mt-2 grid grid-cols-12 gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <label className={`${lbl} col-span-7 sm:col-span-4`}>{t('goods.type')}
              <select className={inp} value={g.type} onChange={(e) => setRow(i, { type: e.target.value })}>{GOODS_TYPES.map((x) => <option key={x.key} value={x.key}>{x.label[lang === 'en' ? 'en' : 'ro']}</option>)}</select>
            </label>
            <label className={`${lbl} col-span-5 sm:col-span-2`}>{t('goods.qty')}<input inputMode="numeric" className={inp} value={g.qty} onChange={(e) => setRow(i, { qty: e.target.value })} /></label>
            <label className={`${lbl} col-span-12 sm:col-span-4`}>{ty?.manual ? t('goods.dimsManual') : t('goods.dims')}
              <input className={inp} value={g.dims} onChange={(e) => setRow(i, { dims: e.target.value })} placeholder={ty?.manual ? t('goods.dimsPh') : ''} />
            </label>
            <div className="col-span-12 flex items-end justify-end sm:col-span-2">
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-[12px] text-rose-600 hover:underline">{t('trip.removeStop')}</button>
            </div>
            <label className={`${lbl} col-span-4`}>{t('goods.weight')}<input inputMode="decimal" className={inp} value={g.weight} onChange={(e) => setRow(i, { weight: e.target.value })} /></label>
            <label className={`${lbl} col-span-4`}>{t('goods.ldm')}<input inputMode="decimal" className={inp} value={g.ldm} onChange={(e) => setRow(i, { ldm: e.target.value })} /></label>
            <label className={`${lbl} col-span-4`}>{t('goods.vol')}<input inputMode="decimal" className={inp} value={g.vol} onChange={(e) => setRow(i, { vol: e.target.value })} /></label>
            <label className={`${lbl} col-span-12`}>{t('goods.desc')}<input className={inp} value={g.desc} onChange={(e) => setRow(i, { desc: e.target.value })} /></label>
          </div>
        )
      })}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => onChange([...rows, emptyGoods()])} className="rounded-lg border border-dashed border-slate-300 px-3 py-1 text-[12.5px] text-brand-600 hover:bg-brand-500/10">{t('goods.add')}</button>
        {rows.length > 0 && (
          <span className="text-[12px] text-slate-600">
            {t('goods.total')}: {[tot.pallets > 0 && `${tot.pallets} ${t('goods.pallets')}`, tot.weight > 0 && `${fmt(tot.weight)} kg`, tot.ldm > 0 && `${fmt(tot.ldm)} LDM`, tot.vol > 0 && `${fmt(tot.vol)} m³`].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
    </div>
  )
}
