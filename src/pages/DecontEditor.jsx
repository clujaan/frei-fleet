import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLang } from '../i18n'
import { api } from '../lib/deconturiApi'
import { StatusChip } from './Deconturi'
import { generateFoaiePdf } from '../lib/foaiePdf'
import { appendAttachments } from '../lib/pdfAttachments'
import { generateFoaieXlsx } from '../lib/foaieXlsx'
import { readDocument } from '../lib/readDocument'
import { EMPLOYEES, MAX_LINES, PAYMENT_METHODS, computeTotals, fmtMoney, isIncluded, normDocNo, parseNum, sameDocument, todayISO, vatFromGross } from '../lib/format'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-500'
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))
const str = (v) => (v === null || v === undefined ? '' : String(v))

const toEdit = (it) => ({ ...it, amount_gross: str(it.amount_gross), vat_amount: str(it.vat_amount), original_amount: str(it.original_amount), original_currency: str(it.original_currency), fx_rate: str(it.fx_rate) })
const num = (v) => { const n = parseNum(v); return Number.isFinite(n) ? n : 0 }
const orNull = (v) => { const n = parseNum(v); return Number.isFinite(n) ? n : null }
const toRow = (it) => ({
  id: it.id, doc_date: it.doc_date || null, vendor: it.vendor || '', doc_no: it.doc_no || '', description: it.description || '',
  amount_gross: num(it.amount_gross), vat_amount: it.vat_overridden ? num(it.vat_amount) : vatFromGross(num(it.amount_gross)),
  vat_overridden: !!it.vat_overridden, cui_ok: it.cui_ok !== false,
  original_amount: orNull(it.original_amount), original_currency: it.original_currency || null, fx_rate: orNull(it.fx_rate),
})
const blank = () => ({ id: uid(), doc_date: todayISO(), vendor: '', doc_no: '', description: '', amount_gross: '', vat_amount: '', vat_overridden: false, cui_ok: true, original_amount: '', original_currency: '', fx_rate: '' })

function Attachments({ code, item, docs, setDocs, disabled }) {
  const { t } = useLang()
  const ref = useRef()
  const [busy, setBusy] = useState(false)
  const mine = docs.filter((d) => d.entity_id === item.id)
  const add = async (e) => {
    setBusy(true)
    try {
      for (const f of e.target.files) {
        const d = await api.uploadFile(code, item.id, f)
        setDocs((x) => [...x, d])
      }
    } catch (err) { alert(err.message) }
    e.target.value = ''
    setBusy(false)
  }
  const open = async (d) => { const u = await api.fileUrl(d); if (u) window.open(u, '_blank'); else alert(t('exp.demoFile')) }
  const del = async (d) => { await api.deleteFile(d); setDocs((x) => x.filter((y) => y.id !== d.id)) }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mine.map((d) => (
        <span key={d.id} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[12px]">
          <button type="button" onClick={() => open(d)} className="max-w-[160px] truncate text-navy-700 hover:text-brand-600">📎 {d.filename}</button>
          {!disabled && <button type="button" onClick={() => del(d)} className="text-slate-400 hover:text-rose-600" aria-label="x">✕</button>}
        </span>
      ))}
      {!disabled && (
        <>
          <input ref={ref} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={add} />
          <button type="button" disabled={busy} onClick={() => ref.current.click()} className="rounded-full border border-dashed border-brand-500 px-3 py-1 text-[12px] text-brand-600 hover:bg-brand-500/10">
            {busy ? '…' : `＋ ${t('exp.attach')}`}
          </button>
        </>
      )}
    </div>
  )
}

export default function DecontEditor() {
  const { id } = useParams()
  const { t } = useLang()
  const [report, setReport] = useState(null)
  const [items, setItems] = useState([])
  const [docs, setDocs] = useState([])
  const [dups, setDups] = useState({})
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [withDocs, setWithDocs] = useState(true)
  const [ai, setAi] = useState({}) // id rând -> { busy, warnings, breakdown }

  useEffect(() => {
    api.getReport(id).then(({ report: r, items: its, docs: d }) => { setReport(r); setItems(its.map(toEdit)); setDocs(d) }).catch((e) => setMsg({ err: e.message }))
  }, [id])

  const readWithAI = async (it) => {
    const mine = docs.filter((d) => d.entity_id === it.id)
    setAi((a) => ({ ...a, [it.id]: { busy: true } }))
    try {
      const blobs = []
      for (const d of mine) {
        const url = await api.fileUrl(d)
        if (!url) throw new Error(t('exp.demoFile'))
        blobs.push(await (await fetch(url)).blob())
      }
      const { data: r, warnings } = await readDocument(blobs)
      const ron = !r.currency || r.currency === 'RON'
      const gross = ron ? Number(r.total_gross) : 0
      const diffVat = ron && Math.abs(Number(r.vat_total) - vatFromGross(gross)) > 0.011
      setI(it.id, {
        doc_date: /^\d{4}-\d{2}-\d{2}$/.test(r.doc_date) ? r.doc_date : it.doc_date,
        vendor: r.vendor || it.vendor,
        doc_no: r.doc_no || it.doc_no,
        description: r.description || it.description,
        amount_gross: ron ? String(r.total_gross) : '',
        vat_overridden: diffVat,
        vat_amount: diffVat ? String(r.vat_total) : '',
        cui_ok: r.has_company_cui !== false,
        original_amount: ron ? '' : String(r.total_gross),
        original_currency: ron ? '' : r.currency,
      })
      setAi((a) => ({ ...a, [it.id]: { warnings, breakdown: r.vat_breakdown || [] } }))
      checkDup({ ...it, doc_no: r.doc_no || it.doc_no, vendor: r.vendor || it.vendor, doc_date: r.doc_date || it.doc_date, amount_gross: ron ? String(r.total_gross) : it.amount_gross, vat_overridden: false, cui_ok: true })
    } catch (e) {
      setAi((a) => ({ ...a, [it.id]: { warnings: [e.message] } }))
    }
  }

  const locked = report && report.status !== 'Ciornă'
  const rows = useMemo(() => items.map(toRow), [items])
  const totals = computeTotals(rows)

  const setR = (k) => (e) => { setReport((r) => ({ ...r, [k]: e.target.value })); setDirty(true) }
  const setI = (iid, patch) => { setItems((xs) => xs.map((x) => (x.id === iid ? { ...x, ...patch } : x))); setDirty(true) }

  const checkDup = async (it) => {
    const row = toRow(it)
    const own = items
      .filter((x) => x.id !== it.id && sameDocument(row, toRow(x)))
      .map(() => ({ code: report.code, reason: 'foaie' }))
    const other = row.doc_no.trim() || row.amount_gross > 0 ? await api.findDuplicates(row, id) : []
    setDups((d) => ({ ...d, [it.id]: [...own.slice(0, 1), ...other] }))
  }

  const save = useCallback(async () => {
    const fields = { employee: report.employee, report_date: report.report_date, purpose: report.purpose, payment_method: report.payment_method }
    const r = await api.saveReport(id, fields, rows)
    setReport(r)
    setDirty(false)
    return r
  }, [id, report, rows])

  const run = async (fn, okMsg) => {
    setBusy(true); setMsg(null)
    try { await fn(); if (okMsg) setMsg({ ok: okMsg }) } catch (e) { setMsg({ err: e.message }) }
    setBusy(false)
  }

  const validate = () => {
    const inc = rows.filter(isIncluded)
    if (!report.employee) return t('exp.vEmployee')
    if (inc.length === 0) return t('exp.vNone')
    if (rows.length > MAX_LINES) return t('exp.vMax')
    for (const [i, r] of rows.entries()) {
      if (!isIncluded(r)) continue
      if (!r.doc_date || !r.vendor.trim() || !r.doc_no.trim()) return `${t('exp.vLine')} ${i + 1}: ${t('exp.vFields')}`
    }
    const seen = new Set()
    for (const r of inc) { const k = normDocNo(r.doc_no); if (k && seen.has(k)) return `${t('exp.vDup')} ${r.doc_no}`; seen.add(k) }
    return null
  }

  const pdf = async (r, its) => {
    const base = await generateFoaiePdf(r, its)
    if (!withDocs || docs.length === 0) return base
    const { blob, warnings } = await appendAttachments(base, r, its, docs, api.fileUrl)
    if (warnings.length) setMsg({ err: `${t('exp.attWarn')} ${warnings.join('; ')}` })
    return blob
  }

  const download = () => run(async () => {
    const r = dirty && !locked ? await save() : report
    const blob = await pdf(r, rows)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `${r.code}.pdf`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  })

  const downloadXlsx = () => run(async () => {
    const r = dirty && !locked ? await save() : report
    const blob = await generateFoaieXlsx(r, rows)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `${r.code}.xlsx`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  })

  const emit = () => run(async () => {
    const bad = validate()
    if (bad) throw new Error(bad)
    for (const it of items) await checkDup(it)
    const found = []
    for (const it of rows) { if (!isIncluded(it)) continue; const o = await api.findDuplicates(it, id); if (o.length) found.push(`${it.doc_no} (${[...new Set(o.map((x) => x.code))].join(', ')})`) }
    if (found.length && !window.confirm(`${t('exp.dupWarn')}\n${found.join('\n')}\n\n${t('exp.dupAsk')}`)) return
    const r = await save()
    const blob = await pdf(r, rows)
    await api.uploadPdf(id, r.code, blob)
    setReport(await api.setStatus(id, 'Emis'))
  }, t('exp.emitted'))

  const status = (s, extra, okMsg) => () => run(async () => setReport(await api.setStatus(id, s, extra)), okMsg)

  if (!report) return <div className="p-8 text-slate-500">{msg?.err || '…'}</div>

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8 sm:px-8">
      <Link to="/deconturi" className="mono-label text-[10.5px] text-navy-700 hover:text-brand-600">← {t('nav.expenses')}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-semibold tracking-tight text-navy-800">{report.code}</h1>
        <StatusChip status={report.status} />
        {dirty && <span className="text-[12px] text-amber-600">● {t('exp.unsaved')}</span>}
      </div>

      <fieldset disabled={locked} className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <label className="text-[12px] text-slate-600">{t('exp.employee')}
          <select className={input} value={report.employee} onChange={setR('employee')}>{EMPLOYEES.map((e) => <option key={e}>{e}</option>)}</select></label>
        <label className="text-[12px] text-slate-600">{t('exp.date')}
          <input type="date" className={input} value={report.report_date} onChange={setR('report_date')} /></label>
        <label className="text-[12px] text-slate-600">{t('exp.purpose')}
          <input className={input} value={report.purpose || ''} onChange={setR('purpose')} /></label>
        <label className="text-[12px] text-slate-600">{t('exp.payment')}
          <select className={input} value={report.payment_method} onChange={setR('payment_method')}>{PAYMENT_METHODS.map((e) => <option key={e}>{e}</option>)}</select></label>
      </fieldset>

      <h2 className="mono-label mt-6 text-[10.5px] text-slate-500">{t('exp.lines')} ({items.length}/{MAX_LINES})</h2>
      <div className="mt-2 space-y-3">
        {items.map((it, idx) => {
          const gross = num(it.amount_gross)
          const autoVat = vatFromGross(gross)
          return (
            <div key={it.id} className={`rounded-xl border bg-white p-4 shadow-sm ${it.cui_ok === false ? 'border-rose-300 opacity-80' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <span className="mono-label text-[10px] text-slate-500">{t('exp.line')} {idx + 1}</span>
                {!locked && <button type="button" onClick={() => { setItems((xs) => xs.filter((x) => x.id !== it.id)); setDirty(true) }} className="text-[12px] text-slate-400 hover:text-rose-600">{t('exp.remove')}</button>}
              </div>
              <fieldset disabled={locked} className="mt-2 grid gap-3 sm:grid-cols-6">
                <label className="text-[12px] text-slate-600 sm:col-span-2">{t('exp.docDate')}
                  <input type="date" className={input} value={it.doc_date || ''} onChange={(e) => setI(it.id, { doc_date: e.target.value })} /></label>
                <label className="text-[12px] text-slate-600 sm:col-span-2">{t('exp.vendor')}
                  <input className={input} value={it.vendor} onChange={(e) => setI(it.id, { vendor: e.target.value })} onBlur={() => checkDup(it)} /></label>
                <label className="text-[12px] text-slate-600 sm:col-span-2">{t('exp.docNo')}
                  <input className={input} placeholder="F123-456 / Bon fiscal: 0032" value={it.doc_no} onChange={(e) => setI(it.id, { doc_no: e.target.value })} onBlur={() => checkDup(it)} /></label>
                <label className="text-[12px] text-slate-600 sm:col-span-6">{t('exp.desc')}
                  <input className={input} value={it.description} onChange={(e) => setI(it.id, { description: e.target.value })} /></label>
                <label className="text-[12px] text-slate-600 sm:col-span-2">{t('exp.gross')} (RON)
                  <input inputMode="decimal" className={input} value={it.amount_gross} onChange={(e) => setI(it.id, { amount_gross: e.target.value })} onBlur={() => checkDup(it)} /></label>
                <label className="text-[12px] text-slate-600 sm:col-span-2">{t('exp.vat')} (RON)
                  <input inputMode="decimal" className={input} value={it.vat_overridden ? it.vat_amount : gross ? String(autoVat) : ''} placeholder="21%" onChange={(e) => setI(it.id, { vat_amount: e.target.value, vat_overridden: true })} /></label>
                <div className="flex items-end text-[12px] sm:col-span-2">
                  {it.vat_overridden ? <button type="button" onClick={() => setI(it.id, { vat_overridden: false, vat_amount: '' })} className="pb-2 text-brand-600 hover:underline">↺ {t('exp.vatAuto')}</button> : <span className="pb-2 text-slate-400">{t('exp.vatNote')}</span>}
                </div>
                <details className="sm:col-span-6">
                  <summary className="cursor-pointer text-[12px] text-slate-500">{t('exp.foreign')}</summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <input inputMode="decimal" placeholder={t('exp.origAmount')} className={input} value={it.original_amount} onChange={(e) => setI(it.id, { original_amount: e.target.value })} />
                    <input placeholder="EUR" maxLength={3} className={input} value={it.original_currency} onChange={(e) => setI(it.id, { original_currency: e.target.value.toUpperCase() })} />
                    <input inputMode="decimal" placeholder={t('exp.fx')} className={input} value={it.fx_rate} onChange={(e) => setI(it.id, { fx_rate: e.target.value })} />
                  </div>
                </details>
              </fieldset>
              <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-700">
                <input type="checkbox" disabled={locked} checked={it.cui_ok !== false} onChange={(e) => setI(it.id, { cui_ok: e.target.checked })} className="accent-brand-500" />
                {t('exp.cuiOk')}
              </label>
              {it.cui_ok === false && <p className="mt-1 text-[12.5px] text-rose-600">{t('exp.cuiNo')}</p>}
              {dups[it.id]?.map((d) => (
                <p key={`${d.code}${d.reason}`} className="mt-1 text-[12.5px] text-amber-600">⚠ {t('exp.dupFound')} {d.code} ({t(`exp.dup_${d.reason}`)})</p>
              ))}
              <div className="mt-3"><Attachments code={report.code} item={it} docs={docs} setDocs={setDocs} disabled={locked} /></div>
              {!locked && docs.some((d) => d.entity_id === it.id) && (
                <button type="button" disabled={ai[it.id]?.busy} onClick={() => readWithAI(it)} className="mt-3 rounded-lg bg-navy-800 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-navy-700 disabled:opacity-60">
                  {ai[it.id]?.busy ? t('exp.aiBusy') : `✨ ${t('exp.aiRead')}`}
                </button>
              )}
              {ai[it.id]?.breakdown?.length > 0 && (
                <p className="mt-2 text-[12.5px] text-slate-600">{t('exp.vatBreakdown')}: {ai[it.id].breakdown.map((b) => `${b.rate}% → ${fmtMoney(b.vat)}`).join(' · ')}</p>
              )}
              {ai[it.id]?.warnings?.length > 0 && (
                <ul className="mt-2 space-y-1 text-[12.5px] text-amber-700">{ai[it.id].warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
              )}
            </div>
          )
        })}
      </div>
      {!locked && items.length < MAX_LINES && (
        <button type="button" onClick={() => { setItems((xs) => [...xs, blank()]); setDirty(true) }} className="mt-3 rounded-lg border border-dashed border-brand-500 px-4 py-2 text-[14px] text-brand-600 hover:bg-brand-500/10">＋ {t('exp.addLine')}</button>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-800 p-4 text-white">
        <div><div className="mono-label text-[10px] text-slate-300">{t('exp.toReimburse')}</div><div className="text-[26px] font-semibold">{fmtMoney(totals.total_gross)} <span className="text-[14px] font-normal text-slate-300">RON</span></div></div>
        <div className="text-[13px] text-slate-200">{t('exp.ofWhichVat')}: <b>{fmtMoney(totals.total_vat)}</b> · {t('exp.docs')}: <b>{totals.doc_count}</b></div>
      </div>

      {msg?.err && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-[13.5px] text-rose-700">{msg.err}</p>}
      {msg?.ok && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-[13.5px] text-emerald-700">{msg.ok}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {!locked && <button disabled={busy || !dirty} onClick={() => run(save, t('exp.saved'))} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[14px] text-navy-800 hover:bg-slate-50 disabled:opacity-40">{t('exp.save')}</button>}
        {!locked && <button disabled={busy} onClick={emit} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">{t('exp.emit')}</button>}
        <button disabled={busy} onClick={download} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[14px] text-navy-800 hover:bg-slate-50 disabled:opacity-50">⬇ {t('exp.pdf')}</button>
        <button disabled={busy} onClick={downloadXlsx} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[14px] text-navy-800 hover:bg-slate-50 disabled:opacity-50">⬇ {t('exp.xlsx')}</button>
        <label className="flex items-center gap-2 px-1 text-[13px] text-slate-600">
          <input type="checkbox" checked={withDocs} onChange={(e) => setWithDocs(e.target.checked)} className="accent-brand-500" />
          {t('exp.withDocs')}
        </label>
        {report.status === 'Emis' && <button disabled={busy} onClick={status('Trimis contabilă', { sent_on: todayISO() })} className="rounded-lg bg-navy-700 px-4 py-2.5 text-[14px] text-white hover:bg-navy-600">{t('exp.markSent')}</button>}
        {report.status === 'Trimis contabilă' && <button disabled={busy} onClick={status('Rambursat', { reimbursed_on: todayISO() })} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-[14px] text-white hover:bg-emerald-700">{t('exp.markPaid')}</button>}
        {(report.status === 'Emis' || report.status === 'Anulat') && <button disabled={busy} onClick={status('Ciornă')} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[14px] text-slate-700 hover:bg-slate-50">{t('exp.reopen')}</button>}
        {report.status !== 'Anulat' && report.status !== 'Rambursat' && <button disabled={busy} onClick={() => window.confirm(t('exp.cancelAsk')) && status('Anulat')()} className="rounded-lg px-4 py-2.5 text-[14px] text-rose-600 hover:bg-rose-50">{t('exp.voidIt')}</button>}
      </div>
    </div>
  )
}
