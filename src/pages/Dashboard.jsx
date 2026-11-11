import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBnrRate } from '../lib/bnr'
import { fmtDate, todayISO } from '../lib/format'
import { useLang } from '../i18n'
import { useAuth } from '../lib/auth'
import { useDashboard } from '../lib/useDashboard'

const ACCENT = {
  orange: { line: 'from-brand-500', chip: 'border-brand-500/40 bg-brand-500/10 text-brand-300' },
  blue: { line: 'from-sky-400', chip: 'border-sky-400/40 bg-sky-400/10 text-sky-300' },
  green: { line: 'from-emerald-400', chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' },
  red: { line: 'from-rose-400', chip: 'border-rose-400/40 bg-rose-400/10 text-rose-300' },
}

const fmtMoney = (v) =>
  v == null ? '—' : new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(v)

function Kpi({ code, label, value, unit, accent = 'orange' }) {
  const a = ACCENT[accent]
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${a.line} to-transparent`} />
      <div className="flex items-start justify-between gap-3">
        <div className="text-[28px] font-semibold leading-none tracking-tight text-white">
          {value}
          {unit && value !== '—' && <span className="ml-1 text-[13px] font-normal text-slate-400">{unit}</span>}
        </div>
        <span className={`mono-label rounded-md border px-1.5 py-1 text-[9px] ${a.chip}`}>{code}</span>
      </div>
      <div className="mono-label mt-3 text-[10px] leading-snug text-slate-400">{label}</div>
    </div>
  )
}

function Section({ title, sub }) {
  return (
    <div className="mb-3 mt-8">
      <div className="mono-label flex items-center gap-2 text-[11px] font-medium text-white">
        <span className="h-px w-4 bg-brand-500" />
        {title}
      </div>
      <p className="mt-1 text-[12px] text-slate-400">{sub}</p>
    </div>
  )
}

function ListCard({ title, empty, items }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mono-label text-[10px] text-slate-300">{title}</div>
      {items.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-[13px]">
          {items.map((it, i) => (
            <li key={i} className="border-b border-white/5 pb-2 last:border-0">
              {it.to ? (
                <Link to={it.to} className="flex items-center justify-between gap-3 hover:text-white">
                  <span className="truncate text-slate-200 hover:underline">{it.title}</span>
                  <span className="mono-label shrink-0 text-[9.5px] text-brand-300">{it.meta} →</span>
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-slate-200">{it.title}</span>
                  <span className="mono-label shrink-0 text-[9.5px] text-brand-300">{it.meta}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function QuickAction({ to, icon, title, sub }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border border-white/10 bg-navy-900/70 p-3 backdrop-blur transition hover:border-brand-500/60 hover:bg-navy-800/80"
    >
      <span className="mono-label grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-brand-500/30 bg-brand-500/10 text-[15px] text-brand-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-white">{title}</span>
        <span className="block truncate text-[11px] text-slate-400">{sub}</span>
      </span>
      <span className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-brand-300" aria-hidden="true">
        →
      </span>
    </Link>
  )
}

export default function Dashboard() {
  const { t } = useLang()
  const { isDemo } = useAuth()
  const d = useDashboard()
  const [bnr, setBnr] = useState(null) // { date, rate } sau false dacă nu e disponibil
  useEffect(() => {
    fetchBnrRate(todayISO()).then(setBnr).catch(() => setBnr(false))
  }, [])
  const time = d.updatedAt.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })

  const quick = [
    ['/deconturi', '＋', t('dash.qDecont')],
    ['/oferte', '⇄', t('dash.qOffer')],
    ['/lead-uri', '◎', t('dash.qLead')],
    ['/clienti', '☰', t('dash.qClient')],
    ['/curse', '➜', t('dash.qTrip')],
    ['/facturi', '€', t('dash.qInvoice')],
    ['/cheltuieli', '≡', t('dash.qCost')],
    ['/pl', '▤', t('dash.qPl')],
  ]

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-10 pt-8 sm:px-8">
      <header className="relative overflow-hidden rounded-2xl border border-white/10">
        <div className="absolute inset-0 bg-navy-900" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/60 to-navy-950/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/80 via-transparent to-transparent" />
        <div className="relative flex min-h-[220px] flex-col justify-between gap-4 p-5 sm:min-h-[260px] sm:p-7">
          <div>
            <div className="mono-label flex items-center gap-2 text-[10px] text-slate-300">
              <span className="h-px w-4 bg-brand-500" />
              {t('dash.overline')}
            </div>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-white sm:text-[30px]">{t('dash.title')}</h1>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="mono-label inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-navy-950/60 px-3 py-2 text-[10px] text-emerald-300 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {isDemo ? t('dash.demo') : t('dash.systemOk')}
              </span>
              <div className="text-[11px] leading-tight text-slate-300">
                {t('dash.lastUpdate')}
                <div className="text-[12px] text-white">{time}</div>
              </div>
            </div>
          </div>
          {bnr !== null && (
            <div className="absolute right-2.5 top-2.5 flex aspect-square w-[68px] flex-col items-center justify-center rounded-lg border border-orange-400/30 bg-navy-950/70 text-center backdrop-blur sm:right-4 sm:top-4 sm:w-[84px]" title={t('dash.bnrTip')}>
              <div className="mono-label !tracking-normal text-[7px] leading-tight text-orange-200/70">
                {bnr?.source === 'ECB' ? 'ECB' : 'BNR'}
                {bnr ? <><br />{fmtDate(bnr.date)}</> : ''}
              </div>
              <div className="mono-label mt-1 text-[8px] text-orange-200/80">1 EUR =</div>
              <div className="led font-mono text-[13px] font-semibold leading-tight sm:text-[15px]">
                {bnr ? Number(bnr.rate).toFixed(4).replace('.', ',') : '—'}
              </div>
              <div className="led font-mono text-[9px] leading-none">RON</div>
            </div>
          )}
        </div>
      </header>

      <Section title={t('dash.finance')} sub={t('dash.financeSub')} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi code="PNL" label={t('dash.weekProfit')} value={fmtMoney(d.weekProfit)} unit="EUR" accent="green" />
        <Kpi code="CUM" label={t('dash.cum')} value={fmtMoney(d.cumProfit)} unit="EUR" accent="green" />
        <Kpi code="INC" label={t('dash.weekRev')} value={fmtMoney(d.weekRevenue)} unit="EUR" accent="orange" />
        <Kpi code="COS" label={t('dash.weekCost')} value={fmtMoney(d.weekCost)} unit="EUR" accent="blue" />
        <Kpi code="FAC" label={t('dash.receivable')} value={fmtMoney(d.receivable)} unit="EUR" accent="orange" />
        <Kpi code="RES" label={t('dash.overdue')} value={fmtMoney(d.overdue)} unit="EUR" accent="red" />
        <Kpi code="REC" label={t('dash.recurring')} value={fmtMoney(d.recurring)} unit="EUR" accent="blue" />
        <Kpi code="NAL" label={t('dash.unalloc')} value={d.unallocated == null ? '—' : String(d.unallocated)} unit="" accent={d.unallocated ? 'red' : 'blue'} />
      </div>

      <Section title={t('dash.activity')} sub={t('dash.activitySub')} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ListCard title={`${t('dash.tripsRunning')} (${d.tripsRunning.length})`} empty={t('dash.emptyTrips')} items={d.tripsRunning} />
        <ListCard title={t('dash.alerts')} empty={t('dash.emptyAlerts')} items={d.alerts} />
      </div>

      <Section title={t('dash.quick')} sub={t('dash.quickSub')} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quick.map(([to, icon, [title, sub]]) => (
          <QuickAction key={to} to={to} icon={icon} title={title} sub={sub} />
        ))}
      </div>
    </div>
  )
}
