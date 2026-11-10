import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../i18n'
import { costsApi } from '../lib/costsApi'
import { TRIPS_API } from '../lib/trips'
import { ORDERS_API } from '../lib/orders'
import { FIRST_YEAR, YEAR, buildRows, computePeriod, periodOf, previousPeriod, weeksOfYear } from '../lib/pl'
import { exportPlPdf, exportPlXlsx, fileBase } from '../lib/plExport'
import { fmtDate, fmtMoney, todayISO } from '../lib/format'
import { grossIn, mondayOf } from '../lib/costs'

const sel = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500'
const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']
const pc = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const vp = (v) => (v == null ? '—' : Math.abs(v) >= 2 ? (v > 0 ? '200%+' : '-200%+') : pc(v))

export default function PL() {
  const { t, lang } = useLang()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [kind, setKind] = useState('week')
  const [cur, setCur] = useState('RON')
  const [year, setYear] = useState(YEAR)
  const years = Array.from({ length: Math.max(YEAR, FIRST_YEAR) - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i)
  const weeks = useMemo(() => weeksOfYear(year), [year])
  const [week, setWeek] = useState(() => {
    const m = mondayOf(todayISO())
    return weeksOfYear(YEAR).some((w) => w.monday === m) ? m : weeksOfYear(YEAR)[0].monday
  })
  const [month, setMonth] = useState(() => (todayISO().startsWith(String(YEAR)) ? todayISO().slice(0, 7) : `${YEAR}-12`))
  const changeYear = (y) => {
    setYear(y)
    const ws = weeksOfYear(y)
    const m = mondayOf(todayISO())
    setWeek(ws.some((w) => w.monday === m) ? m : ws[0].monday)
    setMonth(`${y}-${month.slice(5)}`)
  }
  const [busy, setBusy] = useState('')
  const [future, setFuture] = useState(false) // include săptămânile viitoare (proiecția costurilor recurente)
  const nowMonday = mondayOf(todayISO())

  useEffect(() => {
    Promise.all([TRIPS_API.list(), costsApi.list(), ORDERS_API.list().then((o) => new Set(o.filter((x) => x.trip_id && x.status !== 'Anulată').map((x) => x.trip_id))).catch(() => null)]).then(([trips, costs, ctTrips]) => setData({ trips, costs, ctTrips: ctTrips || undefined })).catch((e) => setErr(e.message))
  }, [])

  const key = kind === 'week' ? week : kind === 'month' ? month : String(year)
  const fullPeriod = useMemo(() => periodOf(kind, key), [kind, key])
  // luna și anul se opresc la săptămâna curentă; fără asta, costurile recurente (chirie etc.) s-ar număra și pentru săptămânile care nu au venit încă
  const period = useMemo(() => (kind === 'week' || future ? fullPeriod : fullPeriod.filter((w) => w.monday <= nowMonday)), [fullPeriod, kind, future, nowMonday])
  const clipped = fullPeriod.length - period.length
  const prevP = useMemo(() => previousPeriod(kind, key), [kind, key])
  const calc = useMemo(() => (data ? { c: computePeriod(period, data, cur), p: computePeriod(prevP.weeks, data, cur) } : null), [data, period, prevP, cur])
  const rows = useMemo(() => (calc ? buildRows(calc.c, calc.p) : []), [calc])
  // profit cumulat de la începutul anului până la sfârșitul perioadei alese
  const ytd = useMemo(() => {
    if (!data || !period.length) return null
    const upto = period[period.length - 1].sunday
    return computePeriod(weeks.filter((w) => w.sunday <= upto && (future || w.monday <= nowMonday)), data, cur).profit
  }, [data, period, weeks, cur, future, nowMonday])

  // total plătit până azi (cu TVA), independent de perioada aleasă: toate costurile cu data de start <= azi
  const spent = useMemo(() => {
    if (!data) return null
    const today = todayISO()
    let amount = 0, vat = 0, n = 0, missing = 0, future = 0
    for (const c of data.costs) {
      if (String(c.start_on) > today) { future += 1; continue }
      const g = grossIn(c, cur)
      if (g.missing) { missing += 1; continue }
      amount += g.amount; vat += g.vat; n += 1
    }
    return { amount, vat, n, missing, future }
  }, [data, cur])

  const first = period[0] || fullPeriod[0]
  const last = period[period.length - 1] || fullPeriod[0]
  const idx = kind === 'week' ? weeks.findIndex((w) => w.monday === week) : kind === 'month' ? Number(month.slice(5)) - 1 : 0
  const go = (d) => {
    if (kind === 'week') { const n = weeks[idx + d]; if (n) setWeek(n.monday) }
    if (kind === 'month') { const m = Number(month.slice(5)) + d; if (m >= 1 && m <= 12) setMonth(`${year}-${String(m).padStart(2, '0')}`) }
  }
  const label = kind === 'week' ? `Săptămâna ${first?.week}` : kind === 'month' ? MONTHS[idx] : `Anul ${year}`
  const meta = {
    kind, key, year, week: first?.week,
    title: kind === 'week' ? `Weekly Profit Report · Săptămâna ${first?.week}` : kind === 'month' ? `Monthly Profit Report · ${MONTHS[idx]} ${year}` : `Yearly Profit Report · ${year}`,
    subtitle: `${fmtDate(first?.monday)} – ${fmtDate(last?.sunday)} · ${cur}`,
    lines: [['Anul', String(year)], ['Luna', kind === 'year' ? 'Toate' : kind === 'month' ? MONTHS[idx] : MONTHS[Number(first?.month.slice(5)) - 1]], ...(kind === 'week' ? [['Săptămâna', first?.week]] : []), ['Început', fmtDate(first?.monday)], ['Sfârșit', fmtDate(last?.sunday)], ['Monedă', cur]],
    curLabel: kind === 'week' ? `S${first?.week}` : kind === 'month' ? MONTHS[idx] : String(year),
    prevLabel: prevP.weeks.length ? (kind === 'week' ? `S${prevP.weeks[0].week}` : kind === 'year' ? prevP.key : MONTHS[Number(prevP.key.slice(5)) - 1]) : '—',
    footnote: 'Venit și cost transport în săptămâna datei de încărcare (curse neanulate). Overheads: Cheltuieli generale alocate pe săptămâni, inclusiv amortizări. ROR = profit / vânzări.',
  }
  const download = async (fn, ext) => {
    setBusy(ext)
    try {
      const blob = await fn(rows, meta)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${fileBase(meta)}_${cur}.${ext}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  const th = 'px-3 py-2.5 text-right'
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {t('nav.pl').toUpperCase()}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{t('nav.pl')}</h1>
        <div className="flex gap-2">
          <button disabled={!!busy || !data} onClick={() => download(exportPlXlsx, 'xlsx')} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[14px] text-navy-800 hover:bg-slate-50 disabled:opacity-50">⬇ Excel</button>
          <button disabled={!!busy || !data} onClick={() => download(exportPlPdf, 'pdf')} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[14px] text-navy-800 hover:bg-slate-50 disabled:opacity-50">⬇ PDF</button>
        </div>
      </div>
      {err && <p className="mt-3 text-rose-600">{err}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white text-[13.5px]">
          {[['week', t('pl.week')], ['month', t('pl.month')], ['year', t('pl.year')]].map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`px-3.5 py-2 ${kind === k ? 'bg-navy-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>
          ))}
        </div>
        {years.length > 1 && <select className={sel} value={year} onChange={(e) => changeYear(Number(e.target.value))} aria-label="An">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>}
        {kind !== 'year' && <button onClick={() => go(-1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">‹</button>}
        {kind === 'week' && (
          <select className={sel} value={week} onChange={(e) => setWeek(e.target.value)}>
            {weeks.map((w) => <option key={w.monday} value={w.monday}>{`S${String(w.week).padStart(2, '0')} · ${fmtDate(w.monday).slice(0, 5)}–${fmtDate(w.sunday).slice(0, 5)}`}</option>)}
          </select>
        )}
        {kind === 'month' && <select className={sel} value={month} onChange={(e) => setMonth(e.target.value)}>{MONTHS.map((m, i) => <option key={m} value={`${year}-${String(i + 1).padStart(2, '0')}`}>{m}</option>)}</select>}
        {kind !== 'year' && <button onClick={() => go(1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">›</button>}
        <div className="ml-auto flex overflow-hidden rounded-lg border border-slate-300 bg-white text-[13.5px]">
          {['RON', 'EUR'].map((c) => <button key={c} onClick={() => setCur(c)} className={`px-3.5 py-2 ${cur === c ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{c}</button>)}
        </div>
      </div>

      {calc && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[[t('pl.kSales'), calc.c.totalSales], [t('pl.kGm'), calc.c.grossMargin], [t('pl.kProfit'), calc.c.profit], [t('pl.kYtd'), ytd]].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mono-label text-[10px] text-slate-500">{l}</div>
                <div className={`mt-1 text-[22px] font-semibold ${v < 0 ? 'text-rose-600' : 'text-navy-800'}`}>{fmtMoney(v)} <span className="text-[12px] font-normal text-slate-500">{cur}</span></div>
              </div>
            ))}
          </div>
          {spent && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy-800/20 bg-navy-800 p-4 text-white">
              <div>
                <div className="mono-label text-[10px] text-slate-300">{t('pl.spentTitle')}</div>
                <div className="mt-1 text-[26px] font-semibold">{fmtMoney(spent.amount)} <span className="text-[14px] font-normal text-slate-300">{cur}</span></div>
              </div>
              <div className="text-[13px] text-slate-200">
                <div>{t('pl.spentVat')}: <b>{fmtMoney(spent.vat)} {cur}</b></div>
                <div>{spent.n} {t('pl.spentEntries')}{spent.future > 0 ? ` · ${spent.future} ${t('pl.spentFuture')}` : ''}</div>
                {spent.missing > 0 && <div className="text-amber-300">⚠ {spent.missing} {t('pl.spentFx')}</div>}
              </div>
            </div>
          )}
          <p className="mt-2 text-[12.5px] text-slate-500">{label} · {fmtDate(first?.monday)} – {fmtDate(last?.sunday)} · {calc.c.trips} {t('pl.trips')}</p>
          {calc.c.noCt > 0 && <p className="mt-1 text-[12.5px] text-slate-500">ℹ {calc.c.noCt} {lang === 'en' ? 'trips in this period have no transport order yet and are not included in the P&L.' : 'curse din perioadă nu au încă comandă de transport și nu sunt incluse în P&L.'}</p>}
          {kind !== 'week' && (
            <label className="mt-1 flex items-center gap-2 text-[12.5px] text-slate-600">
              <input type="checkbox" checked={future} onChange={(e) => setFuture(e.target.checked)} /> {t('pl.future')}
              {clipped > 0 && !future && <span className="text-slate-500">· {clipped} {t('pl.clipped')}</span>}
            </label>
          )}
          {calc.c.fxTrips > 0 && <p className="mt-1 text-[12.5px] text-amber-700">⚠ {calc.c.fxTrips} {t('pl.fxTrips')}</p>}
          {cur === 'EUR' && calc.c.fxCosts > 0 && <p className="mt-1 text-[12.5px] text-amber-700">⚠ {calc.c.fxCosts} {t('pl.fxCosts')}</p>}

          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-[13.5px]">
              <thead className="bg-navy-800 text-[11px] uppercase tracking-wider text-white">
                <tr><th className="px-3 py-2.5 text-left">{kind === 'week' ? 'Weekly Profit Report' : kind === 'month' ? 'Monthly Profit Report' : 'Yearly Profit Report'}</th><th className={th}>{meta.curLabel}</th><th className={th}>% sales</th><th className={th}>{meta.prevLabel}</th><th className={`${th} hidden sm:table-cell`}>% sales</th><th className={th}>Variance</th><th className={`${th} hidden sm:table-cell`}>% var.</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => r.kind === 'section' ? (
                  <tr key={i} className="bg-slate-100"><td colSpan={7} className="px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-navy-700">{r.label}</td></tr>
                ) : r.kind === 'ratio' ? (
                  <tr key={i} className="border-t border-slate-100"><td className="px-3 py-2.5 font-medium text-navy-800">{r.label}</td><td className="px-3 py-2.5 text-right font-medium tabular-nums">{pc(r.cur)}</td><td /><td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{pc(r.prev)}</td><td colSpan={3} /></tr>
                ) : (
                  <tr key={i} className={`border-t border-slate-100 ${r.kind === 'key' ? 'bg-[#FDF0E4] font-semibold' : r.kind === 'total' ? 'bg-slate-50 font-semibold' : ''}`}>
                    <td className={`px-3 py-2.5 ${r.kind === 'line' ? 'pl-6 text-slate-700' : 'text-navy-800'}`}>{r.label}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${r.cur < 0 ? 'text-rose-600' : ''}`}>{fmtMoney(r.cur)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{pc(r.pctCur)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmtMoney(r.prev)}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">{pc(r.pctPrev)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${r.varAbs < 0 ? 'text-rose-600' : ''}`}>{fmtMoney(r.varAbs)}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">{vp(r.varPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-slate-500">{t('pl.hint')}</p>
        </>
      )}
      {!calc && !err && <p className="mt-6 text-slate-500">…</p>}
    </div>
  )
}
