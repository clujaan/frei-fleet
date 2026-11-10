import { useEffect, useMemo, useState } from 'react'
import { backdrop } from '../lib/backdrop'
import { useLang } from '../i18n'
import { fmtMoney } from '../lib/format'
import { fetchBnrRate } from '../lib/bnr'
import { todayISO } from '../lib/format'
import { FREQ, ITEM_KINDS, TRUCKS, TRUCK_DEFAULTS, TRUCK_SECTIONS, calcTruck, fmt3, toNum } from '../lib/trucks'
import ToolShell, { Field, Stat, toolInput as input } from '../components/ToolShell'
import { CloseX, SaveButtons, useFlash } from '../components/ModalChrome'
import { useDeleteReason } from '../components/ReasonModal'

const L = (ro, en) => ({ ro, en })
const T = {
  title: L('Camioane: cost / km', 'Trucks: cost / km'),
  intro: L('Introdu manual datele unui cap tractor și vezi costul pe an, pe lună, pe zi, pe oră și pe km. Calculul urmează modelul tău din Excel; consumul se interpolează după greutatea încărcăturii.', 'Enter a tractor’s data manually and see its cost per year, month, day, hour and km. The calculation follows your Excel model; consumption is interpolated by load weight.'),
  add: L('Camion nou', 'New truck'), none: L('Niciun camion încă.', 'No trucks yet.'), plate: L('Număr', 'Plate'), model: L('Model', 'Model'), perKm: L('Cost / km', 'Cost / km'), perLoaded: L('Cost / km încărcat', 'Cost / loaded km'), status: L('Status', 'Status'),
  save: L('Salvează', 'Save'), cancel: L('Anulează', 'Cancel'), del: L('Ștergi camionul?', 'Delete this truck?'), needPlate: L('Completează numărul de înmatriculare.', 'Enter the plate number.'),
  items: L('Intervenții mecanice, asigurări suplimentare, alte costuri', 'Mechanical interventions, extra insurance, other costs'), addItem: L('＋ Adaugă cost', '＋ Add cost'), itemName: L('Descriere', 'Description'), amount: L('Sumă', 'Amount'), freq: L('Frecvență', 'Frequency'), years: L('Ani (pt. Unic)', 'Years (for One-off)'),
  freqL: { An: L('Pe an', 'Per year'), Lună: L('Pe lună', 'Per month'), Unic: L('Unic, repartizat pe ani', 'One-off, spread over years') },
  results: L('Rezultat', 'Result'), year: L('pe an', 'per year'), month: L('Pe lună', 'Per month'), day: L('Pe zi (20 zile)', 'Per day (20 days)'), hour: L('Pe oră', 'Per hour'), perKmLong: L('COST / KM (toate km)', 'COST / KM (all km)'), perLoadedLong: L('COST / KM ÎNCĂRCAT', 'COST / LOADED KM'),
  total: L('Total costuri', 'Total costs'), overhead: L('Adaos regie', 'Overhead surcharge'), profit: L('Adaos profit și risc', 'Profit and risk surcharge'), grand: L('Total cu adaosuri', 'Total with surcharges'),
  fuelInfo: L('Consum mediu ponderat', 'Weighted average consumption'), litres: L('litri / an', 'litres / year'), mismatch: L('Moneda e RON, dar lipsește cursul RON / EUR: valorile în EUR nu se pot arăta.', 'Currency is RON but the RON / EUR rate is missing: EUR values cannot be shown.'),
  fx: L('Curs BNR/ECB azi', 'Today’s BNR/ECB rate'), notes: L('Observații', 'Notes'), reefTitle: L('Marfă generală vs agregat pornit', 'General cargo vs unit running'), reefGeneral: L('Marfă generală (agregat oprit)', 'General cargo (unit off)'), reefOn: L('Marfă frigorifică (agregat pornit)', 'Refrigerated cargo (unit on)'), reefDay: L('Agregat: cost pe zi pornit (cu adaosuri)', 'Unit: cost per running day (with surcharges)'), reefNote: L('Zilele cu agregat pornit se calculează la media km/zi (km pe an ÷ 240 zile). În costul total anual intră doar zilele din „Zile pe an cu agregat pornit”.', 'Running days use the average km/day (annual km ÷ 240 days). The yearly total includes only the days in “Days per year with unit running”.'), trailer: L('Remorcă', 'Trailer'), note092: L('Adaosurile se calculează la (total / 0,92), ca în Excel.', 'Surcharges are calculated on (total / 0.92), as in the Excel.'),
}

function Modal({ initial, onClose, onSaved }) {
  const { lang } = useLang()
  const editing = !!initial?.id
  const [rid, setRid] = useState(initial?.id || null)
  const [flash, ping] = useFlash()
  const [f, setF] = useState(() => ({
    ...Object.fromEntries(TRUCK_SECTIONS.flatMap((s) => s.fields).map((x) => [x.key, ''])), ...TRUCK_DEFAULTS, notes: '', cost_items: [],
    ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? (k === 'cost_items' ? [] : '')])),
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const items = Array.isArray(f.cost_items) ? f.cost_items : []
  const setItem = (i, k, v) => setF((s) => ({ ...s, cost_items: s.cost_items.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))
  const c = useMemo(() => calcTruck(f), [f])
  const eurRate = f.currency === 'RON' ? toNum(f.fx_rate) : 1
  const other = (v) => (f.currency === 'EUR' ? (toNum(f.fx_rate) > 0 ? { v: v * toNum(f.fx_rate), cur: 'RON' } : null) : eurRate > 0 ? { v: v / eurRate, cur: 'EUR' } : null)
  const money = (v, d = 0) => v.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d })

  const bnr = async () => { try { const r = await fetchBnrRate(todayISO()); setF((s) => ({ ...s, fx_rate: String(r.rate) })) } catch (e) { setErr(e.message) } }
  useEffect(() => { if (!f.fx_rate) fetchBnrRate(todayISO()).then((r) => setF((s) => (s.fx_rate ? s : { ...s, fx_rate: String(r.rate) }))).catch(() => {}) }, [])

  const save = async (exit = true) => {
    if (!String(f.plate).trim()) return setErr(T.needPlate[lang])
    setBusy(true); setErr('')
    try {
      const data = { ...f, plate: f.plate.trim().toUpperCase(), cost_items: items.filter((i) => String(i.name || '').trim() || toNum(i.amount)).map((i) => ({ name: i.name || '', kind: i.kind || 'Alt cost', amount: toNum(i.amount), freq: i.freq || 'An', years: toNum(i.years) || 1 })) }
      const r = await TRUCKS.api.save(rid, data)
      if (r?.id) setRid(r.id)
      setBusy(false)
      if (exit) onSaved(r)
      else { onSaved(r, true); ping() }
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  const Row = ({ label, value, bold }) => (
    <div className={`flex items-baseline justify-between gap-3 py-1 text-[13px] ${bold ? 'font-semibold text-navy-800' : 'text-slate-700'}`}>
      <span>{label}</span><span className="whitespace-nowrap tabular-nums">{money(value)} {f.currency}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-3 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-3 w-full max-w-[1180px] rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{editing ? `${initial.code} · ${initial.plate}` : T.add[lang]}</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <div className="space-y-5">
            {TRUCK_SECTIONS.map((s) => (
              s.fields.some((x) => !x.show || x.show(f)) && <section key={s.key}>
                <h3 className="mono-label border-b border-slate-200 pb-1 text-[10.5px] text-slate-500">{s.title[lang].toUpperCase()}</h3>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {s.fields.filter((x) => !x.show || x.show(f)).map((x) => (
                    <Field key={x.key} label={`${x.label[lang]}${x.required ? ' *' : ''}`} help={x.help?.[lang]}>
                      {x.type === 'select' ? (
                        <select className={input} value={f[x.key]} onChange={set(x.key)}>{x.options.map((o) => <option key={o}>{o}</option>)}</select>
                      ) : x.key === 'fx_rate' ? (
                        <div className="flex gap-2"><input inputMode="decimal" className={input} value={f.fx_rate} onChange={set('fx_rate')} /><button type="button" onClick={bnr} title={T.fx[lang]} className="shrink-0 rounded-lg border border-slate-300 px-2.5 text-[12px] text-brand-600 hover:bg-brand-500/10">BNR</button></div>
                      ) : (
                        <input inputMode={x.type === 'number' ? 'decimal' : undefined} className={input} value={f[x.key]} onChange={set(x.key)} />
                      )}
                    </Field>
                  ))}
                </div>
              </section>
            ))}
            <section>
              <h3 className="mono-label border-b border-slate-200 pb-1 text-[10.5px] text-slate-500">{T.items[lang].toUpperCase()}</h3>
              <div className="mt-2 space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1.4fr_1.1fr_0.8fr_1.1fr_0.6fr_auto]">
                    <input className={`${input} col-span-2 sm:col-span-1`} placeholder={T.itemName[lang]} value={it.name || ''} onChange={(e) => setItem(i, 'name', e.target.value)} />
                    <select className={input} value={it.kind || 'Alt cost'} onChange={(e) => setItem(i, 'kind', e.target.value)}>{ITEM_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
                    <input inputMode="decimal" className={input} placeholder={T.amount[lang]} value={it.amount ?? ''} onChange={(e) => setItem(i, 'amount', e.target.value)} />
                    <select className={input} value={it.freq || 'An'} onChange={(e) => setItem(i, 'freq', e.target.value)}>{FREQ.map((k) => <option key={k} value={k}>{T.freqL[k][lang]}</option>)}</select>
                    <input inputMode="decimal" className={input} placeholder={T.years[lang]} disabled={it.freq !== 'Unic'} value={it.freq === 'Unic' ? it.years ?? '' : ''} onChange={(e) => setItem(i, 'years', e.target.value)} />
                    <button type="button" onClick={() => setF((s) => ({ ...s, cost_items: s.cost_items.filter((_, j) => j !== i) }))} className="rounded px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setF((s) => ({ ...s, cost_items: [...(s.cost_items || []), { name: '', kind: 'Intervenție mecanică', amount: '', freq: 'An', years: 1 }] }))} className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">{T.addItem[lang]}</button>
              </div>
            </section>
            <Field label={T.notes[lang]}><textarea rows={2} className={input} value={f.notes} onChange={set('notes')} /></Field>
          </div>

          <aside className="lg:sticky lg:top-3 lg:self-start">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mono-label text-[10.5px] text-slate-500">{T.results[lang].toUpperCase()} · {f.currency}</h3>
              {f.currency === 'RON' && !toNum(f.fx_rate) && <p className="mt-2 rounded bg-amber-50 p-2 text-[12px] text-amber-800">{T.mismatch[lang]}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Stat accent label={T.perKmLong[lang]} value={`${fmt3(c.perKm)}`} sub={other(c.perKm) ? `${fmt3(other(c.perKm).v)} ${other(c.perKm).cur}` : f.currency} />
                <Stat label={T.perLoadedLong[lang]} value={`${fmt3(c.perLoadedKm)}`} sub={other(c.perLoadedKm) ? `${fmt3(other(c.perLoadedKm).v)} ${other(c.perLoadedKm).cur}` : f.currency} />
                <Stat label={T.month[lang]} value={money(c.perMonth)} sub={other(c.perMonth) ? `${money(other(c.perMonth).v)} ${other(c.perMonth).cur}` : f.currency} />
                <Stat label={T.day[lang]} value={money(c.perDay)} sub={`${T.hour[lang]}: ${money(c.perHour, 1)}`} />
              </div>
              {c.isReefer && (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[12.5px] text-sky-900">
                  <div className="mono-label text-[9.5px] text-sky-700">{T.reefTitle[lang].toUpperCase()}</div>
                  <div className="mt-1 flex justify-between"><span>{T.reefGeneral[lang]}</span><b className="tabular-nums">{fmt3(c.perKmGeneral)} {f.currency} / km</b></div>
                  <div className="flex justify-between"><span>{T.reefOn[lang]}</span><b className="tabular-nums">{fmt3(c.perKmGeneral + c.reeferPerKm)} {f.currency} / km</b></div>
                  <div className="flex justify-between"><span>{T.reefDay[lang]}</span><b className="tabular-nums">{money(c.reeferPerDayFull)} {f.currency}</b></div>
                  <p className="mt-1 text-sky-800/80">{T.reefNote[lang]}</p>
                </div>
              )}
              <div className="mt-4 divide-y divide-slate-200">
                {c.groups.filter((g) => g.rows.length).map((g) => (
                  <div key={g.key} className="py-2">
                    <div className="mono-label text-[9.5px] text-slate-500">{g.title[lang].toUpperCase()}</div>
                    {g.rows.map((r) => <Row key={r.key} label={r.label[lang]} value={r.value} />)}
                    <Row label={`Σ ${g.title[lang]}`} value={g.total} bold />
                  </div>
                ))}
                <div className="py-2">
                  <Row label={T.total[lang]} value={c.total} bold />
                  <Row label={`${T.overhead[lang]} (${f.overhead_pct || 0}%)`} value={c.overhead} />
                  <Row label={`${T.profit[lang]} (${f.profit_pct || 0}%)`} value={c.profit} />
                  <Row label={`${T.grand[lang]} (${T.year[lang]})`} value={c.grand} bold />
                </div>
              </div>
              <p className="mt-2 text-[12px] text-slate-500">{T.fuelInfo[lang]}: {c.l100.toFixed(1)} l/100 km · {money(c.litres)} {T.litres[lang]}. {T.note092[lang]}</p>
            </div>
          </aside>
        </div>
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{T.cancel[lang]}</button>
          <SaveButtons busy={busy} onSave={save} flash={flash} />
        </div>
      </div>
    </div>
  )
}

export default function ToolTrucks() {
  const { lang } = useLang()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null)
  const load = () => TRUCKS.api.list().then(setRows).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])
  const [confirmDel, delNode] = useDeleteReason()
  const remove = async (r) => {
    if (!(await confirmDel({ entity: 'trucks', id: r.id, code: `${r.code} · ${r.plate}` }))) return
    await TRUCKS.api.remove(r.id).catch((e) => setErr(e.message))
    load()
  }
  return (
    <ToolShell wide title={T.title} intro={T.intro} actions={<button onClick={() => setModal({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {T.add[lang]}</button>}>
      {err && <p className="text-rose-600">{err}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows === null ? <p className="p-5 text-slate-500">…</p> : rows.length === 0 ? <p className="p-5 text-slate-500">{T.none[lang]}</p> : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2.5">Cod</th><th className="px-3 py-2.5">{T.plate[lang]}</th><th className="px-3 py-2.5">{T.model[lang]}</th><th className="px-3 py-2.5">{T.trailer[lang]}</th><th className="px-3 py-2.5">{T.perKm[lang]}</th><th className="px-3 py-2.5">{T.perLoaded[lang]}</th><th className="px-3 py-2.5">{T.status[lang]}</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const c = calcTruck(r)
                return (
                  <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal(r)}>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-navy-700">{r.code}</td>
                    <td className="px-3 py-3 font-medium text-navy-800">{r.plate}</td>
                    <td className="px-3 py-3">{r.label}</td>
                    <td className="px-3 py-3">{r.trailer_type === 'Frigorific' ? '❄ Frigorific' : r.trailer_type || 'Prelată'}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{fmt3(c.perKm)} {r.currency}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{fmt3(c.perLoadedKm)} {r.currency}</td>
                    <td className="px-3 py-3">{r.status}</td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}><button onClick={() => remove(r)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {delNode}
      {modal && <Modal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={(_, keep) => { if (!keep) setModal(null); load() }} />}
    </ToolShell>
  )
}
