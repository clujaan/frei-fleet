import { useState } from 'react'
import { useLang } from '../i18n'
import { ACTIVITY_API } from '../lib/activity'

const REASONS = {
  ro: ['Test / date de probă', 'Greșeală de introducere', 'Duplicat', 'Client a anulat', 'Transportator indisponibil', 'Preț neacceptat', 'Alt motiv'],
  en: ['Test / sample data', 'Entry mistake', 'Duplicate', 'Client cancelled', 'Carrier unavailable', 'Price not accepted', 'Other reason'],
}
const TX = {
  ro: { other: 'Descrie motivul', pick: 'Alege motivul', need: 'Alege un motiv.', needText: 'Descrie motivul (minim 3 caractere).', cancel: 'Renunță' },
  en: { other: 'Describe the reason', pick: 'Choose a reason', need: 'Choose a reason.', needText: 'Describe the reason (at least 3 characters).', cancel: 'Cancel' },
}

function ReasonModal({ title, text, confirmLabel, cancelLabel, noReason, onDone }) {
  const { lang } = useLang()
  const L = lang === 'en' ? 'en' : 'ro'
  const list = REASONS[L]
  const [sel, setSel] = useState('')
  const [free, setFree] = useState('')
  const [err, setErr] = useState('')
  const isOther = sel === list[list.length - 1]
  const ok = () => {
    if (noReason) return onDone(true)
    if (!sel) return setErr(TX[L].need)
    if (isOther && free.trim().length < 3) return setErr(TX[L].needText)
    onDone(isOther ? `${sel}: ${free.trim()}` : sel)
  }
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-navy-950/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onDone(null) }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-semibold text-navy-800">{title}</h2>
        {text && <p className="mt-2 text-[13px] text-slate-600">{text}</p>}
        {!noReason && <select autoFocus className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500" value={sel} onChange={(e) => { setSel(e.target.value); setErr('') }}>
          <option value="">{TX[L].pick}…</option>
          {list.map((r) => <option key={r}>{r}</option>)}
        </select>}
        {!noReason && isOther && <textarea rows={3} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-brand-500" placeholder={TX[L].other} value={free} onChange={(e) => { setFree(e.target.value); setErr('') }} />}
        {err && <p className="mt-2 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => onDone(null)} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{cancelLabel || TX[L].cancel}</button>
          <button onClick={ok} className="rounded-lg bg-rose-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-rose-700">{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// const [askReason, reasonNode] = useReason();  const reason = await askReason({ title, text, confirmLabel });  // null = renunțat
export function useReason() {
  const [req, setReq] = useState(null)
  const ask = (o) => new Promise((res) => setReq({ ...o, res }))
  const node = req ? <ReasonModal {...req} onDone={(v) => { req.res(v); setReq(null) }} /> : null
  return [ask, node]
}

// Ștergere cu avertisment + motiv obligatoriu, înregistrat în Jurnal. Folosire:
//   const [confirmDelete, deleteNode] = useDeleteReason();  ... {deleteNode}
//   if (!(await confirmDelete({ entity: 'trucks', id, code }))) return
export function useDeleteReason() {
  const [ask, node] = useReason()
  const { lang } = useLang()
  const en = lang === 'en'
  const confirmDelete = async ({ entity, id, code, extra }) => {
    const reason = await ask({
      title: `${en ? 'Delete' : 'Ștergere'} ${code || ''}`.trim(),
      text: `${en ? '⚠ Deletion is permanent: the data cannot be restored from the app (a copy remains only in the Activity log).' : '⚠ Ștergerea este definitivă: datele nu se pot recupera din aplicație (rămâne doar o copie în Jurnal).'}${extra ? ` ${extra}` : ''}`,
      confirmLabel: en ? 'Delete permanently' : 'Șterge definitiv',
    })
    if (!reason) return false
    await ACTIVITY_API.event(entity, id, code, 'delete_reason', { reason }).catch(() => {})
    return true
  }
  return [confirmDelete, node]
}
