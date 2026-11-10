import { FEATURES } from '../config/features'
import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { backdrop } from '../lib/backdrop'
import ImportClientFormModal from '../components/ImportClientFormModal'
import { useLang } from '../i18n'
import { supabase, isDemo } from '../lib/supabase'
import { COUNTRIES } from '../lib/entities'
import { EUROPE, RO_COUNTIES } from '../lib/places'
import { fmtDate, normVendor, todayISO } from '../lib/format'
import { CloseX, SaveButtons, useFlash } from '../components/ModalChrome'
import { useDeleteReason } from '../components/ReasonModal'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const digits = (s) => String(s ?? '').replace(/\D/g, '')
const PLACE = 'Loading/unloading place'
const optionsOf = (f) => (f.options === 'COUNTRIES' ? COUNTRIES : f.options === 'EUROPE' ? EUROPE : f.options)

// Alertă pentru asigurarea CMR: expirată sau sub 30 de zile
export function cmrState(date) {
  if (!date) return null
  const days = Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${todayISO()}T00:00:00Z`)) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'soon'
  return null
}

function FormModal({ cfg, initial, rows, onClose, onSaved }) {
  const { lang, t } = useLang()
  const [f, setF] = useState(() => {
    const base = Object.fromEntries(cfg.fields.map((x) => [x.key, x.type === 'multi' || x.type === 'emails' ? [] : x.noBlank ? x.options[0] : (x.defaultValue ?? '')]))
    return { ...base, ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? base[k] ?? ''])), ...(cfg.fixed || {}) }
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [rid, setRid] = useState(initial?.id || null)
  const [flash, ping] = useFlash()
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const toggle = (k, v) => setF((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }))

  const dup = useMemo(() => {
    if (f.client_type === PLACE) return null
    const c = digits(f.cui)
    const n = normVendor(f.company)
    return rows.find((r) => r.id !== rid && ((c.length >= 6 && digits(r.cui) === c) || (n.length >= 4 && normVendor(r.company) === n)) && r.client_type !== PLACE)
  }, [f.cui, f.company, f.client_type, rows, rid])

  const save = async (exit = true) => {
    if (!String(f.company).trim()) return setErr(t('ent.needName'))
    const bad = (v) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())
    for (const x of cfg.fields) {
      if (x.requiredOnCreate && !initial?.id && !String(f[x.key] || '').trim()) return setErr(`${t('ent.needEmail')}`)
      if ((x.key === 'email' || x.key === 'billing_email') && String(f[x.key] || '').trim() && bad(f[x.key])) return setErr(`${t('ent.badEmail')}: ${f[x.key]}`)
      if (x.type === 'emails') { const b = (f[x.key] || []).find((v) => String(v).trim() && bad(v)); if (b) return setErr(`${t('ent.badEmail')}: ${b}`) }
    }
    setBusy(true)
    setErr('')
    try {
      const data = { ...f, ...(cfg.fixed || {}) }
      cfg.fields.forEach((x) => { if (x.asNumber && data[x.key] !== '') data[x.key] = Number(data[x.key]) })
      const r = await cfg.api.save(rid, data)
      if (r?.id) setRid(r.id)
      setBusy(false)
      if (exit) onSaved(r)
      else { onSaved(r, true); ping() }
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{initial?.id ? `${initial.code} · ${initial.company}` : cfg.newLabel[lang]}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {cfg.fields.filter((x) => !x.hidden && !(x.clientOnly && f.client_type === PLACE) && !(cfg.fixed && x.key in cfg.fixed)).map((x) => (
            <div key={x.key} className={x.wide ? 'sm:col-span-2' : ''}>
              {x.type === 'emails' ? (
                <div>
                  <div className="text-[12px] text-slate-600">{x.label[lang]}</div>
                  {(f[x.key] || []).map((v, i) => (
                    <div key={i} className="mt-1 flex gap-2">
                      <input type="email" className={input} value={v} onChange={(e) => setF((s) => ({ ...s, [x.key]: s[x.key].map((y, j) => (j === i ? e.target.value : y)) }))} />
                      <button type="button" onClick={() => setF((s) => ({ ...s, [x.key]: s[x.key].filter((_, j) => j !== i) }))} className="rounded px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setF((s) => ({ ...s, [x.key]: [...(s[x.key] || []), ''] }))} className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">{t('ent.addEmail')}</button>
                </div>
              ) : x.type === 'multi' ? (
                <div>
                  <div className="text-[12px] text-slate-600">{x.label[lang]}</div>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {x.options.map((o) => <label key={o} className="flex items-center gap-1.5 text-[13.5px] text-slate-700"><input type="checkbox" checked={f[x.key].includes(o)} onChange={() => toggle(x.key, o)} /> {o}</label>)}
                  </div>
                </div>
              ) : (
                <label className="block text-[12px] text-slate-600">{x.label[lang]}{(x.required || (x.requiredOnCreate && !initial?.id)) && ' *'}
                  {x.type === 'county' && f.country === 'RO' ? (
                    <select className={input} value={f[x.key] ?? ''} onChange={set(x.key)}><option value="">—</option>{RO_COUNTIES.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : x.type === 'select' ? (
                    <select className={input} value={f[x.key] ?? ''} onChange={set(x.key)}>
                      {!x.noBlank && <option value="">—</option>}
                      {optionsOf(x).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : x.type === 'textarea' ? (
                    <textarea rows={2} className={input} value={f[x.key] ?? ''} onChange={set(x.key)} />
                  ) : (
                    <input type={x.type === 'date' ? 'date' : 'text'} inputMode={x.type === 'number' ? 'decimal' : undefined} className={input} value={f[x.key] ?? ''} onChange={set(x.key)} />
                  )}
                </label>
              )}
            </div>
          ))}
        </div>
        {dup && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-[12.5px] text-amber-800">⚠ {t('ent.dup')} <b>{dup.code} · {dup.company}</b></p>}
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('exp.cancel')}</button>
          <SaveButtons busy={busy} onSave={save} flash={flash} />
        </div>
      </div>
    </div>
  )
}

export default function EntityPage({ cfg }) {
  const { lang, t } = useLang()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null)
  const [importForm, setImportForm] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [q, setQ] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fCountry, setFCountry] = useState('')
  const [fType, setFType] = useState('')
  const [sort, setSort] = useState({ key: 'code', dir: -1 })

  const load = () => cfg.api.list().then(setRows).catch((e) => setErr(e.message))
  useEffect(() => { setRows(null); setQ(''); setFStatus(''); setFCountry(''); setFType(''); load() }, [cfg.key])

  const col = (key) => cfg.fields.find((x) => x.key === key) || { key, label: { ro: 'Cod', en: 'Code' } }
  const terms = fold(q).split(/\s+/).filter(Boolean)
  const view = (rows || [])
    .filter((r) => !cfg.scope || cfg.scope(r))
    .filter((r) => { const hay = fold(Object.values(r).flat().join(' | ')); return terms.every((w) => hay.includes(w)) })
    .filter((r) => (!fStatus || r.status === fStatus) && (!fCountry || r.country === fCountry) && (!fType || (r.client_type || 'Client transport') === fType))
    .sort((a, b) => String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'ro', { numeric: true }) * sort.dir)
  const countries = [...new Set((rows || []).map((r) => r.country).filter(Boolean))].sort()
  const cmrAlerts = cfg.key === 'carriers' ? (rows || []).filter((r) => r.status !== 'Blocat' && cmrState(r.cmr_insurance_until)).length : 0

  const [confirmDel, delNode] = useDeleteReason()
  // Client/transportator folosit în curse sau comenzi nu se șterge (legăturile s-ar pierde): se marchează Inactiv / Blocat.
  const linkedCount = async (r) => {
    if (isDemo) return 0
    const carrier = cfg.key === 'carriers'
    const col = carrier ? 'carrier_id' : 'client_id'
    const q = (tbl) => supabase.from(tbl).select('id', { count: 'exact', head: true }).eq(col, r.id)
    const [a, b, c2] = await Promise.all([q('trips'), carrier ? q('transport_orders') : Promise.resolve({ count: 0 }), carrier ? Promise.resolve({ count: 0 }) : q('client_orders')])
    return (a.count || 0) + (b.count || 0) + (c2.count || 0)
  }
  const remove = async (r) => {
    const n = await linkedCount(r).catch(() => 0)
    if (n > 0) return setErr(`${r.code} · ${r.company}: ${lang === 'en' ? `used in ${n} trips/orders, cannot be deleted. Set the status to ${cfg.key === 'carriers' ? 'Blocked' : 'Inactive'} instead.` : `este folosit în ${n} curse/comenzi și nu poate fi șters. Setează statusul ${cfg.key === 'carriers' ? 'Blocat' : 'Inactiv'}.`}`)
    if (!(await confirmDel({ entity: cfg.table || cfg.key, id: r.id, code: `${r.code} · ${r.company}` }))) return
    await cfg.api.remove(r.id).catch((e) => setErr(e.message))
    load()
  }
  const cell = (r, key) => {
    const v = r[key]
    if (key === 'status') return <span className={`mono-label inline-block rounded-full border px-2.5 py-1 text-[9.5px] ${cfg.statusStyle[v] || ''}`}>{v}</span>
    if (key === 'client_type') return <span className={`mono-label inline-block rounded-full border px-2 py-0.5 text-[9px] ${v === PLACE ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>{v || 'Client transport'}</span>
    if (key === 'truck_types') return (v || []).join(', ')
    if (key === 'cmr_insurance_until') {
      const s = cmrState(v)
      return <span className={s === 'expired' ? 'font-medium text-rose-600' : s === 'soon' ? 'font-medium text-amber-600' : ''}>{fmtDate(v)}{s === 'expired' ? ` · ${t('ent.expired')}` : s === 'soon' ? ` · ${t('ent.soon')}` : ''}</span>
    }
    return v ?? ''
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {cfg.title[lang].toUpperCase()}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{cfg.title[lang]}</h1>
        <div className="flex flex-wrap gap-2">
          {FEATURES.clientFormImport && cfg.key === 'clients' && <button onClick={() => setImportForm(true)} className="rounded-lg border border-brand-500 bg-white px-4 py-2.5 text-[14px] font-medium text-brand-600 shadow-sm hover:bg-brand-500/10">⬆ {lang === 'en' ? 'Import client form' : 'Import formular client'}</button>}
          <button onClick={() => setModal({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {cfg.newLabel[lang]}</button>
        </div>
      </div>
      {FEATURES.clientFormImport && importForm && <ImportClientFormModal clients={rows || []} onClose={() => { setImportForm(false); load() }} onDone={() => load()} />}
      {err && <p className="mt-3 text-rose-600">{err}</p>}
      {cmrAlerts > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800">⚠ {cmrAlerts} {t('ent.cmrAlert')}</p>}

      <div className="mt-5"><input className={`${input} !py-2.5`} placeholder={t('ent.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select className={`${input} !w-auto`} value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">{t('exp.allStatuses')}</option>{cfg.statuses.map((s) => <option key={s}>{s}</option>)}</select>
        {cfg.fields.some((x) => x.key === 'client_type') && !cfg.fixed && <select className={`${input} !w-auto`} value={fType} onChange={(e) => setFType(e.target.value)}><option value="">{t('ent.allTypes')}</option>{cfg.fields.find((x) => x.key === 'client_type').options.map((s) => <option key={s}>{s}</option>)}</select>}
        <select className={`${input} !w-auto`} value={fCountry} onChange={(e) => setFCountry(e.target.value)}><option value="">{t('ent.allCountries')}</option>{countries.map((s) => <option key={s}>{s}</option>)}</select>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows === null ? <p className="p-5 text-slate-500">…</p> : view.length === 0 ? <p className="p-5 text-slate-500">{t('ent.none')}</p> : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                {cfg.columns.map((k) => (
                  <th key={k} className="cursor-pointer select-none px-3 py-2.5 hover:text-navy-800" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))}>
                    {col(k).label[lang]}{sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal(r)}>
                  {cfg.columns.map((k) => <td key={k} className={`px-3 py-3 ${k === 'code' ? 'whitespace-nowrap font-medium text-navy-700' : ''}`}>{cell(r, k)}</td>)}
                  <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}><button title={t('cost.del')} onClick={() => remove(r)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {delNode}
      {modal && <FormModal cfg={cfg} initial={modal.id ? modal : null} rows={rows || []} onClose={() => setModal(null)} onSaved={(_, keep) => { if (!keep) setModal(null); load() }} />}
    </div>
  )
}
