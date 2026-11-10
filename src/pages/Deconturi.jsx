import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { backdrop } from '../lib/backdrop'
import { Link, useNavigate } from 'react-router-dom'
import { useLang } from '../i18n'
import { useAuth } from '../lib/auth'
import { api } from '../lib/deconturiApi'
import { costsApi } from '../lib/costsApi'
import AddToCostsModal from '../components/AddToCostsModal'
import { DEFAULT_PURPOSE, EMPLOYEES, PAYMENT_METHODS, STATUS_STYLE, employeeFromEmail, fmtDate, fmtMoney, todayISO } from '../lib/format'
import { CloseX } from '../components/ModalChrome'

export const STATUSES = ['Ciornă', 'Emis', 'Trimis contabilă', 'Rambursat', 'Anulat']

export function StatusChip({ status }) {
  return <span className={`mono-label inline-block rounded-full border px-2.5 py-1 text-[9.5px] ${STATUS_STYLE[status] || ''}`}>{status}</span>
}

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

function NewModal({ onClose }) {
  const { t } = useLang()
  const { user } = useAuth()
  const nav = useNavigate()
  const [f, setF] = useState({ employee: employeeFromEmail(user?.email), report_date: todayISO(), purpose: DEFAULT_PURPOSE, payment_method: PAYMENT_METHODS[0] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const create = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await api.createReport(f)
      nav(`/deconturi/${r.id}`)
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4" {...backdrop(onClose)}>
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{t('exp.new')}</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-[12px] text-slate-600">{t('exp.employee')}
            <select className={input} value={f.employee} onChange={set('employee')}>{EMPLOYEES.map((e) => <option key={e}>{e}</option>)}</select>
          </label>
          <label className="block text-[12px] text-slate-600">{t('exp.date')}
            <input type="date" className={input} value={f.report_date} onChange={set('report_date')} />
          </label>
          <label className="block text-[12px] text-slate-600">{t('exp.purpose')}
            <input className={input} value={f.purpose} onChange={set('purpose')} />
          </label>
          <label className="block text-[12px] text-slate-600">{t('exp.payment')}
            <select className={input} value={f.payment_method} onChange={set('payment_method')}>{PAYMENT_METHODS.map((e) => <option key={e}>{e}</option>)}</select>
          </label>
        </div>
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{t('exp.cancel')}</button>
          <button disabled={busy} onClick={create} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">{t('exp.create')}</button>
        </div>
      </div>
    </div>
  )
}

export default function Deconturi() {
  const { t } = useLang()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(false)
  const [fEmp, setFEmp] = useState('')
  const [fMonth, setFMonth] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [addFor, setAddFor] = useState(null)
  const [linked, setLinked] = useState({}) // report_id -> nr. rânduri deja în Cheltuieli generale

  const loadLinked = () => costsApi.linkedItems().then((l) => setLinked(l.reduce((m, x) => ({ ...m, [x.expense_report_id]: (m[x.expense_report_id] || 0) + 1 }), {}))).catch(() => {})
  useEffect(() => {
    api.listReports().then(setRows).catch((e) => setErr(e.message))
    loadLinked()
  }, [])

  const active = (rows || []).filter((r) => r.status !== 'Anulat')
  const months = useMemo(() => [...new Set((rows || []).map((r) => r.report_date.slice(0, 7)))].sort().reverse(), [rows])
  const filtered = (rows || []).filter((r) => (!fEmp || r.employee === fEmp) && (!fMonth || r.report_date.startsWith(fMonth)) && (!fStatus || r.status === fStatus))

  // De rambursat: foile emise sau trimise, încă nerambursate.
  const owed = (emp) => active.filter((r) => r.employee === emp && (r.status === 'Emis' || r.status === 'Trimis contabilă')).reduce((s, r) => s + Number(r.total_gross), 0)
  const byMonth = months.slice(0, 6).map((m) => [m, active.filter((r) => r.report_date.startsWith(m)).reduce((s, r) => s + Number(r.total_gross), 0)])

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {t('nav.expenses').toUpperCase()}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{t('nav.expenses')}</h1>
        <button onClick={() => setModal(true)} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {t('exp.new')}</button>
      </div>
      {err && <p className="mt-3 text-rose-600">{err}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {EMPLOYEES.map((e) => (
          <div key={e} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mono-label text-[10px] text-slate-500">{t('exp.owedTo')} {e.toUpperCase()}</div>
            <div className="mt-1 text-[24px] font-semibold text-navy-800">{fmtMoney(owed(e))} <span className="text-[13px] font-normal text-slate-500">RON</span></div>
          </div>
        ))}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2">
          <div className="mono-label text-[10px] text-slate-500">{t('exp.perMonth')}</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            {byMonth.length === 0 && <span className="text-slate-400">—</span>}
            {byMonth.map(([m, v]) => <span key={m}><span className="text-slate-500">{m}</span> <b className="text-navy-800">{fmtMoney(v)}</b></span>)}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <select className={`${input} !w-auto`} value={fEmp} onChange={(e) => setFEmp(e.target.value)}>
          <option value="">{t('exp.allEmployees')}</option>{EMPLOYEES.map((e) => <option key={e}>{e}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={fMonth} onChange={(e) => setFMonth(e.target.value)}>
          <option value="">{t('exp.allMonths')}</option>{months.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">{t('exp.allStatuses')}</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows === null ? <p className="p-5 text-slate-500">…</p> : filtered.length === 0 ? <p className="p-5 text-slate-500">{t('exp.none')}</p> : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr><th className="px-4 py-2.5">{t('exp.no')}</th><th className="px-4 py-2.5">{t('exp.date')}</th><th className="hidden px-4 py-2.5 sm:table-cell">{t('exp.employee')}</th><th className="px-4 py-2.5 text-right">{t('exp.total')}</th><th className="hidden px-4 py-2.5 text-right md:table-cell">{t('exp.docs')}</th><th className="px-4 py-2.5">{t('exp.status')}</th><th className="px-3 py-2.5 text-center">{t('cost.colCosts')}</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium"><Link to={`/deconturi/${r.id}`} className="text-navy-700 hover:text-brand-600">{r.code}</Link></td>
                  <td className="px-4 py-3">{fmtDate(r.report_date)}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">{r.employee}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(r.total_gross)}</td>
                  <td className="hidden px-4 py-3 text-right md:table-cell">{r.doc_count}</td>
                  <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                  <td className="px-3 py-3 text-center">
                    {r.status === 'Rambursat' ? (
                      <button onClick={() => setAddFor(r.id)} title={linked[r.id] ? t('cost.iconDone') : t('cost.iconAdd')} className={`inline-grid h-8 w-8 place-items-center rounded-lg border text-[15px] ${linked[r.id] ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-brand-500 bg-brand-500/10 text-brand-600 hover:bg-brand-500/20'}`}>{linked[r.id] ? '✓' : '＋'}</button>
                    ) : r.status !== 'Anulat' ? (
                      <span title={t('cost.iconWait')} className="inline-grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-300">＋</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {modal && <NewModal onClose={() => setModal(false)} />}
      {addFor && <AddToCostsModal reportId={addFor} onClose={() => setAddFor(null)} onDone={() => { setAddFor(null); loadLinked() }} />}
    </div>
  )
}
