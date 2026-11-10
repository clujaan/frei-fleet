import { useEffect, useState } from 'react'
import { backdrop } from '../lib/backdrop'
import { useLang } from '../i18n'
import { api } from '../lib/deconturiApi'
import { costsApi } from '../lib/costsApi'
import { CATEGORIES, COST_TYPES, defaultTypeFor, guessCategory } from '../lib/costs'
import { fmtDate, fmtMoney, normVendor, sameDocument } from '../lib/format'
import { parseSmartbillReport } from '../lib/smartbillReport'
import { CloseX } from './ModalChrome'

const field = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px] text-navy-800 outline-none focus:border-brand-500'

// Import din raportul SmartBill „Documente furnizor”: fiecare factură devine un cost de confirmat.
// Dubluri: față de costurile existente (același număr/furnizor) și față de foile de decont.
export default function ImportReportModal({ file, existing, onClose, onDone }) {
  const { t } = useLang()
  const [lines, setLines] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const parsed = await parseSmartbillReport(file)
        const out = []
        for (const p of parsed) {
          const item = { doc_no: p.doc_no, vendor: p.vendor, doc_date: p.doc_date, amount_gross: p.total }
          const inCosts = existing.find((c) => sameDocument(item, c))
          const inReports = inCosts ? [] : await api.findDuplicates(item, null).catch(() => [])
          const vk = normVendor(p.vendor)
          const known = existing.filter((c) => normVendor(c.vendor) && (normVendor(c.vendor).includes(vk) || vk.includes(normVendor(c.vendor)))).sort((a, b) => String(b.start_on).localeCompare(String(a.start_on)))[0]
          const skip = p.cancelled || !!inCosts || inReports.length > 0
          out.push({
            ...p,
            key: `${p.vendor}|${p.doc_no}`,
            on: !skip,
            reason: p.cancelled ? t('cost.xCancelled') : inCosts ? `${t('cost.xInCosts')} ${inCosts.code}` : inReports.length ? `${t('cost.xInReport')} ${inReports[0].code}` : '',
            description: known?.description || p.vendor,
            category: known?.category || guessCategory(p.vendor),
            cost_type: known?.cost_type || defaultTypeFor({ amount_gross: p.total, vat_amount: p.vat }),
            period_count: known?.period_count || 12,
            period_unit: known?.period_unit || 'Luni',
            known: known?.code || '',
            fx: '',
          })
        }
        if (live) setLines(out)
      } catch (e) {
        if (live) setErr(e.message)
      }
    })()
    return () => { live = false }
  }, [file])

  const upd = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const chosen = lines ? lines.filter((l) => l.on) : []
  const needFx = chosen.filter((l) => l.currency === 'EUR' && !(Number(String(l.fx).replace(',', '.')) > 0))
  const unsupported = chosen.filter((l) => l.currency !== 'RON' && l.currency !== 'EUR')

  const confirm = async () => {
    setBusy(true)
    setErr('')
    try {
      const rows = chosen.map((l) => ({
        description: l.description || l.vendor,
        category: l.category,
        cost_type: l.cost_type,
        vendor: l.vendor,
        doc_no: l.doc_no,
        doc_date: l.doc_date || null,
        amount_gross: l.total,
        currency: l.currency,
        fx_rate: l.currency === 'EUR' ? Number(String(l.fx).replace(',', '.')) : null,
        vat_amount: l.vat > 0 ? l.vat : null,
        vat_rate: l.vat > 0 ? null : 0,
        vat_deductible: true,
        start_on: l.doc_date || new Date().toISOString().slice(0, 10),
        period_unit: l.cost_type === 'Unic - amortizat' ? l.period_unit : null,
        period_count: l.cost_type === 'Unic - amortizat' ? Number(l.period_count) || 12 : null,
        notes: l.notes || null,
      }))
      const saved = await costsApi.insertMany(rows)
      // recurente noi: închid rândul recurent anterior al aceluiași furnizor
      let all = [...existing]
      const closed = []
      for (const s of [...saved].sort((a, b) => String(a.start_on).localeCompare(String(b.start_on)))) {
        closed.push(...(await costsApi.closePrevious(s, all).catch(() => [])))
        all = [...all, s]
      }
      onDone(saved.length, closed)
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-5xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{t('cost.xTitle')}</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">{file.name} · {t('cost.xIntro')}</p>
        {!lines && !err && <p className="mt-4 text-slate-500">…</p>}
        {lines && (
          <div className="mt-4 space-y-2">
            {lines.map((l) => (
              <div key={l.key} className={`rounded-xl border p-3 ${l.reason ? 'border-slate-200 bg-slate-50' : 'border-slate-200'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1" checked={l.on} onChange={(e) => upd(l.key, { on: e.target.checked })} />
                  <div className="min-w-0 flex-1 text-[13.5px] text-navy-800">
                    <b>{l.vendor}</b> <span className="text-slate-500">· {l.doc_no} · {fmtDate(l.doc_date)}</span>
                    {l.reason && <span className="ml-2 text-[12px] text-amber-700">⚠ {l.reason}</span>}
                    {l.known && <span className="ml-2 text-[12px] text-slate-500">({t('cost.xKnown')} {l.known})</span>}
                  </div>
                  <div className="whitespace-nowrap text-right text-[13.5px] tabular-nums"><b>{fmtMoney(l.total)} {l.currency}</b><div className="text-[11.5px] text-slate-500">{t('cost.pVat')} {fmtMoney(l.vat)}</div></div>
                </div>
                {l.on && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                    <input className={`${field} min-w-[200px] flex-1`} value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} />
                    <select className={field} value={l.category} onChange={(e) => upd(l.key, { category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                    <select className={field} value={l.cost_type} onChange={(e) => upd(l.key, { cost_type: e.target.value })}>{COST_TYPES.map((c) => <option key={c}>{c}</option>)}</select>
                    {l.cost_type === 'Unic - amortizat' && (
                      <label className="flex items-center gap-1 text-[12px] text-slate-600"><input type="number" min="1" className={`${field} w-16`} value={l.period_count} onChange={(e) => upd(l.key, { period_count: e.target.value })} /> {t('cost.months')}</label>
                    )}
                    {l.currency === 'EUR' && <input className={`${field} w-28`} placeholder={t('cost.fx')} value={l.fx} onChange={(e) => upd(l.key, { fx: e.target.value })} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {needFx.length > 0 && <p className="mt-3 text-[12.5px] text-amber-700">⚠ {t('cost.xNeedFx')}</p>}
        {unsupported.length > 0 && <p className="mt-3 text-[12.5px] text-amber-700">⚠ {t('cost.xCurrency')} {unsupported.map((l) => l.currency).join(', ')}</p>}
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('exp.cancel')}</button>
          <button disabled={busy || chosen.length === 0 || needFx.length > 0 || unsupported.length > 0} onClick={confirm} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {t('cost.addConfirm')} ({chosen.length})
          </button>
        </div>
      </div>
    </div>
  )
}
