import { useMemo, useState } from 'react'
import { useLang } from '../i18n'
import { RO_COUNTIES, countryOptions, emptyStop } from '../lib/places'
import SearchSelect from './SearchSelect'
import PlaceQuickAdd from './PlaceQuickAdd'
import GoodsEditor from './GoodsEditor'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

function StopBox({ title, value, onChange, onRemove, onMove, places = [], onPlaceAdded }) {
  const { t, lang } = useLang()
  const up = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  const lbl = 'block text-[12px] text-slate-600'
  const [adding, setAdding] = useState(null)
  const apply = (c) => {
    if (!c) return
    onChange({ ...value, company: c.company || '', street: c.address || '', zip: c.zip || '', city: c.city || '', county: c.county || '', country: c.country || '', contact: c.contact_name || '', phone: c.phone || '' })
  }
  const pick = (id) => apply(places.find((x) => x.id === id))
  const placeOpts = useMemo(() => places.map((c) => ({ value: c.id, label: c.company || '—', hint: [c.address, [c.zip, c.city].filter(Boolean).join(' '), c.country].filter(Boolean).join(', ') })), [places])
  return (
    <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="mono-label text-[14px] font-bold tracking-wide text-brand-600">{title}</span>
        <span className="flex items-center gap-3">
          {onMove?.up && <button type="button" onClick={onMove.up} title={t('goods.up')} className="text-[13px] text-slate-500 hover:text-navy-800">▲</button>}
          {onMove?.down && <button type="button" onClick={onMove.down} title={t('goods.down')} className="text-[13px] text-slate-500 hover:text-navy-800">▼</button>}
          {onRemove && <button type="button" onClick={onRemove} className="text-[12px] text-rose-600 hover:underline">{t('trip.removeStop')}</button>}
        </span>
      </div>
      <SearchSelect className="mt-2" value="" onChange={pick} options={placeOpts} placeholder={t('trip.pickPlace')} emptyLabel={t('trip.pickPlace')}
        searchPlaceholder={t('place.search')} noResults={t('place.noResults')} addLabel={t('place.addNew')} onAdd={(q) => setAdding(q || '')} />
      {adding !== null && <PlaceQuickAdd initialName={adding} onClose={() => setAdding(null)} onSaved={(row) => { onPlaceAdded?.(row); apply(row); setAdding(null) }} />}
      <div className="mt-2 grid grid-cols-6 gap-2">
        <label className={`${lbl} col-span-6`}>{t('trip.company')}<input className={input} value={value.company} onChange={up('company')} /></label>
        <label className={`${lbl} col-span-6`}>{t('trip.street')}<input className={input} value={value.street} onChange={up('street')} /></label>
        <label className={`${lbl} col-span-2`}>{t('trip.zip')}<input className={input} value={value.zip} onChange={up('zip')} /></label>
        <label className={`${lbl} col-span-4`}>{t('trip.city')}<input className={input} value={value.city} onChange={up('city')} /></label>
        <label className={`${lbl} col-span-6 sm:col-span-3`}>{t('trip.county')}
          {value.country === 'RO' ? (
            <select className={input} value={value.county} onChange={up('county')}><option value="">—</option>{RO_COUNTIES.map((o) => <option key={o}>{o}</option>)}</select>
          ) : <input className={input} value={value.county} onChange={up('county')} />}
        </label>
        <label className={`${lbl} col-span-6 sm:col-span-3`}>{t('trip.country')}
          <select className={input} value={value.country} onChange={up('country')}>
            <option value="">—</option>
            {countryOptions(lang).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
        </label>
        <label className={`${lbl} col-span-6 sm:col-span-3`}>{t('trip.contact')}<input className={input} value={value.contact} onChange={up('contact')} /></label>
        <label className={`${lbl} col-span-6 sm:col-span-3`}>{t('trip.phone')}<input className={input} value={value.phone} onChange={up('phone')} /></label>
        <label className={`${lbl} col-span-6 sm:col-span-3`}>{t('goods.date')}<input type="date" className={input} value={value.date || ''} onChange={up('date')} /></label>
        <label className={`${lbl} col-span-6 sm:col-span-3`}>{t('goods.dateAlt')}<input type="date" className={input} value={value.date_alt || ''} onChange={up('date_alt')} /></label>
        <label className={`${lbl} col-span-6 sm:col-span-3`}>{t('goods.window')}<input className={input} value={value.window || ''} onChange={up('window')} placeholder={t('goods.windowPh')} /></label>
        <label className={`${lbl} col-span-6 sm:col-span-3`}>{t('goods.ref')}<input className={input} value={value.ref || ''} onChange={up('ref')} /></label>
      </div>
      <GoodsEditor value={value.goods} onChange={(g) => onChange({ ...value, goods: g })} />
    </div>
  )
}


// Lista de puncte (încărcări sau descărcări) cu numerotare, mutare sus/jos, adăugare și ștergere.
// stops = punctele părții respective, în ordine; onChange primește noua listă.
export default function StopsEditor({ side, stops, onChange, places = [], onPlaceAdded }) {
  const { t } = useLang()
  const list = stops.length ? stops : [emptyStop()]
  const move = (i, d) => { const a = [...list]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  return (
    <div className="col-span-full space-y-2">
      {list.map((x, i) => (
        <StopBox key={i} title={list.length > 1 ? `${t(side === 'load' ? 'goods.loadN' : 'goods.unloadN')} ${i + 1}` : t(side === 'load' ? 'trip.loadBox' : 'trip.unloadBox')}
          value={{ ...emptyStop(), ...x }} onChange={(v) => onChange(list.map((y, j) => (j === i ? v : y)))} places={places} onPlaceAdded={onPlaceAdded}
          onMove={list.length > 1 ? { up: i > 0 ? () => move(i, -1) : null, down: i < list.length - 1 ? () => move(i, 1) : null } : null}
          onRemove={list.length > 1 ? () => onChange(list.filter((_, j) => j !== i)) : null} />
      ))}
      <button type="button" onClick={() => onChange([...list, emptyStop()])} className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">
        {t(side === 'load' ? 'trip.addLoad' : 'trip.addUnload')}
      </button>
    </div>
  )
}
