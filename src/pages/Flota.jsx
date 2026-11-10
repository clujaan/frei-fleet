// Flotă: camioane, remorci, șoferi (cu salariu protejat și diurnă) și diurna implicită a firmei.
import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLang } from '../i18n'
import { backdrop } from '../lib/backdrop'
import { CloseX, SaveButtons, useFlash } from '../components/ModalChrome'
import { useDeleteReason } from '../components/ReasonModal'
import { TRUCK_DEFAULTS } from '../lib/trucks'
import { DRIVERS_API, PAY_API, PER_DIEM_API, TRAILERS_API, TRAILER_TYPES, TRUCKS_API, activeOr, monthlyEmployerCost, truckLabel } from '../lib/fleet'
import { pickPerDiemRate } from '../lib/tripMoney'
import { countryName, countryOptions } from '../lib/places'
import { fmtDate, fmtMoney, parseNum, todayISO } from '../lib/format'
import { foldText } from '../lib/costs'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const lbl = 'block text-[12px] text-slate-600'
const useTx = () => { const { lang } = useLang(); return (ro, en) => (lang === 'en' ? en : ro) }
const TABS = ['trucks', 'trailers', 'drivers', 'perdiem']
const pill = (s) => `mono-label rounded-full border px-2 py-0.5 text-[10px] ${s === 'Inactiv' ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`
const blank = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k] ?? '']))

function Modal({ title, onClose, children, busy, onSave, flash, err }) {
  const tx = useTx()
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{title}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{tx('Anulează', 'Cancel')}</button>
          <SaveButtons busy={busy} onSave={onSave} flash={flash} />
        </div>
      </div>
    </div>
  )
}

// Salvare comună: exit = închide fereastra; altfel rămâne deschisă cu „Salvat"
function useSaver(save, onSaved) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [flash, ping] = useFlash()
  const run = async (exit = true) => {
    setBusy(true); setErr('')
    try { const r = await save(); setBusy(false); onSaved(r, !exit); if (!exit) ping() } catch (e) { setErr(e.message); setBusy(false) }
  }
  return { busy, err, setErr, flash, run }
}

function TruckModal({ initial, trailers, onClose, onSaved }) {
  const tx = useTx()
  const [f, setF] = useState(() => ({ ...blank(initial, ['plate', 'make', 'model', 'year', 'vin', 'ref_consumption', 'default_trailer_id', 'notes']), status: initial?.status || 'Activ' }))
  const [id, setId] = useState(initial?.id || null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const s = useSaver(async () => {
    if (!String(f.plate).trim()) throw new Error(tx('Completează numărul de înmatriculare.', 'Fill in the plate number.'))
    // se salvează rândul întreg, ca datele de cost/km din Tools să rămână neatinse
    const r = await TRUCKS_API.save(id, { ...TRUCK_DEFAULTS, ...(initial || {}), ...f, plate: String(f.plate).toUpperCase().replace(/\s+/g, '') })
    setId(r.id)
    return r
  }, onSaved)
  return (
    <Modal title={id ? `${tx('Camion', 'Truck')} ${initial?.code || ''}` : tx('Camion nou', 'New truck')} onClose={onClose} {...s} onSave={s.run}>
      <label className={lbl}>{tx('Număr de înmatriculare', 'Plate number')} *<input className={input} value={f.plate} onChange={set('plate')} placeholder="MM 01 ABC" /></label>
      <label className={lbl}>{tx('Status', 'Status')}<select className={input} value={f.status} onChange={set('status')}><option value="Activ">{tx('Activ', 'Active')}</option><option value="Inactiv">{tx('Inactiv', 'Inactive')}</option></select></label>
      <label className={lbl}>{tx('Marcă', 'Make')}<input className={input} value={f.make} onChange={set('make')} /></label>
      <label className={lbl}>{tx('Model', 'Model')}<input className={input} value={f.model} onChange={set('model')} /></label>
      <label className={lbl}>{tx('An fabricație', 'Year')}<input inputMode="numeric" className={input} value={f.year} onChange={set('year')} /></label>
      <label className={lbl}>VIN<input className={input} value={f.vin} onChange={set('vin')} /></label>
      <label className={lbl}>{tx('Consum de referință (l/100 km)', 'Reference consumption (l/100 km)')}<input inputMode="decimal" className={input} value={f.ref_consumption} onChange={set('ref_consumption')} placeholder="30" /></label>
      <label className={lbl}>{tx('Remorcă obișnuită', 'Usual trailer')}<select className={input} value={f.default_trailer_id || ''} onChange={set('default_trailer_id')}><option value="">—</option>{activeOr(trailers, f.default_trailer_id).map((t) => <option key={t.id} value={t.id}>{t.plate} · {t.trailer_type}</option>)}</select></label>
      <label className={`${lbl} sm:col-span-2`}>{tx('Observații', 'Notes')}<textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>
      {id && <p className="text-[12px] text-slate-500 sm:col-span-2">{tx('Costul pe km (leasing, asigurări, consum detaliat) se calculează în', 'Cost per km (leasing, insurance, detailed consumption) is calculated in')} <Link to="/tools/camioane" className="text-brand-600 hover:underline">Tools → {tx('Camioane', 'Trucks')}</Link>.</p>}
    </Modal>
  )
}

function TrailerModal({ initial, onClose, onSaved }) {
  const tx = useTx()
  const [f, setF] = useState(() => ({ ...blank(initial, ['plate', 'notes']), trailer_type: initial?.trailer_type || 'Prelată', status: initial?.status || 'Activ' }))
  const [id, setId] = useState(initial?.id || null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const s = useSaver(async () => {
    if (!String(f.plate).trim()) throw new Error(tx('Completează numărul de înmatriculare.', 'Fill in the plate number.'))
    const r = await TRAILERS_API.save(id, { ...f, plate: String(f.plate).toUpperCase().replace(/\s+/g, '') })
    setId(r.id)
    return r
  }, onSaved)
  return (
    <Modal title={id ? `${tx('Remorcă', 'Trailer')} ${initial?.code || ''}` : tx('Remorcă nouă', 'New trailer')} onClose={onClose} {...s} onSave={s.run}>
      <label className={lbl}>{tx('Număr de înmatriculare', 'Plate number')} *<input className={input} value={f.plate} onChange={set('plate')} /></label>
      <label className={lbl}>{tx('Tip', 'Type')}<select className={input} value={f.trailer_type} onChange={set('trailer_type')}>{TRAILER_TYPES.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className={lbl}>{tx('Status', 'Status')}<select className={input} value={f.status} onChange={set('status')}><option value="Activ">{tx('Activ', 'Active')}</option><option value="Inactiv">{tx('Inactiv', 'Inactive')}</option></select></label>
      <label className={`${lbl} sm:col-span-2`}>{tx('Observații', 'Notes')}<textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>
    </Modal>
  )
}

// Tarife de diurnă (ale unui șofer sau ale firmei, driverId = null)
function RatesEditor({ driverId, rates, onChange }) {
  const tx = useTx()
  const { lang } = useLang()
  const mine = rates.filter((r) => (r.driver_id || null) === (driverId || null))
  const [n, setN] = useState({ country: '', amount_day: '', currency: 'EUR', valid_from: todayISO() })
  const [err, setErr] = useState('')
  const add = async () => {
    setErr('')
    const amount = parseNum(n.amount_day)
    if (!(amount >= 0) || n.amount_day === '') return setErr(tx('Completează suma pe zi.', 'Fill in the amount per day.'))
    try { await PER_DIEM_API.save(null, { ...n, driver_id: driverId || null, country: n.country || null, amount_day: amount }); setN((s) => ({ ...s, amount_day: '' })); onChange() } catch (e) { setErr(e.message) }
  }
  const del = async (r) => { try { await PER_DIEM_API.remove(r.id); onChange() } catch (e) { setErr(e.message) } }
  return (
    <div className="sm:col-span-2">
      <table className="w-full text-left text-[13px]">
        <thead className="text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="py-1">{tx('Țară', 'Country')}</th><th className="py-1 text-right">{tx('Sumă / zi', 'Amount / day')}</th><th className="py-1">{tx('Valabil de la', 'Valid from')}</th><th /></tr></thead>
        <tbody>
          {mine.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-500">{tx('Niciun tarif.', 'No rates.')}</td></tr>}
          {mine.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="py-1.5">{r.country ? `${r.country} · ${countryName(r.country, lang)}` : tx('Oricare țară', 'Any country')}</td>
              <td className="py-1.5 text-right tabular-nums">{fmtMoney(r.amount_day)} {r.currency}</td>
              <td className="py-1.5">{fmtDate(r.valid_from)}</td>
              <td className="py-1.5 text-right"><button type="button" onClick={() => del(r)} className="rounded px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title={tx('Șterge', 'Delete')}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select className={`${input} sm:col-span-2`} value={n.country} onChange={(e) => setN((s) => ({ ...s, country: e.target.value }))}><option value="">{tx('Oricare țară', 'Any country')}</option>{countryOptions(lang).map((o) => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}</select>
        <input inputMode="decimal" className={input} placeholder={tx('Sumă / zi', 'Amount / day')} value={n.amount_day} onChange={(e) => setN((s) => ({ ...s, amount_day: e.target.value }))} />
        <select className={input} value={n.currency} onChange={(e) => setN((s) => ({ ...s, currency: e.target.value }))}><option>EUR</option><option>RON</option></select>
        <input type="date" className={input} value={n.valid_from} onChange={(e) => setN((s) => ({ ...s, valid_from: e.target.value }))} />
      </div>
      <div className="mt-2 flex items-center gap-3"><button type="button" onClick={add} className="rounded-lg border border-brand-500 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">＋ {tx('Adaugă tarif', 'Add rate')}</button>{err && <span className="text-[12.5px] text-rose-600">{err}</span>}</div>
    </div>
  )
}

function DriverModal({ initial, trucks, rates, pay, canPay, onClose, onSaved, onRates }) {
  const tx = useTx()
  const [f, setF] = useState(() => ({ ...blank(initial, ['full_name', 'phone', 'email', 'default_truck_id', 'notes']), status: initial?.status || 'Activ' }))
  const [p, setP] = useState(() => ({ ...blank(pay, ['monthly_gross', 'employer_cost_month', 'employer_pct']), currency: pay?.currency || 'RON' }))
  const [id, setId] = useState(initial?.id || null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const setPay = (k) => (e) => setP((s) => ({ ...s, [k]: e.target.value }))
  const s = useSaver(async () => {
    if (!String(f.full_name).trim()) throw new Error(tx('Completează numele.', 'Fill in the name.'))
    const r = await DRIVERS_API.save(id, f)
    setId(r.id)
    if (canPay) await PAY_API.save(r.id, p)
    return r
  }, onSaved)
  const cost = monthlyEmployerCost({ monthly_gross: parseNum(p.monthly_gross), employer_cost_month: parseNum(p.employer_cost_month), employer_pct: parseNum(p.employer_pct) })
  return (
    <Modal title={id ? `${tx('Șofer', 'Driver')} ${initial?.code || ''}` : tx('Șofer nou', 'New driver')} onClose={onClose} {...s} onSave={s.run}>
      <label className={lbl}>{tx('Nume și prenume', 'Full name')} *<input className={input} value={f.full_name} onChange={set('full_name')} /></label>
      <label className={lbl}>{tx('Status', 'Status')}<select className={input} value={f.status} onChange={set('status')}><option value="Activ">{tx('Activ', 'Active')}</option><option value="Inactiv">{tx('Inactiv', 'Inactive')}</option></select></label>
      <label className={lbl}>{tx('Telefon', 'Phone')}<input className={input} value={f.phone} onChange={set('phone')} /></label>
      <label className={lbl}>Email<input type="email" className={input} value={f.email} onChange={set('email')} /></label>
      <label className={lbl}>{tx('Camion obișnuit', 'Usual truck')}<select className={input} value={f.default_truck_id || ''} onChange={set('default_truck_id')}><option value="">—</option>{activeOr(trucks, f.default_truck_id).map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}</select></label>
      <div />
      <label className={`${lbl} sm:col-span-2`}>{tx('Observații', 'Notes')}<textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>

      {canPay ? (
        <>
          <div className="mono-label mt-2 text-[10px] text-slate-500 sm:col-span-2">{tx('SALARIU (VIZIBIL DOAR PATRONULUI ȘI CONTABILULUI)', 'SALARY (VISIBLE ONLY TO OWNER AND ACCOUNTANT)')}</div>
          <label className={lbl}>{tx('Salariu lunar brut', 'Monthly gross salary')}<input inputMode="decimal" className={input} value={p.monthly_gross} onChange={setPay('monthly_gross')} /></label>
          <label className={lbl}>{tx('Monedă', 'Currency')}<select className={input} value={p.currency} onChange={setPay('currency')}><option>RON</option><option>EUR</option></select></label>
          <label className={lbl}>{tx('Taxe angajator (% peste brut)', 'Employer taxes (% over gross)')}<input inputMode="decimal" className={input} value={p.employer_pct} onChange={setPay('employer_pct')} placeholder="2,25" /></label>
          <label className={lbl}>{tx('sau: cost total angajator / lună', 'or: total employer cost / month')}<input inputMode="decimal" className={input} value={p.employer_cost_month} onChange={setPay('employer_cost_month')} /></label>
          <p className="text-[12.5px] text-slate-600 sm:col-span-2">{tx('Cost lunar al firmei pentru acest șofer', 'Monthly company cost for this driver')}: <b className="text-navy-800">{fmtMoney(cost)} {p.currency}</b> <span className="text-slate-500">({tx('se plătește și când șoferul nu e în cursă', 'paid even when the driver is not on a trip')})</span></p>
        </>
      ) : <p className="text-[12px] text-slate-500 sm:col-span-2">🔒 {tx('Salariul nu e vizibil pentru rolul tău.', 'The salary is not visible for your role.')}</p>}

      <div className="mono-label mt-2 text-[10px] text-slate-500 sm:col-span-2">{tx('DIURNĂ (TARIFUL EXACT AL ȘOFERULUI)', 'PER DIEM (THE DRIVER’S EXACT RATE)')}</div>
      {id ? <RatesEditor driverId={id} rates={rates} onChange={onRates} /> : <p className="text-[12px] text-slate-500 sm:col-span-2">{tx('Salvează șoferul, apoi adaugă tarifele de diurnă.', 'Save the driver, then add the per diem rates.')}</p>}
    </Modal>
  )
}

export default function Flota() {
  const tx = useTx()
  const { lang } = useLang()
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'trucks'
  const [trucks, setTrucks] = useState(null)
  const [trailers, setTrailers] = useState([])
  const [drivers, setDrivers] = useState([])
  const [rates, setRates] = useState([])
  const [pay, setPay] = useState([])
  const [canPay, setCanPay] = useState(false)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null)
  const [q, setQ] = useState('')
  const [confirmDel, delNode] = useDeleteReason()

  const loadRates = () => PER_DIEM_API.list().then(setRates).catch((e) => setErr(e.message))
  const load = async () => {
    try {
      const [t, r, d, see] = await Promise.all([TRUCKS_API.list(), TRAILERS_API.list(), DRIVERS_API.list(), PAY_API.canSee()])
      setTrucks(t); setTrailers(r); setDrivers(d); setCanPay(see)
      setPay(see ? await PAY_API.list().catch(() => []) : [])
      await loadRates()
    } catch (e) {
      setErr(/trailers|drivers|per_diem/.test(e.message) ? tx('Lipsesc tabelele Flotei. Rulează `npx supabase db reset` (aplică migrarea 0003), apoi `npm run seed:dev`.', 'Fleet tables are missing. Run `npx supabase db reset` (applies migration 0003), then `npm run seed:dev`.') : e.message)
      setTrucks([])
    }
  }
  useEffect(() => { load() }, [])

  const trailerById = useMemo(() => Object.fromEntries(trailers.map((x) => [x.id, x])), [trailers])
  const truckById = useMemo(() => Object.fromEntries((trucks || []).map((x) => [x.id, x])), [trucks])
  const payBy = useMemo(() => Object.fromEntries(pay.map((x) => [x.driver_id, x])), [pay])
  const terms = foldText(q).split(/\s+/).filter(Boolean)
  const match = (...xs) => { const h = foldText(xs.join(' | ')); return terms.every((w) => h.includes(w)) }
  const onSaved = (_, keep) => { if (!keep) setModal(null); load() }
  const remove = async (api, row, code) => {
    if (!(await confirmDel({ entity: api.table || '', id: row.id, code }))) return
    await api.remove(row.id).catch((e) => setErr(/foreign key|violates/i.test(e.message) ? tx('Nu se poate șterge: e folosit în curse. Pune-l pe Inactiv.', 'Cannot delete: it is used in trips. Set it to Inactive.') : e.message))
    load()
  }
  const tabLabel = { trucks: tx('Camioane', 'Trucks'), trailers: tx('Remorci', 'Trailers'), drivers: tx('Șoferi', 'Drivers'), perdiem: tx('Diurnă implicită', 'Default per diem') }
  const newLabel = { trucks: tx('Camion nou', 'New truck'), trailers: tx('Remorcă nouă', 'New trailer'), drivers: tx('Șofer nou', 'New driver') }
  const th = 'px-3 py-2.5'
  const td = 'px-3 py-3'

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {tx('FLOTĂ', 'FLEET')}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{tx('Flotă', 'Fleet')}</h1>
        {newLabel[tab] && <button onClick={() => setModal({ kind: tab })} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {newLabel[tab]}</button>}
      </div>
      {delNode}
      {err && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-[13px] text-rose-700">{err}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((k) => (
          <button key={k} onClick={() => setParams(k === 'trucks' ? {} : { tab: k }, { replace: true })} className={`rounded-lg border px-4 py-2 text-[13.5px] ${tab === k ? 'border-brand-500 bg-brand-500/10 font-medium text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {tabLabel[k]}{k !== 'perdiem' && <span className="ml-1.5 text-slate-400">{{ trucks: (trucks || []).length, trailers: trailers.length, drivers: drivers.length }[k]}</span>}
          </button>
        ))}
      </div>
      {tab !== 'perdiem' && <div className="mt-3"><input className={`${input} !py-2.5`} placeholder={tx('Caută…', 'Search…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>}

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {trucks === null ? <p className="p-5 text-slate-500">…</p> : tab === 'trucks' ? (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Nr. înmatriculare', 'Plate')}</th><th className={th}>{tx('Marcă / model', 'Make / model')}</th><th className={`${th} hidden sm:table-cell`}>{tx('An', 'Year')}</th><th className={`${th} hidden md:table-cell`}>{tx('Consum ref.', 'Ref. consumption')}</th><th className={`${th} hidden md:table-cell`}>{tx('Remorcă', 'Trailer')}</th><th className={th}>Status</th><th /></tr></thead>
            <tbody>
              {trucks.filter((t) => match(t.code, t.plate, t.make, t.model, t.label, t.vin)).map((t) => (
                <tr key={t.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal({ kind: 'trucks', row: t })}>
                  <td className={`${td} font-medium text-navy-700`}>{t.plate}<div className="text-[11px] font-normal text-slate-400">{t.code}</div></td>
                  <td className={td}>{[t.make, t.model].filter(Boolean).join(' ') || t.label || '—'}{t.vin && <div className="text-[11px] text-slate-500">VIN {t.vin}</div>}</td>
                  <td className={`${td} hidden sm:table-cell`}>{t.year || '—'}</td>
                  <td className={`${td} hidden md:table-cell tabular-nums`}>{t.ref_consumption ? `${fmtMoney(t.ref_consumption)} l/100` : '—'}</td>
                  <td className={`${td} hidden md:table-cell`}>{trailerById[t.default_trailer_id]?.plate || '—'}</td>
                  <td className={td}><span className={pill(t.status)}>{t.status === 'Inactiv' ? tx('Inactiv', 'Inactive') : tx('Activ', 'Active')}</span></td>
                  <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}><button title={tx('Șterge', 'Delete')} onClick={() => remove({ ...TRUCKS_API, table: 'trucks' }, t, t.plate)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                </tr>
              ))}
              {trucks.length === 0 && <tr><td colSpan={7} className="p-5 text-slate-500">{tx('Niciun camion.', 'No trucks.')}</td></tr>}
            </tbody>
          </table>
        ) : tab === 'trailers' ? (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Nr. înmatriculare', 'Plate')}</th><th className={th}>{tx('Tip', 'Type')}</th><th className={`${th} hidden sm:table-cell`}>{tx('Observații', 'Notes')}</th><th className={th}>Status</th><th /></tr></thead>
            <tbody>
              {trailers.filter((t) => match(t.code, t.plate, t.trailer_type, t.notes)).map((t) => (
                <tr key={t.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal({ kind: 'trailers', row: t })}>
                  <td className={`${td} font-medium text-navy-700`}>{t.plate}<div className="text-[11px] font-normal text-slate-400">{t.code}</div></td>
                  <td className={td}>{t.trailer_type}</td>
                  <td className={`${td} hidden text-slate-500 sm:table-cell`}>{t.notes || '—'}</td>
                  <td className={td}><span className={pill(t.status)}>{t.status === 'Inactiv' ? tx('Inactiv', 'Inactive') : tx('Activ', 'Active')}</span></td>
                  <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}><button title={tx('Șterge', 'Delete')} onClick={() => remove({ ...TRAILERS_API, table: 'trailers' }, t, t.plate)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                </tr>
              ))}
              {trailers.length === 0 && <tr><td colSpan={5} className="p-5 text-slate-500">{tx('Nicio remorcă.', 'No trailers.')}</td></tr>}
            </tbody>
          </table>
        ) : tab === 'drivers' ? (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Șofer', 'Driver')}</th><th className={`${th} hidden sm:table-cell`}>{tx('Telefon', 'Phone')}</th><th className={`${th} hidden md:table-cell`}>{tx('Camion', 'Truck')}</th><th className={th}>{tx('Diurnă', 'Per diem')}</th>{canPay && <th className={`${th} text-right`}>{tx('Cost lunar', 'Monthly cost')}</th>}<th className={th}>Status</th><th /></tr></thead>
            <tbody>
              {drivers.filter((d) => match(d.code, d.full_name, d.phone, d.email)).map((d) => {
                const own = rates.filter((r) => r.driver_id === d.id)
                const base = pickPerDiemRate(rates, d.id, null, todayISO())
                return (
                  <tr key={d.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal({ kind: 'drivers', row: d })}>
                    <td className={`${td} font-medium text-navy-700`}>{d.full_name}<div className="text-[11px] font-normal text-slate-400">{d.code}</div></td>
                    <td className={`${td} hidden sm:table-cell`}>{d.phone || '—'}</td>
                    <td className={`${td} hidden md:table-cell`}>{truckById[d.default_truck_id]?.plate || '—'}</td>
                    <td className={td}>{base ? `${fmtMoney(base.amount_day)} ${base.currency}/${tx('zi', 'day')}` : '—'}{own.length === 0 && d.status !== 'Inactiv' && <div className="text-[11.5px] text-amber-700">⚠ {tx('fără tarif propriu', 'no own rate')}</div>}{own.length > 1 && <div className="text-[11.5px] text-slate-500">{own.length} {tx('tarife', 'rates')}</div>}</td>
                    {canPay && <td className={`${td} text-right tabular-nums`}>{payBy[d.id] ? `${fmtMoney(monthlyEmployerCost(payBy[d.id]))} ${payBy[d.id].currency}` : <span className="text-amber-700">—</span>}</td>}
                    <td className={td}><span className={pill(d.status)}>{d.status === 'Inactiv' ? tx('Inactiv', 'Inactive') : tx('Activ', 'Active')}</span></td>
                    <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}><button title={tx('Șterge', 'Delete')} onClick={() => remove({ ...DRIVERS_API, table: 'drivers' }, d, d.full_name)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                  </tr>
                )
              })}
              {drivers.length === 0 && <tr><td colSpan={7} className="p-5 text-slate-500">{tx('Niciun șofer.', 'No drivers.')}</td></tr>}
            </tbody>
          </table>
        ) : (
          <div className="p-4">
            <p className="text-[13px] text-slate-600">{tx('Tarifele firmei se folosesc doar când șoferul nu are tarif propriu pentru acea țară. Ordinea: șofer + țară → șofer → firmă + țară → firmă. Regulile fiscale se validează cu contabilul.', 'Company rates are used only when the driver has no own rate for that country. Order: driver + country → driver → company + country → company. Tax rules are validated with the accountant.')}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><RatesEditor driverId={null} rates={rates} onChange={loadRates} /></div>
          </div>
        )}
      </div>
      {tab === 'drivers' && !canPay && <p className="mt-2 text-[12px] text-slate-500">🔒 {tx('Salariile sunt ascunse pentru rolul tău.', 'Salaries are hidden for your role.')}</p>}

      {modal?.kind === 'trucks' && <TruckModal initial={modal.row} trailers={trailers} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'trailers' && <TrailerModal initial={modal.row} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'drivers' && <DriverModal initial={modal.row} trucks={trucks || []} rates={rates} pay={modal.row ? payBy[modal.row.id] : null} canPay={canPay} onClose={() => setModal(null)} onSaved={onSaved} onRates={loadRates} />}
      <p className="mt-2 text-[12px] text-slate-500">{lang === 'en' ? 'Documents and expiry dates (ITP, RCA, licences) come in a later stage.' : 'Documentele și termenele (ITP, RCA, licențe) vin într-o etapă următoare.'}</p>
    </div>
  )
}
