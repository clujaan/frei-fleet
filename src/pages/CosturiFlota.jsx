// Costuri flotă (Etapa 4): costuri directe (card, taxe, bonuri), nealocate, rezervorul bazei, costuri fixe, salarii pe lună.
// Calculele sunt în src/lib/fleetCosts.js; aici doar introducere, liste și alocare manuală.
import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLang } from '../i18n'
import { backdrop } from '../lib/backdrop'
import { CloseX, SaveButtons, useFlash } from '../components/ModalChrome'
import { getCompany } from '../lib/company'
import { bnrRateOrNull } from '../lib/bnr'
import { activeOr, truckLabel } from '../lib/fleet'
import { COSTS_API, FIXED_API, FUEL_API, PAYROLL_API, computeFleet, loadFleetData, setAllocation } from '../lib/fleetCostsApi'
import { COST_CATEGORIES, FIXED_KINDS, categoryLabel, costValue, driverMonthCost, matchTrip, monthlyEmployerCost } from '../lib/fleetCosts'
import { IMPORT_FIELDS, IMPORT_REQUIRED, buildCostRows, guessMapping, parseCsv } from '../lib/costImport'
import { countryOptions } from '../lib/places'
import { foldText } from '../lib/costs'
import { fmtDate, fmtMoney, parseNum, todayISO } from '../lib/format'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const lbl = 'block text-[12px] text-slate-600'
const th = 'px-3 py-2.5 font-medium'
const td = 'px-3 py-2.5 align-top'
const useTx = () => { const { lang } = useLang(); return (ro, en) => (lang === 'en' ? en : ro) }
const TABS = ['costs', 'unalloc', 'fuel', 'fixed', 'payroll']

// datetime-local <-> ISO (ora locală a utilizatorului)
const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const fromLocal = (v) => (v ? new Date(v).toISOString() : null)
const nowLocal = () => toLocal(new Date().toISOString())
const fmtWhen = (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${fmtDate(toLocal(iso).slice(0, 10))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const n = (v) => (v === '' || v == null ? null : parseNum(v))

function Modal({ title, onClose, children, busy, onSave, flash, err, wide }) {
  const tx = useTx()
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className={`relative my-4 w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} rounded-2xl bg-white p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{title}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        {onSave && (
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{tx('Anulează', 'Cancel')}</button>
            <SaveButtons busy={busy} onSave={onSave} flash={flash} />
          </div>
        )}
      </div>
    </div>
  )
}
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
// cursul BNR pentru o dată, dacă rândul nu are curs
const withFx = async (row, day) => (Number(row.fx_rate) > 0 ? row : { ...row, fx_rate: (await bnrRateOrNull(day || todayISO())) || null })

// Alegerea cursei pentru un cost: automat / o cursă anume / cost lunar al camionului
function AllocPicker({ f, setF, trips, truckById }) {
  const tx = useTx()
  const own = trips.filter((t) => t.kind !== 'subcontracted' && t.status !== 'Anulată' && (!f.truck_id || t.truck_id === f.truck_id))
  const auto = f.alloc_mode === 'auto' ? matchTrip({ truck_id: f.truck_id, occurred_at: fromLocal(f.when), alloc_mode: 'auto' }, trips) : null
  const autoTrip = trips.find((t) => t.id === auto)
  return (
    <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[12px] font-medium text-slate-600">{tx('Pe ce cursă intră', 'Which trip it goes to')}</div>
      <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
        {[['auto', tx('Automat (camion + dată)', 'Automatic (truck + date)')], ['trip', tx('O cursă anume', 'A specific trip')], ['truck', tx('Cost lunar al camionului', 'Monthly truck cost')]].map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5"><input type="radio" checked={f.alloc_mode === k} onChange={() => setF((s) => ({ ...s, alloc_mode: k }))} />{l}</label>
        ))}
      </div>
      {f.alloc_mode === 'trip' && (
        <select className={`${input} mt-2`} value={f.trip_id || ''} onChange={(e) => setF((s) => ({ ...s, trip_id: e.target.value }))}>
          <option value="">—</option>
          {own.map((t) => <option key={t.id} value={t.id}>{t.code} · {truckById[t.truck_id]?.plate || '—'} · {fmtDate(String(t.start_at || '').slice(0, 10))}</option>)}
        </select>
      )}
      {f.alloc_mode === 'auto' && (
        <p className="mt-2 text-[12.5px] text-slate-600">
          {!f.truck_id ? tx('Alege camionul ca să se lege singur de cursă.', 'Pick the truck so it links to the trip by itself.')
            : autoTrip ? <>→ {tx('se leagă de', 'links to')} <b>{autoTrip.code}</b></>
              : <span className="text-amber-700">⚠ {tx('Nicio cursă a camionului în acel moment — va apărea în „Nealocate".', 'No trip of this truck at that time — it will show in “Unallocated”.')}</span>}
        </p>
      )}
      {f.alloc_mode === 'truck' && <p className="mt-2 text-[12.5px] text-slate-600">{tx('Intră în costul camionului pe luna respectivă (ex. service, anvelope), nu într-o cursă.', 'Counts in the truck’s cost for that month (e.g. service, tyres), not in a trip.')}</p>}
    </div>
  )
}

export function CostModal({ initial, ctx, onClose, onSaved }) {
  const tx = useTx()
  const { lang } = useLang()
  const [f, setF] = useState(() => ({
    when: toLocal(initial?.occurred_at) || nowLocal(), category: initial?.category || 'fuel_card', paid_by: initial?.paid_by || 'company',
    amount: initial?.amount ?? '', vat_amount: initial?.vat_amount ?? '', currency: initial?.currency || 'EUR', fx_rate: initial?.fx_rate ?? '',
    truck_id: initial?.truck_id || '', driver_id: initial?.driver_id || '', trip_id: initial?.trip_id || '', alloc_mode: initial?.alloc_mode || 'auto',
    country: initial?.country || '', liters: initial?.liters ?? '', odometer: initial?.odometer ?? '', vendor: initial?.vendor || '', doc_no: initial?.doc_no || '', notes: initial?.notes || '',
  }))
  const [id, setId] = useState(initial?.id || null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const s = useSaver(async () => {
    const amount = n(f.amount)
    if (!(amount >= 0) || f.amount === '') throw new Error(tx('Completează suma.', 'Fill in the amount.'))
    if (f.alloc_mode === 'trip' && !f.trip_id) throw new Error(tx('Alege cursa.', 'Pick the trip.'))
    const row = await withFx({
      ...initial, occurred_at: fromLocal(f.when), category: f.category, paid_by: f.paid_by, amount, vat_amount: n(f.vat_amount) || 0, currency: f.currency, fx_rate: n(f.fx_rate),
      truck_id: f.truck_id || null, driver_id: f.driver_id || null, trip_id: f.alloc_mode === 'trip' ? f.trip_id : null, alloc_mode: f.alloc_mode,
      country: f.country || null, liters: n(f.liters), odometer: n(f.odometer), vendor: f.vendor, doc_no: f.doc_no, notes: f.notes, source: initial?.source || 'manual',
    }, f.when.slice(0, 10))
    const r = await COSTS_API.save(id, row)
    setId(r.id)
    setF((x) => ({ ...x, fx_rate: r.fx_rate ?? '' }))
    return r
  }, onSaved)
  const fuel = f.category === 'fuel_card'
  return (
    <Modal title={id ? `${tx('Cost', 'Cost')} ${initial?.code || ''}` : tx('Cost nou', 'New cost')} onClose={onClose} {...s} onSave={s.run}>
      <label className={lbl}>{tx('Data și ora', 'Date and time')}<input type="datetime-local" className={input} value={f.when} onChange={set('when')} /></label>
      <label className={lbl}>{tx('Categorie', 'Category')}<select className={input} value={f.category} onChange={set('category')}>{COST_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}</select></label>
      <label className={lbl}>{tx('Sumă fără TVA deductibil', 'Amount excl. deductible VAT')} *<input inputMode="decimal" className={input} value={f.amount} onChange={set('amount')} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={lbl}>{tx('Monedă', 'Currency')}<select className={input} value={f.currency} onChange={set('currency')}><option>EUR</option><option>RON</option></select></label>
        <label className={lbl}>{tx('Curs (RON/EUR)', 'Rate (RON/EUR)')}<input inputMode="decimal" className={input} value={f.fx_rate} onChange={set('fx_rate')} placeholder="BNR" /></label>
      </div>
      <label className={lbl}>{tx('TVA (informativ)', 'VAT (for reference)')}<input inputMode="decimal" className={input} value={f.vat_amount} onChange={set('vat_amount')} /></label>
      <label className={lbl}>{tx('Plătit de', 'Paid by')}<select className={input} value={f.paid_by} onChange={set('paid_by')}><option value="company">{tx('Firmă (card, cont)', 'Company (card, account)')}</option><option value="driver">{tx('Șofer (prin decont)', 'Driver (expense report)')}</option></select></label>
      <label className={lbl}>{tx('Camion', 'Truck')}<select className={input} value={f.truck_id} onChange={set('truck_id')}><option value="">—</option>{activeOr(ctx.trucks, f.truck_id).map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}</select></label>
      <label className={lbl}>{tx('Șofer', 'Driver')}<select className={input} value={f.driver_id} onChange={set('driver_id')}><option value="">—</option>{activeOr(ctx.drivers, f.driver_id).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
      {fuel && <label className={lbl}>{tx('Litri', 'Litres')}<input inputMode="decimal" className={input} value={f.liters} onChange={set('liters')} /></label>}
      {fuel && <label className={lbl}>{tx('Kilometraj', 'Odometer')}<input inputMode="numeric" className={input} value={f.odometer} onChange={set('odometer')} /></label>}
      <label className={lbl}>{tx('Țară', 'Country')}<select className={input} value={f.country} onChange={set('country')}><option value="">—</option>{countryOptions(lang).map((o) => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}</select></label>
      <label className={lbl}>{tx('Furnizor / stație', 'Vendor / station')}<input className={input} value={f.vendor} onChange={set('vendor')} /></label>
      <label className={lbl}>{tx('Nr. document', 'Document no.')}<input className={input} value={f.doc_no} onChange={set('doc_no')} /></label>
      <AllocPicker f={f} setF={setF} trips={ctx.trips} truckById={ctx.truckById} />
      <label className={`${lbl} sm:col-span-2`}>{tx('Observații', 'Notes')}<textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>
    </Modal>
  )
}

function FuelModal({ initial, kind, ctx, onClose, onSaved }) {
  const tx = useTx()
  const k = initial?.kind || kind
  const [f, setF] = useState(() => ({
    when: toLocal(initial?.moved_at) || nowLocal(), liters: initial?.liters ?? '', unit_price: initial?.unit_price ?? '', currency: initial?.currency || 'RON', fx_rate: initial?.fx_rate ?? '',
    vendor: initial?.vendor || '', doc_no: initial?.doc_no || '', truck_id: initial?.truck_id || '', odometer: initial?.odometer ?? '', trip_id: initial?.trip_id || '', alloc_mode: initial?.alloc_mode || 'auto', notes: initial?.notes || '',
  }))
  const [id, setId] = useState(initial?.id || null)
  const set = (key) => (e) => setF((s) => ({ ...s, [key]: e.target.value }))
  const s = useSaver(async () => {
    if (!(n(f.liters) > 0)) throw new Error(tx('Completează litrii.', 'Fill in the litres.'))
    if (k === 'in' && !(n(f.unit_price) > 0)) throw new Error(tx('Completează prețul pe litru.', 'Fill in the price per litre.'))
    if (k === 'out' && !f.truck_id) throw new Error(tx('Alege camionul alimentat.', 'Pick the truck.'))
    if (k === 'out' && f.alloc_mode === 'trip' && !f.trip_id) throw new Error(tx('Alege cursa.', 'Pick the trip.'))
    let row = { ...initial, kind: k, moved_at: fromLocal(f.when), liters: n(f.liters), notes: f.notes }
    if (k === 'in') row = await withFx({ ...row, unit_price: n(f.unit_price), currency: f.currency, fx_rate: n(f.fx_rate), vendor: f.vendor, doc_no: f.doc_no, truck_id: null, alloc_mode: 'auto' }, f.when.slice(0, 10))
    else row = { ...row, currency: 'RON', truck_id: f.truck_id, odometer: n(f.odometer), trip_id: f.alloc_mode === 'trip' ? f.trip_id : null, alloc_mode: f.alloc_mode }
    const r = await FUEL_API.save(id, row)
    setId(r.id)
    return r
  }, onSaved)
  return (
    <Modal title={k === 'in' ? tx('Intrare în rezervor (cumpărare)', 'Tank in (purchase)') : tx('Alimentare camion din rezervor', 'Truck refuel from tank')} onClose={onClose} {...s} onSave={s.run}>
      <label className={lbl}>{tx('Data și ora', 'Date and time')}<input type="datetime-local" className={input} value={f.when} onChange={set('when')} /></label>
      <label className={lbl}>{tx('Litri', 'Litres')} *<input inputMode="decimal" className={input} value={f.liters} onChange={set('liters')} /></label>
      {k === 'in' ? <>
        <label className={lbl}>{tx('Preț pe litru, fără TVA', 'Price per litre, excl. VAT')} *<input inputMode="decimal" className={input} value={f.unit_price} onChange={set('unit_price')} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className={lbl}>{tx('Monedă', 'Currency')}<select className={input} value={f.currency} onChange={set('currency')}><option>RON</option><option>EUR</option></select></label>
          <label className={lbl}>{tx('Curs', 'Rate')}<input inputMode="decimal" className={input} value={f.fx_rate} onChange={set('fx_rate')} placeholder="BNR" /></label>
        </div>
        <label className={lbl}>{tx('Furnizor', 'Supplier')}<input className={input} value={f.vendor} onChange={set('vendor')} /></label>
        <label className={lbl}>{tx('Nr. factură / aviz', 'Invoice / note no.')}<input className={input} value={f.doc_no} onChange={set('doc_no')} /></label>
      </> : <>
        <label className={lbl}>{tx('Camion', 'Truck')} *<select className={input} value={f.truck_id} onChange={set('truck_id')}><option value="">—</option>{activeOr(ctx.trucks, f.truck_id).map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}</select></label>
        <label className={lbl}>{tx('Kilometraj', 'Odometer')}<input inputMode="numeric" className={input} value={f.odometer} onChange={set('odometer')} /></label>
        <p className="text-[12px] text-slate-500 sm:col-span-2">{tx('Costul se calculează singur: litri × prețul mediu din rezervor la acea dată.', 'Cost is calculated automatically: litres × the tank’s average price at that date.')}</p>
        <AllocPicker f={f} setF={setF} trips={ctx.trips} truckById={ctx.truckById} />
      </>}
      <label className={`${lbl} sm:col-span-2`}>{tx('Observații', 'Notes')}<textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>
    </Modal>
  )
}

function FixedModal({ initial, ctx, onClose, onSaved }) {
  const tx = useTx()
  const [f, setF] = useState(() => ({ truck_id: initial?.truck_id || '', kind: initial?.kind || 'Leasing', amount_month: initial?.amount_month ?? '', currency: initial?.currency || 'EUR', fx_rate: initial?.fx_rate ?? '', valid_from: initial?.valid_from || `${todayISO().slice(0, 7)}-01`, valid_to: initial?.valid_to || '', notes: initial?.notes || '' }))
  const [id, setId] = useState(initial?.id || null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const s = useSaver(async () => {
    if (!f.truck_id) throw new Error(tx('Alege camionul.', 'Pick the truck.'))
    if (!(n(f.amount_month) >= 0) || f.amount_month === '') throw new Error(tx('Completează suma pe lună.', 'Fill in the monthly amount.'))
    if (f.valid_to && f.valid_to < f.valid_from) throw new Error(tx('„Până la" e înainte de „de la".', '“Until” is before “from”.'))
    const r = await FIXED_API.save(id, await withFx({ ...f, amount_month: n(f.amount_month), fx_rate: n(f.fx_rate), valid_to: f.valid_to || null, trailer_id: null }, f.valid_from))
    setId(r.id)
    return r
  }, onSaved)
  return (
    <Modal title={id ? `${tx('Cost fix', 'Fixed cost')} ${initial?.code || ''}` : tx('Cost fix nou', 'New fixed cost')} onClose={onClose} {...s} onSave={s.run}>
      <label className={lbl}>{tx('Camion', 'Truck')} *<select className={input} value={f.truck_id} onChange={set('truck_id')}><option value="">—</option>{activeOr(ctx.trucks, f.truck_id).map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}</select></label>
      <label className={lbl}>{tx('Tip', 'Type')}<select className={input} value={f.kind} onChange={set('kind')}>{FIXED_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
      <label className={lbl}>{tx('Sumă pe lună, fără TVA deductibil', 'Monthly amount, excl. deductible VAT')} *<input inputMode="decimal" className={input} value={f.amount_month} onChange={set('amount_month')} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={lbl}>{tx('Monedă', 'Currency')}<select className={input} value={f.currency} onChange={set('currency')}><option>EUR</option><option>RON</option></select></label>
        <label className={lbl}>{tx('Curs', 'Rate')}<input inputMode="decimal" className={input} value={f.fx_rate} onChange={set('fx_rate')} placeholder="BNR" /></label>
      </div>
      <label className={lbl}>{tx('Valabil de la', 'Valid from')}<input type="date" className={input} value={f.valid_from} onChange={set('valid_from')} /></label>
      <label className={lbl}>{tx('Până la (gol = în continuare)', 'Until (empty = ongoing)')}<input type="date" className={input} value={f.valid_to} onChange={set('valid_to')} /></label>
      <p className="text-[12px] text-slate-500 sm:col-span-2">{tx('O asigurare anuală se trece ca sumă pe lună (anual / 12). Lunile parțiale se socotesc pe zile.', 'An annual insurance is entered per month (annual / 12). Partial months are counted by days.')}</p>
      <label className={`${lbl} sm:col-span-2`}>{tx('Observații', 'Notes')}<textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>
    </Modal>
  )
}

function PayrollModal({ driver, ym, row, pay, onClose, onSaved }) {
  const tx = useTx()
  const [f, setF] = useState(() => ({ gross: row?.gross ?? pay?.monthly_gross ?? '', employer_taxes: row?.employer_taxes ?? '', bonus: row?.bonus ?? '', total_cost: row?.total_cost ?? '', currency: row?.currency || pay?.currency || 'RON', notes: row?.notes || '' }))
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const s = useSaver(async () => PAYROLL_API.save(row?.id || null, { ...f, driver_id: driver.id, month: `${ym}-01`, gross: n(f.gross), employer_taxes: n(f.employer_taxes), bonus: n(f.bonus), total_cost: n(f.total_cost), fx_rate: row?.fx_rate ?? (await bnrRateOrNull(`${ym}-01`)) }), onSaved)
  return (
    <Modal title={`${driver.full_name} · ${ym}`} onClose={onClose} {...s} onSave={s.run}>
      <label className={lbl}>{tx('Salariu brut', 'Gross salary')}<input inputMode="decimal" className={input} value={f.gross} onChange={set('gross')} /></label>
      <label className={lbl}>{tx('Taxe angajator', 'Employer taxes')}<input inputMode="decimal" className={input} value={f.employer_taxes} onChange={set('employer_taxes')} /></label>
      <label className={lbl}>{tx('Bonusuri', 'Bonuses')}<input inputMode="decimal" className={input} value={f.bonus} onChange={set('bonus')} /></label>
      <label className={lbl}>{tx('Cost total (dacă îl știi exact)', 'Total cost (if you know it exactly)')}<input inputMode="decimal" className={input} value={f.total_cost} onChange={set('total_cost')} /></label>
      <label className={lbl}>{tx('Monedă', 'Currency')}<select className={input} value={f.currency} onChange={set('currency')}><option>RON</option><option>EUR</option></select></label>
      <label className={`${lbl} sm:col-span-2`}>{tx('Observații', 'Notes')}<textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>
      <p className="text-[12px] text-slate-500 sm:col-span-2">{tx('Dacă nu completezi luna, se folosește salariul din fișa șoferului (Flotă → Șoferi).', 'If the month is empty, the salary from the driver card is used (Fleet → Drivers).')}</p>
    </Modal>
  )
}

const FIELD_LABEL = { date: ['Data', 'Date'], time: ['Ora', 'Time'], plate: ['Nr. camion', 'Truck plate'], liters: ['Litri', 'Litres'], amount: ['Sumă', 'Amount'], vat: ['TVA', 'VAT'], currency: ['Monedă', 'Currency'], vendor: ['Stație / furnizor', 'Station / vendor'], country: ['Țară', 'Country'], doc_no: ['Nr. document', 'Doc no.'], odometer: ['Kilometraj', 'Odometer'] }
function ImportModal({ ctx, existingKeys, onClose, onDone }) {
  const tx = useTx()
  const { lang } = useLang()
  const [csv, setCsv] = useState(null)
  const [map, setMap] = useState({})
  const [opt, setOpt] = useState({ category: 'fuel_card', currency: 'EUR', vatIncluded: true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = (text) => { const p = parseCsv(text); setCsv(p); setMap(guessMapping(p.header)) }
  const onFile = (e) => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = () => load(String(r.result || '')); r.readAsText(file) }
  const res = useMemo(() => (csv ? buildCostRows(csv.rows, { ...opt, map, trucks: ctx.trucks, existingKeys }) : null), [csv, map, opt, ctx.trucks, existingKeys])
  const missing = IMPORT_REQUIRED.filter((f) => map[f] == null || map[f] === '')
  const run = async () => {
    setBusy(true); setErr('')
    try {
      const days = [...new Set(res.ok.map((r) => r.occurred_at.slice(0, 10)))]
      const fx = Object.fromEntries(await Promise.all(days.map(async (d) => [d, await bnrRateOrNull(d)])))
      const rows = res.ok.map((r) => ({ ...r, occurred_at: fromLocal(r.occurred_at), fx_rate: fx[r.occurred_at.slice(0, 10)] || null }))
      const count = await COSTS_API.insertMany(rows)
      onDone(count)
    } catch (e) { setErr(e.message); setBusy(false) }
  }
  const reason = { date: tx('dată necitibilă', 'unreadable date'), plate: tx('camion necunoscut', 'unknown truck'), amount: tx('sumă necitibilă', 'unreadable amount'), currency: tx('monedă necunoscută', 'unknown currency') }
  return (
    <Modal title={tx('Import tranzacții (CSV)', 'Import transactions (CSV)')} onClose={onClose} wide err={err}>
      <div className="sm:col-span-2 text-[13px] text-slate-600">{tx('Exportă raportul de la card (DKV, OMV, Shell, GO-Box…) ca CSV. Excel: Salvare ca → CSV. Camioanele se recunosc după numărul de înmatriculare din Flotă.', 'Export the card report (DKV, OMV, Shell, toll box…) as CSV. Excel: Save as → CSV. Trucks are matched by plate number from Fleet.')}</div>
      <label className={`${lbl} sm:col-span-2`}>{tx('Fișier CSV', 'CSV file')}<input type="file" accept=".csv,.txt,text/csv" className={input} onChange={onFile} /></label>
      {csv && <>
        <div className="sm:col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {IMPORT_FIELDS.map((k) => (
            <label key={k} className={lbl}>{FIELD_LABEL[k][lang === 'en' ? 1 : 0]}{IMPORT_REQUIRED.includes(k) && ' *'}
              <select className={input} value={map[k] ?? ''} onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value === '' ? null : Number(e.target.value) }))}>
                <option value="">—</option>{csv.header.map((h, i) => <option key={i} value={i}>{h || `${tx('coloana', 'column')} ${i + 1}`}</option>)}
              </select>
            </label>
          ))}
        </div>
        <label className={lbl}>{tx('Categorie pentru toate rândurile', 'Category for all rows')}<select className={input} value={opt.category} onChange={(e) => setOpt((o) => ({ ...o, category: e.target.value }))}>{['fuel_card', 'toll', 'parking', 'other'].map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}</select></label>
        <label className={lbl}>{tx('Moneda, dacă fișierul nu o are', 'Currency, if the file has none')}<select className={input} value={opt.currency} onChange={(e) => setOpt((o) => ({ ...o, currency: e.target.value }))}><option>EUR</option><option>RON</option></select></label>
        <label className="flex items-center gap-2 text-[13px] text-slate-700 sm:col-span-2"><input type="checkbox" checked={opt.vatIncluded} onChange={(e) => setOpt((o) => ({ ...o, vatIncluded: e.target.checked }))} />{tx('Suma din fișier include TVA-ul (se scade coloana TVA)', 'The amount includes VAT (the VAT column is subtracted)')}</label>
        <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]">
          {missing.length ? <span className="text-amber-700">⚠ {tx('Alege coloanele obligatorii:', 'Pick the required columns:')} {missing.map((f) => FIELD_LABEL[f][lang === 'en' ? 1 : 0]).join(', ')}</span> : <>
            <b>{res.ok.length}</b> {tx('rânduri de importat', 'rows to import')} · {res.duplicates} {tx('deja importate (sărite)', 'already imported (skipped)')} · <span className={res.errors.length ? 'text-rose-600' : ''}>{res.errors.length} {tx('cu erori', 'with errors')}</span>
            {res.errors.length > 0 && <ul className="mt-2 max-h-32 overflow-y-auto text-[12px] text-rose-700">{res.errors.slice(0, 50).map((e) => <li key={e.line}>{tx('Rândul', 'Row')} {e.line}: {reason[e.reason]}{e.value ? ` (${e.value})` : ''}</li>)}</ul>}
          </>}
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{tx('Anulează', 'Cancel')}</button>
          <button disabled={busy || missing.length > 0 || !res.ok.length} onClick={run} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">{busy ? '…' : `${tx('Importă', 'Import')} ${res.ok.length}`}</button>
        </div>
      </>}
    </Modal>
  )
}

export default function CosturiFlota() {
  const tx = useTx()
  const { lang } = useLang()
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'costs'
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [modal, setModal] = useState(null)
  const [q, setQ] = useState('')
  const [fCat, setFCat] = useState('')
  const [fTruck, setFTruck] = useState('')
  const [ym, setYm] = useState(todayISO().slice(0, 7))
  const cur = getCompany().report_currency || 'EUR'

  const load = () => loadFleetData().then(setData).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])
  const fleet = useMemo(() => (data ? computeFleet(data, cur) : null), [data, cur])
  const ctx = useMemo(() => ({ trips: data?.trips || [], trucks: data?.trucks || [], drivers: data?.drivers || [], truckById: Object.fromEntries((data?.trucks || []).map((t) => [t.id, t])) }), [data])
  const tripById = useMemo(() => Object.fromEntries((data?.trips || []).map((t) => [t.id, t])), [data])
  const existingKeys = useMemo(() => new Set((data?.costs || []).map((c) => c.import_key).filter(Boolean)), [data])
  const onSaved = (_r, stay) => { load(); if (!stay) setModal(null) }
  const remove = async (api, row) => { if (!window.confirm(tx('Ștergi rândul?', 'Delete this row?'))) return; try { await api.remove(row.id); load() } catch (e) { setErr(e.message) } }

  if (!data) return <div className="p-8 text-slate-500">{err || '…'}</div>
  const plate = (id) => ctx.truckById[id]?.plate || '—'
  const tripOf = (it) => tripById[matchTrip(it, data.trips)] || null
  const allocCell = (it) => {
    if (it.alloc_mode === 'truck') return <span className="text-slate-500">{tx('lunar camion', 'monthly truck')}</span>
    const t = tripOf(it)
    return t ? <span className="text-navy-700">{t.code}{it.alloc_mode === 'trip' && <span className="text-slate-400"> ({tx('manual', 'manual')})</span>}</span> : <span className="text-amber-700">⚠ {tx('nealocat', 'unallocated')}</span>
  }
  const val = (c) => { const v = costValue(c, cur); return v.ok ? `${fmtMoney(v.value)} ${cur}` : <span className="text-amber-700">⚠ {tx('fără curs', 'no rate')}</span> }

  const costs = (data.costs || []).filter((c) => (!fCat || c.category === fCat) && (!fTruck || c.truck_id === fTruck) && (!q || foldText([c.code, c.vendor, c.doc_no, c.notes, plate(c.truck_id), c.country].join(' ')).includes(foldText(q))))
  const moves = [...(data.moves || [])].sort((a, b) => String(b.moved_at).localeCompare(String(a.moved_at)))
  const unalloc = fleet.unallocated
  const tabLabel = { costs: tx('Costuri', 'Costs'), unalloc: tx('Nealocate', 'Unallocated'), fuel: tx('Rezervor bază', 'Base tank'), fixed: tx('Costuri fixe camioane', 'Truck fixed costs'), payroll: tx('Salarii pe lună', 'Monthly payroll') }
  const visibleTabs = TABS.filter((k) => k !== 'payroll' || data.canPay)

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {tx('COSTURI FLOTĂ', 'FLEET COSTS')}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{tx('Costuri flotă', 'Fleet costs')}</h1>
        <div className="flex flex-wrap gap-2">
          {tab === 'costs' && <button onClick={() => setModal({ kind: 'import' })} className="rounded-lg border border-brand-500 px-4 py-2.5 text-[14px] text-brand-600 hover:bg-brand-500/10">⇪ {tx('Import CSV card', 'Import card CSV')}</button>}
          {tab === 'costs' && <button onClick={() => setModal({ kind: 'cost' })} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {tx('Cost', 'Cost')}</button>}
          {tab === 'fuel' && <button onClick={() => setModal({ kind: 'fuel', fuelKind: 'in' })} className="rounded-lg border border-brand-500 px-4 py-2.5 text-[14px] text-brand-600 hover:bg-brand-500/10">＋ {tx('Intrare (cumpărare)', 'In (purchase)')}</button>}
          {tab === 'fuel' && <button onClick={() => setModal({ kind: 'fuel', fuelKind: 'out' })} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {tx('Alimentare camion', 'Truck refuel')}</button>}
          {tab === 'fixed' && <button onClick={() => setModal({ kind: 'fixed' })} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {tx('Cost fix', 'Fixed cost')}</button>}
        </div>
      </div>
      {err && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-[13px] text-rose-700">{err}</p>}
      {info && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-[13px] text-emerald-800">✓ {info}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {visibleTabs.map((k) => (
          <button key={k} onClick={() => setParams(k === 'costs' ? {} : { tab: k }, { replace: true })} className={`rounded-lg border px-4 py-2 text-[13.5px] ${tab === k ? 'border-brand-500 bg-brand-500/10 font-medium text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {tabLabel[k]}
            {k === 'costs' && <span className="ml-1.5 text-slate-400">{data.costs.length}</span>}
            {k === 'unalloc' && unalloc.length > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[11.5px] text-amber-800">{unalloc.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'costs' && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input className={`${input} !py-2.5`} placeholder={tx('Caută (furnizor, document, camion)…', 'Search (vendor, document, truck)…')} value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={`${input} sm:!w-auto`} value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">{tx('Toate categoriile', 'All categories')}</option>{COST_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}</select>
            <select className={`${input} sm:!w-auto`} value={fTruck} onChange={(e) => setFTruck(e.target.value)}><option value="">{tx('Toate camioanele', 'All trucks')}</option>{ctx.trucks.map((t) => <option key={t.id} value={t.id}>{t.plate}</option>)}</select>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-[13.5px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Data', 'Date')}</th><th className={th}>{tx('Categorie', 'Category')}</th><th className={`${th} hidden md:table-cell`}>{tx('Furnizor / document', 'Vendor / document')}</th><th className={th}>{tx('Camion', 'Truck')}</th><th className={th}>{tx('Cursă', 'Trip')}</th><th className={`${th} text-right`}>{tx('Sumă', 'Amount')}</th><th className={`${th} hidden sm:table-cell text-right`}>{cur}</th><th /></tr></thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal({ kind: 'cost', row: c })}>
                    <td className={`${td} whitespace-nowrap`}>{fmtWhen(c.occurred_at)}<div className="text-[11px] text-slate-400">{c.code}{c.source === 'import' ? ` · ${tx('import', 'import')}` : ''}</div></td>
                    <td className={td}>{categoryLabel(c.category, lang)}{c.liters ? <div className="text-[11.5px] text-slate-500">{fmtMoney(c.liters)} l</div> : null}{c.paid_by === 'driver' && <div className="text-[11.5px] text-slate-500">{tx('plătit de șofer', 'paid by driver')}</div>}</td>
                    <td className={`${td} hidden md:table-cell`}>{c.vendor || '—'}{c.doc_no && <div className="text-[11.5px] text-slate-500">{c.doc_no}</div>}</td>
                    <td className={td}>{plate(c.truck_id)}</td>
                    <td className={td}>{allocCell(c)}</td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{fmtMoney(c.amount)} {c.currency}</td>
                    <td className={`${td} hidden whitespace-nowrap text-right tabular-nums sm:table-cell`}>{val(c)}</td>
                    <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}><button title={tx('Șterge', 'Delete')} onClick={() => remove(COSTS_API, c)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                  </tr>
                ))}
                {costs.length === 0 && <tr><td colSpan={8} className="p-5 text-slate-500">{tx('Niciun cost.', 'No costs.')}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-slate-500">{tx('Sumele se trec fără TVA deductibil. Costul cu camion se leagă singur de cursa camionului dacă data e între plecare și întoarcere. Cheltuielile de birou rămân în', 'Amounts are entered without deductible VAT. A cost with a truck links itself to the truck’s trip if the date is between departure and return. Office costs stay in')} <Link to="/cheltuieli" className="text-brand-600 hover:underline">{tx('Cheltuieli generale', 'General costs')}</Link>.</p>
        </>
      )}

      {tab === 'unalloc' && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Data', 'Date')}</th><th className={th}>{tx('Ce', 'What')}</th><th className={th}>{tx('Camion', 'Truck')}</th><th className={`${th} text-right`}>{cur}</th><th className={th}>{tx('Leagă de', 'Link to')}</th></tr></thead>
            <tbody>
              {unalloc.map((it) => {
                const isFuel = !!it.kind
                const v = isFuel ? fleet.ledger.outs[it.id]?.cost || 0 : costValue(it, cur).value
                const when = new Date(it.occurred_at || it.moved_at).getTime()
                const near = data.trips.filter((t) => t.kind !== 'subcontracted' && t.status !== 'Anulată' && (!it.truck_id || t.truck_id === it.truck_id) && t.start_at)
                  .sort((a, b) => Math.abs(new Date(a.start_at) - when) - Math.abs(new Date(b.start_at) - when)).slice(0, 8)
                return (
                  <tr key={it.id} className="border-t border-slate-100">
                    <td className={`${td} whitespace-nowrap`}>{fmtWhen(it.occurred_at || it.moved_at)}<div className="text-[11px] text-slate-400">{it.code}</div></td>
                    <td className={td}>{isFuel ? categoryLabel('fuel_base', lang) : categoryLabel(it.category, lang)}{it.vendor && <div className="text-[11.5px] text-slate-500">{it.vendor}</div>}</td>
                    <td className={td}>{it.truck_id ? plate(it.truck_id) : <span className="text-amber-700">{tx('fără camion', 'no truck')}</span>}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtMoney(v)}</td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-2">
                        <select className={`${input} !w-auto !py-1.5 text-[13px]`} defaultValue="" onChange={async (e) => { if (!e.target.value) return; try { await setAllocation(it, 'trip', e.target.value); load() } catch (x) { setErr(x.message) } }}>
                          <option value="">{tx('Alege cursa…', 'Pick trip…')}</option>
                          {near.map((t) => <option key={t.id} value={t.id}>{t.code} · {plate(t.truck_id)} · {fmtDate(String(t.start_at).slice(0, 10))}{t.end_at ? `–${fmtDate(String(t.end_at).slice(0, 10))}` : ''}</option>)}
                        </select>
                        {it.truck_id && <button onClick={async () => { try { await setAllocation(it, 'truck'); load() } catch (x) { setErr(x.message) } }} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] text-slate-600 hover:bg-slate-50">{tx('Cost lunar camion', 'Monthly truck cost')}</button>}
                        <button onClick={() => setModal(isFuel ? { kind: 'fuel', row: it } : { kind: 'cost', row: it })} className="text-[12.5px] text-brand-600 hover:underline">{tx('Deschide', 'Open')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {unalloc.length === 0 && <tr><td colSpan={5} className="p-5 text-emerald-700">✓ {tx('Toate costurile cu camion sunt legate de o cursă sau marcate lunare.', 'All truck costs are linked to a trip or marked monthly.')}</td></tr>}
            </tbody>
          </table>
          <p className="border-t border-slate-100 p-3 text-[12px] text-slate-500">{tx('Până le aloci, intră în costul camionului pe luna lor (nu se pierd din profit), dar nu apar pe nicio cursă.', 'Until you allocate them they count in the truck’s monthly cost (not lost from profit), but on no trip.')}</p>
        </div>
      )}

      {tab === 'fuel' && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[12px] text-slate-500">{tx('Stoc în rezervor', 'Tank stock')}</div><div className="text-[22px] font-semibold text-navy-800">{fmtMoney(fleet.ledger.stockLiters)} l</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[12px] text-slate-500">{tx('Preț mediu ponderat', 'Weighted average price')}</div><div className="text-[22px] font-semibold text-navy-800">{fleet.ledger.avgPrice ? `${fmtMoney(fleet.ledger.avgPrice)} ${cur}/l` : '—'}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[12px] text-slate-500">{tx('Valoarea stocului', 'Stock value')}</div><div className="text-[22px] font-semibold text-navy-800">{fmtMoney(fleet.ledger.stockValue)} {cur}</div></div>
          </div>
          {fleet.ledger.negative.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800">⚠ {fleet.ledger.negative.length} {tx('alimentări au scos mai mult decât era în rezervor. Verifică intrările lipsă.', 'refuels took more than was in the tank. Check for missing purchases.')}</p>}
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-[13.5px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Data', 'Date')}</th><th className={th}>{tx('Tip', 'Type')}</th><th className={`${th} text-right`}>{tx('Litri', 'Litres')}</th><th className={`${th} text-right`}>{tx('Preț / l', 'Price / l')}</th><th className={th}>{tx('Camion / furnizor', 'Truck / supplier')}</th><th className={th}>{tx('Cursă', 'Trip')}</th><th className={`${th} text-right`}>{tx('Cost', 'Cost')} {cur}</th><th /></tr></thead>
              <tbody>
                {moves.map((m) => {
                  const o = fleet.ledger.outs[m.id]
                  return (
                    <tr key={m.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal({ kind: 'fuel', row: m })}>
                      <td className={`${td} whitespace-nowrap`}>{fmtWhen(m.moved_at)}<div className="text-[11px] text-slate-400">{m.code}</div></td>
                      <td className={td}>{m.kind === 'in' ? <span className="text-emerald-700">▲ {tx('intrare', 'in')}</span> : <span className="text-navy-700">▼ {tx('alimentare', 'refuel')}</span>}{fleet.ledger.negative.includes(m.id) && <div className="text-[11.5px] text-amber-700">⚠ {tx('peste stoc', 'over stock')}</div>}</td>
                      <td className={`${td} text-right tabular-nums`}>{fmtMoney(m.liters)}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{m.kind === 'in' ? `${fmtMoney(m.unit_price)} ${m.currency}` : o ? `${fmtMoney(o.unitCost)} ${cur}` : '—'}</td>
                      <td className={td}>{m.kind === 'in' ? m.vendor || '—' : plate(m.truck_id)}</td>
                      <td className={td}>{m.kind === 'out' ? allocCell(m) : ''}</td>
                      <td className={`${td} text-right tabular-nums`}>{o ? fmtMoney(o.cost) : ''}</td>
                      <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}><button title={tx('Șterge', 'Delete')} onClick={() => remove(FUEL_API, m)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                    </tr>
                  )
                })}
                {moves.length === 0 && <tr><td colSpan={8} className="p-5 text-slate-500">{tx('Nicio mișcare. Dacă firma nu are rezervor propriu, ignoră această filă.', 'No movements. If the company has no own tank, ignore this tab.')}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'fixed' && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Camion', 'Truck')}</th><th className={th}>{tx('Tip', 'Type')}</th><th className={`${th} text-right`}>{tx('Pe lună', 'Per month')}</th><th className={th}>{tx('Perioadă', 'Period')}</th><th className={`${th} hidden md:table-cell`}>{tx('Observații', 'Notes')}</th><th /></tr></thead>
            <tbody>
              {[...(data.fixed || [])].sort((a, b) => plate(a.truck_id).localeCompare(plate(b.truck_id)) || a.kind.localeCompare(b.kind)).map((f) => {
                const ended = f.valid_to && f.valid_to < todayISO()
                return (
                  <tr key={f.id} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${ended ? 'text-slate-400' : ''}`} onClick={() => setModal({ kind: 'fixed', row: f })}>
                    <td className={`${td} font-medium`}>{plate(f.truck_id)}<div className="text-[11px] font-normal text-slate-400">{f.code}</div></td>
                    <td className={td}>{f.kind}</td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{fmtMoney(f.amount_month)} {f.currency}</td>
                    <td className={`${td} whitespace-nowrap`}>{fmtDate(f.valid_from)} – {f.valid_to ? fmtDate(f.valid_to) : tx('în continuare', 'ongoing')}</td>
                    <td className={`${td} hidden text-slate-500 md:table-cell`}>{f.notes || ''}</td>
                    <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}><button title={tx('Șterge', 'Delete')} onClick={() => remove(FIXED_API, f)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                  </tr>
                )
              })}
              {(data.fixed || []).length === 0 && <tr><td colSpan={6} className="p-5 text-slate-500">{tx('Niciun cost fix. Adaugă leasingul, asigurările și impozitul fiecărui camion.', 'No fixed costs. Add each truck’s leasing, insurance and tax.')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payroll' && data.canPay && (
        <>
          <div className="mt-3 flex items-center gap-2"><label className="text-[13px] text-slate-600">{tx('Luna', 'Month')}</label><input type="month" className={`${input} !w-auto`} value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} /></div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-[13.5px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Șofer', 'Driver')}</th><th className={`${th} text-right`}>{tx('Din fișa șoferului', 'From driver card')}</th><th className={`${th} text-right`}>{tx('Luna aceasta', 'This month')}</th><th className={`${th} text-right`}>{tx('Folosit în profit', 'Used in profit')} ({cur})</th></tr></thead>
              <tbody>
                {activeOr(data.drivers).map((d) => {
                  const p = data.pay.find((x) => x.driver_id === d.id)
                  const row = data.payroll.find((x) => x.driver_id === d.id && String(x.month).slice(0, 7) === ym)
                  const used = driverMonthCost(d.id, ym, data.payroll, data.pay, cur, fleet.fx)
                  return (
                    <tr key={d.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal({ kind: 'payroll', driver: d, row, pay: p })}>
                      <td className={`${td} font-medium text-navy-700`}>{d.full_name}</td>
                      <td className={`${td} text-right tabular-nums`}>{p ? `${fmtMoney(monthlyEmployerCost(p))} ${p.currency}` : <span className="text-amber-700">—</span>}</td>
                      <td className={`${td} text-right tabular-nums`}>{row ? `${fmtMoney(Number(row.total_cost) > 0 ? row.total_cost : (Number(row.gross) || 0) + (Number(row.employer_taxes) || 0) + (Number(row.bonus) || 0))} ${row.currency}` : <span className="text-slate-400">{tx('— (fișa)', '— (card)')}</span>}</td>
                      <td className={`${td} text-right tabular-nums`}>{used.ok ? fmtMoney(used.value) : <span className="text-amber-700">⚠ {tx('fără curs', 'no rate')}</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-slate-500">🔒 {tx('Doar patronul (și contabilul, dacă e permis în Setări) vede această filă. Salariul se plătește și când șoferul nu e în cursă; în profit se împarte pe camioane după zilele condusă.', 'Only the owner (and the accountant, if allowed in Settings) sees this tab. Salary is paid even when the driver is not on a trip; in profit it is split across trucks by days driven.')}</p>
        </>
      )}

      {modal?.kind === 'cost' && <CostModal initial={modal.row} ctx={ctx} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'fuel' && <FuelModal initial={modal.row} kind={modal.fuelKind} ctx={ctx} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'fixed' && <FixedModal initial={modal.row} ctx={ctx} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'payroll' && <PayrollModal driver={modal.driver} ym={ym} row={modal.row} pay={modal.pay} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.kind === 'import' && <ImportModal ctx={ctx} existingKeys={existingKeys} onClose={() => setModal(null)} onDone={(count) => { setModal(null); load(); setErr(''); setInfo(`${count} ${tx('rânduri importate.', 'rows imported.')}`) }} />}
    </div>
  )
}
