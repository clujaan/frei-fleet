import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useRef, useState } from 'react'
import { backdrop } from '../lib/backdrop'
import { useLang } from '../i18n'
import { COUNTRIES } from '../lib/entities'
import { CURRENCIES, EXCHANGES, OFFERS_API, bestQuote, cleanQuotes, emptyQuote, marginOf, quotesOf, sortedQuotes, cleanExtraStops, extraStops, routePlaces, OFFER_STATUSES, OFFER_STYLE, VEHICLES, checkOffer, laneStats, offerHaystack, offerKey, parseOffersExcel, ratePerKm } from '../lib/offers'
import { foldText } from '../lib/costs'
import { calcKm, canCalcKm, suggestPlaces } from '../lib/km'
import { readOffer } from '../lib/readOffer'
import { fmtDate, fmtMoney, parseNum, todayISO } from '../lib/format'
import { CloseX, SaveButtons, useFlash } from '../components/ModalChrome'
import { useDeleteReason } from '../components/ReasonModal'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const sel = `${input} !w-auto`
const lbl = 'block text-[12px] text-slate-600'

const EMPTY = {
  received_on: todayISO(), exchange: EXCHANGES[0], company: '', contact_name: '', phone: '', email: '', load_country: '', load_place: '', load_date: '', load_date_alt: '', unload_country: '', unload_place: '', unload_date: '', unload_date_alt: '',
  km: '', cargo: '', weight_t: '', vehicle_type: VEHICLES[0], price: '', currency: 'EUR', status: '', notes: '', extra_loads: [], extra_unloads: [], carrier_quotes: [],
}


// Câmp de loc cu sugestii (localitate + județ + cod poștal). La alegere completează și țara.
export function PlaceInput({ value, country, onText, onPick }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  const ctl = useRef(null)
  const typed = useRef(false)
  useEffect(() => {
    clearTimeout(timer.current)
    ctl.current?.abort()
    if (!typed.current || String(value).trim().length < 3) { setItems([]); return }
    timer.current = setTimeout(async () => {
      ctl.current = new AbortController()
      const r = await suggestPlaces(String(value).trim(), country)
      setItems(r)
      setOpen(r.length > 0)
    }, 350)
    return () => clearTimeout(timer.current)
  }, [value, country])
  return (
    <div className="relative">
      <input className={input} autoComplete="off" value={value} onChange={(e) => { typed.current = true; onText(e.target.value) }} onFocus={() => items.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && items.length > 0 && (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((it) => (
            <li key={it.text + it.country}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { typed.current = false; setOpen(false); setItems([]); onPick(it) }} className="block w-full px-3 py-1.5 text-left text-[13px] text-navy-800 hover:bg-slate-50">
                <b>{it.name}</b>{it.post ? ` · ${it.post}` : ''}<span className="text-slate-500">{it.area ? ` · ${it.area}` : ''}{it.countryName ? ` · ${it.countryName}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Un loc suplimentar de încărcare/descărcare: țară + localitate/cod poștal (cu sugestii) + dată
function ExtraStop({ title, dateLabel, value, onChange, onRemove }) {
  const { t } = useLang()
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="mono-label text-[10px] text-slate-500">{title}</span>
        <button type="button" onClick={onRemove} className="text-[12px] text-slate-400 hover:text-rose-600">✕ {t('trip.removeStop')}</button>
      </div>
      <div className="grid grid-cols-6 gap-2">
        <label className={`${lbl} col-span-2 sm:col-span-1`}>{t('offer.country')}<input list="countries" maxLength={3} className={`${input} uppercase`} value={value.country || ''} onChange={set('country')} /></label>
        <div className={`${lbl} col-span-4 sm:col-span-3`}>{t('trip.city')} / {t('trip.zip').toLowerCase()}
          <PlaceInput value={value.place || ''} country={value.country || ''}
            onText={(v) => { const { lat, lon, ...rest } = value; onChange({ ...rest, place: v }) }}
            onPick={(it) => onChange({ ...value, place: it.text, country: it.country || value.country, lat: it.lat, lon: it.lon })} />
        </div>
        <label className={`${lbl} col-span-6 sm:col-span-2`}>{dateLabel}<input type="date" className={input} value={value.date || ''} onChange={set('date')} /></label>
      </div>
    </div>
  )
}

function OfferModal({ initial, known, onClose, onSaved }) {
  const [rid, setRid] = useState(initial?.id || null)
  const [flash, ping] = useFlash()
  const { t } = useLang()
  const [f, setF] = useState(() => ({ ...EMPTY, ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? EMPTY[k] ?? ''])) }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [kmBusy, setKmBusy] = useState(false)
  const [kmMsg, setKmMsg] = useState('')
  const [geo, setGeo] = useState({})
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const extras = (side) => extraStops(f[`extra_${side}s`])
  const setExtras = (side, arr) => setF((s) => ({ ...s, [`extra_${side}s`]: arr }))
  const doKm = async () => {
    setKmBusy(true); setKmMsg('')
    try { const km = await calcKm(f, geo); setF((s) => ({ ...s, km: String(km) })); setKmMsg(`✓ ${km} km`) } catch (e) { setKmMsg(e.message) }
    setKmBusy(false)
  }
  const auto = useRef({ phone: '', email: '' })
  const ck = foldText(f.company).replace(/\s+/g, '')
  const contactsOf = (known.contacts[ck] || [])
  const fill = (s, name, comp) => {
    const nk = foldText(name).replace(/\s+/g, '')
    if (!nk) return s
    const list = comp ? (known.contacts[comp] || []) : Object.values(known.contacts).flat()
    const c = list.find((x) => x.key === nk)
    if (!c) return s
    const out = { ...s }
    // completează doar câmpurile goale (sau cele puse anterior automat)
    if (c.phone && (!s.phone || s.phone === auto.current.phone)) { out.phone = c.phone; auto.current.phone = c.phone }
    if (c.email && (!s.email || s.email === auto.current.email)) { out.email = c.email; auto.current.email = c.email }
    return out
  }
  const onCompany = (e) => setF((s) => ({ ...s, company: e.target.value }))
  const onCompanyBlur = () => setF((s) => {
    const canon = known.companies[foldText(s.company).replace(/\s+/g, '')]
    const n = canon && canon !== s.company ? { ...s, company: canon } : s
    return fill(n, n.contact_name, foldText(n.company).replace(/\s+/g, ''))
  })
  const onContact = (e) => { const v = e.target.value; setF((s) => fill({ ...s, contact_name: v }, v, foldText(s.company).replace(/\s+/g, ''))) }
  const model = { ...f, price: parseNum(f.price) || 0, km: parseNum(f.km) || 0 }
  const rate = ratePerKm(model)
  const warns = checkOffer(model)

  const save = async (exit = true) => {
    if (!f.received_on) return setErr(t('offer.w_received'))
    if (f.load_date && f.unload_date && f.unload_date < f.load_date) return setErr(t('offer.w_dates'))
    setBusy(true)
    setErr('')
    try {
      let kmVal = f.km
      // Dacă lipsesc km, încerc calculul automat; la eșec salvez oricum, fără km.
      if ((kmVal === '' || !parseNum(kmVal)) && canCalcKm(f)) { try { kmVal = String(await calcKm(f, geo)) } catch { /* rămâne gol */ } }
      const kmNum = parseNum(kmVal) || 0
      const saved = await OFFERS_API.save(rid, {
        ...f, carrier_quotes: cleanQuotes(f.carrier_quotes), extra_loads: cleanExtraStops(f.extra_loads), extra_unloads: cleanExtraStops(f.extra_unloads), load_country: f.load_country.trim().toUpperCase(), unload_country: f.unload_country.trim().toUpperCase(),
        price: f.price === '' ? null : model.price, km: kmVal === '' || !kmNum ? null : kmNum, weight_t: f.weight_t === '' ? null : parseNum(f.weight_t),
      })
      if (saved?.id) setRid(saved.id)
      setBusy(false)
      if (exit) onSaved(saved)
      else { onSaved(saved, true); ping() }
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{initial?.id ? `${t('trip.edit')} ${initial.code}` : t('offer.new')}</h2>
        {initial?._warnings && <p className="mt-1 rounded-lg bg-sky-50 p-2 text-[12.5px] text-sky-800">📷 {t('offer.shotCheck')}</p>}
        <datalist id="countries">{COUNTRIES.filter((c) => c !== 'Alta').map((c) => <option key={c} value={c} />)}</datalist>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={lbl}>{t('offer.received')} *<input type="date" className={input} value={f.received_on} onChange={set('received_on')} /></label>
          <label className={lbl}>{t('offer.exchange')}<select className={input} value={f.exchange} onChange={set('exchange')}>{EXCHANGES.map((x) => <option key={x}>{x}</option>)}</select></label>
          <datalist id="known-companies">{Object.values(known.companies).map((c) => <option key={c} value={c} />)}</datalist>
          <datalist id="known-contacts">{contactsOf.map((c) => <option key={c.key} value={c.name} />)}</datalist>
          <label className={lbl}>{t('offer.company')}<input list="known-companies" autoComplete="off" className={input} value={f.company} onChange={onCompany} onBlur={onCompanyBlur} /></label>
          <label className={lbl}>{t('offer.contact')}<input list="known-contacts" autoComplete="off" className={input} value={f.contact_name} onChange={onContact} /></label>
          <label className={lbl}>{t('offer.phone')}<input className={input} value={f.phone} onChange={set('phone')} /></label>
          <label className={lbl}>{t('offer.email')}<input className={input} value={f.email} onChange={set('email')} /></label>
          <div className="grid grid-cols-3 gap-2">
            <label className={lbl}>{t('offer.country')}<input list="countries" maxLength={3} className={`${input} uppercase`} value={f.load_country} onChange={set('load_country')} placeholder="RO" /></label>
            <div className={`${lbl} col-span-2`}>{t('offer.loadPlace')}<PlaceInput value={f.load_place} country={f.load_country} onText={(v) => setF((s) => ({ ...s, load_place: v }))} onPick={(it) => { setGeo((g) => ({ ...g, load: { text: it.text, lat: it.lat, lon: it.lon } })); setF((s) => ({ ...s, load_place: it.text, load_country: it.country || s.load_country })) }} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className={lbl}>{t('offer.country')}<input list="countries" maxLength={3} className={`${input} uppercase`} value={f.unload_country} onChange={set('unload_country')} placeholder="DE" /></label>
            <div className={`${lbl} col-span-2`}>{t('offer.unloadPlace')}<PlaceInput value={f.unload_place} country={f.unload_country} onText={(v) => setF((s) => ({ ...s, unload_place: v }))} onPick={(it) => { setGeo((g) => ({ ...g, unload: { text: it.text, lat: it.lat, lon: it.lon } })); setF((s) => ({ ...s, unload_place: it.text, unload_country: it.country || s.unload_country })) }} /></div>
          </div>
          <label className={lbl}>{t('trip.loadDate')}<input type="date" className={input} value={f.load_date} onChange={set('load_date')} /></label>
          <label className={lbl}>{t('trip.unloadDate')}<input type="date" className={input} value={f.unload_date} onChange={set('unload_date')} /></label>
          <label className={lbl}>{t('trip.loadDate')} · {t('goods.dateAlt')}<input type="date" className={input} value={f.load_date_alt || ''} onChange={set('load_date_alt')} /></label>
          <label className={lbl}>{t('trip.unloadDate')} · {t('goods.dateAlt')}<input type="date" className={input} value={f.unload_date_alt || ''} onChange={set('unload_date_alt')} /></label>
          {['load', 'unload'].map((side) => (
            <div key={side} className="space-y-2 sm:col-span-2">
              {extras(side).map((x, i) => (
                <ExtraStop key={i} dateLabel={t(side === 'load' ? 'trip.loadDate' : 'trip.unloadDate')} title={`${t(side === 'load' ? 'trip.extraLoad' : 'trip.extraUnload')} ${i + 2}`} value={x}
                  onChange={(v) => { setKmMsg(''); setExtras(side, extras(side).map((y, j) => (j === i ? v : y))) }} onRemove={() => setExtras(side, extras(side).filter((_, j) => j !== i))} />
              ))}
              <button type="button" onClick={() => setExtras(side, [...extras(side), { country: '', place: '', date: '' }])} className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">
                {t(side === 'load' ? 'trip.addLoad' : 'trip.addUnload')}
              </button>
            </div>
          ))}
          <div className={lbl}>
            <label className="block">{t('offer.km')}<input inputMode="numeric" className={input} value={f.km} onChange={(e) => { setKmMsg(''); set('km')(e) }} /></label>
            <button type="button" disabled={kmBusy || !canCalcKm(f)} onClick={doKm} className="mt-1 text-[12px] font-medium text-brand-600 hover:underline disabled:text-slate-400 disabled:no-underline">{kmBusy ? 'Calculez…' : '📍 Calculează km'}</button>
            {kmMsg && <span className={`ml-2 text-[12px] ${kmMsg.startsWith('✓') ? 'text-emerald-600' : 'text-amber-700'}`}>{kmMsg}</span>}
          </div>
          <label className={lbl}>{t('offer.weight')}<input inputMode="decimal" className={input} value={f.weight_t} onChange={set('weight_t')} /></label>
          <label className={lbl}>{t('offer.cargo')}<input className={input} value={f.cargo} onChange={set('cargo')} /></label>
          <label className={lbl}>{t('offer.vehicle')}<select className={input} value={f.vehicle_type} onChange={set('vehicle_type')}>{VEHICLES.map((x) => <option key={x}>{x}</option>)}</select></label>
          <div className="grid grid-cols-3 gap-2">
            <label className={`${lbl} col-span-2`}>{t('offer.price')}<input inputMode="decimal" className={input} value={f.price} onChange={set('price')} placeholder="0,00" /></label>
            <label className={lbl}>{t('cost.currency')}<select className={input} value={f.currency} onChange={(e) => { const v = e.target.value; setF((s) => ({ ...s, currency: v, carrier_quotes: (s.carrier_quotes || []).map((q) => (q.curManual ? q : { ...q, currency: v })) })) }}>{CURRENCIES.map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
            <div className="mono-label text-[10px] text-slate-500">{t('quote.title')}</div>
            <p className="mt-1 text-[11.5px] text-slate-500">{t('quote.hint')}</p>
            {(f.carrier_quotes || []).map((q, i) => {
              const upd = (patch) => setF((s) => ({ ...s, carrier_quotes: (s.carrier_quotes || []).map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
              return (
                <div key={i} className="mt-2 grid grid-cols-6 gap-2 rounded-lg bg-slate-50 p-2">
                  <label className={`${lbl} col-span-6 sm:col-span-3`}>{t('quote.carrier')}<input className={input} value={q.carrier} onChange={(e) => upd({ carrier: e.target.value })} /></label>
                  <label className={`${lbl} col-span-3 sm:col-span-2`}>{t('quote.price')}<input inputMode="decimal" className={input} value={q.price ?? ''} onChange={(e) => upd({ price: e.target.value })} placeholder="0,00" /></label>
                  <label className={`${lbl} col-span-3 sm:col-span-1`}>{t('cost.currency')}<select className={input} value={q.currency} onChange={(e) => upd({ currency: e.target.value, curManual: true })}>{CURRENCIES.map((x) => <option key={x}>{x}</option>)}</select></label>
                  <label className={`${lbl} col-span-3`}>{t('quote.exchange')}<select className={input} value={q.exchange || ''} onChange={(e) => upd({ exchange: e.target.value })}><option value="">—</option>{EXCHANGES.map((x) => <option key={x}>{x}</option>)}</select></label>
                  <label className={`${lbl} col-span-3`}>{t('quote.extId')}<input className={input} value={q.ext_id || ''} onChange={(e) => upd({ ext_id: e.target.value })} /></label>
                  <label className={`${lbl} col-span-6 sm:col-span-2`}>{t('quote.contact')}<input className={input} value={q.contact || ''} onChange={(e) => upd({ contact: e.target.value })} /></label>
                  <label className={`${lbl} col-span-6 sm:col-span-2`}>{t('quote.email')}<input className={input} value={q.email || ''} onChange={(e) => upd({ email: e.target.value })} /></label>
                  <label className={`${lbl} col-span-6 sm:col-span-2`}>{t('quote.phone')}<input className={input} value={q.phone || ''} onChange={(e) => upd({ phone: e.target.value })} /></label>
                  <div className="col-span-6 text-right"><button type="button" onClick={() => setF((s) => ({ ...s, carrier_quotes: (s.carrier_quotes || []).filter((_, j) => j !== i) }))} className="text-[12px] text-rose-600 hover:underline">{t('trip.removeStop')}</button></div>
                </div>
              )
            })}
            <button type="button" onClick={() => setF((s) => ({ ...s, carrier_quotes: [...(s.carrier_quotes || []), emptyQuote(s.currency, s.exchange)] }))} className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">{t('quote.add')}</button>
          </div>
          <label className={lbl}>{t('trip.status')}<select className={input} value={f.status} onChange={set('status')}><option value="">—</option>{OFFER_STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className={`${lbl} sm:col-span-2`}>{t('cost.notes')}<textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></label>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-[12.5px] text-slate-600">
          {t('offer.rate')}: <b className="text-[15px] text-navy-800">{rate == null ? '—' : `${fmtMoney(rate)} ${f.currency}/km`}</b>
          {(() => { const m = marginOf({ ...model, carrier_quotes: cleanQuotes(f.carrier_quotes) }); return m == null ? null : <span className="ml-4">{t('quote.margin')}: <b className={`text-[15px] ${m >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmtMoney(m)} {f.currency}</b></span> })()}
        </div>
        {(initial?._warnings || []).map((w, i) => <p key={`r${i}`} className="mt-1 text-[12.5px] text-amber-700">⚠ {w}</p>)}
        {warns.filter((w) => w !== 'received').map((w) => <p key={w} className="mt-1 text-[12.5px] text-amber-700">⚠ {t(`offer.w_${w}`)}</p>)}
        {err && <p className="mt-2 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('exp.cancel')}</button>
          <SaveButtons busy={busy} onSave={save} flash={flash} />
        </div>
      </div>
    </div>
  )
}

// „Ofertă din imagine”: lipești (Ctrl+V) sau alegi 1–3 capturi de ecran; aplicația citește oferta și deschide formularul completat, de verificat.
function ScreenshotModal({ onClose, onRead }) {
  const { t } = useLang()
  const [imgs, setImgs] = useState([]) // [{ blob, url }]
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const add = (blobs) => setImgs((cur) => [...cur, ...blobs.filter((b) => b.type.startsWith('image/')).map((blob) => ({ blob, url: URL.createObjectURL(blob) }))].slice(0, 3))
  useEffect(() => {
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.items || []).filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean)
      if (files.length) { e.preventDefault(); add(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])
  const go = async () => {
    setBusy(true); setErr('')
    try { onRead(await readOffer(imgs.map((i) => i.blob))) } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{t('offer.shotTitle')}</h2>
        <p className="mt-1 text-[13px] text-slate-600">{t('offer.shotHelp')}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {imgs.map((im, i) => (
            <div key={im.url} className="relative overflow-hidden rounded-lg border border-slate-200">
              <img src={im.url} alt="" className="h-28 w-full object-cover object-top" />
              <button type="button" onClick={() => setImgs((c) => c.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded bg-white/90 px-1.5 text-[12px] text-slate-600 hover:text-rose-600">✕</button>
            </div>
          ))}
          {imgs.length < 3 && (
            <label className="grid h-28 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-slate-300 text-center text-[12.5px] text-slate-500 hover:border-brand-500 hover:text-brand-600">
              <span>{t('offer.shotPick')}<br /><span className="text-[11px]">Ctrl+V</span></span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = '' }} />
            </label>
          )}
        </div>
        <p className="mt-3 text-[12px] text-slate-500">{t('offer.shotNote')}</p>
        {err && <p className="mt-2 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('exp.cancel')}</button>
          <button disabled={busy || !imgs.length} onClick={go} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('offer.shotBusy') : t('offer.shotGo')}</button>
        </div>
      </div>
    </div>
  )
}

function ImportModal({ file, existing, onClose, onDone }) {
  const { t } = useLang()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    parseOffersExcel(file).then((r) => {
      if (!live) return
      const have = new Set(existing.map(offerKey))
      const seen = new Set()
      const fresh = []
      let dup = 0
      for (const row of r.rows) {
        const k = offerKey(row)
        if (have.has(k) || seen.has(k)) { dup++; continue }
        seen.add(k)
        fresh.push(row)
      }
      setData({ fresh, dup, skipped: r.skipped.length, total: r.rows.length })
    }).catch((e) => live && setErr(e.message))
    return () => { live = false }
  }, [file, existing])
  const go = async () => {
    setBusy(true)
    try {
      onDone(await OFFERS_API.insertMany(data.fresh))
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{t('offer.importTitle')}</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">{file.name}</p>
        {!data && !err && <p className="mt-4 text-slate-500">…</p>}
        {data && (
          <ul className="mt-4 space-y-1 text-[14px] text-navy-800">
            <li>{t('offer.iRead')}: <b>{data.total}</b></li>
            <li>{t('offer.iNew')}: <b className="text-emerald-700">{data.fresh.length}</b></li>
            <li>{t('offer.iDup')}: <b>{data.dup}</b></li>
            {data.skipped > 0 && <li className="text-slate-500">{t('offer.iExample')}: {data.skipped}</li>}
          </ul>
        )}
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('exp.cancel')}</button>
          <button disabled={busy || !data || data.fresh.length === 0} onClick={go} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">{t('offer.iGo')} ({data?.fresh.length || 0})</button>
        </div>
      </div>
    </div>
  )
}

const SORTS = {
  code: (a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }),
  received_on: (a, b) => String(a.received_on).localeCompare(String(b.received_on)),
  exchange: (a, b) => String(a.exchange).localeCompare(String(b.exchange)),
  route: (a, b) => `${a.load_country}${a.unload_country}`.localeCompare(`${b.load_country}${b.unload_country}`),
  km: (a, b) => (Number(a.km) || 0) - (Number(b.km) || 0),
  price: (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0),
  rate: (a, b) => (ratePerKm(a) || 0) - (ratePerKm(b) || 0),
  quote: (a, b) => (Number(bestQuote(a)?.price) || Infinity) - (Number(bestQuote(b)?.price) || Infinity),
  margin: (a, b) => (marginOf(a) ?? -Infinity) - (marginOf(b) ?? -Infinity),
}

export default function Burse() {
  const { t } = useLang()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null)
  const [file, setFile] = useState(null)
  const [shot, setShot] = useState(false)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState('list')
  const [openQ, setOpenQ] = useState(null)
  const [q, setQ] = useState('')
  const [fEx, setFEx] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [fVeh, setFVeh] = useState('')
  const [fSt, setFSt] = useState('')
  const [fCur, setFCur] = useState('')
  const [fMonth, setFMonth] = useState('')
  const [fWarn, setFWarn] = useState(false)
  const [cur, setCur] = useState('EUR')
  const [sort, setSort] = useState({ key: 'code', dir: -1 })
  const fileRef = useRef(null)

  const known = useMemo(() => {
    const companies = {}
    const contacts = {}
    const k = (x) => foldText(x || '').replace(/\s+/g, '')
    const sorted = [...(rows || [])].sort((a, b) => String(b.received_on || '').localeCompare(String(a.received_on || '')))
    for (const o of sorted) {
      const ck = k(o.company)
      if (!ck) continue
      if (!companies[ck]) companies[ck] = o.company.trim()
      const nk = k(o.contact_name)
      if (!nk) continue
      const list = (contacts[ck] ||= [])
      let c = list.find((x) => x.key === nk)
      if (!c) { c = { key: nk, name: o.contact_name.trim(), phone: '', email: '' }; list.push(c) }
      if (!c.phone && o.phone) c.phone = o.phone
      if (!c.email && o.email) c.email = o.email
    }
    return { companies, contacts }
  }, [rows])
  const load = () => OFFERS_API.list().then(setRows).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])
  // link direct (ex. din Tabla flotei): /oferte?open=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open')
    if (!id || !rows) return
    const o = rows.find((x) => x.id === id)
    if (o) setModal(o)
    window.history.replaceState(null, '', window.location.pathname)
  }, [rows])

  const all = rows || []
  const enriched = useMemo(() => all.map((o) => ({ o, hay: offerHaystack(o), warns: checkOffer(o) })), [rows])
  const uniq = (k) => [...new Set(all.map((o) => o[k]).filter(Boolean))].sort()
  const months = [...new Set(all.map((o) => String(o.received_on).slice(0, 7)))].sort().reverse()
  const terms = foldText(q).split(/\s+/).filter(Boolean)
  const filtered = enriched
    .filter((e) => terms.every((w) => e.hay.includes(w)))
    .filter(({ o }) => (!fEx || o.exchange === fEx) && (!fFrom || o.load_country === fFrom) && (!fTo || o.unload_country === fTo) && (!fVeh || o.vehicle_type === fVeh) && (!fSt || o.status === fSt) && (!fCur || o.currency === fCur) && (!fMonth || String(o.received_on).startsWith(fMonth)))
    .filter((e) => !fWarn || e.warns.length)
    .sort((a, b) => SORTS[sort.key](a.o, b.o) * sort.dir)

  const month = todayISO().slice(0, 7)
  const thisMonth = all.filter((o) => String(o.received_on).startsWith(month))
  const rates = thisMonth.filter((o) => o.currency === 'EUR').map(ratePerKm).filter((x) => x != null)
  const avgRate = rates.length ? rates.reduce((s, x) => s + x, 0) / rates.length : null
  const warnCount = enriched.filter((e) => e.warns.length).length
  const hasFilters = q || fEx || fFrom || fTo || fVeh || fSt || fCur || fMonth || fWarn
  const clear = () => { setQ(''); setFEx(''); setFFrom(''); setFTo(''); setFVeh(''); setFSt(''); setFCur(''); setFMonth(''); setFWarn(false) }
  const stats = useMemo(() => laneStats(filtered.map((e) => e.o), cur), [filtered, cur])
  const th = (key, label, cls = '') => (
    <th className={`cursor-pointer select-none px-3 py-2.5 hover:text-navy-800 ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>{label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
  )
  const [confirmDel, delNode] = useDeleteReason()
  const remove = async (o) => {
    if (!(await confirmDel({ entity: 'freight_offers', id: o.id, code: o.code }))) return
    await OFFERS_API.remove(o.id).catch((e) => setErr(e.message))
    load()
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {t('nav.offers').toUpperCase()}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{t('nav.offers')}</h1>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = '' }} />
          <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-brand-500 px-4 py-2.5 text-[14px] font-medium text-brand-600 hover:bg-brand-500/10">⬆ {t('offer.import')}</button>
          <button onClick={() => setShot(true)} className="rounded-lg border border-brand-500 bg-white px-4 py-2.5 text-[14px] font-medium text-brand-600 shadow-sm hover:bg-brand-500/10">📷 {t('offer.fromShot')}</button>
          <button onClick={() => setModal({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {t('offer.new')}</button>
        </div>
      </div>
      {err && <p className="mt-3 text-rose-600">{err}</p>}
      {msg && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">{msg}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[[t('offer.kTotal'), all.length, ''], [t('offer.kMonth'), thisMonth.length, ''], [t('offer.kAvg'), avgRate == null ? '—' : fmtMoney(avgRate), 'EUR/km']].map(([l, v, u]) => (
          <div key={l} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mono-label text-[10px] text-slate-500">{l}</div>
            <div className="mt-1 text-[24px] font-semibold text-navy-800">{v} <span className="text-[13px] font-normal text-slate-500">{u}</span></div>
          </div>
        ))}
        <button onClick={() => setFWarn((v) => !v)} className={`rounded-xl border p-4 text-left shadow-sm ${fWarn ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="mono-label text-[10px] text-slate-500">{t('offer.kIncomplete')}</div>
          <div className={`mt-1 text-[24px] font-semibold ${warnCount ? 'text-amber-600' : 'text-navy-800'}`}>{warnCount}</div>
        </button>
      </div>

      <div className="mt-4"><input className={`${input} !py-2.5`} placeholder={t('offer.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select className={sel} value={fEx} onChange={(e) => setFEx(e.target.value)}><option value="">{t('offer.allEx')}</option>{EXCHANGES.map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={fFrom} onChange={(e) => setFFrom(e.target.value)}><option value="">{t('offer.allFrom')}</option>{uniq('load_country').map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={fTo} onChange={(e) => setFTo(e.target.value)}><option value="">{t('offer.allTo')}</option>{uniq('unload_country').map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={fVeh} onChange={(e) => setFVeh(e.target.value)}><option value="">{t('offer.allVeh')}</option>{VEHICLES.map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={fSt} onChange={(e) => setFSt(e.target.value)}><option value="">{t('exp.allStatuses')}</option>{OFFER_STATUSES.map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={fCur} onChange={(e) => setFCur(e.target.value)}><option value="">{t('offer.allCur')}</option>{CURRENCIES.map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">{t('exp.allMonths')}</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
        {hasFilters && <button onClick={clear} className="rounded-lg px-3 py-2 text-[13px] text-brand-600 hover:bg-brand-500/10">{t('cost.clear')}</button>}
      </div>

      <div className="mt-4 flex gap-1 border-b border-slate-200">
        {[['list', t('offer.tabList')], ['lanes', t('offer.tabLanes')]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-[14px] ${tab === k ? 'border-brand-500 font-medium text-navy-800' : 'border-transparent text-slate-500 hover:text-navy-800'}`}>{l}</button>
        ))}
      </div>

      {tab === 'list' ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {rows === null ? <p className="p-5 text-slate-500">…</p> : filtered.length === 0 ? <p className="p-5 text-slate-500">{t('offer.none')}</p> : (
            <table className="w-full text-left text-[13.5px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>{th('received_on', t('offer.received'))}{th('exchange', t('offer.exchange'), 'hidden sm:table-cell')}{th('route', t('offer.route'))}{th('km', t('offer.km'), 'text-right hidden md:table-cell')}
                  {th('price', t('offer.price'), 'text-right')}{th('quote', t('quote.col'), 'text-right')}{th('margin', t('quote.margin'), 'text-right hidden sm:table-cell')}{th('rate', t('offer.rate'), 'text-right hidden sm:table-cell')}<th className="hidden px-3 py-2.5 lg:table-cell">{t('trip.status')}</th><th className="px-3 py-2.5" /></tr>
              </thead>
              <tbody>
                {filtered.map(({ o, warns }) => {
                  const r = ratePerKm(o)
                  return (
                    <tr key={o.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal(o)}>
                      <td className="whitespace-nowrap px-3 py-3"><span className="font-medium text-navy-700">{fmtDate(o.received_on)}</span><div className="text-[11px] text-slate-400">{o.code}</div></td>
                      <td className="hidden px-3 py-3 sm:table-cell">{o.exchange || '—'}<div className="text-[11.5px] text-slate-500">{o.company}</div></td>
                      <td className="px-3 py-3">
                        <b>{o.load_country || '?'} → {o.unload_country || '?'}</b>
                        {(extraStops(o.extra_loads).length > 0 || extraStops(o.extra_unloads).length > 0) && (
                          <span className="ml-2 inline-flex gap-1 align-middle">
                            {extraStops(o.extra_loads).length > 0 && <span className="mono-label rounded-full border border-brand-500/40 bg-brand-500/10 px-1.5 py-0.5 text-[9px] text-brand-600">+{extraStops(o.extra_loads).length} {t('offer.xLoads')}</span>}
                            {extraStops(o.extra_unloads).length > 0 && <span className="mono-label rounded-full border border-sky-400/50 bg-sky-50 px-1.5 py-0.5 text-[9px] text-sky-700">+{extraStops(o.extra_unloads).length} {t('offer.xUnloads')}</span>}
                          </span>
                        )}
                        <div className="text-[11.5px] text-slate-500">{[(() => { const r = routePlaces(o); return r.from && r.to ? `${r.from} → ${r.to}` : '' })(), o.vehicle_type, o.cargo].filter(Boolean).join(' · ')}</div>
                        {warns.length > 0 && <div className="text-[11.5px] text-amber-600">⚠ {t(`offer.w_${warns[0]}`)}</div>}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums md:table-cell">{o.km ? Number(o.km).toLocaleString('ro-RO') : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{o.price ? `${fmtMoney(o.price)} ${o.currency}` : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums" onClick={(e) => { if (quotesOf(o).length > 1) e.stopPropagation() }}>
                        {(() => {
                          const b = bestQuote(o)
                          const n = quotesOf(o).length
                          if (!b) return n ? <span className="text-slate-400">{n} {t('quote.noPrice')}</span> : '—'
                          return (
                            <div>
                              <span className="whitespace-nowrap">{fmtMoney(b.price)} {b.currency}</span>
                              <div className="text-[11.5px] text-slate-500">{b.carrier || '—'}</div>
                              {n > 1 && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); setOpenQ((x) => (x === o.id ? null : o.id)) }} className="mono-label mt-0.5 rounded-full border border-slate-300 px-2 py-0.5 text-[9px] text-slate-600 hover:bg-slate-100">{openQ === o.id ? '▲' : '▼'} {n} {t('quote.offers')}</button>
                              )}
                              {openQ === o.id && (
                                <div className="mt-1 space-y-0.5 rounded-lg bg-slate-50 p-2 text-left text-[12px]">
                                  {sortedQuotes(o).map((q, i) => (
                                    <div key={i} className="flex justify-between gap-3"><span className="text-slate-600">{q.carrier || '—'}{q.exchange ? ` · ${q.exchange}` : ''}{q.ext_id ? ` · ID ${q.ext_id}` : ''}</span><b className="whitespace-nowrap tabular-nums">{q.price ? `${fmtMoney(q.price)} ${q.currency}` : '—'}</b></div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums sm:table-cell">{(() => { const m = marginOf(o); return m == null ? '—' : <span className={m >= 0 ? 'font-medium text-emerald-700' : 'font-medium text-rose-600'}>{fmtMoney(m)} {o.currency}</span> })()}</td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums sm:table-cell">{r == null ? '—' : fmtMoney(r)}</td>
                      <td className="hidden px-3 py-3 lg:table-cell">{o.status && <span className={`mono-label inline-block rounded-full border px-2 py-0.5 text-[9px] ${OFFER_STYLE[o.status] || ''}`}>{o.status}</span>}</td>
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}><button title={t('cost.del')} onClick={() => remove(o)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
            {t('offer.laneCur')}
            <select className={sel} value={cur} onChange={(e) => setCur(e.target.value)}>{CURRENCIES.map((x) => <option key={x}>{x}</option>)}</select>
            <span className="text-[12px] text-slate-500">{t('offer.laneNote')}</span>
          </div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            {stats.length === 0 ? <p className="p-5 text-slate-500">{t('offer.laneNone')}</p> : (
              <table className="w-full text-left text-[13.5px]">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr><th className="px-3 py-2.5">{t('offer.route')}</th><th className="px-3 py-2.5">{t('offer.vehicle')}</th><th className="px-3 py-2.5 text-right">{t('offer.laneN')}</th>
                    <th className="px-3 py-2.5 text-right">{t('offer.laneAvg')}</th><th className="hidden px-3 py-2.5 text-right sm:table-cell">{t('offer.laneMin')}</th><th className="hidden px-3 py-2.5 text-right sm:table-cell">{t('offer.laneMax')}</th>
                    <th className="hidden px-3 py-2.5 text-right md:table-cell">{t('offer.laneAvgPrice')}</th><th className="hidden px-3 py-2.5 md:table-cell">{t('offer.laneLast')}</th></tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={`${s.from}${s.to}${s.vehicle}`} className="border-t border-slate-100">
                      <td className="px-3 py-3 font-medium text-navy-700">{s.from} → {s.to}</td>
                      <td className="px-3 py-3">{s.vehicle}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{s.n}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{fmtMoney(s.avg)}</td>
                      <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{fmtMoney(s.min)}</td>
                      <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{fmtMoney(s.max)}</td>
                      <td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">{fmtMoney(s.avgPrice)}</td>
                      <td className="hidden whitespace-nowrap px-3 py-3 md:table-cell">{fmtDate(s.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      <p className="mt-2 text-[12px] text-slate-500">{filtered.length} / {all.length} · {t('offer.hint')}</p>
      {shot && <ScreenshotModal onClose={() => setShot(false)} onRead={(form) => { setShot(false); setModal({ ...form, received_on: todayISO(), status: '' }) }} />}
      {delNode}
      {modal && <OfferModal known={known} initial={modal.id || modal._warnings ? modal : null} onClose={() => setModal(null)} onSaved={(_, keep) => { if (!keep) setModal(null); load() }} />}
      {file && <ImportModal file={file} existing={all} onClose={() => setFile(null)} onDone={(n) => { setFile(null); setMsg(`${t('offer.iDone')} ${n}.`); load() }} />}
    </div>
  )
}
