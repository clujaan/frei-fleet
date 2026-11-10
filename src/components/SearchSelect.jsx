import { useEffect, useMemo, useRef, useState } from 'react'
import { foldText } from '../lib/costs'

// Listă derulantă cu căutare (în loc de <select>): scrii și lista se filtrează pe loc.
// options: [{ value, label, hint? }]. Căutarea ignoră diacriticele și acceptă mai mulți termeni (toți trebuie să existe).
// onAdd (opțional): arată butonul fix de jos (ex. „+ Adresă nouă”), apelat fără să se piardă nimic din formular.
export default function SearchSelect({ value, onChange, options, placeholder = '—', emptyLabel = '—', searchPlaceholder = 'Caută…', noResults = 'Niciun rezultat', addLabel, onAdd, className = '', disabled = false, keepOpenLabel }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const root = useRef(null)
  const inp = useRef(null)

  const prepared = useMemo(() => options.map((o) => ({ ...o, hay: foldText(`${o.label} ${o.hint || ''}`) })), [options])
  const terms = foldText(q).split(/\s+/).filter(Boolean)
  const list = prepared.filter((o) => terms.every((w) => o.hay.includes(w))).slice(0, 200)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const off = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  useEffect(() => { setHi(0) }, [q, open])
  useEffect(() => { if (open) setTimeout(() => inp.current?.focus(), 0) }, [open])

  const choose = (v) => { onChange(v); setOpen(false); setQ('') }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (list[hi]) choose(list[hi].value) }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-slate-500">
        <span className={`truncate ${current ? '' : 'text-slate-400'}`}>{current ? current.label : placeholder}</span>
        <span className="text-[10px] text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg" onKeyDown={onKey}>
          <div className="border-b border-slate-100 p-2">
            <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13.5px] outline-none focus:border-brand-500" />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            <button type="button" onClick={() => choose('')} className="block w-full px-3 py-1.5 text-left text-[13px] text-slate-400 hover:bg-slate-50">{emptyLabel}</button>
            {list.map((o, i) => (
              <button type="button" key={o.value} onMouseEnter={() => setHi(i)} onClick={() => choose(o.value)}
                className={`block w-full px-3 py-1.5 text-left text-[13.5px] ${i === hi ? 'bg-brand-500/10' : ''} ${o.value === value ? 'font-semibold text-navy-800' : 'text-slate-700'}`}>
                <span className="block truncate">{o.label}</span>
                {o.hint && <span className="block truncate text-[11.5px] text-slate-500">{o.hint}</span>}
              </button>
            ))}
            {list.length === 0 && <div className="px-3 py-2 text-[13px] text-slate-500">{noResults}</div>}
          </div>
          {onAdd && (
            <button type="button" onClick={() => { setOpen(false); onAdd(q) }} className="block w-full border-t border-slate-100 px-3 py-2 text-left text-[13px] font-medium text-brand-600 hover:bg-brand-500/10">{addLabel}</button>
          )}
        </div>
      )}
    </div>
  )
}
