import { useState } from 'react'
import { ENTITY_LABEL, EVENT_LABEL, fieldLabel } from '../lib/activity'

const ACT_STYLE = {
  create: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  update: 'border-sky-300 bg-sky-50 text-sky-700',
  delete: 'border-rose-300 bg-rose-50 text-rose-700',
  event: 'border-amber-300 bg-amber-50 text-amber-700',
}
const ACT_LABEL = { create: 'Creat', update: 'Modificat', delete: 'Șters', event: 'Eveniment' }

const fmtVal = (k, v) => {
  if (v === null || v === undefined || v === '') return '—'
  if (k.endsWith('_id')) return '…'
  if (typeof v === 'boolean') return v ? 'da' : 'nu'
  if (typeof v === 'object') {
    if (Array.isArray(v) && v.length === 0) return '—'
    const s = JSON.stringify(v)
    return s.length > 140 ? `${s.slice(0, 140)}…` : s
  }
  const s = String(v)
  return s.length > 140 ? `${s.slice(0, 140)}…` : s
}
const fmtAt = (iso) => new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

function describe(r) {
  const what = r.entity === 'documents' ? `${r.detail?.filename || 'fișier'}` : r.record_code || ''
  if (r.action === 'event') return `${EVENT_LABEL[r.summary] || r.summary || 'Eveniment'} ${what}${r.detail?.reason ? ` — ${r.detail.reason}` : ''}`.trim()
  if (r.entity === 'documents') return `${r.action === 'create' ? 'Fișier încărcat' : 'Fișier șters'}: ${what}`
  return what
}

export function userName(r) {
  return r.user_name || r.user_email || 'sistem'
}

export default function ActivityList({ rows, showEntity = true }) {
  const [open, setOpen] = useState({})
  if (!rows.length) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500">Nicio înregistrare.</p>
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {rows.map((r) => {
        const changes = r.changes ? Object.entries(r.changes) : []
        const expandable = changes.length > 0 || (r.action === 'delete' && r.detail)
        return (
          <div key={r.id} className="border-t border-slate-100 first:border-t-0">
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px] ${expandable ? 'cursor-pointer hover:bg-slate-50' : ''}`} onClick={() => expandable && setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}>
              <span className="w-[150px] whitespace-nowrap tabular-nums text-slate-500">{fmtAt(r.at)}</span>
              <span className="w-[130px] truncate font-medium text-navy-800" title={r.user_email || ''}>{userName(r)}</span>
              <span className={`mono-label rounded-full border px-2 py-0.5 text-[9px] ${ACT_STYLE[r.action]}`}>{ACT_LABEL[r.action]}</span>
              {showEntity && <span className="text-slate-500">{ENTITY_LABEL[r.entity] || r.entity}</span>}
              <span className="min-w-0 flex-1 text-navy-800">
                {describe(r)}
                {changes.length > 0 && <span className="ml-2 text-slate-500">{expandable && !open[r.id] ? `· ${changes.map(([k]) => fieldLabel(k)).join(', ')}` : ''}</span>}
              </span>
              {expandable && <span className="text-slate-400">{open[r.id] ? '▲' : '▼'}</span>}
            </div>
            {open[r.id] && changes.length > 0 && (
              <div className="bg-slate-50 px-4 pb-3 pt-1 text-[12.5px]">
                {changes.map(([k, [a, b]]) => (
                  <div key={k} className="py-0.5">
                    <b className="text-navy-800">{fieldLabel(k)}:</b> <span className="text-rose-600 line-through">{fmtVal(k, a)}</span> → <span className="text-emerald-700">{fmtVal(k, b)}</span>
                  </div>
                ))}
              </div>
            )}
            {open[r.id] && r.action === 'delete' && r.detail && (
              <div className="bg-slate-50 px-4 pb-3 pt-1 text-[12.5px] text-slate-600">
                {Object.entries(r.detail).filter(([k, v]) => v !== null && v !== '' && !['id', 'created_at', 'updated_at', 'created_by'].includes(k) && !k.endsWith('_id')).slice(0, 14).map(([k, v]) => (
                  <div key={k}><b className="text-navy-800">{fieldLabel(k)}:</b> {fmtVal(k, v)}</div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
