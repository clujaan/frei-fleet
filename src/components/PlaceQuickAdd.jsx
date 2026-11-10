import { useState } from 'react'
import { useLang } from '../i18n'
import { CLIENTS } from '../lib/entities'
import { RO_COUNTIES, countryOptions } from '../lib/places'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const lbl = 'block text-[12px] text-slate-600'

// Adresă nouă de încărcare/descărcare, creată peste formularul cursei (nu se iese din formular, nu se pierde nimic).
// Se salvează în același tabel ca pagina „Adrese încărcare / descărcare”.
export default function PlaceQuickAdd({ initialName = '', onClose, onSaved }) {
  const { t, lang } = useLang()
  const [f, setF] = useState({ company: initialName, address: '', zip: '', city: '', county: '', country: 'RO', contact_name: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const save = async () => {
    if (!f.company.trim()) return setErr(t('place.needName'))
    setBusy(true); setErr('')
    try {
      const row = await CLIENTS.api.save(null, { ...f, company: f.company.trim(), client_type: 'Loading/unloading place', status: 'Activ' })
      onSaved(row)
    } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="my-4 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-semibold text-navy-800">{t('place.newTitle')}</h3>
        <p className="mt-1 text-[12px] text-slate-500">{t('place.newHint')}</p>
        <div className="mt-3 grid grid-cols-6 gap-2">
          <label className={`${lbl} col-span-6`}>{t('trip.company')} *<input className={input} value={f.company} onChange={set('company')} autoFocus /></label>
          <label className={`${lbl} col-span-6`}>{t('trip.street')}<input className={input} value={f.address} onChange={set('address')} /></label>
          <label className={`${lbl} col-span-2`}>{t('trip.zip')}<input className={input} value={f.zip} onChange={set('zip')} /></label>
          <label className={`${lbl} col-span-4`}>{t('trip.city')}<input className={input} value={f.city} onChange={set('city')} /></label>
          <label className={`${lbl} col-span-3`}>{t('trip.county')}
            {f.country === 'RO' ? <select className={input} value={f.county} onChange={set('county')}><option value="">—</option>{RO_COUNTIES.map((o) => <option key={o}>{o}</option>)}</select> : <input className={input} value={f.county} onChange={set('county')} />}
          </label>
          <label className={`${lbl} col-span-3`}>{t('trip.country')}
            <select className={input} value={f.country} onChange={set('country')}><option value="">—</option>{countryOptions(lang).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select>
          </label>
          <label className={`${lbl} col-span-3`}>{t('trip.contact')}<input className={input} value={f.contact_name} onChange={set('contact_name')} /></label>
          <label className={`${lbl} col-span-3`}>{t('trip.phone')}<input className={input} value={f.phone} onChange={set('phone')} /></label>
        </div>
        {err && <p className="mt-2 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-[14px] text-slate-700 hover:bg-slate-50">{t('exp.cancel')}</button>
          <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-60">{busy ? '…' : t('place.saveUse')}</button>
        </div>
      </div>
    </div>
  )
}
