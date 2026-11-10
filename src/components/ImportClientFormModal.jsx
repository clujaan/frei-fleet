import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { backdrop } from '../lib/backdrop'
import { useLang } from '../i18n'
import { CLIENTS } from '../lib/entities'
import { TRIPS_API } from '../lib/trips'
import { bnrRateOrNull } from '../lib/bnr'
import { calcTripKm, canCalcTripKm } from '../lib/km'
import { buildDraft, readFormFields } from '../lib/clientForm'
import { suggestLdm } from '../lib/goods'
import { countryOptions } from '../lib/places'
import { foldText } from '../lib/costs'
import { normVendor } from '../lib/format'
import { CloseX } from './ModalChrome'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13.5px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const lbl = 'block text-[11.5px] text-slate-600'
const PLACE = 'Loading/unloading place'
const digits = (x) => String(x || '').replace(/\D/g, '').replace(/^0+/, '')

const T = {
  title: { ro: 'Import formular client', en: 'Import client form' },
  pick: { ro: 'Alege PDF-ul completat de client (formularul firmei)', en: 'Choose the PDF filled in by the client (company form)' },
  reading: { ro: 'Citesc formularul…', en: 'Reading the form…' },
  review: { ro: 'Verifică datele; poți corecta orice. Nu se salvează nimic până nu apeși „Creează”.', en: 'Check the data; you can correct anything. Nothing is saved until you press “Create”.' },
  client: { ro: 'CLIENT', en: 'CLIENT' },
  found: { ro: 'Client existent găsit', en: 'Existing client found' },
  useExisting: { ro: 'Folosesc clientul existent', en: 'Use the existing client' },
  createNew: { ro: 'Creez un client nou', en: 'Create a new client' },
  newClient: { ro: 'Client nou: se creează', en: 'New client will be created' },
  company: { ro: 'Firma', en: 'Company' }, cui: { ro: 'CUI', en: 'VAT ID' }, contact: { ro: 'Persoană de contact', en: 'Contact person' }, phone: { ro: 'Telefon', en: 'Phone' }, email: { ro: 'Email', en: 'Email' },
  terms: { ro: 'Termen de plată (zile)', en: 'Payment terms (days)' },
  makeTrip: { ro: 'Creez și cursa din datele formularului', en: 'Also create the trip from the form data' },
  load: { ro: 'ÎNCĂRCARE', en: 'LOADING' }, unload: { ro: 'DESCĂRCARE', en: 'UNLOADING' },
  street: { ro: 'Stradă și număr', en: 'Street and number' }, zip: { ro: 'Cod poștal', en: 'Postcode' }, city: { ro: 'Localitate', en: 'City' }, county: { ro: 'Județ', en: 'County' }, country: { ro: 'Țară', en: 'Country' },
  date: { ro: 'Data', en: 'Date' }, dateAlt: { ro: 'Data alternativă', en: 'Alternative date' }, window: { ro: 'Interval orar', en: 'Time window' }, ref: { ro: 'Referință', en: 'Reference' },
  goods: { ro: 'MARFĂ', en: 'GOODS' }, gtype: { ro: 'Se creează un rând de marfă: Europalet 120×80 (îl poți schimba apoi în cursă).', en: 'A goods row is created: Europallet 120×80 (you can change it later in the trip).' }, qty: { ro: 'Nr. paleți', en: 'No. of pallets' }, weight: { ro: 'Greutate (kg)', en: 'Weight (kg)' }, gdesc: { ro: 'Descriere marfă', en: 'Goods description' },
  price: { ro: 'Preț (venit cursă, fără TVA)', en: 'Price (trip revenue, excl. VAT)' }, currency: { ro: 'Moneda', en: 'Currency' }, service: { ro: 'Tip serviciu', en: 'Service type' },
  notes: { ro: 'Observații cursă', en: 'Trip notes' },
  savePlaces: { ro: 'Salvez adresele în „Adrese încărcare / descărcare” (dacă nu există)', en: 'Save the addresses in “Loading / unloading addresses” (if missing)' },
  dup: { ro: 'Atenție: există deja o cursă cu același client, aceeași încărcare și același preț', en: 'Warning: a trip with the same client, loading and price already exists' },
  dupAnyway: { ro: 'Creez cursa oricum', en: 'Create the trip anyway' },
  create: { ro: 'Creează', en: 'Create' }, cancel: { ro: 'Renunță', en: 'Cancel' }, close: { ro: 'Închide', en: 'Close' },
  needName: { ro: 'Completează numele firmei clientului.', en: 'Enter the client company name.' },
  needLoad: { ro: 'Pentru cursă completează data și localitatea încărcării.', en: 'For the trip, enter the loading date and city.' },
  aiNo: { ro: 'Adresele nu au putut fi împărțite automat; verifică-le cu atenție.', en: 'The addresses could not be split automatically; please check them carefully.' },
  done: { ro: 'Gata.', en: 'Done.' }, clientMade: { ro: 'Client creat', en: 'Client created' }, clientUsed: { ro: 'Client folosit', en: 'Client used' }, tripMade: { ro: 'Cursă creată', en: 'Trip created' }, placesMade: { ro: 'Adrese noi salvate', en: 'New addresses saved' },
  kmOk: { ro: 'Km calculați', en: 'Km calculated' }, kmNo: { ro: 'Km neimportați (completează-i în cursă)', en: 'Km not calculated (enter them in the trip)' },
  openTrips: { ro: 'Deschide Curse', en: 'Open Trips' },
}

function StopFields({ title, v, onChange, lang, countries }) {
  const up = (k) => (e) => onChange({ ...v, [k]: e.target.value })
  const L = (k) => T[k][lang]
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mono-label text-[10px] text-slate-500">{title}</div>
      <div className="mt-2 grid grid-cols-6 gap-2">
        <label className={`${lbl} col-span-6`}>{L('company')}<input className={input} value={v.company} onChange={up('company')} /></label>
        <label className={`${lbl} col-span-6`}>{L('street')}<input className={input} value={v.street} onChange={up('street')} /></label>
        <label className={`${lbl} col-span-2`}>{L('zip')}<input className={input} value={v.zip} onChange={up('zip')} /></label>
        <label className={`${lbl} col-span-4`}>{L('city')}<input className={input} value={v.city} onChange={up('city')} /></label>
        <label className={`${lbl} col-span-3`}>{L('county')}<input className={input} value={v.county} onChange={up('county')} /></label>
        <label className={`${lbl} col-span-3`}>{L('country')}<select className={input} value={v.country} onChange={up('country')}><option value="">—</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select></label>
        <label className={`${lbl} col-span-3`}>{L('contact')}<input className={input} value={v.contact} onChange={up('contact')} /></label>
        <label className={`${lbl} col-span-3`}>{L('phone')}<input className={input} value={v.phone} onChange={up('phone')} /></label>
        <label className={`${lbl} col-span-3`}>{L('date')}<input type="date" className={input} value={v.date} onChange={up('date')} /></label>
        <label className={`${lbl} col-span-3`}>{L('dateAlt')}<input type="date" className={input} value={v.date_alt} onChange={up('date_alt')} /></label>
        <label className={`${lbl} col-span-3`}>{L('window')}<input className={input} value={v.window} onChange={up('window')} /></label>
        <label className={`${lbl} col-span-3`}>{L('ref')}<input className={input} value={v.ref} onChange={up('ref')} /></label>
      </div>
    </div>
  )
}

export default function ImportClientFormModal({ clients, onClose, onDone }) {
  const { lang } = useLang()
  const L = (k) => T[k][lang]
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [d, setD] = useState(null)
  const [trips, setTrips] = useState([])
  const [useExisting, setUseExisting] = useState(true)
  const [makeTrip, setMakeTrip] = useState(true)
  const [savePlaces, setSavePlaces] = useState(true)
  const [dupOk, setDupOk] = useState(false)
  const [result, setResult] = useState(null)
  const countries = useMemo(() => countryOptions(lang), [lang])

  useEffect(() => { TRIPS_API.list().then(setTrips).catch(() => {}) }, [])
  useEffect(() => { fileRef.current?.click() }, [])

  const onFile = async (file) => {
    if (!file) return
    setBusy(true); setErr('')
    try {
      const fields = await readFormFields(file)
      setD(await buildDraft(fields))
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const realClients = useMemo(() => (clients || []).filter((c) => (c.client_type || 'Client transport') !== PLACE), [clients])
  const match = useMemo(() => {
    if (!d) return null
    const c = digits(d.client.cui)
    const n = normVendor(d.client.company)
    return realClients.find((r) => (c.length >= 6 && digits(r.cui) === c) || (n.length >= 4 && normVendor(r.company) === n)) || null
  }, [d, realClients])

  const dup = useMemo(() => {
    if (!d || !match || !makeTrip) return null
    return trips.find((t) => t.client_id === match.id && t.load_date === d.load.date && foldText(t.load_city) === foldText(d.load.city) && Number(t.revenue) === Number(d.price)) || null
  }, [d, match, trips, makeTrip])

  const setC = (k) => (e) => setD((s) => ({ ...s, client: { ...s.client, [k]: e.target.value } }))
  const setG = (k) => (e) => setD((s) => ({ ...s, goods: { ...s.goods, [k]: e.target.value } }))

  const create = async () => {
    if (!d.client.company.trim()) return setErr(L('needName'))
    if (makeTrip && (!d.load.date || !d.load.city.trim())) return setErr(L('needLoad'))
    setBusy(true); setErr('')
    const res = { client: null, clientNew: false, trip: null, places: 0, km: null }
    try {
      let client = match && useExisting ? match : null
      if (!client) {
        client = await CLIENTS.api.save(null, {
          company: d.client.company.trim(), cui: d.client.cui.trim(), contact_name: d.client.contact_name.trim(), phone: d.client.phone.trim(), email: d.client.email.trim(),
          payment_terms_days: d.client.payment_terms_days === '' ? null : Number(d.client.payment_terms_days), client_type: 'Client transport', status: 'Activ',
        })
        res.clientNew = true
      }
      res.client = client
      if (savePlaces) {
        const existing = (clients || []).filter((c) => c.client_type === PLACE)
        for (const st of [d.load, d.unload]) {
          const name = st.company.trim() || st.city.trim()
          if (!name || !st.city.trim()) continue
          const key = foldText(`${st.company} ${st.street} ${st.city}`).replace(/\s+/g, '')
          if (existing.some((p) => foldText(`${p.company} ${p.address} ${p.city}`).replace(/\s+/g, '') === key)) continue
          await CLIENTS.api.save(null, { company: name, address: st.street.trim(), zip: st.zip.trim(), city: st.city.trim(), county: st.county.trim(), country: st.country, contact_name: st.contact.trim(), phone: st.phone.trim(), client_type: PLACE, status: 'Activ' })
          res.places += 1
        }
      }
      if (makeTrip) {
        const g = { type: 'euro', qty: d.goods.qty, dims: '120×80', weight: d.goods.weight, ldm: '', ldmManual: false, vol: '', desc: d.goods.desc }
        g.ldm = suggestLdm(g)
        const trip = {
          client_id: client.id, service_type: d.service_type, status: 'Planificată',
          load_date: d.load.date, load_date_alt: d.load.date_alt || null, load_window: d.load.window, load_ref: d.load.ref,
          load_company: d.load.company, load_street: d.load.street, load_zip: d.load.zip, load_city: d.load.city, load_county: d.load.county, load_country: d.load.country, load_contact: d.load.contact, load_phone: d.load.phone,
          unload_date: d.unload.date || null, unload_date_alt: d.unload.date_alt || null, unload_window: d.unload.window, unload_ref: d.unload.ref,
          unload_company: d.unload.company, unload_street: d.unload.street, unload_zip: d.unload.zip, unload_city: d.unload.city, unload_county: d.unload.county, unload_country: d.unload.country, unload_contact: d.unload.contact, unload_phone: d.unload.phone,
          load_goods: d.goods.weight || d.goods.qty ? [g] : [], unload_goods: [], extra_loads: [], extra_unloads: [],
          revenue: d.price === '' ? null : Number(String(d.price).replace(',', '.')), revenue_currency: d.currency, cost: null, cost_currency: d.currency, notes: d.notes,
        }
        const fx = await bnrRateOrNull(trip.load_date).catch(() => null)
        if (fx?.rate) trip.fx_rate = fx.rate
        if (canCalcTripKm(trip)) { try { trip.km = await calcTripKm(trip); res.km = true } catch { res.km = false } }
        res.trip = await TRIPS_API.save(null, trip)
      }
      setResult(res)
      onDone?.(res)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{L('title')}</h2>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
        {!d && !busy && !result && (
          <div className="mt-4">
            <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-brand-500 px-4 py-2.5 text-[14px] font-medium text-brand-600 hover:bg-brand-500/10">⬆ {L('pick')}</button>
          </div>
        )}
        {busy && !d && <p className="mt-4 text-slate-500">{L('reading')}</p>}
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}

        {result && (
          <div className="mt-4 space-y-2 rounded-xl bg-emerald-50 p-4 text-[14px] text-emerald-900">
            <b>{L('done')}</b>
            <div>{result.clientNew ? L('clientMade') : L('clientUsed')}: <b>{result.client.code} · {result.client.company}</b></div>
            {result.places > 0 && <div>{L('placesMade')}: {result.places}</div>}
            {result.trip && <div>{L('tripMade')}: <b>{result.trip.code}</b>{result.km === true ? ` · ${L('kmOk')}: ${result.trip.km} km` : result.km === false ? ` · ${L('kmNo')}` : ''}</div>}
            <div className="flex gap-3 pt-2">
              {result.trip && <Link to="/curse" className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600">{L('openTrips')}</Link>}
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-700 hover:bg-white">{L('close')}</button>
            </div>
          </div>
        )}

        {d && !result && (
          <>
            <p className="mt-1 text-[12.5px] text-slate-600">{L('review')}</p>
            {!d.aiUsed && (d.load.rawAddress || d.unload.rawAddress) && !d.load.city && <p className="mt-1 text-[12.5px] text-amber-700">⚠ {L('aiNo')}</p>}

            <div className="mt-3 rounded-xl border border-slate-200 p-3">
              <div className="mono-label text-[10px] text-slate-500">{L('client')}</div>
              {match
                ? (
                  <div className="mt-2 rounded-lg bg-sky-50 p-2 text-[13px] text-sky-900">
                    {L('found')}: <b>{match.code} · {match.company}</b>
                    <div className="mt-1 flex gap-4">
                      <label className="flex items-center gap-1.5"><input type="radio" checked={useExisting} onChange={() => setUseExisting(true)} /> {L('useExisting')}</label>
                      <label className="flex items-center gap-1.5"><input type="radio" checked={!useExisting} onChange={() => setUseExisting(false)} /> {L('createNew')}</label>
                    </div>
                  </div>
                )
                : <p className="mt-1 text-[12.5px] text-emerald-700">✓ {L('newClient')}</p>}
              <div className="mt-2 grid grid-cols-6 gap-2">
                <label className={`${lbl} col-span-6 sm:col-span-4`}>{L('company')}<input className={input} value={d.client.company} onChange={setC('company')} disabled={!!match && useExisting} /></label>
                <label className={`${lbl} col-span-6 sm:col-span-2`}>{L('cui')}<input className={input} value={d.client.cui} onChange={setC('cui')} disabled={!!match && useExisting} /></label>
                <label className={`${lbl} col-span-6 sm:col-span-2`}>{L('contact')}<input className={input} value={d.client.contact_name} onChange={setC('contact_name')} disabled={!!match && useExisting} /></label>
                <label className={`${lbl} col-span-3 sm:col-span-2`}>{L('phone')}<input className={input} value={d.client.phone} onChange={setC('phone')} disabled={!!match && useExisting} /></label>
                <label className={`${lbl} col-span-3 sm:col-span-2`}>{L('email')}<input className={input} value={d.client.email} onChange={setC('email')} disabled={!!match && useExisting} /></label>
                <label className={`${lbl} col-span-6 sm:col-span-2`}>{L('terms')}<input inputMode="numeric" className={input} value={d.client.payment_terms_days} onChange={setC('payment_terms_days')} disabled={!!match && useExisting} /></label>
              </div>
            </div>

            <label className="mt-3 flex items-center gap-2 text-[14px] font-medium text-navy-800"><input type="checkbox" checked={makeTrip} onChange={(e) => setMakeTrip(e.target.checked)} /> {L('makeTrip')}</label>

            {makeTrip && (
              <div className="mt-2 space-y-3">
                <StopFields title={L('load')} v={d.load} onChange={(v) => setD((s) => ({ ...s, load: v }))} lang={lang} countries={countries} />
                <StopFields title={L('unload')} v={d.unload} onChange={(v) => setD((s) => ({ ...s, unload: v }))} lang={lang} countries={countries} />
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="mono-label text-[10px] text-slate-500">{L('goods')}</div>
                  <div className="mt-2 grid grid-cols-6 gap-2">
                    <label className={`${lbl} col-span-6 sm:col-span-3`}>{L('gdesc')}<input className={input} value={d.goods.desc} onChange={setG('desc')} /></label>
                    <label className={`${lbl} col-span-3 sm:col-span-1`}>{L('qty')}<input inputMode="numeric" className={input} value={d.goods.qty} onChange={setG('qty')} /></label>
                    <label className={`${lbl} col-span-3 sm:col-span-2`}>{L('weight')}<input inputMode="decimal" className={input} value={d.goods.weight} onChange={setG('weight')} /></label>
                    <label className={`${lbl} col-span-3`}>{L('price')}<input inputMode="decimal" className={input} value={d.price} onChange={(e) => setD((s) => ({ ...s, price: e.target.value }))} /></label>
                    <label className={`${lbl} col-span-3 sm:col-span-1`}>{L('currency')}<select className={input} value={d.currency} onChange={(e) => setD((s) => ({ ...s, currency: e.target.value }))}><option>EUR</option><option>RON</option></select></label>
                    <label className={`${lbl} col-span-6 sm:col-span-2`}>{L('service')}<select className={input} value={d.service_type} onChange={(e) => setD((s) => ({ ...s, service_type: e.target.value }))}>{['FTL intern', 'FTL internațional', 'LTL intern', 'LTL internațional'].map((x) => <option key={x}>{x}</option>)}</select></label>
                    <label className={`${lbl} col-span-6`}>{L('notes')}<textarea rows={4} className={input} value={d.notes} onChange={(e) => setD((s) => ({ ...s, notes: e.target.value }))} /></label>
                  </div>
                  <p className="mt-1 text-[11.5px] text-slate-500">{L('gtype')}</p>
                </div>
              </div>
            )}

            <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" checked={savePlaces} onChange={(e) => setSavePlaces(e.target.checked)} /> {L('savePlaces')}</label>
            {dup && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">
                ⚠ {L('dup')} (<b>{dup.code}</b>).
                <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={dupOk} onChange={(e) => setDupOk(e.target.checked)} /> {L('dupAnyway')}</label>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{L('cancel')}</button>
              <button disabled={busy || (!!dup && !dupOk)} onClick={create} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">{busy ? '…' : L('create')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
