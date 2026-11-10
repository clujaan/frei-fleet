import { APP_SHORT_NAME, STORAGE_PREFIX } from '../config/brand'
import { OVERLINE } from '../config/brand'
import { useState } from 'react'
import { useLang } from '../i18n'
import { supabase, isDemo } from '../lib/supabase'

// Copie de siguranță a datelor, descărcată pe calculator (până la trecerea pe Supabase Pro, care are backup zilnic).
const TABLES = [
  ['trips', 'Curse'], ['transport_orders', 'Comenzi'], ['client_orders', 'Comenzi client'], ['clients', 'Clienti si adrese'], ['carriers', 'Transportatori'],
  ['freight_offers', 'Oferte burse'], ['leads', 'Leaduri'], ['interactions', 'Interactiuni'], ['general_costs', 'Cheltuieli'],
  ['expense_reports', 'Deconturi'], ['expense_items', 'Linii decont'], ['documents', 'Fisiere (lista)'], ['trucks', 'Camioane'],
  ['toll_countries', 'Taxe tari'], ['toll_extras', 'Taxe extra'], ['toll_corridors', 'Taxe tronsoane'], ['toll_routes', 'Taxe rute salvate'],
  ['activity_log', 'Jurnal'],
]
const PAGE = 1000
const LAST_KEY = `${STORAGE_PREFIX}_last_export`

async function fetchAll(table) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}
const cellVal = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v)
function save(blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
const stamp = () => new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')

export default function ExportDate() {
  const { lang } = useLang()
  const en = lang === 'en'
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [last, setLast] = useState(() => { try { return localStorage.getItem(LAST_KEY) || '' } catch { return '' } })

  const run = async (kind) => {
    setBusy(kind); setErr(''); setMsg('')
    try {
      if (isDemo) throw new Error(en ? 'Not available in demo mode.' : 'Indisponibil în modul demo.')
      const data = {}
      const counts = []
      for (const [tbl, label] of TABLES) {
        try { data[tbl] = await fetchAll(tbl) } catch (e) { if (/does not exist|relation|Could not find|schema cache/.test(e.message)) continue; throw e }
        counts.push(`${label}: ${data[tbl].length}`)
      }
      const name = `${APP_SHORT_NAME}_backup_${stamp()}`
      if (kind === 'json') {
        save(new Blob([JSON.stringify({ exported_at: new Date().toISOString(), tables: data }, null, 1)], { type: 'application/json' }), `${name}.json`)
      } else {
        const ExcelJS = (await import('exceljs')).default
        const wb = new ExcelJS.Workbook()
        for (const [tbl, label] of TABLES) {
          if (!data[tbl]) continue
          const rows = data[tbl]
          const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
          const ws = wb.addWorksheet(label.slice(0, 31))
          if (!cols.length) { ws.addRow(['(gol / empty)']); continue }
          ws.addRow(cols).font = { bold: true }
          rows.forEach((r) => ws.addRow(cols.map((c) => cellVal(r[c]))))
          ws.views = [{ state: 'frozen', ySplit: 1 }]
          cols.forEach((_, i) => { ws.getColumn(i + 1).width = 18 })
        }
        const buf = await wb.xlsx.writeBuffer()
        save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`)
      }
      const when = new Date().toLocaleString('ro-RO')
      try { localStorage.setItem(LAST_KEY, when) } catch { /* ignorat */ }
      setLast(when)
      setMsg(`${en ? 'Exported' : 'Export descărcat'}: ${counts.join(' · ')}`)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  const btn = 'rounded-lg px-4 py-2.5 text-[14px] font-medium disabled:opacity-50'
  return (
    <div className="max-w-3xl">
      <p className="mono-label text-[10px] text-slate-500">— {OVERLINE} / {(en ? 'Data export' : 'Export date').toUpperCase()}</p>
      <h1 className="mt-2 text-[28px] font-semibold text-navy-800">{en ? 'Data export' : 'Export date'}</h1>
      <p className="mt-1 text-[13px] text-slate-500">
        {en ? 'Downloads a full copy of the data (trips, orders, clients, carriers, costs, reports, activity log) to your computer.' : 'Descarcă pe calculator o copie completă a datelor (curse, comenzi, clienți, transportatori, cheltuieli, deconturi, jurnal).'}
      </p>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap gap-3">
          <button disabled={!!busy} onClick={() => run('xlsx')} className={`${btn} bg-brand-500 text-white hover:bg-brand-600`}>{busy === 'xlsx' ? '…' : en ? 'Download Excel (readable)' : 'Descarcă Excel (lizibil)'}</button>
          <button disabled={!!busy} onClick={() => run('json')} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>{busy === 'json' ? '…' : en ? 'Download JSON (full copy)' : 'Descarcă JSON (copie completă)'}</button>
        </div>
        {last && <p className="mt-3 text-[12.5px] text-slate-500">{en ? 'Last export from this browser' : 'Ultimul export din acest browser'}: {last}</p>}
        {msg && <p className="mt-3 text-[13px] text-emerald-700">{msg}</p>}
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        <ul className="mt-4 list-disc space-y-1 pl-5 text-[12.5px] text-slate-600">
          <li>{en ? 'Excel: one sheet per module, easy to read and filter. JSON: complete copy, the form to restore from.' : 'Excel: câte o foaie pe modul, ușor de citit și filtrat. JSON: copia completă, forma din care se poate restaura.'}</li>
          <li>{en ? 'Files (order PDFs, receipts) are not included, only their list. Keep sent order PDFs in your email as well.' : 'Fișierele încărcate (PDF-uri, bonuri) nu sunt incluse, doar lista lor. Păstrează și PDF-urile comenzilor trimise în email.'}</li>
          <li>{en ? 'The files contain real business data: store them in a safe place and do not send them by email.' : 'Fișierele conțin date reale ale firmei: păstrează-le într-un loc sigur și nu le trimite pe email.'}</li>
          <li>{en ? 'Recommended: before every larger change and at least weekly, until Supabase Pro (daily backup) is active.' : 'Recomandat: înainte de fiecare modificare mai mare și măcar săptămânal, până se activează Supabase Pro (backup zilnic).'}</li>
        </ul>
      </div>
    </div>
  )
}
