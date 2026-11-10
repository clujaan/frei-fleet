import { OVERLINE } from '../config/brand'
import { useState } from 'react'
import { useLang } from '../i18n'

export const toolInput = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

// Cadru comun pentru paginile din Tools
export default function ToolShell({ title, intro, actions, children, wide }) {
  const { lang } = useLang()
  return (
    <div className={`mx-auto px-5 py-8 sm:px-8 ${wide ? 'max-w-[1200px]' : 'max-w-[960px]'}`}>
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / TOOLS / {title[lang].toUpperCase()}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{title[lang]}</h1>
        {actions}
      </div>
      {intro && <p className="mt-2 max-w-[760px] text-[14px] text-slate-600">{intro[lang]}</p>}
      <div className="mt-5">{children}</div>
    </div>
  )
}

export function Field({ label, children, className = '', help }) {
  const [open, setOpen] = useState(false)
  if (!help) return <label className={`block text-[12px] text-slate-600 ${className}`}>{label}{children}</label>
  return (
    <div className={`block text-[12px] text-slate-600 ${className}`}>
      <div className="flex items-start gap-1.5">
        <span>{label}</span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Info"
          className={`mt-px grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border text-[10px] font-semibold italic leading-none ${open ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-400 text-slate-500 hover:border-brand-500 hover:text-brand-600'}`}>i</button>
      </div>
      {open && <p className="mb-1 mt-1 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-[12.5px] leading-relaxed text-sky-900">{help}</p>}
      {children}
    </div>
  )
}

export function Stat({ label, value, sub, accent }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'border-brand-500/50 bg-brand-500/10' : 'border-slate-200 bg-white'}`}>
      <div className="mono-label text-[9.5px] text-slate-500">{label}</div>
      <div className="mt-1 text-[22px] font-semibold leading-tight text-navy-800">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-slate-500">{sub}</div>}
    </div>
  )
}
