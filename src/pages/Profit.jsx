// Profit (Etapa 4): pe lună, cursă, camion, șofer, client. Înlocuiește P&L-ul vechi (modelul cu un singur venit pe cursă).
// Calculele: src/lib/fleetCosts.js (tripPnL, monthReport). Reguli: SPEC secț. 6 + DECIZII „Plan extins".
import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLang } from '../i18n'
import { getCompany } from '../lib/company'
import { CLIENTS } from '../lib/entities'
import { computeFleet, loadFleetData } from '../lib/fleetCostsApi'
import { monthKey } from '../lib/fleetCosts'
import { fmtMoney, todayISO } from '../lib/format'

const input = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const th = 'px-3 py-2.5 font-medium'
const td = 'px-3 py-2.5'
const useTx = () => { const { lang } = useLang(); return (ro, en) => (lang === 'en' ? en : ro) }
const TABS = ['summary', 'trips', 'trucks', 'drivers', 'clients']
const tone = (v) => (v < 0 ? 'text-rose-600' : v > 0 ? 'text-emerald-700' : '')
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : '—')
const prevMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return d.toISOString().slice(0, 7) })
}

export default function Profit() {
  const tx = useTx()
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'summary'
  const [ym, setYm] = useState(params.get('m') || todayISO().slice(0, 7))
  const [data, setData] = useState(null)
  const [clients, setClients] = useState([])
  const [err, setErr] = useState('')
  const cur = getCompany().report_currency || 'EUR'

  useEffect(() => {
    loadFleetData().then(setData).catch((e) => setErr(e.message))
    CLIENTS.api.list().then(setClients).catch(() => {})
  }, [])
  const fleet = useMemo(() => (data ? computeFleet(data, cur) : null), [data, cur])
  const R = useMemo(() => (fleet ? fleet.month(ym) : null), [fleet, ym])
  const history = useMemo(() => (fleet ? prevMonths(ym, 12).map((m) => ({ ym: m, ...fleet.month(m).total })) : []), [fleet, ym])

  if (!data || !R) return <div className="p-8 text-slate-500">{err || '…'}</div>
  const truckById = Object.fromEntries(data.trucks.map((t) => [t.id, t]))
  const driverById = Object.fromEntries(data.drivers.map((d) => [d.id, d]))
  const cName = Object.fromEntries(clients.map((c) => [c.id, c.company]))
  const T = R.total
  const tripsInMonth = fleet.rows.filter(({ trip }) => trip.status !== 'Anulată' && monthKey(trip.start_at || trip.load_date) === ym)
    .sort((a, b) => String(a.trip.start_at || '').localeCompare(String(b.trip.start_at || '')))
  const unallocated = fleet.unallocated.filter((it) => monthKey(it.occurred_at || it.moved_at) === ym).length
  const fxIssues = R.missingFx.length + tripsInMonth.filter(({ pnl }) => pnl.missingFx.length).length
  const go = (k) => setParams({ ...(k === 'summary' ? {} : { tab: k }), m: ym }, { replace: true })
  const tabLabel = { summary: tx('Rezumat lună', 'Month summary'), trips: tx('Curse', 'Trips'), trucks: tx('Camioane', 'Trucks'), drivers: tx('Șoferi', 'Drivers'), clients: tx('Clienți', 'Customers') }

  const kpis = [
    [tx('VENIT', 'REVENUE'), T.revenue],
    [tx('PROFIT CURSE', 'TRIP PROFIT'), T.contribution, pct(T.contribution, T.revenue)],
    [tx('PROFIT FLOTĂ', 'FLEET PROFIT'), T.fleetProfit, pct(T.fleetProfit, T.revenue)],
    [tx('PROFIT NET', 'NET PROFIT'), T.netProfit, pct(T.netProfit, T.revenue)],
  ]
  const steps = [
    [tx('Venit (comenzile curselor din lună)', 'Revenue (orders of the month’s trips)'), T.revenue, 'plus'],
    [tx('Costuri directe ale curselor (combustibil, taxe, diurnă, CT-uri…)', 'Direct trip costs (fuel, tolls, per diem, CTs…)'), -T.direct],
    [tx('= Profit curse (contribuție)', '= Trip profit (contribution)'), T.contribution, 'sub'],
    [tx('Costuri fixe camioane (leasing, asigurări…)', 'Truck fixed costs (leasing, insurance…)'), -T.fixed],
    [tx('Alte costuri camioane în lună (service, nealocate)', 'Other truck costs this month (service, unallocated)'), -T.truckOther],
    [data.canPay ? tx('Salarii șoferi', 'Driver salaries') : tx('Salarii șoferi (ascunse pentru rolul tău)', 'Driver salaries (hidden for your role)'), -T.salaries],
    [tx('= Profit flotă', '= Fleet profit'), T.fleetProfit, 'sub'],
    [tx('Cheltuieli generale (birou, contabilitate…)', 'General costs (office, accounting…)'), -T.overhead],
    [tx('= Profit net', '= Net profit'), T.netProfit, 'total'],
  ]

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {tx('PROFIT', 'PROFIT')}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{tx('Profit', 'Profit')}</h1>
        <div className="flex items-center gap-2"><span className="text-[13px] text-slate-600">{tx('Luna', 'Month')}</span><input type="month" className={input} value={ym} onChange={(e) => { if (e.target.value) { setYm(e.target.value); setParams({ ...(tab === 'summary' ? {} : { tab }), m: e.target.value }, { replace: true }) } }} /></div>
      </div>
      {err && <p className="mt-3 text-rose-600">{err}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([l, v, p]) => (
          <div key={l} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mono-label text-[10px] text-slate-500">{l}</div>
            <div className={`mt-1 text-[24px] font-semibold ${p ? tone(v) : 'text-navy-800'}`}>{fmtMoney(v)} <span className="text-[13px] font-normal text-slate-500">{cur}</span></div>
            {p && <div className="text-[11.5px] text-slate-500">{p} {tx('din venit', 'of revenue')}</div>}
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-1 text-[12.5px]">
        {unallocated > 0 && <p className="text-amber-700">⚠ {unallocated} {tx('costuri ale lunii nu sunt legate de nicio cursă (intră la camion).', 'costs of the month are not linked to a trip (counted on the truck).')} <Link to="/costuri-flota?tab=unalloc" className="font-medium underline">{tx('Alocă-le →', 'Allocate them →')}</Link></p>}
        {fxIssues > 0 && <p className="text-amber-700">⚠ {tx('Unele sume nu au curs RON/EUR și nu sunt în total.', 'Some amounts have no RON/EUR rate and are not in the total.')}</p>}
        {!data.canPay && <p className="text-slate-500">🔒 {tx('Salariile nu sunt incluse pentru rolul tău, deci profitul flotei și cel net sunt mai mari decât în realitate.', 'Salaries are not included for your role, so fleet and net profit are higher than in reality.')}</p>}
        {T.unassignedSalary > 0 && <p className="text-slate-500">{tx('Salarii ale șoferilor fără curse în lună (intră doar în totalul flotei):', 'Salaries of drivers without trips this month (only in the fleet total):')} {fmtMoney(T.unassignedSalary)} {cur}</p>}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((k) => <button key={k} onClick={() => go(k)} className={`rounded-lg border px-4 py-2 text-[13.5px] ${tab === k ? 'border-brand-500 bg-brand-500/10 font-medium text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{tabLabel[k]}</button>)}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {tab === 'summary' && (
          <div className="grid gap-6 p-4 lg:grid-cols-2">
            <table className="w-full text-[13.5px]">
              <tbody>
                {steps.map(([l, v, k]) => (
                  <tr key={l} className={k === 'sub' || k === 'total' ? 'border-t border-slate-200 font-semibold' : ''}>
                    <td className={`py-1.5 ${k ? 'text-navy-800' : 'text-slate-600'}`}>{l}</td>
                    <td className={`py-1.5 text-right tabular-nums ${k === 'sub' || k === 'total' ? tone(v) : ''} ${k === 'total' ? 'text-[16px]' : ''}`}>{fmtMoney(v)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-100 text-[12px] text-slate-500"><td className="py-1.5">{T.trips} {tx('curse', 'trips')} · {fmtMoney(T.km)} km{T.km ? ` · ${tx('profit curse / km', 'trip profit / km')} ${fmtMoney(T.contribution / T.km)} ${cur}` : ''}</td><td /></tr>
              </tbody>
            </table>
            <div>
              <div className="mono-label mb-2 text-[10px] text-slate-500">{tx('ULTIMELE 12 LUNI', 'LAST 12 MONTHS')} · {cur}</div>
              <table className="w-full text-[12.5px]">
                <thead className="text-[10.5px] uppercase tracking-wider text-slate-500"><tr><th className="py-1 text-left">{tx('Luna', 'Month')}</th><th className="py-1 text-right">{tx('Curse', 'Trips')}</th><th className="py-1 text-right">{tx('Venit', 'Revenue')}</th><th className="py-1 text-right">{tx('Profit curse', 'Trip profit')}</th><th className="py-1 text-right">{tx('Profit net', 'Net profit')}</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.ym} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${h.ym === ym ? 'bg-brand-500/5 font-medium' : ''}`} onClick={() => { setYm(h.ym); setParams({ m: h.ym }, { replace: true }) }}>
                      <td className="py-1">{h.ym}</td><td className="py-1 text-right tabular-nums">{h.trips}</td><td className="py-1 text-right tabular-nums">{fmtMoney(h.revenue)}</td>
                      <td className={`py-1 text-right tabular-nums ${tone(h.contribution)}`}>{fmtMoney(h.contribution)}</td><td className={`py-1 text-right tabular-nums ${tone(h.netProfit)}`}>{fmtMoney(h.netProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'trips' && (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Cursă', 'Trip')}</th><th className={th}>{tx('Camion / șofer', 'Truck / driver')}</th><th className={`${th} text-right`}>{tx('Venit', 'Revenue')}</th><th className={`${th} text-right`}>{tx('Costuri directe', 'Direct costs')}</th><th className={`${th} text-right`}>{tx('Profit', 'Profit')}</th><th className={`${th} text-right`}>%</th><th className={`${th} hidden md:table-cell text-right`}>km</th><th className={`${th} hidden md:table-cell text-right`}>{tx('Cost / km', 'Cost / km')}</th><th className={`${th} hidden lg:table-cell text-right`}>l/100</th></tr></thead>
            <tbody>
              {tripsInMonth.map(({ trip, pnl }) => (
                <tr key={trip.id} className="border-t border-slate-100">
                  <td className={`${td} font-medium text-navy-700`}><Link to="/curse" className="hover:underline">{trip.code}</Link>{trip.kind === 'subcontracted' && <div className="mono-label text-[9px] font-normal text-violet-700">{tx('SUBCONTRACTATĂ', 'SUBCONTRACTED')}</div>}<div className="text-[11px] font-normal text-slate-400">{String(trip.start_at || trip.load_date || '').slice(0, 10)}</div></td>
                  <td className={td}>{truckById[trip.truck_id]?.plate || '—'}<div className="text-[11.5px] text-slate-500">{[driverById[trip.driver_id]?.full_name, driverById[trip.driver2_id]?.full_name].filter(Boolean).join(' + ')}</div></td>
                  <td className={`${td} text-right tabular-nums`}>{fmtMoney(pnl.revenue)}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtMoney(pnl.direct)}</td>
                  <td className={`${td} text-right font-medium tabular-nums ${tone(pnl.contribution)}`}>{fmtMoney(pnl.contribution)}</td>
                  <td className={`${td} text-right tabular-nums text-slate-500`}>{pnl.marginPct != null ? `${pnl.marginPct}%` : '—'}</td>
                  <td className={`${td} hidden text-right tabular-nums md:table-cell`}>{pnl.km || '—'}</td>
                  <td className={`${td} hidden text-right tabular-nums md:table-cell`}>{pnl.costPerKm != null ? fmtMoney(pnl.costPerKm) : '—'}</td>
                  <td className={`${td} hidden text-right tabular-nums lg:table-cell ${pnl.warnings.includes('consumption') ? 'text-amber-700' : ''}`}>{pnl.consumption != null ? fmtMoney(pnl.consumption) : '—'}</td>
                </tr>
              ))}
              {tripsInMonth.length === 0 && <tr><td colSpan={9} className="p-5 text-slate-500">{tx('Nicio cursă plecată în această lună.', 'No trip departed this month.')}</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'trucks' && (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Camion', 'Truck')}</th><th className={`${th} text-right`}>{tx('Curse', 'Trips')}</th><th className={`${th} hidden sm:table-cell text-right`}>km</th><th className={`${th} text-right`}>{tx('Profit curse', 'Trip profit')}</th><th className={`${th} text-right`}>{tx('Fixe', 'Fixed')}</th><th className={`${th} text-right`}>{tx('Alte', 'Other')}</th><th className={`${th} text-right`}>{tx('Salarii', 'Salaries')}</th><th className={`${th} text-right`}>{tx('Profit', 'Profit')}</th><th className={`${th} hidden md:table-cell text-right`}>{tx('Profit / km', 'Profit / km')}</th></tr></thead>
            <tbody>
              {[...R.trucks].sort((a, b) => b.profit - a.profit).map((r) => (
                <tr key={r.truck_id} className="border-t border-slate-100">
                  <td className={`${td} font-medium text-navy-700`}>{truckById[r.truck_id]?.plate || '—'}<div className="text-[11.5px] font-normal text-slate-500">{[truckById[r.truck_id]?.make, truckById[r.truck_id]?.model].filter(Boolean).join(' ')}</div></td>
                  <td className={`${td} text-right tabular-nums`}>{r.trips}</td>
                  <td className={`${td} hidden text-right tabular-nums sm:table-cell`}>{r.km || '—'}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtMoney(r.contribution)}</td>
                  <td className={`${td} text-right tabular-nums text-slate-600`}>{r.fixed ? `−${fmtMoney(r.fixed)}` : '—'}</td>
                  <td className={`${td} text-right tabular-nums text-slate-600`}>{r.other ? `−${fmtMoney(r.other)}` : '—'}</td>
                  <td className={`${td} text-right tabular-nums text-slate-600`}>{r.salary ? `−${fmtMoney(r.salary)}` : '—'}</td>
                  <td className={`${td} text-right font-medium tabular-nums ${tone(r.profit)}`}>{fmtMoney(r.profit)}</td>
                  <td className={`${td} hidden text-right tabular-nums md:table-cell`}>{r.km ? fmtMoney(r.profit / r.km) : '—'}</td>
                </tr>
              ))}
              {R.subcontracted.trips > 0 && <tr className="border-t border-slate-100 text-slate-600"><td className={td}>{tx('Curse subcontractate', 'Subcontracted trips')}</td><td className={`${td} text-right tabular-nums`}>{R.subcontracted.trips}</td><td className="hidden sm:table-cell" /><td className={`${td} text-right tabular-nums`}>{fmtMoney(R.subcontracted.contribution)}</td><td colSpan={3} /><td className={`${td} text-right font-medium tabular-nums ${tone(R.subcontracted.contribution)}`}>{fmtMoney(R.subcontracted.contribution)}</td><td className="hidden md:table-cell" /></tr>}
            </tbody>
          </table>
        )}

        {tab === 'drivers' && (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Șofer', 'Driver')}</th><th className={`${th} text-right`}>{tx('Curse', 'Trips')}</th><th className={`${th} text-right`}>{tx('Zile în cursă', 'Days on trip')}</th><th className={`${th} text-right`}>{tx('Profit curse', 'Trip profit')}</th>{data.canPay && <th className={`${th} text-right`}>{tx('Cost salarial', 'Salary cost')}</th>}{data.canPay && <th className={`${th} text-right`}>{tx('Profit', 'Profit')}</th>}</tr></thead>
            <tbody>
              {[...R.drivers].sort((a, b) => b.contribution - a.contribution).map((r) => (
                <tr key={r.driver_id} className="border-t border-slate-100">
                  <td className={`${td} font-medium text-navy-700`}>{driverById[r.driver_id]?.full_name || '—'}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.trips}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.days || '—'}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtMoney(r.contribution)}</td>
                  {data.canPay && <td className={`${td} text-right tabular-nums text-slate-600`}>{r.salary ? `−${fmtMoney(r.salary)}` : '—'}</td>}
                  {data.canPay && <td className={`${td} text-right font-medium tabular-nums ${tone(r.profit)}`}>{fmtMoney(r.profit)}</td>}
                </tr>
              ))}
              {R.drivers.length === 0 && <tr><td colSpan={6} className="p-5 text-slate-500">{tx('Niciun șofer în curse luna aceasta.', 'No driver on trips this month.')}</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'clients' && (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className={th}>{tx('Client', 'Customer')}</th><th className={`${th} text-right`}>{tx('Comenzi', 'Orders')}</th><th className={`${th} text-right`}>{tx('Venit', 'Revenue')}</th><th className={`${th} text-right`}>{tx('Cost repartizat', 'Allocated cost')}</th><th className={`${th} text-right`}>{tx('Profit', 'Profit')}</th><th className={`${th} text-right`}>%</th></tr></thead>
            <tbody>
              {R.clients.map((r) => (
                <tr key={r.client_id || 'none'} className="border-t border-slate-100">
                  <td className={`${td} font-medium text-navy-700`}>{r.client_id ? cName[r.client_id] || '—' : tx('(fără client)', '(no customer)')}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.orders}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtMoney(r.revenue)}</td>
                  <td className={`${td} text-right tabular-nums text-slate-600`}>{fmtMoney(r.cost)}</td>
                  <td className={`${td} text-right font-medium tabular-nums ${tone(r.profit)}`}>{fmtMoney(r.profit)}</td>
                  <td className={`${td} text-right tabular-nums text-slate-500`}>{pct(r.profit, r.revenue)}</td>
                </tr>
              ))}
              {R.clients.length === 0 && <tr><td colSpan={6} className="p-5 text-slate-500">{tx('Nicio comandă în cursele lunii.', 'No orders on the month’s trips.')}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-[12px] text-slate-500">{tx(
        'Cursa intră în luna în care a plecat din bază. Profitul cursei = venit − costuri directe. Costul cursei se împarte pe comenzi după criteriul cursei (LDM implicit); distribuția subcontractată după marfa pe care o duce. Salariile se împart pe camioane după zilele condusă în lună. Calcule de ajutor; regulile fiscale se validează cu contabilul.',
        'A trip counts in the month it left the base. Trip profit = revenue − direct costs. The trip cost is split across orders by the trip’s basis (LDM by default); subcontracted distribution by the goods it carries. Salaries are split across trucks by days driven in the month. Helper calculations; tax rules are validated with the accountant.')}</p>
    </div>
  )
}
