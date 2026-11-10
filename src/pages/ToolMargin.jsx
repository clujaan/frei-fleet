import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../i18n'
import { fetchBnrRate } from '../lib/bnr'
import { parseNum, todayISO } from '../lib/format'
import ToolShell, { Field, Stat, toolInput as input } from '../components/ToolShell'

const L = (ro, en) => ({ ro, en })
const T = {
  title: L('Calculator de marjă', 'Margin calculator'),
  intro: L('Preț client, cost transportator și cheltuieli extra, în orice combinație RON / EUR. Vezi marja în EUR și %, plus prețul minim pentru marja dorită.', 'Client price, carrier cost and extra costs in any RON / EUR mix. See the margin in EUR and %, plus the minimum price for the margin you want.'),
  price: L('Preț client (fără TVA)', 'Client price (ex. VAT)'), cost: L('Cost transportator', 'Carrier cost'), extra: L('Cheltuieli extra (taxe, parcări…)', 'Extra costs (tolls, parking…)'), km: L('Km încărcat (opțional)', 'Loaded km (optional)'),
  rate: L('Curs RON / EUR', 'RON / EUR rate'), date: L('Data cursului', 'Rate date'), target: L('Marja dorită (% din preț)', 'Desired margin (% of price)'),
  revenue: L('Venit', 'Revenue'), costTotal: L('Cost total', 'Total cost'), margin: L('Marjă', 'Margin'), markup: L('Adaos peste cost', 'Markup over cost'), minPrice: L('Preț minim pentru marja dorită', 'Minimum price for desired margin'), gap: L('Diferență față de prețul actual', 'Difference vs current price'),
  perKm: L('Marjă / km', 'Margin / km'), needRate: L('Ai sume în RON: completează cursul RON / EUR.', 'You have RON amounts: enter the RON / EUR rate.'), src: L('Sursă curs', 'Rate source'),
}
const n = (v) => { const x = parseNum(v); return Number.isFinite(x) ? x : 0 }
const money = (v) => Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Amount({ label, value, cur, onValue, onCur }) {
  return (
    <Field label={label}>
      <div className="flex gap-2"><input inputMode="decimal" className={input} value={value} onChange={(e) => onValue(e.target.value)} />
        <select className={`${input} !w-[88px]`} value={cur} onChange={(e) => onCur(e.target.value)}><option>EUR</option><option>RON</option></select></div>
    </Field>
  )
}

export default function ToolMargin() {
  const { lang } = useLang()
  const [f, setF] = useState({ price: '', pc: 'EUR', cost: '', cc: 'EUR', extra: '', ec: 'EUR', km: '', rate: '', date: todayISO(), target: '10' })
  const [src, setSrc] = useState('')
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  useEffect(() => { fetchBnrRate(f.date).then((r) => { setF((s) => ({ ...s, rate: String(r.rate) })); setSrc(`${r.source || 'BNR'} · ${r.date}`) }).catch(() => setSrc('')) }, [f.date])
  const res = useMemo(() => {
    const rate = n(f.rate)
    const inRon = [f.pc, f.cc, f.ec].some((c, i) => c === 'RON' && n([f.price, f.cost, f.extra][i]))
    if (inRon && !rate) return { err: true }
    const eur = (v, c) => (c === 'RON' ? n(v) / rate : n(v))
    const revenue = eur(f.price, f.pc), cost = eur(f.cost, f.cc) + eur(f.extra, f.ec)
    const margin = revenue - cost
    const tm = Math.min(Math.max(n(f.target), 0), 95) / 100
    const minEur = cost / (1 - tm)
    return { revenue, cost, margin, pct: revenue ? (margin / revenue) * 100 : 0, markup: cost ? (margin / cost) * 100 : 0, minEur, minRon: rate ? minEur * rate : null, gap: revenue - minEur, perKm: n(f.km) ? margin / n(f.km) : null, rate }
  }, [f])

  return (
    <ToolShell title={T.title} intro={T.intro}>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
          <Amount label={T.price[lang]} value={f.price} cur={f.pc} onValue={set('price')} onCur={set('pc')} />
          <Amount label={T.cost[lang]} value={f.cost} cur={f.cc} onValue={set('cost')} onCur={set('cc')} />
          <Amount label={T.extra[lang]} value={f.extra} cur={f.ec} onValue={set('extra')} onCur={set('ec')} />
          <Field label={T.km[lang]}><input inputMode="decimal" className={input} value={f.km} onChange={(e) => set('km')(e.target.value)} /></Field>
          <Field label={T.rate[lang]}><input inputMode="decimal" className={input} value={f.rate} onChange={(e) => set('rate')(e.target.value)} /></Field>
          <Field label={T.date[lang]}><input type="date" className={input} value={f.date} onChange={(e) => set('date')(e.target.value)} /></Field>
          <Field label={T.target[lang]}><input inputMode="decimal" className={input} value={f.target} onChange={(e) => set('target')(e.target.value)} /></Field>
          {src && <p className="self-end text-[12px] text-slate-500">{T.src[lang]}: {src}</p>}
        </div>
        <div className="space-y-3">
          {res.err ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[14px] text-amber-800">{T.needRate[lang]}</p> : (
            <>
              <Stat accent label={T.margin[lang].toUpperCase()} value={`${money(res.margin)} EUR`} sub={`${res.pct.toFixed(1)}% · ${T.markup[lang].toLowerCase()} ${res.markup.toFixed(1)}%`} />
              <div className="grid grid-cols-2 gap-3">
                <Stat label={T.revenue[lang].toUpperCase()} value={`${money(res.revenue)} EUR`} />
                <Stat label={T.costTotal[lang].toUpperCase()} value={`${money(res.cost)} EUR`} />
              </div>
              <Stat label={T.minPrice[lang].toUpperCase()} value={`${money(res.minEur)} EUR`} sub={`${res.minRon != null ? `${money(res.minRon)} RON · ` : ''}${T.gap[lang].toLowerCase()}: ${money(res.gap)} EUR`} />
              {res.perKm != null && <Stat label={T.perKm[lang].toUpperCase()} value={`${money(res.perKm)} EUR`} />}
            </>
          )}
        </div>
      </div>
    </ToolShell>
  )
}
