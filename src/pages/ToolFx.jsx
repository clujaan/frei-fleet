import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import { fetchBnrRate } from '../lib/bnr'
import { fmtDate, parseNum, todayISO } from '../lib/format'
import ToolShell, { Field, Stat, toolInput as input } from '../components/ToolShell'

const L = (ro, en) => ({ ro, en })
const T = {
  title: L('Convertor RON / EUR', 'RON / EUR converter'),
  intro: L('Convertește o sumă cu cursul unei zile alese (BNR, iar dacă BNR e indisponibil, ECB).', 'Convert an amount with the rate of a chosen day (BNR, or ECB when BNR is unavailable).'),
  amount: L('Sumă', 'Amount'), from: L('Din', 'From'), date: L('Data', 'Date'), swap: L('Inversează', 'Swap'), result: L('Rezultat', 'Result'), rate: L('Curs folosit', 'Rate used'), asOf: L('Curs din', 'Rate dated'), loading: L('Se caută cursul…', 'Fetching rate…'),
}
const money = (v, d = 2) => Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function ToolFx() {
  const { lang } = useLang()
  const [amount, setAmount] = useState('1000')
  const [from, setFrom] = useState('EUR')
  const [date, setDate] = useState(todayISO())
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { setR(null); setErr(''); fetchBnrRate(date).then(setR).catch((e) => setErr(e.message)) }, [date])
  const a = parseNum(amount)
  const out = r && Number.isFinite(a) ? (from === 'EUR' ? a * r.rate : a / r.rate) : null
  return (
    <ToolShell title={T.title} intro={T.intro}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
          <Field label={T.amount[lang]}><input inputMode="decimal" className={input} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={T.from[lang]}>
            <div className="flex gap-2"><select className={input} value={from} onChange={(e) => setFrom(e.target.value)}><option>EUR</option><option>RON</option></select>
              <button type="button" onClick={() => setFrom(from === 'EUR' ? 'RON' : 'EUR')} title={T.swap[lang]} className="shrink-0 rounded-lg border border-slate-300 px-3 text-brand-600 hover:bg-brand-500/10">⇄</button></div>
          </Field>
          <Field label={T.date[lang]}><input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value || todayISO())} /></Field>
        </div>
        <div className="space-y-3">
          {err ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[14px] text-amber-800">{err}</p> : !r ? <p className="text-slate-500">{T.loading[lang]}</p> : (
            <>
              <Stat accent label={T.result[lang].toUpperCase()} value={out == null ? '—' : `${money(out)} ${from === 'EUR' ? 'RON' : 'EUR'}`} />
              <Stat label={T.rate[lang].toUpperCase()} value={`1 EUR = ${Number(r.rate).toFixed(4).replace('.', ',')} RON`} sub={`${r.source || 'BNR'} · ${T.asOf[lang].toLowerCase()} ${fmtDate(r.date)} · 1 RON = ${(1 / r.rate).toFixed(5).replace('.', ',')} EUR`} />
            </>
          )}
        </div>
      </div>
    </ToolShell>
  )
}
