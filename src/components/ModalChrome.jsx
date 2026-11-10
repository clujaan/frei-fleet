import { useEffect, useRef, useState } from 'react'
import { useLang } from '../i18n'

// Buton X (dreapta sus) — singura cale de închidere a ferestrelor, pe lângă salvare.
export function CloseX({ onClose }) {
  const { lang } = useLang()
  return (
    <button type="button" onClick={onClose} aria-label={lang === 'en' ? 'Close' : 'Închide'} title={lang === 'en' ? 'Close' : 'Închide'}
      className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-[18px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
  )
}

// Confirmare scurtă „Salvat” după un Save fără ieșire.
export function useFlash() {
  const [flash, setFlash] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const ping = () => { setFlash(true); clearTimeout(timer.current); timer.current = setTimeout(() => setFlash(false), 2500) }
  return [flash, ping]
}

// Două butoane de salvare: onSave(false) = rămâne în fereastră, onSave(true) = salvează și iese.
export function SaveButtons({ busy, onSave, flash }) {
  const { lang } = useLang()
  const en = lang === 'en'
  return (
    <>
      {flash && <span className="self-center text-[13px] text-emerald-600">✓ {en ? 'Saved' : 'Salvat'}</span>}
      <button type="button" disabled={busy} onClick={() => onSave(false)} className="rounded-lg border border-brand-500 px-4 py-2 text-[14px] font-medium text-brand-600 hover:bg-brand-500/10 disabled:opacity-50">{en ? 'Save' : 'Salvează'}</button>
      <button type="button" disabled={busy} onClick={() => onSave(true)} className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600 disabled:opacity-50">{en ? 'Save and Exit' : 'Salvează și ieși'}</button>
    </>
  )
}
