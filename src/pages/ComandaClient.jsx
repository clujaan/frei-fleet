import { FEATURES } from '../config/features'
import { nameFromEmail } from '../lib/people'
import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { backdrop } from '../lib/backdrop'
import SearchSelect from '../components/SearchSelect'
import StopsEditor from '../components/StopBox'
import ActivityList from '../components/ActivityList'
import { CloseX, SaveButtons, useFlash } from '../components/ModalChrome'
import { useDeleteReason } from '../components/ReasonModal'
import { ACTIVITY_API } from '../lib/activity'
import { useAuth } from '../lib/auth'
import { mailConfigured, sendMail, warmUpMail } from '../lib/graphMail'
import { useLang } from '../i18n'
import LockGate from '../lib/editLock'
import StaleBanner from '../components/StaleBanner'
import { baselineSnaps, changesFor, takeSnapshot, useSnaps } from '../lib/sentSnapshot'
import { CLIENTS } from '../lib/entities'
import { TRIPS_API } from '../lib/trips'
import { ORDERS_API } from '../lib/orders'
import { CC_STATUSES, CC_STYLE, CLIENT_ORDERS_API, DIRECTIONS, EMPTY_CC, PAY_FROM, SENDERS, ccHaystack, ccStatusLabel, checkClientOrder, defaultClientMail, fromClient, fromTrip } from '../lib/clientOrders'
import { getCompany } from '../lib/company'
import { bnrRateOrNull } from '../lib/bnr'
import { orderMeasures } from '../lib/tripMoney'
import { cleanOrderStops, legacyFromStops, mergeSides, sideStops } from '../lib/orderStops'
import { routeLabel } from '../lib/places'
import { generateClientOrderPdf } from '../lib/clientOrderPdf'
import PdfPreview from '../components/PdfPreview'
import { foldText } from '../lib/costs'
import { fmtDate, fmtMoney, parseNum, todayISO } from '../lib/format'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const sel = `${input} !w-auto`
const lbl = 'block text-[12px] text-slate-600'
const TRUCKS = ['Prelată', 'Frigorific', 'Megatrailer', 'Alt tip']

const useTx = () => { const { lang } = useLang(); return (ro, en) => (lang === 'en' ? en : ro) }
const PAY_LABEL = {
  invoice: ['de la data emiterii facturii', 'from the invoice issue date'],
  original: ['de la primirea documentelor în original', 'from receipt of the original documents'],
  electronic: ['de la primirea documentelor în format electronic', 'from receipt of the documents in electronic form'],
  unload: ['de la data descărcării', 'from the unloading date'],
  eom: ['de la sfârșitul lunii facturii', 'from the end of the invoice month'],
}
const tripLabel = (tr) => [tr.code, fmtDate(String(tr.start_at || tr.load_date || '').slice(0, 10)), tr.status === 'Anulată' ? 'Anulată' : ''].filter(Boolean).join(' · ')
const defaultSender = (email) => nameFromEmail(email, SENDERS)
const fileName = (o, client) => `${o.code}${client ? `_${client.company.replace(/[^a-zA-Z0-9]+/g, '_')}` : ''}_${o.lang}.pdf`
const fmtDT = (iso) => { try { return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const firstDate = (o, side) => (sideStops(o.stops, side).map((s) => s.date).filter(Boolean).sort()[0] || '')

function History({ id, code, onClose }) {
  const tx = useTx()
  const [rows, setRows] = useState(null)
  useEffect(() => { ACTIVITY_API.list({ entityId: id }).then(setRows).catch(() => setRows([])) }, [id])
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{tx('Istoric', 'History')} {code}</h2>
        <div className="mt-4">{rows === null ? <p className="text-slate-500">…</p> : <ActivityList rows={rows} showEntity={false} />}</div>
        <div className="mt-4 flex justify-end"><button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">OK</button></div>
      </div>
    </div>
  )
}

function SendMail({ order, client, route, blobOf, onClose, onSent }) {
  const tx = useTx()
  const { user, isDemo } = useAuth()
  const lang = order.lang === 'en' ? 'en' : 'ro'
  const base = defaultClientMail(order, lang, route)
  const addrs = [...new Set([client?.email, client?.billing_email].filter(Boolean))]
  const [picked, setPicked] = useState(() => Object.fromEntries(addrs.map((a, i) => [a, i === 0])))
  const [extra, setExtra] = useState([])
  const [other, setOther] = useState('')
  const [subject, setSubject] = useState(base.subject)
  const [body, setBody] = useState(base.body)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  useEffect(() => { warmUpMail() }, [])
  const valid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
  const to = [...addrs.filter((a) => picked[a]), ...extra]
  const name = fileName(order, client)
  const addOther = () => {
    if (!valid(other)) return setErr(`${tx('Adresă invalidă', 'Invalid address')}: ${other}`)
    setErr('')
    setExtra((x) => (x.includes(other.trim()) ? x : [...x, other.trim()]))
    setOther('')
  }
  const send = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await sendMail({ to, subject, body, attachment: { name, make: blobOf }, loginHint: isDemo ? '' : user?.email })
      ACTIVITY_API.event('client_orders', order.id, order.code, 'email_sent', { to, cc: r.cc, from: r.from, subject, file: name })
      setDone(r.from)
      await onSent(r.from, to)
    } catch (e) {
      setErr(e.message)
      setConfirm(false)
    }
    setBusy(false)
  }
  return (
    <div className="fixed inset-0 z-[70] grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{tx('Trimite comanda clientului', 'Send the order to the customer')} {order.code}</h2>
        {done ? (
          <>
            <p className="mt-4 text-[14px] text-emerald-700">✓ {tx('Comanda a fost trimisă.', 'The order has been sent.')}</p>
            <p className="mt-1 text-[12.5px] text-slate-500">{done} → {to.join(', ')}</p>
            <div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600">OK</button></div>
          </>
        ) : (
          <>
            <div className="mt-4 space-y-3 text-[12px] text-slate-600">
              <div>
                {tx('Către', 'To')}
                {addrs.length === 0 && <p className="mt-1 text-[12.5px] text-amber-700">⚠ {tx('Clientul nu are adresă de email. Adaugă una mai jos sau completeaz-o în Clienți.', 'The customer has no email address. Add one below or fill it in under Clients.')}</p>}
                <div className="mt-1 space-y-1">
                  {addrs.map((a) => <label key={a} className="flex items-center gap-2 text-[13.5px] text-navy-800"><input type="checkbox" checked={!!picked[a]} onChange={(e) => setPicked((p) => ({ ...p, [a]: e.target.checked }))} /> {a}{a === client?.billing_email && a !== client?.email && <span className="text-[11.5px] text-slate-500">({tx('email facturare', 'billing email')})</span>}</label>)}
                  {extra.map((a) => <div key={a} className="flex items-center gap-2 text-[13.5px] text-navy-800">✉ {a}<button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => setExtra((x) => x.filter((y) => y !== a))}>✕</button></div>)}
                </div>
                <div className="mt-2 flex gap-2">
                  <input type="email" className={input} placeholder={tx('Altă adresă de email', 'Another email address')} value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOther())} />
                  <button type="button" onClick={addOther} className="rounded-lg border border-slate-300 px-3 text-[13px] text-slate-600 hover:bg-slate-100">{tx('Adaugă', 'Add')}</button>
                </div>
              </div>
              <div>{tx('Copie (CC)', 'Copy (CC)')}<div className="mt-1 text-[13.5px] text-navy-800">{isDemo ? 'demo@example.test' : user?.email} <span className="text-slate-500">({tx('expeditorul', 'sender')})</span></div></div>
              <label className="block">{tx('Subiect', 'Subject')}<input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
              <label className="block">{tx('Mesaj', 'Message')}<textarea rows={8} className={input} value={body} onChange={(e) => setBody(e.target.value)} /></label>
              <div>{tx('Atașament', 'Attachment')}<div className="mt-1 text-[13.5px] text-navy-800">📎 {name}</div></div>
            </div>
            {!mailConfigured && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-[12.5px] text-amber-800">⚠ Trimiterea pe email nu e configurată încă (lipsesc VITE_MS_CLIENT_ID și VITE_MS_TENANT_ID).</p>}
            {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
            {confirm ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <p className="text-[13.5px] text-navy-800">{tx('Trimit comanda către', 'Send the order to')} <b>{to.join(', ')}</b>?</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button disabled={busy} onClick={() => setConfirm(false)} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{tx('Înapoi', 'Back')}</button>
                  <button disabled={busy} onClick={send} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">{busy ? tx('Se trimite…', 'Sending…') : tx('Da, trimite', 'Yes, send')}</button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{tx('Anulează', 'Cancel')}</button>
                <button disabled={!subject.trim()} onClick={() => (to.length ? setConfirm(true) : setErr(tx('Alege cel puțin o adresă.', 'Pick at least one address.')))} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">✉ {tx('Trimite', 'Send')}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CcModal({ initial, prefill, trips, clients, places, onClose, onSaved }) {
  const tx = useTx()
  const { lang: uiLang } = useLang()
  const { user, isDemo } = useAuth()
  const [newPlaces, setNewPlaces] = useState([])
  const allPlaces = useMemo(() => [...places, ...newPlaces], [places, newPlaces])
  const [f, setF] = useState(() => ({ ...EMPTY_CC, sender_name: defaultSender(user?.email), order_date: todayISO(), ...Object.fromEntries(Object.entries(initial || prefill || {}).map(([k, v]) => [k, v ?? EMPTY_CC[k] ?? ''])) }))
  const [saved, setSaved] = useState(initial || null)
  const [flash, ping] = useFlash()
  const [hist, setHist] = useState(false)
  const [mail, setMail] = useState(null)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const trip = trips.find((x) => x.id === f.trip_id)
  const client = clients.find((c) => c.id === f.client_id)
  const reportCur = getCompany().report_currency || 'EUR'
  const model = { ...f, price: parseNum(f.price) || 0, fx_rate: parseNum(f.fx_rate) || 0 }
  const warns = checkClientOrder(model, trip, reportCur)
  const issued = f.direction === 'issued'

  const withTotals = (st, s) => {
    const lg = legacyFromStops(st, s.lang)
    return { ...s, stops: st, ...(lg.packages !== undefined ? { weight_kg: lg.weight_kg, ldm: lg.ldm, packages: lg.packages } : {}) }
  }
  const setSide = (side) => (arr) => setF((s) => withTotals(mergeSides(side === 'load' ? arr : sideStops(s.stops, 'load'), side === 'unload' ? arr : sideStops(s.stops, 'unload')), s))
  const pickTrip = (id) => setF((s) => ({ ...s, trip_id: id || '' }))
  const pickClient = (id) => {
    const c = clients.find((x) => x.id === id)
    setF((s) => ({ ...s, client_id: id, ...(c && !saved ? fromClient(c) : {}) }))
  }
  const rowOf = () => ({ ...f, trip_id: f.trip_id || null, stops: cleanOrderStops(f.stops), price: f.price === '' ? null : model.price, currency: model.currency, fx_rate: model.fx_rate > 0 ? model.fx_rate : null, weight_kg: f.weight_kg === '' ? null : parseNum(f.weight_kg), ldm: f.ldm === '' ? null : parseNum(f.ldm), payment_terms_days: f.payment_terms_days === '' ? null : parseNum(f.payment_terms_days), payment_terms_from: f.payment_terms_from || 'invoice', send_count: saved?.send_count || 0, sent_at: saved?.sent_at || null, sent_to: saved?.sent_to || null })
  const persist = async () => {
    const row = rowOf()
    // cursul RON/EUR la data comenzii: completat automat (BNR/ECB) dacă lipsește; dacă nu e disponibil, comanda se salvează oricum
    if (!(row.fx_rate > 0) && Number(row.price) > 0) {
      const r0 = await bnrRateOrNull(row.order_date || todayISO())
      if (r0?.rate) { row.fx_rate = r0.rate; setF((x) => ({ ...x, fx_rate: String(r0.rate) })) }
    }
    const r = await CLIENT_ORDERS_API.save(saved?.id || null, row)
    setSaved(r)
    return r
  }
  const save = async (exit = true) => {
    setBusy(true)
    setErr('')
    try {
      const r = await persist()
      setBusy(false)
      if (exit) onSaved(r)
      else { onSaved(r, true); ping() }
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }
  const needClient = () => { if (!f.client_id) { setErr(tx('Alege clientul.', 'Pick the customer.')); return true } return false }
  const pdf = async () => {
    if (needClient()) return
    setBusy(true)
    setErr('')
    try {
      const r = await persist()
      const blob = await generateClientOrderPdf({ ...r, ...rowOf(), code: r.code }, client)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = fileName({ ...r, lang: f.lang }, client)
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      ACTIVITY_API.event('client_orders', r.id, r.code, 'pdf_download', { lang: f.lang })
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  const openMail = async () => {
    if (needClient()) return
    setBusy(true)
    setErr('')
    try {
      const r = await persist()
      setMail({ ...r, ...rowOf(), code: r.code, id: r.id })
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  const afterSent = async (from, to) => {
    const base = saved || {}
    const r = await CLIENT_ORDERS_API.save(saved.id, { ...rowOf(), sent_at: new Date().toISOString(), sent_to: to.join(', '), send_count: (base.send_count || 0) + 1 })
    setSaved(r)
    await takeSnapshot('cc', r, trip)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{saved?.code ? `${tx('Modifică', 'Edit')} ${saved.code}` : tx('Comandă client nouă', 'New customer order')}</h2>
        {saved?.sent_at && <p className="mt-1 text-[12.5px] text-emerald-700">✉ {tx('Trimisă', 'Sent')} {fmtDT(saved.sent_at)} → {saved.sent_to}{saved.send_count > 1 ? ` (${saved.send_count}×)` : ''}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className={`${lbl} sm:col-span-2`}>{tx('Cursa în care merge marfa', 'Trip carrying the goods')}
            <SearchSelect value={f.trip_id} onChange={pickTrip} options={trips.filter((tr) => tr.id === f.trip_id || tr.status !== 'Anulată').map((tr) => ({ value: tr.id, label: tripLabel(tr) }))} searchPlaceholder={tx('Caută…', 'Search…')} noResults={tx('Niciun rezultat', 'No results')} />
            <span className="mt-1 block text-[11.5px] font-normal text-slate-500">{tx('Opțional. Marfa poate aștepta fără cursă și poate fi mutată oricând pe altă cursă (grupaj).', 'Optional. The goods can wait without a trip and can be moved to another trip at any time (groupage).')}</span>
          </div>
          <label className={lbl}>{tx('Status', 'Status')}<select className={input} value={f.status || 'Confirmată'} onChange={set('status')}>{CC_STATUSES.map((x) => <option key={x} value={x}>{ccStatusLabel(x, uiLang)}</option>)}</select></label>
          <div className={`${lbl} sm:col-span-3`}>{tx('Tip comandă', 'Order type')}
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(DIRECTIONS).map(([k, [ro, en]]) => <button key={k} type="button" onClick={() => setF((x) => ({ ...x, direction: k }))} className={`rounded-lg border px-3 py-1.5 text-[13px] ${f.direction === k ? 'border-brand-500 bg-brand-500/10 font-medium text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{tx(ro, en)}</button>)}
            </div>
          </div>
          <div className={`${lbl} sm:col-span-2`}>{tx('Client', 'Customer')} *
            <SearchSelect value={f.client_id} onChange={pickClient} options={clients.map((c) => ({ value: c.id, label: c.company, hint: [c.country, c.contact_name].filter(Boolean).join(', ') }))} searchPlaceholder={tx('Caută…', 'Search…')} noResults={tx('Niciun rezultat', 'No results')} />
            {client && <span className="mt-1 block text-[11.5px] font-normal text-slate-500">{[client.cui, client.contact_name, client.email].filter(Boolean).join(' · ')}</span>}
          </div>
          <label className={lbl}>{tx('Limba comenzii', 'Order language')}<select className={input} value={f.lang} onChange={set('lang')}><option value="ro">Română</option><option value="en">English</option></select></label>
          <label className={lbl}>{tx('Data comenzii', 'Order date')}<input type="date" className={input} value={f.order_date} onChange={set('order_date')} /></label>
          <label className={lbl}>{tx('Referința clientului (opțional)', 'Customer reference (optional)')}<input className={input} value={f.client_ref} onChange={set('client_ref')} /></label>
          <label className={lbl}>{tx('Comandă emisă de', 'Order issued by')}<select className={input} value={f.sender_name} onChange={set('sender_name')}>{SENDERS.map((s) => <option key={s}>{s}</option>)}</select></label>

          <div className="mono-label mt-2 text-[10px] text-slate-500 sm:col-span-3">{tx('PUNCTE DE ÎNCĂRCARE ȘI DESCĂRCARE', 'LOADING AND UNLOADING POINTS')}</div>
          <StopsEditor side="load" stops={sideStops(f.stops, 'load')} onChange={setSide('load')} places={allPlaces} onPlaceAdded={(r) => setNewPlaces((a) => [...a, r])} />
          <StopsEditor side="unload" stops={sideStops(f.stops, 'unload')} onChange={setSide('unload')} places={allPlaces} onPlaceAdded={(r) => setNewPlaces((a) => [...a, r])} />

          <div className="mono-label mt-2 text-[10px] text-slate-500 sm:col-span-3">{tx('MARFĂ', 'CARGO')}</div>
          <label className={`${lbl} sm:col-span-2`}>{tx('Marfă (descriere)', 'Cargo (description)')}<input className={input} value={f.cargo} onChange={set('cargo')} /></label>
          <label className={lbl}>{tx('Tip vehicul', 'Vehicle type')}<select className={input} value={f.truck_type} onChange={set('truck_type')}><option value="">—</option>{TRUCKS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className={lbl}>{tx('Greutate (kg)', 'Weight (kg)')}<input inputMode="decimal" className={input} value={f.weight_kg} onChange={set('weight_kg')} /></label>
          <label className={lbl}>{tx('Colete / paleți', 'Packages / pallets')}<input className={input} value={f.packages} onChange={set('packages')} placeholder="33 paleți" /></label>
          <label className={lbl}>LDM<input inputMode="decimal" className={input} value={f.ldm} onChange={set('ldm')} /></label>
          <label className="flex items-center gap-2 pt-5 text-[13px] text-navy-800"><input type="checkbox" checked={!!f.adr} onChange={(e) => setF((s) => ({ ...s, adr: e.target.checked }))} /> ADR</label>
          <label className={lbl}>{tx('Temperatură', 'Temperature')}<input className={input} value={f.temperature} onChange={set('temperature')} placeholder="+2…+6 °C" /></label>
          <label className={`${lbl} sm:col-span-2`}>{tx('Cod UIT', 'UIT code')}<textarea rows={2} className={input} value={f.uit} onChange={set('uit')} placeholder={tx('Un cod UIT pe rând', 'One UIT code per line')} /></label>

          <div className="mono-label mt-2 text-[10px] text-slate-500 sm:col-span-3">{tx('PREȚ ȘI PLATĂ', 'PRICE AND PAYMENT')}</div>
          <label className={lbl}>{tx('Preț transport (fără TVA)', 'Freight price (excl. VAT)')} *<input inputMode="decimal" className={input} value={f.price} onChange={set('price')} placeholder="0,00" /></label>
          <label className={lbl}>{tx('Monedă', 'Currency')}<select className={input} value={f.currency} onChange={set('currency')}><option>EUR</option><option>RON</option></select></label>
          <label className={lbl}>{tx('Curs RON / EUR (data comenzii)', 'RON / EUR rate (order date)')}<input inputMode="decimal" className={input} value={f.fx_rate ?? ''} onChange={set('fx_rate')} placeholder={tx('automat la salvare', 'automatic on save')} /></label>
          <div className="sm:col-span-3">
            <div className={lbl}>{tx('Termen de plată (zile)', 'Payment terms (days)')}</div>
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <input inputMode="numeric" className={input} value={f.payment_terms_days} onChange={set('payment_terms_days')} placeholder="30" />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[0, 15, 30, 45, 60, 90].map((d) => (
                    <button key={d} type="button" onClick={() => setF((s) => ({ ...s, payment_terms_days: d }))} className={`rounded-full border px-2.5 py-0.5 text-xs ${String(f.payment_terms_days) === String(d) ? 'border-navy bg-navy text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{d === 0 ? tx('La descărcare', 'At unloading') : d}</button>
                  ))}
                </div>
              </div>
              <label className={`${lbl} sm:col-span-2`}>{tx('Termenul începe', 'Term starts')}
                <select className={input} value={f.payment_terms_from || 'invoice'} onChange={set('payment_terms_from')} disabled={String(f.payment_terms_days) === '0'}>
                  {PAY_FROM.map((v) => <option key={v} value={v}>{tx(...PAY_LABEL[v])}</option>)}
                </select>
              </label>
            </div>
          </div>
          <label className={`${lbl} sm:col-span-3`}>{tx('Detalii suplimentare / comentarii (apar pe PDF)', 'Additional details / comments (shown on the PDF)')}<textarea rows={2} className={input} value={f.special_conditions} onChange={set('special_conditions')} /></label>
          <label className={`${lbl} sm:col-span-3`}>{tx('Observații', 'Notes')} <span className="text-slate-400">({tx('nu apar pe PDF', 'not on the PDF')})</span><textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>
        </div>

        {trip && (
          <p className="mt-3 text-[12px] text-slate-500">
            {tx('Legături', 'Links')}: <Link to={`/curse`} className="text-brand-600 hover:underline">{trip.code}</Link>
            {initial?.ctCode && <> · <Link to="/comenzi" className="text-brand-600 hover:underline">{initial.ctCode}</Link></>}
          </p>
        )}
        {warns.map((w) => <p key={w} className="mt-1 text-[12.5px] text-amber-700">⚠ {{
          client: tx('Alege clientul.', 'Pick the customer.'),
          price: tx('Lipsește prețul.', 'The price is missing.'),
          fx: tx(`Prețul e în ${f.currency}, raportarea în ${reportCur}: lipsește cursul RON/EUR (se ia automat la salvare, dacă e disponibil).`, `The price is in ${f.currency}, reporting in ${reportCur}: the RON/EUR rate is missing (filled automatically on save when available).`),
          tripCancelled: tx('Cursa a fost anulată: mută marfa pe altă cursă.', 'The trip was cancelled: move the goods to another trip.'),
          stops: tx('Nu sunt completate punctele de încărcare / descărcare.', 'No loading / unloading points filled in.'),
          loadDate: tx('Lipsește data încărcării.', 'The loading date is missing.'),
        }[w]}</p>)}
        {trip?.status === 'Anulată' && <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">⛔ {tx('Cursa a fost anulată!', 'The trip was cancelled!')} {trip.code}</div>}
        {saved?.id && <StaleBanner kind="cc" order={saved} trip={trip} lang={uiLang} onResend={openMail} />}
        {err && <p className="mt-2 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {saved?.id && <button type="button" onClick={() => setHist(true)} className="mr-auto rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">🕘 {tx('Istoric', 'History')}</button>}
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{tx('Anulează', 'Cancel')}</button>
          {issued && <button disabled={busy} onClick={openMail} className="rounded-lg border border-slate-300 px-4 py-2 text-[14px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">✉ {tx('Trimite pe email', 'Send by email')}</button>}
          <button disabled={busy} onClick={() => (f.client_id ? setPreview(true) : setErr(tx('Alege întâi clientul în comandă.', 'Pick the customer in the order first.')))} className="rounded-lg border border-slate-300 px-4 py-2 text-[14px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">👁 {tx('Previzualizează', 'Preview')}</button>
          <button disabled={busy} onClick={pdf} className="rounded-lg border border-brand-500 px-4 py-2 text-[14px] font-medium text-brand-600 hover:bg-brand-500/10 disabled:opacity-50">⬇ {tx('Descarcă PDF', 'Download PDF')}</button>
          <SaveButtons busy={busy} onSave={save} flash={flash} />
        </div>
      </div>
      {mail && <SendMail order={mail} client={client} route={routeLabel(trip || {})} blobOf={() => generateClientOrderPdf(mail, client)} onClose={() => setMail(null)} onSent={afterSent} />}
      {preview && <PdfPreview title={`${saved?.code || tx('Comandă client nouă', 'New customer order')} · ${f.lang === 'en' ? 'EN' : 'RO'}`} filename={`${saved?.code || 'Comanda_client'}_${f.lang}.pdf`} makeBlob={() => generateClientOrderPdf({ ...(saved || {}), ...rowOf(), code: saved?.code || '—' }, client)} onClose={() => setPreview(false)} />}
      {hist && saved?.id && <History id={saved.id} code={saved.code} onClose={() => setHist(false)} />}
    </div>
  )
}

const SORTS = {
  code: (a, b) => a.o.code.localeCompare(b.o.code, 'en', { numeric: true }),
  order_date: (a, b) => String(a.o.order_date).localeCompare(String(b.o.order_date)),
  client: (a, b) => foldText(a.client).localeCompare(foldText(b.client)),
  load: (a, b) => firstDate(a.o, 'load').localeCompare(firstDate(b.o, 'load')),
  unload: (a, b) => firstDate(a.o, 'unload').localeCompare(firstDate(b.o, 'unload')),
  price: (a, b) => (Number(a.o.price) || 0) - (Number(b.o.price) || 0),
  sent: (a, b) => String(a.o.sent_at || '').localeCompare(String(b.o.sent_at || '')),
}

const placeLine = (s) => [s.company, [s.city, s.country && `(${s.country})`].filter(Boolean).join(' ')].map((x) => String(x || '').trim()).filter(Boolean).join(' · ')

export default function ComandaClient() {
  const tx = useTx()
  const { lang } = useLang()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState(null)
  const [trips, setTrips] = useState([])
  const [clients, setClients] = useState([])
  const [orders, setOrders] = useState([])
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null)
  const [q, setQ] = useState('')
  const [fClient, setFClient] = useState('')
  const [fMonth, setFMonth] = useState('')
  const [sort, setSort] = useState({ key: 'code', dir: -1 })
  const [confirmDel, delNode] = useDeleteReason()
  const [mailOrder, setMailOrder] = useState(null)

  const load = () => Promise.all([CLIENT_ORDERS_API.list(), TRIPS_API.list(), CLIENTS.api.list().catch(() => []), ORDERS_API.list().catch(() => [])])
    .then(([r, tr, c, ct]) => { setRows(r); setTrips(tr); setClients(c); setOrders(ct) }).catch((e) => setErr(/client_orders/.test(e.message) ? tx('Tabelul client_orders nu există încă. Rulează migrarea 026 în Supabase SQL Editor.', 'The client_orders table does not exist yet. Run migration 026 in the Supabase SQL Editor.') : e.message))
  useEffect(() => { load() }, [])
  const ccSnaps = useSnaps('cc')

  const realClients = useMemo(() => clients.filter((c) => (c.client_type || 'Client transport') !== 'Loading/unloading place'), [clients])
  const cName = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.company])), [clients])
  const tById = useMemo(() => Object.fromEntries(trips.map((x) => [x.id, x])), [trips])
  const ctByTrip = useMemo(() => Object.fromEntries(orders.filter((o) => o.trip_id && o.status !== 'Anulată' && o.purpose === 'subcontracted_trip').map((o) => [o.trip_id, o])), [orders])
  useEffect(() => { if (rows && ccSnaps.ready) baselineSnaps('cc', rows, tById, ccSnaps.snaps) }, [rows, trips, ccSnaps.ready]) // eslint-disable-line react-hooks/exhaustive-deps
  const [onlyFree, setOnlyFree] = useState(() => params.get('free') === '1')
  const freeCount = (rows || []).filter((o) => !o.trip_id && o.status !== 'Anulată').length
  const withCt = (o) => (o ? { ...o, ctCode: ctByTrip[o.trip_id]?.code } : o)

  // /comanda-client?trip=ID (din Curse) = comandă nouă în acea cursă; ?open=ID = deschide comanda; ?free=1 = doar comenzile fără cursă
  const tripParam = params.get('trip')
  const openParam = params.get('open')
  useEffect(() => {
    if ((!tripParam && !openParam) || rows === null) return
    setParams({}, { replace: true })
    if (openParam) { const o = rows.find((x) => x.id === openParam); if (o) setModal(withCt(o)) } else if (tById[tripParam]) setModal({ prefill: fromTrip(tById[tripParam]) })
  }, [tripParam, openParam, rows])

  const enriched = useMemo(() => (rows || []).map((o) => {
    const client = cName[o.client_id] || ''
    const trip = tById[o.trip_id]
    return { o, client, trip, warns: checkClientOrder(o, trip, getCompany().report_currency || 'EUR'), hay: ccHaystack(o, client, trip) }
  }), [rows, cName, tById])
  const months = [...new Set(enriched.map((e) => String(e.o.order_date).slice(0, 7)))].sort().reverse()
  const terms = foldText(q).split(/\s+/).filter(Boolean)
  const filtered = enriched
    .filter((e) => terms.every((w) => e.hay.includes(w)))
    .filter((e) => (!fClient || e.o.client_id === fClient) && (!fMonth || String(e.o.order_date).startsWith(fMonth)) && (!onlyFree || (!e.o.trip_id && e.o.status !== 'Anulată')))
    .sort((a, b) => SORTS[sort.key](a, b) * sort.dir)
  const hasFilters = q || fClient || fMonth || onlyFree
  const th = (key, label, cls = '') => (
    <th className={`cursor-pointer select-none px-3 py-2.5 hover:text-navy-800 ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>{label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
  )
  const remove = async (o) => {
    if (!(await confirmDel({ entity: 'client_orders', id: o.id, code: o.code }))) return
    await CLIENT_ORDERS_API.remove(o.id).catch((e) => setErr(e.message))
    load()
  }
  const stopRows = (o) => {
    const out = []
    for (const side of ['load', 'unload']) {
      const list = sideStops(o.stops, side).filter((x) => placeLine(x))
      const word = side === 'load' ? (lang === 'en' ? 'Loading' : 'Încărcare') : (lang === 'en' ? 'Unloading' : 'Descărcare')
      list.forEach((x, i) => out.push({ label: list.length > 1 ? `${word} ${i + 1}` : word, text: placeLine(x) }))
    }
    return out
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {tx('COMANDĂ CLIENT', 'CUSTOMER ORDER')}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{tx('Comandă Client', 'Customer Order')}</h1>
        <button onClick={() => setModal({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {tx('Comandă client nouă', 'New customer order')}</button>
      </div>
      {delNode}
      {err && <p className="mt-3 text-rose-600">{err}</p>}

      {FEATURES.blankFormDownloads && (
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-[13.5px] font-medium text-navy-800">{tx('Formulare goale pentru client (de descărcat)', 'Blank customer forms (download)')}</div>
        <p className="mt-0.5 text-[12px] text-slate-500">{tx('Variantele vechi, pe care clientul le completează singur. Pentru comenzile completate de firmă folosește butonul „Comandă client nouă”.', 'The older versions that the customer fills in alone. For orders filled in by the company use the “New customer order” button.')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[].map(([file, label]) => (
            <a key={file} href={`/forms/${file}`} download className="rounded-lg border border-brand-500 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">⬇ {label}</a>
          ))}
        </div>
      </div>
      )}

      <div className="mt-4"><input className={`${input} !py-2.5`} placeholder={tx('Caută în orice: nr. comandă, client, adresă, referință…', 'Search anything: order no., customer, address, reference…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select className={sel} value={fClient} onChange={(e) => setFClient(e.target.value)}><option value="">{tx('Toți clienții', 'All customers')}</option>{realClients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</select>
        <select className={sel} value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">{tx('Toate lunile', 'All months')}</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
        {hasFilters && <button onClick={() => { setQ(''); setFClient(''); setFMonth(''); setOnlyFree(false) }} className="rounded-lg px-3 py-2 text-[13px] text-brand-600 hover:bg-brand-500/10">{tx('Șterge filtrele', 'Clear filters')}</button>}
      </div>

      {rows !== null && (
        <button onClick={() => setOnlyFree((v) => !v)} className={`mt-4 flex w-full items-center justify-between rounded-xl border p-4 text-left shadow-sm ${onlyFree ? 'border-amber-400 bg-amber-50' : freeCount ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
          <div>
            <div className="mono-label text-[10px] text-slate-500">{tx('Comenzi fără cursă', 'Orders without a trip')}</div>
            <div className="text-[12.5px] text-slate-600">{freeCount ? tx('Mărfuri care așteaptă să fie puse într-o cursă. Apasă ca să vezi doar aceste comenzi.', 'Goods waiting to be put on a trip. Click to show only these orders.') : tx('Toate comenzile active sunt într-o cursă.', 'All active orders are on a trip.')}</div>
          </div>
          <div className={`text-[28px] font-semibold ${freeCount ? 'text-amber-600' : 'text-emerald-600'}`}>{freeCount}</div>
        </button>
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows === null ? <p className="p-5 text-slate-500">…</p> : filtered.length === 0 ? <p className="p-5 text-slate-500">{tx('Nicio comandă client.', 'No customer orders.')}</p> : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>{th('code', tx('Cod', 'Code'))}{th('order_date', tx('Data comenzii', 'Order date'), 'hidden sm:table-cell')}{th('client', tx('Client', 'Customer'))}{th('load', tx('Data încărcării', 'Loading date'), 'hidden md:table-cell')}{th('unload', tx('Data descărcării', 'Unloading date'), 'hidden md:table-cell')}{th('price', tx('Preț', 'Price'), 'text-right')}<th className="px-3 py-2.5">{tx('Cursă / status', 'Trip / status')}</th>{th('sent', tx('Trimisă', 'Sent'), 'hidden sm:table-cell')}<th className="px-3 py-2.5" /></tr>
            </thead>
            <tbody>
              {filtered.map(({ o, client, trip, warns }) => {
                const rowsSt = stopRows(o)
                const ct = o.trip_id ? ctByTrip[o.trip_id] : null
                return (
                  <tr key={o.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal(withCt(o))}>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-navy-700">{o.code}{(trip || ct) && <div className="text-[11px] font-normal text-slate-400">{[trip?.code, ct?.code].filter(Boolean).join(' · ')}</div>}</td>
                    <td className="hidden whitespace-nowrap px-3 py-3 sm:table-cell">{fmtDate(o.order_date)}</td>
                    <td className="px-3 py-3">
                      {trip?.status === 'Anulată' && <div className="text-[12.5px] font-bold text-rose-600">⛔ {tx('Cursa a fost anulată!', 'The trip was cancelled!')}</div>}
                      {client || '—'}{o.client_ref && <span className="ml-1 text-[11.5px] text-slate-500">· {o.client_ref}</span>}
                      <div className="mt-0.5 text-[12px] leading-snug text-slate-600">
                        {rowsSt.map((r, i) => <div key={i}><span className="font-medium text-slate-500">{r.label}:</span> {r.text}</div>)}
                        {warns.length > 0 && <div className="text-amber-600">⚠ {{ client: tx('Fără client', 'No customer'), price: tx('Fără preț', 'No price'), stops: tx('Fără puncte', 'No points'), loadDate: tx('Fără data încărcării', 'No loading date'), fx: tx('Fără curs RON/EUR', 'No RON/EUR rate'), tripCancelled: tx('Cursa a fost anulată', 'Trip cancelled') }[warns[0]]}</div>}
                        {(() => { const ch = changesFor('cc', o, trip, ccSnaps.snaps[o.id], lang); return ch.length > 0 && <div className="font-medium text-amber-700">⚠ {lang === 'en' ? 'Changed after sending' : 'Modificat după trimitere'}: {ch.join(', ')}</div> })()}
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 md:table-cell">{firstDate(o, 'load') ? fmtDate(firstDate(o, 'load')) : '—'}<div className="text-[11.5px] text-slate-500">{o.lang === 'en' ? 'EN' : 'RO'}</div></td>
                    <td className="hidden whitespace-nowrap px-3 py-3 md:table-cell">{firstDate(o, 'unload') ? fmtDate(firstDate(o, 'unload')) : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{o.price ? `${fmtMoney(o.price)} ${o.currency}` : '—'}{(() => { const m = orderMeasures(o); return (m.ldm > 0 || m.weight > 0) && <div className="text-[11px] text-slate-500">{[m.ldm > 0 && `${fmtMoney(m.ldm)} LDM`, m.weight > 0 && `${fmtMoney(m.weight)} kg`].filter(Boolean).join(' · ')}</div> })()}</td>
                    <td className="whitespace-nowrap px-3 py-3">{trip ? <span className="font-medium text-navy-700">{trip.code}</span> : <span className="mono-label rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9.5px] text-amber-700">{tx('FĂRĂ CURSĂ', 'NO TRIP')}</span>}<div className="mt-1"><span className={`mono-label rounded-full border px-2 py-0.5 text-[9.5px] ${CC_STYLE[o.status] || ''}`}>{ccStatusLabel(o.status || 'Confirmată', lang)}</span>{o.direction === 'issued' && <span className="ml-1 text-[10.5px] text-slate-500">{tx('emisă', 'issued')}</span>}</div></td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-[12.5px] sm:table-cell">{o.sent_at ? <span className="text-emerald-700">✉ {fmtDT(o.sent_at)}{o.send_count > 1 ? ` (${o.send_count}×)` : ''}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {o.direction === 'issued' && <button title={tx('Trimite pe email', 'Send by email')} onClick={() => (o.client_id ? setMailOrder(o) : setErr(tx('Alege întâi clientul în comandă.', 'Pick the customer in the order first.')))} className="rounded px-2 py-1 text-brand-600 hover:bg-brand-500/10">✉</button>}
                      <button title={tx('Șterge', 'Delete')} onClick={() => remove(o)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-[12px] text-slate-500">{tx('Fiecare comandă = marfa unui client, cu prețul ei. O cursă poate avea mai multe comenzi (grupaj). Comenzile „emise” au PDF și se trimit clientului spre semnare.', 'Each order = one customer’s goods, with its own price. A trip can carry several orders (groupage). “Issued” orders have a PDF and are sent to the customer for signing.')}</p>
      {mailOrder && (
        <SendMail order={mailOrder} client={clients.find((c) => c.id === mailOrder.client_id)} route={routeLabel(tById[mailOrder.trip_id] || {})} blobOf={() => generateClientOrderPdf(mailOrder, clients.find((c) => c.id === mailOrder.client_id))}
          onClose={() => { setMailOrder(null); load() }}
          onSent={async (from, to) => { const r = await CLIENT_ORDERS_API.save(mailOrder.id, { ...mailOrder, sent_at: new Date().toISOString(), sent_to: to.join(', '), send_count: (mailOrder.send_count || 0) + 1 }); await takeSnapshot('cc', r, tById[r.trip_id]) }} />
      )}
      {modal && <LockGate entity="client_orders" id={modal.id} label={modal.code} onClose={() => setModal(null)}><CcModal initial={modal.id ? modal : null} prefill={modal.prefill} trips={trips} clients={realClients.filter((c) => c.status !== 'Inactiv' || c.id === modal.client_id)} places={clients.filter((c) => c.status !== 'Inactiv')} onClose={() => setModal(null)} onSaved={(r, keep) => { if (!keep) setModal(null); load() }} /></LockGate>}
    </div>
  )
}

