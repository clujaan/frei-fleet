import { useEffect, useState } from 'react'
import { backdrop } from '../lib/backdrop'
import { useLang } from '../i18n'
import { api } from '../lib/deconturiApi'
import { costsApi } from '../lib/costsApi'
import { CATEGORIES, COST_TYPES, defaultTypeFor, guessCategory } from '../lib/costs'
import { fmtDate, fmtMoney, isIncluded, sameDocument } from '../lib/format'
import { CloseX } from './ModalChrome'

const field = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px] text-navy-800 outline-none focus:border-brand-500'

// Propunerea automată: fiecare linie a unei foi RAMBURSATE devine un rând de cost,
// cu data = data rambursării. Confirmi tu ce se adaugă și cum (amortizat / one time).
export default function AddToCostsModal({ reportId, onClose, onDone }) {
  const { t } = useLang()
  const [data, setData] = useState(null)
  const [sel, setSel] = useState({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([api.getReport(reportId), costsApi.linkedItems(), costsApi.list()])
      .then(([d, linked, costs]) => {
        if (!live) return
        const done = new Set(linked.filter((l) => l.expense_report_id === reportId).map((l) => l.expense_item_id))
        const lines = d.items.filter(isIncluded)
        const inCosts = {}
        linked.filter((l) => l.expense_report_id === reportId && l.code).forEach((l) => { inCosts[l.expense_item_id] = l.code })
        lines.forEach((it) => {
          const hit = costs.find((c) => c.expense_item_id !== it.id && sameDocument(it, c))
          if (hit && !done.has(it.id)) { inCosts[it.id] = hit.code; done.add(it.id) }
        })
        setData({ report: d.report, lines, done, inCosts })
        setSel(Object.fromEntries(lines.map((it) => [it.id, {
          on: !done.has(it.id),
          category: guessCategory(`${it.description} ${it.vendor}`),
          cost_type: defaultTypeFor(it),
          period_count: 12,
        }])))
      })
      .catch((e) => setErr(e.message))
    return () => { live = false }
  }, [reportId])

  const upd = (id, k, v) => setSel((s) => ({ ...s, [id]: { ...s[id], [k]: v } }))
  const chosen = data ? data.lines.filter((it) => sel[it.id]?.on && !data.done.has(it.id)) : []

  const confirm = async () => {
    setBusy(true)
    setErr('')
    try {
      const start = data.report.reimbursed_on || data.report.report_date
      await costsApi.insertMany(chosen.map((it) => {
        const s = sel[it.id]
        return {
          description: it.description || it.vendor || data.report.purpose,
          category: s.category,
          cost_type: s.cost_type,
          vendor: it.vendor,
          doc_no: it.doc_no,
          doc_date: it.doc_date,
          amount_gross: it.amount_gross,
          currency: 'RON',
          // liniile de decont au mereu TVA-ul calculat sau citit de pe document; 0 înseamnă TVA 0 (nu se aplică 21%)
          vat_amount: Number(it.vat_amount) > 0 ? it.vat_amount : null,
          vat_rate: Number(it.vat_amount) > 0 ? null : 0,
          vat_deductible: true,
          start_on: start,
          period_unit: s.cost_type === 'Unic - amortizat' ? 'Luni' : null,
          period_count: s.cost_type === 'Unic - amortizat' ? Number(s.period_count) || 12 : null,
          expense_report_id: reportId,
          expense_item_id: it.id,
        }
      }))
      onDone()
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{t('cost.addTitle')} {data?.report.code}</h2>
        {data && <p className="mt-1 text-[12.5px] text-slate-500">{t('cost.addIntro')} <b>{fmtDate(data.report.reimbursed_on || data.report.report_date)}</b> ({t('cost.addDateNote')})</p>}
        {!data && !err && <p className="mt-4 text-slate-500">…</p>}
        {data && (
          <div className="mt-4 space-y-2">
            {data.lines.map((it) => {
              const s = sel[it.id] || {}
              const was = data.done.has(it.id)
              return (
                <div key={it.id} className={`rounded-xl border p-3 ${was ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'}`}>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1" disabled={was} checked={!!s.on && !was} onChange={(e) => upd(it.id, 'on', e.target.checked)} />
                    <span className="min-w-0 flex-1 text-[13.5px] text-navy-800">
                      {it.description || '—'}
                      <span className="block text-[11.5px] text-slate-500">{[it.vendor, it.doc_no, fmtDate(it.doc_date)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <b className="whitespace-nowrap text-[13.5px] tabular-nums">{fmtMoney(it.amount_gross)} RON</b>
                  </label>
                  {was ? <p className="mt-1 pl-7 text-[12px] text-emerald-700">✓ {data.inCosts[it.id] ? `${t('cost.alreadyAs')} ${data.inCosts[it.id]}` : t('cost.alreadyAdded')}</p> : s.on && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                      <select className={field} value={s.category} onChange={(e) => upd(it.id, 'category', e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                      <select className={field} value={s.cost_type} onChange={(e) => upd(it.id, 'cost_type', e.target.value)}>{COST_TYPES.filter((c) => c.startsWith('Unic')).map((c) => <option key={c}>{c}</option>)}</select>
                      {s.cost_type === 'Unic - amortizat' && (
                        <label className="flex items-center gap-1 text-[12px] text-slate-600">
                          <input type="number" min="1" className={`${field} w-16`} value={s.period_count} onChange={(e) => upd(it.id, 'period_count', e.target.value)} /> {t('cost.months')}
                        </label>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('exp.cancel')}</button>
          <button disabled={busy || chosen.length === 0} onClick={confirm} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {t('cost.addConfirm')} ({chosen.length})
          </button>
        </div>
      </div>
    </div>
  )
}
