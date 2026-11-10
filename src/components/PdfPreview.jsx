import { useEffect, useState } from 'react'
import { useLang } from '../i18n'

// Previzualizare PDF în fereastră mare: makeBlob() întoarce PDF-ul exact cum ar fi trimis (din datele din formular, fără salvare).
export default function PdfPreview({ title, makeBlob, filename, onClose }) {
  const { lang } = useLang()
  const en = lang === 'en'
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    let made = ''
    makeBlob().then((b) => {
      if (!alive) return
      made = URL.createObjectURL(b)
      setUrl(made)
    }).catch((e) => alive && setErr(e?.message || String(e)))
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-navy-950/80 p-2 sm:p-5">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="mr-auto text-[16px] font-semibold text-navy-800">👁 {title}</h2>
          {url && <a href={url} download={filename} className="rounded-lg border border-brand-500 px-3 py-1.5 text-[13px] font-medium text-brand-600 hover:bg-brand-500/10">⬇ {en ? 'Download' : 'Descarcă'}</a>}
          {url && <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-slate-700 hover:bg-slate-100">↗ {en ? 'Open in new tab' : 'Deschide în tab nou'}</a>}
          <button onClick={onClose} className="rounded-lg bg-brand-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-700">{en ? 'Close' : 'Închide'}</button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-200">
          {err ? <p className="p-5 text-[14px] text-rose-600">{err}</p> : !url ? <p className="p-5 text-[14px] text-slate-500">{en ? 'Generating the PDF…' : 'Se generează PDF-ul…'}</p> : <iframe title={title} src={url} className="h-full w-full border-0" />}
        </div>
        <p className="border-t border-slate-200 px-4 py-2 text-[12px] text-slate-500">{en ? 'Preview from the data in the form (not saved yet). If the PDF does not show here, use “Open in new tab”.' : 'Previzualizare din datele din formular (nesalvate încă). Dacă PDF-ul nu se vede aici, folosește „Deschide în tab nou”.'}</p>
      </div>
    </div>
  )
}
