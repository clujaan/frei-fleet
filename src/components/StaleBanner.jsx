import { STORAGE_PREFIX } from '../config/brand'
import { useEffect, useState } from 'react'
import { SNAPS, changesFor, takeSnapshot } from '../lib/sentSnapshot'

// Banner în fereastra comenzii: ce s-a modificat după trimitere + „Am verificat" / „Retrimite".
const TABLE = { ct: 'transport_orders', cc: 'client_orders' }
export default function StaleBanner({ kind, order, trip, lang = 'ro', onResend, code }) {
  const [snap, setSnap] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!order?.id) return undefined
    let live = true
    const load = () => SNAPS.list(TABLE[kind]).then((rows) => { if (live) setSnap(rows.find((r) => r.entity_id === order.id)?.snapshot || null) }).catch(() => {})
    load()
    window.addEventListener(`${STORAGE_PREFIX}-snaps`, load)
    return () => { live = false; window.removeEventListener(`${STORAGE_PREFIX}-snaps`, load) }
  }, [kind, order?.id, tick])
  const labels = changesFor(kind, order, trip, snap, lang)
  if (!labels.length) return null
  const en = lang === 'en'
  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
      ⚠ {code ? <b>{code}: </b> : null}{en ? 'changed after the order was sent: ' : 'modificat după trimiterea comenzii: '}<b>{labels.join(', ')}</b>.
      {' '}{en ? 'The recipient may have outdated data.' : 'Destinatarul poate avea date vechi.'}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={async () => { await takeSnapshot(kind, order, trip); setTick((x) => x + 1) }} className="rounded-lg border border-amber-400 bg-white px-3 py-1 text-[12.5px] font-medium text-amber-800 hover:bg-amber-100">✓ {en ? 'I checked, all fine' : 'Am verificat, e în regulă'}</button>
        {onResend && <button type="button" onClick={onResend} className="rounded-lg border border-brand-500 bg-white px-3 py-1 text-[12.5px] font-medium text-brand-600 hover:bg-brand-500/10">✉ {en ? 'Resend' : 'Retrimite'}</button>}
      </div>
    </div>
  )
}
