import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useRef, useState } from 'react'
import { backdrop } from '../lib/backdrop'
import { Link } from 'react-router-dom'
import { useLang } from '../i18n'
import { costsApi } from '../lib/costsApi'
import { AMORT_THRESHOLD, CATEGORIES, COST_TYPES, TYPE_STYLE, VAT_RATES, calcCost, checkCost, foldText, mondayOf, searchHaystack } from '../lib/costs'
import { fmtDate, fmtMoney, parseNum, todayISO } from '../lib/format'
import { importInvoices } from '../lib/importInvoice'
import { fetchBnrRate } from '../lib/bnr'
import ImportReportModal from '../components/ImportReportModal'
import { weeksOfMonth } from '../lib/pl'
import { CloseX, SaveButtons, useFlash } from '../components/ModalChrome'
import { useDeleteReason } from '../components/ReasonModal'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const sel = `${input} !w-auto`

export function TypeChip({ type }) {
  return <span className={`mono-label inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[9.5px] ${TYPE_STYLE[type] || ''}`}>{type}</span>
}

const EMPTY = {
  description: '', category: 'Altele', cost_type: 'Unic - one time cost', vendor: '', doc_no: '', doc_date: '', amount_gross: '', currency: 'RON', fx_rate: '',
  vat_rate: 0.21, vat_amount: '', vat_deductible: true, start_on: todayISO(), period_unit: 'Luni', period_count: 12, end_on: '', notes: '',
  expense_report_id: null, expense_item_id: null,
}

function CostModal({ initial, onClose, onSaved, draft, queueInfo, onSkip }) {
  const { t } = useLang()
  const [f, setF] = useState(() => ({ ...EMPTY, ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? EMPTY[k] ?? ''])) }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [docs, setDocs] = useState([])
  const [newFiles, setNewFiles] = useState(() => draft?.files || [])
  const [rid, setRid] = useState(initial?.id || null)
  const [flash, ping] = useFlash()
  useEffect(() => {
    if (initial?.id) costsApi.listFiles(initial.id).then(setDocs).catch(() => {})
  }, [initial?.id])
  const openDoc = async (d) => {
    const url = await costsApi.fileUrl(d)
    if (url) window.open(url, '_blank')
    else setErr(t('exp.demoFile'))
  }
  const dropDoc = async (d) => {
    await costsApi.deleteFile(d).catch((e) => setErr(e.message))
    setDocs((x) => x.filter((y) => y.id !== d.id))
  }
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  // Curs BNR din data documentului (altfel data de start); se completează singur, dar rămâne editabil
  const [fxMsg, setFxMsg] = useState('')
  const fxTouched = useRef(false)
  const fxAuto = useRef(false)
  const fxDate = f.doc_date || f.start_on
  const bnr = async (manual) => {
    if (!fxDate) return setFxMsg(t('cost.fxNoDate'))
    setFxMsg('…')
    try {
      const r = await fetchBnrRate(fxDate)
      fxAuto.current = true
      if (manual) fxTouched.current = false
      setF((s) => ({ ...s, fx_rate: String(r.rate) }))
      setFxMsg(r.source === 'ECB' ? `${t('cost.ecbNote')} ${fmtDate(r.date)}` : `${t('trip.bnr')} ${fmtDate(r.date)}`)
    } catch (e) {
      setFxMsg(e.message)
    }
  }
  useEffect(() => {
    if (fxTouched.current || !fxDate) return
    if (f.fx_rate && !fxAuto.current) return // curs existent (introdus manual sau din factură)
    bnr(false)
  }, [fxDate])

  const model = { ...f, amount_gross: parseNum(f.amount_gross) || 0, fx_rate: parseNum(f.fx_rate) || 0, vat_amount: parseNum(f.vat_amount) || 0, vat_rate: Number(f.vat_rate), period_count: Number(f.period_count) || 0 }
  const calc = calcCost(model)
  const warns = checkCost(model, calc)
  const blocking = warns.filter((w) => ['desc', 'amount', 'start', 'fx', 'endBeforeStart'].includes(w))
  const recurrent = f.cost_type === 'Recurent lunar' || f.cost_type === 'Recurent anual'

  const save = async (exit = true) => {
    if (blocking.length) return setErr(t(`cost.w_${blocking[0]}`))
    setBusy(true)
    setErr('')
    try {
      const saved = await costsApi.save(rid, { ...f, ...model, vat_amount: model.vat_amount || null, vat_rate: f.vat_amount ? null : model.vat_rate, fx_rate: model.fx_rate || null })
      for (const file of newFiles) await costsApi.uploadFile(saved, file).catch((e) => { throw new Error(`${file.name}: ${e.message}`) })
      if (saved?.id) setRid(saved.id)
      setNewFiles([])
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold text-navy-800">{initial?.id ? `${t('cost.edit')} ${initial.code}` : t('cost.new')}</h2>
          {initial?.report_code && <Link to={`/deconturi/${initial.expense_report_id}`} className="mono-label text-[10px] text-brand-600 hover:underline">{t('cost.fromReport')} {initial.report_code} ↗</Link>}
        </div>

        {queueInfo && <p className="mono-label mt-1 text-[10px] text-brand-600">{t('cost.importing')} {queueInfo} · {draft?.name}</p>}
        {draft?.duplicate && <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-700">⚠ {t('cost.dupFound')} <b>{draft.duplicate.code}</b> ({t(`cost.dup_${draft.duplicate.reason}`)}).</p>}
        {draft?.warnings?.map((w, i) => <p key={i} className="mt-2 text-[12.5px] text-amber-700">⚠ {w}</p>)}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-[12px] text-slate-600 sm:col-span-2">{t('cost.description')}
            <input className={input} value={f.description} onChange={set('description')} autoFocus />
          </label>
          <label className="block text-[12px] text-slate-600">{t('cost.category')}
            <select className={input} value={f.category || 'Altele'} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="block text-[12px] text-slate-600">{t('cost.type')}
            <select className={input} value={f.cost_type} onChange={set('cost_type')}>{COST_TYPES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="block text-[12px] text-slate-600">{t('cost.vendor')}
            <input className={input} value={f.vendor} onChange={set('vendor')} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12px] text-slate-600">{t('cost.docNo')}
              <input className={input} value={f.doc_no} onChange={set('doc_no')} />
            </label>
            <label className="block text-[12px] text-slate-600">{t('cost.docDate')}
              <input type="date" className={input} value={f.doc_date} onChange={set('doc_date')} />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <label className="col-span-2 block text-[12px] text-slate-600">{t('cost.amount')}
              <input inputMode="decimal" className={input} value={f.amount_gross} onChange={set('amount_gross')} placeholder="0,00" />
            </label>
            <label className="block text-[12px] text-slate-600">{t('cost.currency')}
              <select className={input} value={f.currency} onChange={set('currency')}><option>RON</option><option>EUR</option></select>
            </label>
          </div>
          <div>
            <div className="flex items-end gap-2">
              <label className="block flex-1 text-[12px] text-slate-600">{t('cost.fx')}
                <input inputMode="decimal" className={input} value={f.fx_rate} onChange={(e) => { fxTouched.current = true; set('fx_rate')(e) }} placeholder="5,0000" />
              </label>
              <button type="button" onClick={() => bnr(true)} className="rounded-lg border border-brand-500 px-3 py-2 text-[13px] text-brand-600 hover:bg-brand-500/10">{t('trip.bnrBtn')}</button>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">{fxMsg || (f.currency === 'EUR' ? '' : t('cost.fxRonHint'))}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12px] text-slate-600">{t('cost.vatRate')}
              <select className={input} value={f.vat_rate ?? 0.21} onChange={set('vat_rate')} disabled={!!parseNum(f.vat_amount)}>
                {VAT_RATES.map((r) => <option key={r} value={r}>{Math.round(r * 100)}%</option>)}
              </select>
            </label>
            <label className="block text-[12px] text-slate-600">{t('cost.vatAmount')}
              <input inputMode="decimal" className={input} value={f.vat_amount} onChange={set('vat_amount')} placeholder={t('cost.vatAuto')} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-slate-700 sm:col-span-2">
            <input type="checkbox" checked={f.vat_deductible !== false} onChange={set('vat_deductible')} /> {t('cost.vatDeductible')}
          </label>

          <label className="block text-[12px] text-slate-600">{recurrent ? t('cost.startRec') : t('cost.start')}
            <input type="date" className={input} value={f.start_on} onChange={set('start_on')} />
          </label>
          {f.cost_type === 'Unic - amortizat' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[12px] text-slate-600">{t('cost.periodCount')}
                <input type="number" min="1" className={input} value={f.period_count} onChange={set('period_count')} />
              </label>
              <label className="block text-[12px] text-slate-600">{t('cost.periodUnit')}
                <select className={input} value={f.period_unit || 'Luni'} onChange={set('period_unit')}><option>Luni</option><option>Săptămâni</option></select>
              </label>
            </div>
          )}
          {recurrent && (
            <label className="block text-[12px] text-slate-600">{t('cost.end')}
              <input type="date" className={input} value={f.end_on} onChange={set('end_on')} />
            </label>
          )}
          <label className="block text-[12px] text-slate-600 sm:col-span-2">{t('cost.notes')}
            <textarea rows={2} className={input} value={f.notes} onChange={set('notes')} />
          </label>
          <div className="sm:col-span-2">
            <div className="text-[12px] text-slate-600">{t('cost.files')}</div>
            <ul className="mt-1 space-y-1 text-[13px]">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-2"><button type="button" onClick={() => openDoc(d)} className="truncate text-brand-600 hover:underline">{d.filename}</button><button type="button" onClick={() => dropDoc(d)} className="text-slate-400 hover:text-rose-600">✕</button></li>
              ))}
              {newFiles.map((file, i) => (
                <li key={i} className="flex items-center gap-2 text-slate-600"><span className="truncate">{file.name}</span><span className="text-[11px] text-slate-400">({t('cost.onSave')})</span><button type="button" onClick={() => setNewFiles((x) => x.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600">✕</button></li>
              ))}
            </ul>
            <label className="mt-1 inline-block cursor-pointer text-[12.5px] text-brand-600 hover:underline">＋ {t('cost.addFile')}
              <input type="file" multiple accept=".pdf,.xml,.zip,image/*" className="hidden" onChange={(e) => { setNewFiles((x) => [...x, ...Array.from(e.target.files)]); e.target.value = '' }} />
            </label>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-[12.5px] text-slate-600 sm:grid-cols-4">
          <div>{t('cost.pVat')}<b className="block text-[15px] text-navy-800">{fmtMoney(calc.vat)} {f.currency}</b></div>
          <div>{t('cost.pNet')}<b className="block text-[15px] text-navy-800">{fmtMoney(calc.net)} {f.currency}</b></div>
          <div>{t('cost.pWeeks')}<b className="block text-[15px] text-navy-800">{recurrent ? (f.end_on ? '…' : '∞') : calc.weeks || '—'}</b></div>
          <div>{t('cost.pPerWeek')}<b className="block text-[15px] text-navy-800">{fmtMoney(calc.perWeekRon)} RON</b></div>
        </div>
        {calc.firstWeek && <p className="mt-2 text-[12px] text-slate-500">{t('cost.pFrom')} {fmtDate(calc.firstWeek)}{calc.lastWeek && calc.lastWeek !== '2099-12-31' ? ` → ${fmtDate(calc.lastWeek)}` : ''}</p>}
        {warns.filter((w) => !blocking.includes(w)).map((w) => <p key={w} className="mt-1 text-[12.5px] text-amber-700">⚠ {t(`cost.w_${w}`).replace('{n}', AMORT_THRESHOLD)}</p>)}
        {err && <p className="mt-2 text-[13px] text-rose-600">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {onSkip && <button onClick={onSkip} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('cost.skip')}</button>}
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('exp.cancel')}</button>
          <SaveButtons busy={busy} onSave={save} flash={flash} />
        </div>
      </div>
    </div>
  )
}

const SORTS = {
  start_on: (a, b) => String(a.c.start_on).localeCompare(String(b.c.start_on)),
  code: (a, b) => a.c.code.localeCompare(b.c.code, 'en', { numeric: true }),
  description: (a, b) => foldText(a.c.description).localeCompare(foldText(b.c.description)),
  category: (a, b) => String(a.c.category).localeCompare(String(b.c.category)),
  cost_type: (a, b) => String(a.c.cost_type).localeCompare(String(b.c.cost_type)),
  net: (a, b) => a.calc.netRon - b.calc.netRon,
  perWeek: (a, b) => a.calc.perWeekRon - b.calc.perWeekRon,
}

export default function Cheltuieli() {
  const { t } = useLang()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null) // null | {} (nou) | rând (modificare)
  const [queue, setQueue] = useState([]) // drafturi de facturi importate, confirmate pe rând
  const [importing, setImporting] = useState(false)
  const [reportFile, setReportFile] = useState(null)
  const [importMsg, setImportMsg] = useState('')
  const [q, setQ] = useState('')
  const [fCat, setFCat] = useState('')
  const [fType, setFType] = useState('')
  const [fMonth, setFMonth] = useState('')
  const [fCur, setFCur] = useState('')
  const [fVat, setFVat] = useState('')
  const [fSrc, setFSrc] = useState('')
  const [fWarn, setFWarn] = useState(false)
  const [sort, setSort] = useState({ key: 'code', dir: -1 })

  const load = () => costsApi.list().then(setRows).catch((e) => setErr(e.message))
  useEffect(() => {
    load()
  }, [])

  const enriched = useMemo(() => (rows || []).map((c) => {
    const calc = calcCost(c)
    return { c, calc, warns: checkCost(c, calc), hay: searchHaystack(c, calc, c.report_code) }
  }), [rows])

  const months = useMemo(() => [...new Set(enriched.map((e) => String(e.c.start_on).slice(0, 7)))].sort().reverse(), [enriched])
  const terms = foldText(q).split(/\s+/).filter(Boolean)
  const filtered = enriched
    .filter((e) => terms.every((w) => e.hay.includes(w)))
    .filter((e) => (!fCat || e.c.category === fCat) && (!fType || e.c.cost_type === fType) && (!fMonth || String(e.c.start_on).startsWith(fMonth)) && (!fCur || e.c.currency === fCur))
    .filter((e) => !fVat || (fVat === 'da' ? e.c.vat_deductible !== false : e.c.vat_deductible === false))
    .filter((e) => !fSrc || (fSrc === 'decont' ? !!e.c.expense_report_id : !e.c.expense_report_id))
    .filter((e) => !fWarn || e.warns.length > 0)
    .sort((a, b) => SORTS[sort.key](a, b) * sort.dir)

  const sum = (fn) => filtered.reduce((s, e) => s + fn(e), 0)
  const thisMonday = mondayOf(todayISO())
  // cost alocat pe săptămâna curentă (toate rândurile, nu doar cele filtrate)
  const weekNow = enriched.reduce((s, e) => s + (e.calc.firstWeek && e.calc.firstWeek <= thisMonday && e.calc.lastWeek >= thisMonday ? e.calc.perWeekRon : 0), 0)
  // cost alocat în luna curentă: suma costului pe săptămână pentru săptămânile (ISO) cu joia în luna asta
  const monthWeeks = weeksOfMonth(todayISO().slice(0, 7))
  const monthNow = enriched.reduce((s, e) => s + (e.calc.firstWeek ? monthWeeks.reduce((a, w) => a + (w.monday >= e.calc.firstWeek && w.monday <= e.calc.lastWeek ? e.calc.perWeekRon : 0), 0) : 0), 0)
  const warnCount = enriched.filter((e) => e.warns.length).length
  const noFx = enriched.filter((e) => !(Number(e.c.fx_rate) > 0))
  const hasFilters = q || fCat || fType || fMonth || fCur || fVat || fSrc || fWarn
  const clear = () => { setQ(''); setFCat(''); setFType(''); setFMonth(''); setFCur(''); setFVat(''); setFSrc(''); setFWarn(false) }

  const th = (key, label, cls = '') => (
    <th className={`cursor-pointer select-none px-3 py-2.5 hover:text-navy-800 ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
      {label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const afterSave = async (saved) => {
    const closed = await costsApi.closePrevious(saved, rows || []).catch(() => [])
    if (closed.length) setImportMsg(`${t('cost.closed')} ${closed.join(', ')} (${t('cost.closedAt')} ${fmtDate(saved.start_on)}).`)
    load()
  }
  const onSaved = (saved, keep) => { if (!keep) setModal(null); afterSave(saved) }
  const onQueueSaved = (saved, keep) => { if (!keep) setQueue((x) => x.slice(1)); afterSave(saved) }
  const pickInvoices = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setImporting(true)
    setImportMsg('')
    try {
      const { drafts, errors } = await importInvoices(files, rows || [])
      setQueue(drafts)
      if (errors.length) setImportMsg(errors.join(' · '))
    } finally {
      setImporting(false)
    }
  }
  const [confirmDel, delNode] = useDeleteReason()
  const remove = async (c) => {
    if (!(await confirmDel({ entity: 'general_costs', id: c.id, code: c.code }))) return
    await costsApi.remove(c.id).catch((e) => setErr(e.message))
    load()
  }
  const [fxBusy, setFxBusy] = useState(false)
  const fillFx = async () => {
    setFxBusy(true)
    setImportMsg('')
    try {
      const { done, failed, error } = await costsApi.fillMissingFx(noFx.map((e) => e.c))
      setImportMsg(`${t('cost.fxDone')} ${done.length}.${failed.length ? ` ${t('cost.fxFailed')} ${failed.join(', ')}. ${error}` : ''}`)
      load()
    } finally {
      setFxBusy(false)
    }
  }
  const next = async (c) => {
    try {
      await costsApi.nextMonth(c)
      load()
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {t('nav.costs').toUpperCase()}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{t('nav.costs')}</h1>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[14px] font-medium text-navy-800 shadow-sm hover:bg-slate-50">
            ⬆ {t('cost.importXls')}
            <input type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={(e) => { setReportFile(e.target.files[0] || null); e.target.value = '' }} />
          </label>
          <label className={`cursor-pointer rounded-lg border border-brand-500 bg-white px-4 py-2.5 text-[14px] font-medium text-brand-600 shadow-sm hover:bg-brand-500/10 ${importing ? 'pointer-events-none opacity-60' : ''}`}>
            {importing ? t('cost.importBusy') : `⬆ ${t('cost.import')}`}
            <input type="file" multiple accept=".pdf,.xml,.zip,image/*" className="hidden" onChange={pickInvoices} />
          </label>
          {noFx.length > 0 && (
            <button disabled={fxBusy} onClick={fillFx} className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5 text-[14px] font-medium text-amber-800 shadow-sm hover:bg-amber-100 disabled:opacity-60">
              {fxBusy ? t('cost.fxBusy') : `${t('cost.fxFill')} (${noFx.length})`}
            </button>
          )}
          <button onClick={() => setModal({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {t('cost.new')}</button>
        </div>
      </div>
      {importMsg && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800">{importMsg}</p>}
      {err && <p className="mt-3 text-rose-600">{err}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mono-label text-[10px] text-slate-500">{t('cost.kWeek')}</div>
          <div className="mt-1 text-[24px] font-semibold text-navy-800">{fmtMoney(weekNow)} <span className="text-[13px] font-normal text-slate-500">RON</span></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mono-label text-[10px] text-slate-500">{t('cost.kMonth')}</div>
          <div className="mt-1 text-[24px] font-semibold text-navy-800">{fmtMoney(monthNow)} <span className="text-[13px] font-normal text-slate-500">RON</span></div>
          <div className="text-[11px] text-slate-500">{monthWeeks.length} {t('cost.kMonthWeeks')}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mono-label text-[10px] text-slate-500">{t('cost.kEntries')}</div>
          <div className="mt-1 text-[24px] font-semibold text-navy-800">{enriched.length}</div>
        </div>
        <button onClick={() => setFWarn((v) => !v)} className={`rounded-xl border p-4 text-left shadow-sm ${fWarn ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="mono-label text-[10px] text-slate-500">{t('cost.kWarn')}</div>
          <div className={`mt-1 text-[24px] font-semibold ${warnCount ? 'text-amber-600' : 'text-navy-800'}`}>{warnCount}</div>
        </button>
      </div>

      <div className="mt-6">
        <input className={`${input} !py-2.5`} placeholder={t('cost.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select className={sel} value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">{t('cost.allCats')}</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select className={sel} value={fType} onChange={(e) => setFType(e.target.value)}><option value="">{t('cost.allTypes')}</option>{COST_TYPES.map((c) => <option key={c}>{c}</option>)}</select>
        <select className={sel} value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">{t('exp.allMonths')}</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
        <select className={sel} value={fCur} onChange={(e) => setFCur(e.target.value)}><option value="">{t('cost.allCur')}</option><option>RON</option><option>EUR</option></select>
        <select className={sel} value={fVat} onChange={(e) => setFVat(e.target.value)}><option value="">{t('cost.allVat')}</option><option value="da">{t('cost.vatYes')}</option><option value="nu">{t('cost.vatNo')}</option></select>
        <select className={sel} value={fSrc} onChange={(e) => setFSrc(e.target.value)}><option value="">{t('cost.allSrc')}</option><option value="decont">{t('cost.srcReport')}</option><option value="manual">{t('cost.srcManual')}</option></select>
        {hasFilters && <button onClick={clear} className="rounded-lg px-3 py-2 text-[13px] text-brand-600 hover:bg-brand-500/10">{t('cost.clear')}</button>}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows === null ? <p className="p-5 text-slate-500">…</p> : filtered.length === 0 ? <p className="p-5 text-slate-500">{t('cost.none')}</p> : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                {th('code', t('cost.code'))}{th('start_on', t('cost.start'))}{th('description', t('cost.description'))}
                {th('category', t('cost.category'), 'hidden md:table-cell')}{th('cost_type', t('cost.type'))}
                {th('net', t('cost.pNetRon'), 'text-right')}{th('perWeek', t('cost.pPerWeek'), 'text-right hidden sm:table-cell')}<th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ c, calc, warns }) => (
                <tr key={c.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal(c)}>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-navy-700">{c.code}</td>
                  <td className="whitespace-nowrap px-3 py-3">{fmtDate(c.start_on)}</td>
                  <td className="px-3 py-3">
                    {c.description}
                    <div className="text-[11.5px] text-slate-500">
                      {[c.vendor, c.doc_no, c.report_code && `${t('cost.fromReport')} ${c.report_code}`, c.currency === 'EUR' && `${fmtMoney(c.amount_gross)} EUR`].filter(Boolean).join(' · ')}
                      {warns.length > 0 && <span className="ml-1 text-amber-600">⚠ {t(`cost.w_${warns[0]}`).replace('{n}', AMORT_THRESHOLD)}</span>}
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">{c.category}</td>
                  <td className="px-3 py-3"><TypeChip type={c.cost_type} /></td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{fmtMoney(calc.netRon)}</td>
                  <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-600 sm:table-cell">{fmtMoney(calc.perWeekRon)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {(c.cost_type === 'Recurent lunar' || c.cost_type === 'Recurent anual') && (
                      <button title={t('cost.nextTip')} onClick={() => next(c)} className="rounded px-2 py-1 text-[12px] text-brand-600 hover:bg-brand-500/10">{t('cost.next')}</button>
                    )}
                    <button title={t('cost.del')} onClick={() => remove(c)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-[13px] font-semibold text-navy-800">
              <tr>
                <td colSpan={5} className="px-3 py-2.5 text-right">{t('cost.total')} ({filtered.length})</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(sum((e) => e.calc.netRon))}</td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{fmtMoney(sum((e) => e.calc.perWeekRon))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="mt-2 text-[12px] text-slate-500">{t('cost.hint')}</p>
      {reportFile && <ImportReportModal file={reportFile} existing={rows || []} onClose={() => setReportFile(null)} onDone={(n, closed) => { setReportFile(null); setImportMsg(`${t('cost.xDone')} ${n}.${closed.length ? ` ${t('cost.closed')} ${closed.join(', ')}.` : ''}`); load() }} />}
      {queue.length > 0 && <CostModal key={queue[0].name + queue.length} initial={queue[0].fields} draft={queue[0]} queueInfo={`${queue.length}`} onSkip={() => setQueue((x) => x.slice(1))} onClose={() => setQueue([])} onSaved={onQueueSaved} />}
      {delNode}
      {modal && <CostModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={onSaved} />}
    </div>
  )
}
