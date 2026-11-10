import { FEATURES } from '../config/features'
import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { backdrop } from '../lib/backdrop'
import SearchSelect from '../components/SearchSelect'
import StopsEditor from '../components/StopBox'
import { cleanOrderStops, legacyFromStops, mergeSides, sideStops } from '../lib/orderStops'
import { emptyStop } from '../lib/places'
import ActivityList from '../components/ActivityList'
import { ACTIVITY_API } from '../lib/activity'
import { useReason, useDeleteReason } from '../components/ReasonModal'
import { useAuth } from '../lib/auth'
import { defaultMail, mailConfigured, sendMail, warmUpMail } from '../lib/graphMail'
import { Link, useSearchParams } from 'react-router-dom'
import { useLang } from '../i18n'
import { CARRIERS, CLIENTS } from '../lib/entities'
import { TRIPS_API } from '../lib/trips'
import { CLIENT_ORDERS_API } from '../lib/clientOrders'
import LockGate from '../lib/editLock'
import StaleBanner from '../components/StaleBanner'
import { baselineSnaps, changesFor, takeSnapshot, useSnaps } from '../lib/sentSnapshot'
import { CT_GOODS_API, CT_PURPOSES, ORDERS_API, ORDER_FILES, ORDER_STATUSES, ORDER_STYLE, checkOrder, orderHaystack, orderStatusLabel, uitList } from '../lib/orders'
import { getCompany } from '../lib/company'
import { bnrRateOrNull } from '../lib/bnr'
import { cleanGoods } from '../lib/goods'
import { generateOrderPdf } from '../lib/orderPdf'
import PdfPreview from '../components/PdfPreview'
import { foldText } from '../lib/costs'
import { fmtDate, fmtMoney, parseNum, todayISO } from '../lib/format'
import { CloseX, SaveButtons, useFlash } from '../components/ModalChrome'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const sel = `${input} !w-auto`
const lbl = 'block text-[12px] text-slate-600'
const FORMS = [] // formulare goale descărcabile: dezactivate în v1 (vezi src/config/features.js)
const TRUCKS = ['Prelată', 'Frigorific', 'Megatrailer', 'Alt tip']

const EMPTY = {
  status: 'Ciornă', lang: 'ro', order_date: todayISO(), trip_id: '', carrier_id: '', load_date: '', load_address: '', load_contact: '', load_window: '', load_ref: '', stops: [],
  unload_date: '', unload_address: '', unload_contact: '', unload_window: '', unload_ref: '', cargo: '', weight_kg: '', packages: '', ldm: '', adr: false, temperature: '', truck_type: '',
  price: '', currency: 'EUR', payment_terms_days: 30, payment_terms_from: 'electronic', uit: '', plate_truck: '', plate_trailer: '', driver_name: '', driver_phone: '', special_conditions: '', sent_on: '', confirmed_on: '', notes: '',
  purpose: 'distribution', fx_rate: '',
}

// Punctele CT-ului din mărfurile alese (comenzi client).
// Distribuție: încărcare la bază (din Setări firmă) + descărcările fiecărei mărfi, cu marfa ei. Cursă subcontractată: toate punctele comenzilor.
const stopsFromGoods = (orders, purpose) => {
  const list = orders || []
  const unloads = list.flatMap((o) => sideStops(o.stops, 'unload').map((x) => ({ ...emptyStop(), ...x, side: 'unload' })))
  if (purpose === 'subcontracted_trip') return [...list.flatMap((o) => sideStops(o.stops, 'load').map((x) => ({ ...emptyStop(), ...x, side: 'load' }))), ...unloads]
  const c = getCompany()
  const goods = list.flatMap((o) => cleanGoods(sideStops(o.stops, 'load').flatMap((x) => x.goods || [])))
  return [{ ...emptyStop(), side: 'load', company: c.base_name || c.name || '', street: c.base_address || '', country: c.country || 'RO', goods }, ...unloads]
}
const fromGoods = (orders, purpose, lang = 'ro') => {
  const stops = stopsFromGoods(orders, purpose)
  return { stops, ...legacyFromStops(stops, lang), cargo: [...new Set((orders || []).map((o) => o.cargo).filter(Boolean))].join('; ') }
}
const tripLabel = (tr) => [tr.code, fmtDate(String(tr.start_at || tr.load_date || '').slice(0, 10)), tr.kind === 'subcontracted' ? 'subcontractată' : ''].filter(Boolean).join(' · ')

function OrderHistory({ orderId, code, onClose }) {
  const { t } = useLang()
  const [rows, setRows] = useState(null)
  useEffect(() => { ACTIVITY_API.list({ entityId: orderId }).then(setRows).catch(() => setRows([])) }, [orderId])
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{t('act.history')} {code}</h2>
        <div className="mt-4">{rows === null ? <p className="text-slate-500">…</p> : <ActivityList rows={rows} showEntity={false} />}</div>
        <div className="mt-4 flex justify-end"><button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">OK</button></div>
      </div>
    </div>
  )
}

function SendMailModal({ order, carrier, blobOf, onClose, onSent }) {
  const { t } = useLang()
  const { user, isDemo } = useAuth()
  const lang = order.lang === 'en' ? 'en' : 'ro'
  const base = defaultMail(order, lang)
  const addrs = [carrier?.email, ...(Array.isArray(carrier?.extra_emails) ? carrier.extra_emails : [])].filter(Boolean)
  const [picked, setPicked] = useState(() => Object.fromEntries(addrs.map((a) => [a, true])))
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
  const fileName = `${order.code}${carrier ? `_${carrier.company.replace(/[^a-zA-Z0-9]+/g, '_')}` : ''}_${lang}.pdf`
  const addOther = () => {
    if (!valid(other)) return setErr(`${t('ent.badEmail')}: ${other}`)
    setErr('')
    setExtra((x) => (x.includes(other.trim()) ? x : [...x, other.trim()]))
    setOther('')
  }
  const send = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await sendMail({ to, subject, body, attachment: { name: fileName, make: blobOf }, loginHint: isDemo ? '' : user?.email })
      ACTIVITY_API.event('transport_orders', order.id, order.code, 'email_sent', { to, cc: r.cc, from: r.from, subject, file: fileName })
      setDone(r.from)
      await onSent(r.from, to)
    } catch (e) {
      setErr(e.message)
      setConfirm(false)
    }
    setBusy(false)
  }
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{t('ord.mailTitle')} {order.code}</h2>
        {done ? (
          <>
            <p className="mt-4 text-[14px] text-emerald-700">✓ {t('ord.mailDone')}</p>
            <p className="mt-1 text-[12.5px] text-slate-500">{done} → {to.join(', ')}</p>
            <div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600">OK</button></div>
          </>
        ) : (
          <>
            <div className="mt-4 space-y-3 text-[12px] text-slate-600">
              <div>
                {t('ord.mailTo')}
                {addrs.length === 0 && <p className="mt-1 text-[12.5px] text-amber-700">⚠ {t('ord.mailNoEmail')}</p>}
                <div className="mt-1 space-y-1">
                  {addrs.map((a) => <label key={a} className="flex items-center gap-2 text-[13.5px] text-navy-800"><input type="checkbox" checked={!!picked[a]} onChange={(e) => setPicked((p) => ({ ...p, [a]: e.target.checked }))} /> {a}</label>)}
                  {extra.map((a) => <div key={a} className="flex items-center gap-2 text-[13.5px] text-navy-800">✉ {a}<button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => setExtra((x) => x.filter((y) => y !== a))}>✕</button></div>)}
                </div>
                <div className="mt-2 flex gap-2">
                  <input type="email" className={input} placeholder={t('ord.mailExtra')} value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOther())} />
                  <button type="button" onClick={addOther} className="rounded-lg border border-slate-300 px-3 text-[13px] text-slate-600 hover:bg-slate-100">{t('ord.mailAdd')}</button>
                </div>
              </div>
              <div>{t('ord.mailCc')}<div className="mt-1 text-[13.5px] text-navy-800">{isDemo ? 'demo@example.test' : user?.email} <span className="text-slate-500">(expeditorul)</span></div></div>
              <label className="block">{t('ord.mailSubject')}<input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
              <label className="block">{t('ord.mailBody')}<textarea rows={8} className={input} value={body} onChange={(e) => setBody(e.target.value)} /></label>
              <div>{t('ord.mailAttach')}<div className="mt-1 text-[13.5px] text-navy-800">📎 {fileName}</div></div>
            </div>
            {!mailConfigured && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-[12.5px] text-amber-800">⚠ Trimiterea pe email nu e configurată încă (lipsesc VITE_MS_CLIENT_ID și VITE_MS_TENANT_ID).</p>}
            {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
            {confirm ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <p className="text-[13.5px] text-navy-800">{t('ord.mailConfirm')} <b>{to.join(', ')}</b>?</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button disabled={busy} onClick={() => setConfirm(false)} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('ord.mailBack')}</button>
                  <button disabled={busy} onClick={send} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('ord.mailSending') : t('ord.mailYes')}</button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('exp.cancel')}</button>
                <button disabled={!subject.trim()} onClick={() => (to.length ? setConfirm(true) : setErr(t('ord.mailNone')))} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">✉ {t('ord.mailSend')}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OrderModal({ initial, prefill, trips, carriers, places = [], ccRows = [], clients = [], links = [], onClose, onSaved }) {
  const { t, lang: uiLang } = useLang()
  const [newPlaces, setNewPlaces] = useState([])
  const allPlaces = useMemo(() => [...places, ...newPlaces], [places, newPlaces])
  const [f, setF] = useState(() => ({ ...EMPTY, ...Object.fromEntries(Object.entries(initial || prefill || {}).map(([k, v]) => [k, v ?? EMPTY[k] ?? ''])) }))
  const [saved, setSaved] = useState(initial || null)
  const [flash, ping] = useFlash()
  const [askReason, reasonNode] = useReason()
  const [confirmDelFile, delFileNode] = useDeleteReason()
  const [cancelReason, setCancelReason] = useState('')
  const [goodsIds, setGoodsIds] = useState(() => (initial?.id ? links.filter((l) => l.transport_order_id === initial.id).map((l) => l.client_order_id) : prefill?.goodsIds || []))
  const [hist, setHist] = useState(false)
  const [mail, setMail] = useState(null)
  const [preview, setPreview] = useState(false)
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const trip = trips.find((x) => x.id === f.trip_id)
  const carrier = carriers.find((c) => c.id === f.carrier_id)
  const tripLocked = !!initial?.trip_id
  // „Puncte”: încărcări / descărcări numerotate (din cursă sau adăugate aici). Comenzile vechi, doar cu text, rămân în modul vechi până la reîncărcarea din cursă.
  const stopsMode = (Array.isArray(f.stops) && f.stops.length > 0) || !(f.load_address || f.unload_address)
  const eff = stopsMode ? { ...f, ...legacyFromStops(f.stops, f.lang) } : f
  const setSide = (side) => (arr) => setF((s) => {
    const st = mergeSides(side === 'load' ? arr : sideStops(s.stops, 'load'), side === 'unload' ? arr : sideStops(s.stops, 'unload'))
    const lg = legacyFromStops(st, s.lang)
    return { ...s, stops: st, ...(lg.packages !== undefined ? { weight_kg: lg.weight_kg, ldm: lg.ldm, packages: lg.packages } : {}) }
  })
  // mărfurile care se pot alege: ale cursei alese, altfel toate comenzile active
  const cName = Object.fromEntries(clients.map((c) => [c.id, c.company]))
  const candidates = ccRows.filter((o) => (o.status !== 'Anulată' || goodsIds.includes(o.id)) && (!f.trip_id || o.trip_id === f.trip_id || goodsIds.includes(o.id)))
  const inOtherCt = (id) => links.some((l) => l.client_order_id === id && l.transport_order_id !== saved?.id)
  const reloadFromTrip = () => {
    const chosen = ccRows.filter((o) => goodsIds.includes(o.id))
    if (!chosen.length) return setErr(uiLang === 'en' ? 'Pick the goods first.' : 'Alege întâi mărfurile.')
    if ((f.stops.length > 0 || f.load_address || f.unload_address) && !window.confirm(t('ord.reloadConfirm'))) return
    setF((s) => ({ ...s, ...fromGoods(chosen, s.purpose, s.lang) }))
  }
  const model = { ...eff, price: parseNum(f.price) || 0 }
  const warns = checkOrder(model, trip, carrier)

  useEffect(() => { if (saved?.id) ORDER_FILES.list(saved.id).then(setFiles).catch(() => {}) }, [saved?.id])

  const pickTrip = (id) => setF((s) => ({ ...s, trip_id: id || '' }))
  const pickCarrier = (id) => {
    const k = carriers.find((c) => c.id === id)
    setF((s) => ({ ...s, carrier_id: id, payment_terms_days: !initial?.id && k?.payment_terms_days != null ? k.payment_terms_days : s.payment_terms_days, lang: k && k.country && k.country !== 'RO' ? 'en' : s.lang }))
  }
  const rowOf = () => {
    const row = { ...eff, trip_id: f.trip_id || null, fx_rate: parseNum(f.fx_rate) > 0 ? parseNum(f.fx_rate) : null, stops: stopsMode ? cleanOrderStops(f.stops) : [], price: f.price === '' ? null : model.price, weight_kg: eff.weight_kg === '' ? null : parseNum(eff.weight_kg), ldm: eff.ldm === '' ? null : parseNum(eff.ldm), payment_terms_days: f.payment_terms_days === '' ? null : parseNum(f.payment_terms_days), payment_terms_from: f.payment_terms_from || 'electronic' }
    if (row.status === 'Trimisă' && !row.sent_on) row.sent_on = todayISO()
    if ((row.status === 'Confirmată' || row.status === 'Semnată încărcată') && !row.confirmed_on) row.confirmed_on = todayISO()
    return row
  }
  const persist = async () => {
    if (eff.load_date && eff.unload_date && eff.unload_date < eff.load_date) throw new Error(t('ord.w_dates'))
    const row = rowOf()
    if (!(row.fx_rate > 0) && Number(row.price) > 0) {
      const r0 = await bnrRateOrNull(row.order_date || todayISO())
      if (r0?.rate) { row.fx_rate = r0.rate; setF((x) => ({ ...x, fx_rate: String(r0.rate) })) }
    }
    const r = await ORDERS_API.save(saved?.id || null, row).catch((e) => { throw new Error(friendlyErr(e, t)) })
    await CT_GOODS_API.setFor(r.id, goodsIds)
    setSaved(r)
    if (cancelReason && r?.id) { await ACTIVITY_API.event('transport_orders', r.id, r.code, 'cancel_reason', { reason: cancelReason }).catch(() => {}); setCancelReason('') }
    setF((s) => ({ ...s, sent_on: r.sent_on || '', confirmed_on: r.confirmed_on || '' }))
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
  const pdf = async () => {
    if (!f.carrier_id) return setErr(t('ord.w_carrier'))
    setBusy(true)
    setErr('')
    try {
      const r = await persist()
      const blob = await generateOrderPdf({ ...r, ...rowOf(), code: r.code }, carrier)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${r.code}${carrier ? `_${carrier.company.replace(/[^a-zA-Z0-9]+/g, '_')}` : ''}_${f.lang}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      ACTIVITY_API.event('transport_orders', r.id, r.code, 'pdf_download', { lang: f.lang })
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  const openMail = async () => {
    if (!f.carrier_id) return setErr(t('ord.mailNoCarrier'))
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
  const afterSent = async () => {
    const r = await ORDERS_API.save(saved.id, { ...rowOf(), status: 'Trimisă', sent_on: f.sent_on || todayISO() })
    setSaved(r)
    setF((s) => ({ ...s, status: 'Trimisă', sent_on: r.sent_on || '' }))
    await takeSnapshot('ct', r, trips.find((x) => x.id === r.trip_id))
  }
  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    setErr('')
    try {
      const r = saved || (await persist())
      await ORDER_FILES.upload(r, file)
      setFiles(await ORDER_FILES.list(r.id))
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  const open = async (d) => {
    const u = await ORDER_FILES.url(d).catch(() => null)
    if (u) window.open(u, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{saved?.code ? `${t('trip.edit')} ${saved.code}` : t('ord.new')}</h2>
        {trip?.status === 'Anulată' && <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">⛔ {uiLang === 'en' ? 'The trip was cancelled!' : 'Cursa a fost anulată!'} {trip.code}</div>}
        {saved?.id && <StaleBanner kind="ct" order={saved} trip={trips.find((x) => x.id === saved.trip_id)} lang={uiLang} onResend={openMail} />}
        {reasonNode}
        {delFileNode}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className={`${lbl} sm:col-span-3`}>{uiLang === 'en' ? 'What the CT is for' : 'Pentru ce e CT-ul'}
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(CT_PURPOSES).map(([k, [ro, en]]) => <button key={k} type="button" onClick={() => setF((x) => ({ ...x, purpose: k }))} className={`rounded-lg border px-3 py-1.5 text-[13px] ${f.purpose === k ? 'border-brand-500 bg-brand-500/10 font-medium text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{uiLang === 'en' ? en : ro}</button>)}
            </div>
          </div>
          <div className={`${lbl} sm:col-span-3`}>{t('ord.trip')}
            <SearchSelect value={f.trip_id} disabled={tripLocked} onChange={pickTrip} options={trips.filter((tr) => tr.id === f.trip_id || (tr.status !== 'Anulată' && (f.purpose === 'subcontracted_trip' ? tr.kind === 'subcontracted' : tr.kind !== 'subcontracted'))).map((tr) => ({ value: tr.id, label: tripLabel(tr) }))} searchPlaceholder={t('place.search')} noResults={t('place.noResults')} />
            {tripLocked && <span className="mt-1 block text-[11.5px] font-normal text-slate-500">{t('ord.tripLocked')}</span>}
          </div>
          <div className={`${lbl} sm:col-span-3`}>{uiLang === 'en' ? 'Goods carried by this CT (customer orders)' : 'Mărfurile duse de acest CT (comenzi client)'}
            <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
              {candidates.length === 0 ? <p className="px-3 py-2 text-[12.5px] text-slate-500">{uiLang === 'en' ? 'No orders to pick.' : 'Nicio comandă de ales.'}</p> : candidates.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-[13px] text-navy-800 first:border-t-0 hover:bg-slate-50">
                  <input type="checkbox" checked={goodsIds.includes(o.id)} onChange={(e) => setGoodsIds((g) => (e.target.checked ? [...g, o.id] : g.filter((x) => x !== o.id)))} />
                  <span className="font-medium">{o.code}</span> · {cName[o.client_id] || '—'}
                  <span className="text-[12px] text-slate-500">{sideStops(o.stops, 'unload').map((x) => [x.city, x.country].filter(Boolean).join(' ')).filter(Boolean).join(', ')}</span>
                  {inOtherCt(o.id) && <span className="text-[11.5px] text-amber-700">⚠ {uiLang === 'en' ? 'already in another CT' : 'deja în alt CT'}</span>}
                </label>
              ))}
            </div>
            <span className="mt-1 block text-[11.5px] font-normal text-slate-500">{uiLang === 'en' ? 'The CT price is split across these goods by the trip’s basis (LDM by default).' : 'Prețul CT-ului se împarte pe aceste mărfuri după criteriul cursei (implicit LDM).'} <button type="button" onClick={reloadFromTrip} className="font-medium text-brand-600 hover:underline">{uiLang === 'en' ? 'Fill in the stops from these goods' : 'Completează punctele din aceste mărfuri'}</button></span>
          </div>
          <div className={`${lbl} sm:col-span-2`}>{t('trip.carrier')} *
            <SearchSelect value={f.carrier_id} onChange={pickCarrier} options={carriers.map((c) => ({ value: c.id, label: c.company, hint: [c.country, c.contact_name].filter(Boolean).join(', ') }))} searchPlaceholder={t('place.search')} noResults={t('place.noResults')} />
          </div>
          <label className={lbl}>{t('ord.lang')}<select className={input} value={f.lang} onChange={set('lang')}><option value="ro">Română</option><option value="en">English</option></select></label>
          {carriers.length === 0 && <p className="text-[12px] text-amber-700 sm:col-span-3">{t('ord.noCarriers')} <Link to="/transportatori" className="underline">{t('nav.carriers')}</Link></p>}
          <label className={lbl}>{t('ord.date')}<input type="date" className={input} value={f.order_date} onChange={set('order_date')} /></label>
          <label className={lbl}>{t('trip.status')}<select className={input} value={f.status} onChange={async (e) => { const v = e.target.value; if (v === 'Anulată' && (saved?.status ?? initial?.status) !== 'Anulată' && (saved || initial?.id)) { const r = await askReason({ title: `${t('ord.cancelTitle')} ${saved?.code || initial?.code}`, text: t('ord.cancelText'), confirmLabel: t('ord.cancelBtn') }); if (!r) return; setCancelReason(r) } else setCancelReason(''); setF((s) => ({ ...s, status: v })) }}>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{orderStatusLabel(s, uiLang)}</option>)}</select></label>
          <label className={`${lbl} sm:col-span-2`}>{t('ord.uit')}<textarea rows={Math.min(6, Math.max(2, String(f.uit || '').split('\n').length))} className={input} value={f.uit} onChange={set('uit')} placeholder={uiLang === 'en' ? 'One UIT code per line (one per unloading point)' : 'Un cod UIT pe rând (câte unul pentru fiecare descărcare)'} /></label>

          {stopsMode ? (
            <>
              <div className="mono-label mt-2 flex items-center justify-between text-[10px] text-slate-500 sm:col-span-3">
                <span>{t('ord.stopsTitle')}</span>
                {goodsIds.length > 0 && <button type="button" onClick={reloadFromTrip} className="text-[12px] font-medium normal-case tracking-normal text-brand-600 hover:underline">{uiLang === 'en' ? 'Reload from goods' : 'Reîncarcă din mărfuri'}</button>}
              </div>
              <StopsEditor side="load" stops={sideStops(f.stops, 'load')} onChange={setSide('load')} places={allPlaces} onPlaceAdded={(r) => setNewPlaces((a) => [...a, r])} />
              <StopsEditor side="unload" stops={sideStops(f.stops, 'unload')} onChange={setSide('unload')} places={allPlaces} onPlaceAdded={(r) => setNewPlaces((a) => [...a, r])} />
            </>
          ) : (
            <>
              {goodsIds.length > 0 && <div className="sm:col-span-3"><button type="button" onClick={reloadFromTrip} className="text-[12px] font-medium text-brand-600 hover:underline">{t('ord.useStops')}</button></div>}
          <div className="mono-label mt-2 text-[10px] text-slate-500 sm:col-span-3">{t('ord.load')}</div>
          <label className={lbl}>{t('trip.loadDate')} *<input type="date" className={input} value={f.load_date} onChange={set('load_date')} /></label>
          <label className={lbl}>{t('ord.window')}<input className={input} value={f.load_window} onChange={set('load_window')} placeholder="08:00–12:00" /></label>
          <label className={lbl}>{t('ord.ref')}<input className={input} value={f.load_ref} onChange={set('load_ref')} /></label>
          <label className={`${lbl} sm:col-span-2`}>{t('ord.address')}<textarea rows={4} className={input} value={f.load_address} onChange={set('load_address')} /></label>
          <label className={lbl}>{t('ord.person')}<input className={input} value={f.load_contact} onChange={set('load_contact')} /></label>

          <div className="mono-label mt-2 text-[10px] text-slate-500 sm:col-span-3">{t('ord.unload')}</div>
          <label className={lbl}>{t('trip.unloadDate')}<input type="date" className={input} value={f.unload_date} onChange={set('unload_date')} /></label>
          <label className={lbl}>{t('ord.window')}<input className={input} value={f.unload_window} onChange={set('unload_window')} /></label>
          <label className={lbl}>{t('ord.ref')}<input className={input} value={f.unload_ref} onChange={set('unload_ref')} /></label>
          <label className={`${lbl} sm:col-span-2`}>{t('ord.address')}<textarea rows={4} className={input} value={f.unload_address} onChange={set('unload_address')} /></label>
          <label className={lbl}>{t('ord.person')}<input className={input} value={f.unload_contact} onChange={set('unload_contact')} /></label>

            </>
          )}

          <div className="mono-label mt-2 text-[10px] text-slate-500 sm:col-span-3">{t('ord.cargoTitle')}</div>
          <label className={`${lbl} sm:col-span-2`}>{t('offer.cargo')}<input className={input} value={f.cargo} onChange={set('cargo')} /></label>
          <label className={lbl}>{t('ord.truck')}<select className={input} value={f.truck_type} onChange={set('truck_type')}><option value="">—</option>{TRUCKS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className={lbl}>{t('ord.weight')}<input inputMode="decimal" className={input} value={f.weight_kg} onChange={set('weight_kg')} /></label>
          <label className={lbl}>{t('ord.packages')}<input className={input} value={f.packages} onChange={set('packages')} placeholder="33 paleți" /></label>
          <label className={lbl}>LDM<input inputMode="decimal" className={input} value={f.ldm} onChange={set('ldm')} /></label>
          <label className="flex items-center gap-2 pt-5 text-[13px] text-navy-800"><input type="checkbox" checked={!!f.adr} onChange={(e) => setF((s) => ({ ...s, adr: e.target.checked }))} /> ADR</label>
          <label className={`${lbl} sm:col-span-2`}>{t('ord.temp')}<input className={input} value={f.temperature} onChange={set('temperature')} placeholder="+2…+6 °C" /></label>

          <div className="mono-label mt-2 text-[10px] text-slate-500 sm:col-span-3">{t('ord.vehicle')}</div>
          <label className={lbl}>{t('ord.plateTruck')}<input className={`${input} uppercase`} value={f.plate_truck} onChange={set('plate_truck')} /></label>
          <label className={lbl}>{t('ord.plateTrailer')}<input className={`${input} uppercase`} value={f.plate_trailer} onChange={set('plate_trailer')} /></label>
          <div />
          <label className={lbl}>{t('ord.driver')}<input className={input} value={f.driver_name} onChange={set('driver_name')} /></label>
          <label className={lbl}>{t('ord.driverPhone')}<input className={input} value={f.driver_phone} onChange={set('driver_phone')} /></label>
          <div />

          <div className="mono-label mt-2 text-[10px] text-slate-500 sm:col-span-3">{t('ord.priceTitle')}</div>
          <label className={lbl}>{t('ord.price')} *<input inputMode="decimal" className={input} value={f.price} onChange={set('price')} placeholder="0,00" /></label>
          <label className={lbl}>{t('cost.currency')}<select className={input} value={f.currency} onChange={set('currency')}><option>EUR</option><option>RON</option></select></label>
          <label className={lbl}>{uiLang === 'en' ? 'RON / EUR rate (order date)' : 'Curs RON / EUR (data comenzii)'}<input inputMode="decimal" className={input} value={f.fx_rate ?? ''} onChange={set('fx_rate')} placeholder={uiLang === 'en' ? 'automatic on save' : 'automat la salvare'} /></label>
          <div className="sm:col-span-3">
            <div className={lbl}>{t('ord.terms')}</div>
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <input inputMode="numeric" className={input} value={f.payment_terms_days} onChange={set('payment_terms_days')} placeholder="30" />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[0, 15, 30, 45, 60, 90].map((d) => (
                    <button key={d} type="button" onClick={() => setF((s) => ({ ...s, payment_terms_days: d }))} className={`rounded-full border px-2.5 py-0.5 text-xs ${String(f.payment_terms_days) === String(d) ? 'border-navy bg-navy text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{d === 0 ? t('ord.termsAtUnload') : d}</button>
                  ))}
                </div>
              </div>
              <label className={`${lbl} sm:col-span-2`}>{t('ord.termsFrom')}
                <select className={input} value={f.payment_terms_from || 'electronic'} onChange={set('payment_terms_from')} disabled={String(f.payment_terms_days) === '0'}>
                  {['invoice', 'original', 'electronic', 'unload', 'eom'].map((v) => <option key={v} value={v}>{t('ord.from.' + v)}</option>)}
                </select>
                {f.payment_terms_from === 'original' && String(f.payment_terms_days) !== '0' && <span className="mt-1 block text-xs text-slate-500">{t('ord.fromOrigHint')}</span>}
              </label>
            </div>
          </div>
          <label className={`${lbl} sm:col-span-3`}>{t('ord.special')}<textarea rows={2} className={input} value={f.special_conditions} onChange={set('special_conditions')} /></label>
          <label className={`${lbl} sm:col-span-3`}>{t('cost.notes')} <span className="text-slate-400">({t('ord.notPdf')})</span><textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-navy-800">{t('ord.files')}</span>
            <label className="cursor-pointer rounded-lg border border-brand-500 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">
              ⬆ {t('ord.upload')}<input type="file" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </div>
          <p className="mt-1 text-[11.5px] text-slate-500">{t('ord.filesHint')}</p>
          {files.map((d) => (
            <div key={d.id} className="mt-1 flex items-center justify-between text-[13px]">
              <button className="truncate text-left text-brand-600 hover:underline" onClick={() => open(d)}>{d.filename}</button>
              <button className="px-2 text-slate-400 hover:text-rose-600" onClick={async () => { if (!(await confirmDelFile({ entity: 'documents', id: d.id, code: d.filename }))) return; await ORDER_FILES.remove(d); setFiles(await ORDER_FILES.list(saved.id)) }}>✕</button>
            </div>
          ))}
        </div>

        {warns.map((w) => <p key={w} className="mt-1 text-[12.5px] text-amber-700">⚠ {t(`ord.w_${w}`)}</p>)}
        {err && <p className="mt-2 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {saved?.id && <button type="button" onClick={() => setHist(true)} className="mr-auto rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">🕘 {t('act.history')}</button>}
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('exp.cancel')}</button>
          <button disabled={busy} onClick={openMail} className="rounded-lg border border-slate-300 px-4 py-2 text-[14px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">✉ {t('ord.mailBtn')}</button>
          <button disabled={busy} onClick={() => (f.carrier_id ? setPreview(true) : setErr(t('ord.w_carrier')))} className="rounded-lg border border-slate-300 px-4 py-2 text-[14px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">👁 {uiLang === 'en' ? 'Preview' : 'Previzualizează'}</button>
          <button disabled={busy} onClick={pdf} className="rounded-lg border border-brand-500 px-4 py-2 text-[14px] font-medium text-brand-600 hover:bg-brand-500/10 disabled:opacity-50">⬇ {t('ord.pdf')}</button>
          <SaveButtons busy={busy} onSave={save} flash={flash} />
        </div>
      </div>
      {mail && <SendMailModal order={mail} carrier={carrier} blobOf={() => generateOrderPdf(mail, carrier)} onClose={() => setMail(null)} onSent={afterSent} />}
      {preview && <PdfPreview title={`${saved?.code || (uiLang === 'en' ? 'New transport order' : 'Comandă de transport nouă')} · ${f.lang === 'en' ? 'EN' : 'RO'}`} filename={`${saved?.code || 'Comanda_transport'}_${f.lang}.pdf`} makeBlob={() => generateOrderPdf({ ...(saved || {}), ...rowOf(), code: saved?.code || '—' }, carrier)} onClose={() => setPreview(false)} />}
      {hist && saved?.id && <OrderHistory orderId={saved.id} code={saved.code} onClose={() => setHist(false)} />}
    </div>
  )
}

const friendlyErr = (e, t) => (/transport_orders_trip_active_uq|duplicate key/i.test(e?.message || '') ? t('ord.tripTaken') : /trip_locked/i.test(e?.message || '') ? t('ord.tripLocked') : e?.message || String(e))

// pentru listă: „Încărcare 1: Firmă · Localitate (RO)” / „Descărcare 2: …”; comenzile vechi, fără puncte, păstrează textul adresei
const placeLine = (s) => [s.company, [s.city, s.country && `(${s.country})`].filter(Boolean).join(' ')].map((x) => String(x || '').trim()).filter(Boolean).join(' · ')
const stopRows = (o, lang) => {
  const out = []
  for (const side of ['load', 'unload']) {
    const list = sideStops(o.stops, side).filter((x) => placeLine(x))
    const word = side === 'load' ? (lang === 'en' ? 'Loading' : 'Încărcare') : (lang === 'en' ? 'Unloading' : 'Descărcare')
    list.forEach((x, i) => out.push({ side, label: list.length > 1 ? `${word} ${i + 1}` : word, text: placeLine(x) }))
  }
  return out
}

const SORTS = {
  code: (a, b) => a.o.code.localeCompare(b.o.code, 'en', { numeric: true }),
  order_date: (a, b) => String(a.o.order_date).localeCompare(String(b.o.order_date)),
  carrier: (a, b) => foldText(a.carrier).localeCompare(foldText(b.carrier)),
  load_date: (a, b) => String(a.o.load_date).localeCompare(String(b.o.load_date)),
  unload_date: (a, b) => String(a.o.unload_date || '').localeCompare(String(b.o.unload_date || '')),
  price: (a, b) => (Number(a.o.price) || 0) - (Number(b.o.price) || 0),
}

export default function Comenzi() {
  const { t, lang } = useLang()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState(null)
  const [trips, setTrips] = useState([])
  const [carriers, setCarriers] = useState([])
  const [clients, setClients] = useState([])
  const [ccRows, setCcRows] = useState([])
  const [showUn, setShowUn] = useState(false)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null)
  const [askReasonMain, reasonNodeMain] = useReason()
  const [mailOrder, setMailOrder] = useState(null)
  const [q, setQ] = useState('')
  const [fRun, setFRun] = useState(() => params.get('running') === '1')
  const [fSt, setFSt] = useState('')
  const [fCar, setFCar] = useState('')
  const [fMonth, setFMonth] = useState('')
  const [sort, setSort] = useState({ key: 'code', dir: -1 })

  const ctSnaps = useSnaps('ct')
  const [links, setLinks] = useState([])
  const load = () => Promise.all([ORDERS_API.list(), TRIPS_API.list(), CARRIERS.api.list(), CLIENTS.api.list().catch(() => []), CLIENT_ORDERS_API.list().catch(() => []), CT_GOODS_API.list().catch(() => [])])
    .then(([r, tr, k, c, cc, ln]) => { setRows(r); setTrips(tr); setCarriers(k); setClients(c); setCcRows(cc); setLinks(ln) }).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  // /comenzi?trip=ID (din Curse): CT nou pentru cursă. Cursă proprie = distribuție (alegi mărfurile); &purpose=subcontracted_trip = toată cursa.
  const tripParam = params.get('trip')
  const purposeParam = params.get('purpose')
  useEffect(() => {
    if (!tripParam || rows === null) return
    const tr = trips.find((x) => x.id === tripParam)
    setParams({}, { replace: true })
    if (!tr) return
    const purpose = purposeParam === 'subcontracted_trip' || tr.kind === 'subcontracted' ? 'subcontracted_trip' : 'distribution'
    const goods = ccRows.filter((o) => o.trip_id === tr.id && o.status !== 'Anulată')
    const pre = purpose === 'subcontracted_trip' ? goods : []
    setModal({ prefill: { trip_id: tr.id, purpose, goodsIds: pre.map((o) => o.id), ...(pre.length ? fromGoods(pre, purpose) : {}) } })
  }, [tripParam, rows])

  const ccCode = useMemo(() => Object.fromEntries(ccRows.map((x) => [x.id, x.code])), [ccRows])
  const goodsOf = (id) => links.filter((l) => l.transport_order_id === id).map((l) => ccCode[l.client_order_id]).filter(Boolean)
  const kName = useMemo(() => Object.fromEntries(carriers.map((c) => [c.id, c.company])), [carriers])
  const tById = useMemo(() => Object.fromEntries(trips.map((x) => [x.id, x])), [trips])
  useEffect(() => { if (rows && ctSnaps.ready) baselineSnaps('ct', rows, tById, ctSnaps.snaps) }, [rows, trips, ctSnaps.ready]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeByTrip = useMemo(() => Object.fromEntries((rows || []).filter((o) => o.trip_id && o.status !== 'Anulată' && o.purpose === 'subcontracted_trip').map((o) => [o.trip_id, o])), [rows])
  // doar cursele subcontractate au nevoie de CT pentru toată cursa
  const unallocated = useMemo(() => trips.filter((x) => x.kind === 'subcontracted' && x.status !== 'Anulată' && !activeByTrip[x.id]).sort((a, b) => String(a.start_at || a.load_date).localeCompare(String(b.start_at || b.load_date))), [trips, activeByTrip])
  const clientName = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.company])), [clients])
  const enriched = useMemo(() => (rows || []).map((o) => {
    const carrier = kName[o.carrier_id] || ''
    const trip = tById[o.trip_id]
    return { o, carrier, trip, warns: checkOrder(o, trip, carriers.find((c) => c.id === o.carrier_id)), hay: orderHaystack(o, carrier, trip) }
  }), [rows, kName, tById, carriers])

  const months = [...new Set(enriched.map((e) => String(e.o.order_date).slice(0, 7)))].sort().reverse()
  const terms = foldText(q).split(/\s+/).filter(Boolean)
  const filtered = enriched
    .filter((e) => terms.every((w) => e.hay.includes(w)))
    .filter((e) => !fRun || e.o.status === 'Semnată încărcată')
    .filter((e) => (!fSt || e.o.status === fSt) && (!fCar || e.o.carrier_id === fCar) && (!fMonth || String(e.o.order_date).startsWith(fMonth)))
    .sort((a, b) => SORTS[sort.key](a, b) * sort.dir)
  const count = (s) => enriched.filter((e) => e.o.status === s).length
  const hasFilters = q || fSt || fCar || fMonth || fRun
  const th = (key, label, cls = '') => (
    <th className={`cursor-pointer select-none px-3 py-2.5 hover:text-navy-800 ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>{label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
  )
  const setStatus = async (o, status) => {
    if (status === o.status) return
    setErr('')
    let reason = ''
    if (status === 'Anulată') {
      reason = await askReasonMain({ title: `${t('ord.cancelTitle')} ${o.code}`, text: t('ord.cancelText'), confirmLabel: t('ord.cancelBtn') })
      if (!reason) return
    }
    const row = { ...o, status }
    if (status === 'Trimisă' && !row.sent_on) row.sent_on = todayISO()
    if ((status === 'Confirmată' || status === 'Semnată încărcată') && !row.confirmed_on) row.confirmed_on = todayISO()
    setRows((rs) => rs.map((r) => (r.id === o.id ? { ...r, ...row } : r)))
    try {
      const saved = await ORDERS_API.save(o.id, row)
      if (status === 'Trimisă') await takeSnapshot('ct', saved, tById[saved.trip_id])
      if (reason) await ACTIVITY_API.event('transport_orders', o.id, o.code, 'cancel_reason', { reason }).catch(() => {})
    } catch (e) {
      setErr(friendlyErr(e, t))
    }
    load()
  }
  const remove = async (o) => {
    const sent = o.status !== 'Ciornă' && o.status !== 'Anulată'
    const reason = await askReasonMain({ title: `${t('ord.delTitle')} ${o.code}`, text: sent ? `${t('ord.delSentAsk')} (${orderStatusLabel(o.status, lang)})` : t('ord.delText'), confirmLabel: t('ord.delBtn') })
    if (!reason) return
    await ACTIVITY_API.event('transport_orders', o.id, o.code, 'delete_reason', { reason }).catch(() => {})
    await ORDERS_API.remove(o.id).catch((e) => setErr(e.message))
    load()
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {t('nav.orders').toUpperCase()}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{t('nav.orders')}</h1>
        <button onClick={() => setModal({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {t('ord.new')}</button>
      </div>
      {reasonNodeMain}
      {err && <p className="mt-3 text-rose-600">{err}</p>}

      {FEATURES.blankFormDownloads && (
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-[13.5px] font-medium text-navy-800">{t('ord.formsTitle')}</div>
        <p className="mt-0.5 text-[12px] text-slate-500">{t('ord.formsHint')}</p>
        {FORMS.map(([kind, files]) => (
          <div key={kind} className="mt-3">
            <div className="mono-label text-[10px] text-slate-500">{t(`ord.forms_${kind}`)}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {files.map(([file, label]) => (
                <a key={file} href={`/forms/${file}`} download className="rounded-lg border border-brand-500 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">⬇ {label}</a>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}

      {rows !== null && (
        <div className="mt-5">
          <button onClick={() => setShowUn((v) => !v)} className={`flex w-full items-center justify-between rounded-xl border p-4 text-left shadow-sm ${unallocated.length ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'}`}>
            <div>
              <div className="mono-label text-[10px] text-slate-500">{t('ord.unTitle')}</div>
              <div className="text-[12.5px] text-slate-600">{unallocated.length ? t('ord.unHint') : t('ord.unNone')}</div>
            </div>
            <div className={`text-[28px] font-semibold ${unallocated.length ? 'text-rose-600' : 'text-emerald-600'}`}>{unallocated.length}</div>
          </button>
          {showUn && unallocated.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-xl border border-rose-200 bg-white shadow-sm">
              <table className="w-full text-left text-[13.5px]">
                <tbody>
                  {unallocated.map((tr) => (
                    <tr key={tr.id} className="border-t border-slate-100 first:border-t-0">
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-navy-700">{tr.code}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(String(tr.start_at || tr.load_date || '').slice(0, 10))}</td>
                      <td className="px-3 py-2.5">{(() => { const g = ccRows.filter((o) => o.trip_id === tr.id && o.status !== 'Anulată'); return <><div>{[...new Set(g.map((o) => clientName[o.client_id]).filter(Boolean))].join(', ') || '—'}</div><div className="text-[12px] text-slate-500">{g.length} {lang === 'en' ? 'orders' : 'comenzi'}</div></> })()}</td>
                      <td className="hidden px-3 py-2.5 sm:table-cell" />
                      <td className="whitespace-nowrap px-3 py-2.5 text-right"><button onClick={() => { const g = ccRows.filter((o) => o.trip_id === tr.id && o.status !== 'Anulată'); setModal({ prefill: { trip_id: tr.id, purpose: 'subcontracted_trip', goodsIds: g.map((o) => o.id), ...(g.length ? fromGoods(g, 'subcontracted_trip', lang) : {}) } }) }} className="rounded-lg border border-brand-500 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">＋ {t('ord.createFor')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {['Ciornă', 'Trimisă', 'Confirmată', 'Semnată încărcată', 'Executată'].map((s) => (
          <button key={s} onClick={() => setFSt(fSt === s ? '' : s)} className={`rounded-xl border p-3 text-left shadow-sm ${fSt === s ? 'border-brand-500 bg-brand-500/5' : 'border-slate-200 bg-white'}`}>
            <div className="mono-label text-[9.5px] text-slate-500">{orderStatusLabel(s, lang).toUpperCase()}</div>
            <div className="mt-1 text-[22px] font-semibold text-navy-800">{count(s)}</div>
          </button>
        ))}
      </div>

      <div className="mt-4"><input className={`${input} !py-2.5`} placeholder={t('ord.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select className={sel} value={fSt} onChange={(e) => setFSt(e.target.value)}><option value="">{t('exp.allStatuses')}</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{orderStatusLabel(s, lang)}</option>)}</select>
        <select className={sel} value={fCar} onChange={(e) => setFCar(e.target.value)}><option value="">{t('trip.allCarriers')}</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</select>
        <select className={sel} value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">{t('exp.allMonths')}</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
        {fRun && <span className="mono-label rounded-full border border-sky-300 bg-sky-50 px-3 py-2 text-[11px] text-sky-700">{lang === 'en' ? 'Loaded trips (in progress)' : 'Doar curse încărcate (în desfășurare)'}</span>}
        {hasFilters && <button onClick={() => { setQ(''); setFSt(''); setFCar(''); setFMonth(''); setFRun(false) }} className="rounded-lg px-3 py-2 text-[13px] text-brand-600 hover:bg-brand-500/10">{t('cost.clear')}</button>}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows === null ? <p className="p-5 text-slate-500">…</p> : filtered.length === 0 ? <p className="p-5 text-slate-500">{t('ord.none')}</p> : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>{th('code', t('cost.code'))}{th('order_date', t('ord.date'), 'hidden sm:table-cell')}{th('carrier', t('trip.carrier'))}{th('load_date', t('trip.loadDate'), 'hidden md:table-cell')}{th('unload_date', t('trip.unloadDate'), 'hidden md:table-cell')}{th('price', t('ord.price'), 'text-right')}<th className="hidden px-3 py-2.5 sm:table-cell">{t('trip.status')}</th><th className="px-3 py-2.5" /></tr>
            </thead>
            <tbody>
              {filtered.map(({ o, carrier, trip, warns }) => (
                <tr key={o.id} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${o.status === 'Anulată' ? 'opacity-50' : ''}`} onClick={() => setModal(o)}>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-navy-700">{o.code}<div className="text-[11px] font-normal text-slate-400">{[trip?.code, ...goodsOf(o.id)].filter(Boolean).join(' · ')}</div><div className="mono-label text-[9px] font-normal text-violet-700">{o.purpose === 'subcontracted_trip' ? (lang === 'en' ? 'SUBCONTRACTED TRIP' : 'CURSĂ SUBCONTRACTATĂ') : (lang === 'en' ? 'DISTRIBUTION' : 'DISTRIBUȚIE')}</div></td>
                  <td className="hidden whitespace-nowrap px-3 py-3 sm:table-cell">{fmtDate(o.order_date)}</td>
                  <td className="px-3 py-3">
                    {carrier || '—'}
                    {trip?.status === 'Anulată' && <div className="mt-0.5 text-[12.5px] font-bold text-rose-600">⛔ {lang === 'en' ? 'The trip was cancelled!' : 'Cursa a fost anulată!'}</div>}
                    {(() => {
                      const rows = stopRows(o, lang)
                      return (
                        <div className="mt-0.5 text-[12px] leading-snug text-slate-600">
                          {rows.length > 0
                            ? rows.map((r, i) => <div key={i}><span className="font-medium text-slate-500">{r.label}:</span> {r.text}</div>)
                            : (o.load_address || o.unload_address) && <div className="text-slate-500">{[o.load_address && o.unload_address ? `${o.load_address} → ${o.unload_address}` : ''].filter(Boolean).join('')}</div>}
                          {o.uit && <div className="text-slate-500">{uitList(o.uit).map((u) => <div key={u}>UIT {u}</div>)}</div>}
                          {warns.length > 0 && o.status !== 'Anulată' && <div className="text-amber-600">⚠ {t(`ord.w_${warns[0]}`)}</div>}
                          {(() => { const ch = changesFor('ct', o, trip, ctSnaps.snaps[o.id], lang); return ch.length > 0 && <div className="font-medium text-amber-700">⚠ {lang === 'en' ? 'Changed after sending' : 'Modificat după trimitere'}: {ch.join(', ')}</div> })()}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-3 md:table-cell">{fmtDate(o.load_date)}<div className="text-[11.5px] text-slate-500">{o.lang === 'en' ? 'EN' : 'RO'}</div></td>
                  <td className="hidden whitespace-nowrap px-3 py-3 md:table-cell">{o.unload_date ? fmtDate(o.unload_date) : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{o.price ? `${fmtMoney(o.price)} ${o.currency}` : '—'}</td>
                  <td className="hidden px-3 py-3 sm:table-cell" onClick={(e) => e.stopPropagation()}>
                    <select aria-label={t('trip.status')} value={o.status} onChange={(e) => setStatus(o, e.target.value)} className={`mono-label cursor-pointer rounded-full border px-2 py-0.5 text-[10px] outline-none ${ORDER_STYLE[o.status] || ''}`}>
                      {ORDER_STATUSES.map((x) => <option key={x} value={x}>{orderStatusLabel(x, lang)}</option>)}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button title={t('ord.mailBtn')} onClick={() => (o.carrier_id ? setMailOrder(o) : setErr(t('ord.mailNoCarrier')))} className="rounded px-2 py-1 text-brand-600 hover:bg-brand-500/10">✉</button>
                    <button title={t('cost.del')} onClick={() => remove(o)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-[12px] text-slate-500">{t('ord.hint')}</p>
      {mailOrder && (
        <SendMailModal order={mailOrder} carrier={carriers.find((c) => c.id === mailOrder.carrier_id)} blobOf={() => generateOrderPdf(mailOrder, carriers.find((c) => c.id === mailOrder.carrier_id))}
          onClose={() => { setMailOrder(null); load() }}
          onSent={async () => { const r = await ORDERS_API.save(mailOrder.id, { ...mailOrder, status: 'Trimisă', sent_on: mailOrder.sent_on || todayISO() }); await takeSnapshot('ct', r, tById[r.trip_id]) }} />
      )}
      {modal && <LockGate entity="transport_orders" id={modal.id} label={modal.code} onClose={() => setModal(null)}><OrderModal initial={modal.id ? modal : null} prefill={modal.prefill} trips={trips} places={clients.filter((c) => c.status !== 'Inactiv')} ccRows={ccRows} clients={clients} links={links} carriers={carriers.filter((c) => c.status !== 'Blocat' || c.id === modal.carrier_id)} onClose={() => setModal(null)} onSaved={(_, keep) => { if (!keep) setModal(null); load() }} /></LockGate>}
    </div>
  )
}
