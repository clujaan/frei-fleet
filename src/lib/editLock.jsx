// Blocare la editare: o cursă / comandă poate fi deschisă pentru editare de un singur utilizator odată.
// Semnal de viață la 30 s; dacă nu mai vine niciunul 90 s (tab închis brusc, net căzut), blocarea expiră singură.
import { useEffect, useRef, useState } from 'react'
import { supabase, isDemo } from './supabase'
import { useAuth } from './auth'
import { useLang } from '../i18n'

const HEARTBEAT_MS = 30000

const nameOf = (user) => user?.user_metadata?.full_name || String(user?.email || '').split('@')[0] || '?'
const hhmm = (iso) => { try { return new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

async function acquire(entity, id, name) {
  const { data, error } = await supabase.rpc('acquire_edit_lock', { p_entity: entity, p_id: id, p_name: name })
  if (error) throw error
  return data
}

// <LockGate entity="trips" id={trip.id} onClose={...}>…fereastra…</LockGate>
// Dacă id lipsește (înregistrare nouă) sau suntem în demo, nu blochează nimic.
export default function LockGate({ entity, id, label, onClose, children }) {
  const { user } = useAuth()
  const { lang } = useLang()
  const [state, setState] = useState(!id || isDemo ? { ok: true } : null)
  const [lost, setLost] = useState(null)
  const [tick, setTick] = useState(0)
  const held = useRef(false)
  const en = lang === 'en'

  useEffect(() => {
    if (!id || isDemo) return undefined
    let alive = true
    let timer
    const name = nameOf(user)
    const beat = async () => {
      try {
        const r = await acquire(entity, id, name)
        if (!alive) return
        if (!held.current) {
          if (r.ok) { held.current = true; setState({ ok: true }); timer = setInterval(beat, HEARTBEAT_MS) } else setState(r)
        } else if (!r.ok) { setLost(r) }
      } catch (e) {
        // fără tabelul/funcțiile din migrarea 027 sau fără rețea: nu blocăm munca
        if (alive && !held.current) setState({ ok: true, unavailable: true })
      }
    }
    beat()
    const release = () => { if (held.current) { held.current = false; supabase.rpc('release_edit_lock', { p_entity: entity, p_id: id }).then(() => {}, () => {}) } }
    window.addEventListener('pagehide', release)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('pagehide', release); release() }
  }, [entity, id, user?.id, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state === null) return null
  if (!state.ok) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h3 className="font-display text-lg font-semibold text-navy-800">🔒 {en ? 'Open by another user' : 'Deschisă de alt utilizator'}</h3>
          <p className="mt-2 text-[14px] text-slate-600">
            {label ? <b>{label}</b> : null}{label ? ' ' : ''}{en ? 'is being edited by' : 'este editată acum de'} <b>{state.user_name || '?'}</b>{state.since ? ` ${en ? 'since' : 'de la'} ${hhmm(state.since)}` : ''}.
            {' '}{en ? 'You can open it once they leave.' : 'O poți deschide după ce iese din ea.'}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-[14px] text-slate-700 hover:bg-slate-100">{en ? 'Close' : 'Închide'}</button>
            <button onClick={() => { setState(null); setTick((x) => x + 1) }} className="rounded-lg bg-brand-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-700">{en ? 'Try again' : 'Reîncearcă'}</button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <>
      {children}
      {lost && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-semibold text-rose-700">🔒 {en ? 'Editing was taken over' : 'Editarea a fost preluată'}</h3>
            <p className="mt-2 text-[14px] text-slate-600">{en ? 'The connection was interrupted for a while and' : 'Conexiunea a fost întreruptă o vreme, iar'} <b>{lost.user_name || '?'}</b> {en ? 'opened it meanwhile. To avoid overwriting their changes, close this window and open it again.' : 'a deschis-o între timp. Ca să nu se suprascrie modificările lui, închide fereastra și redeschide-o.'}</p>
            <div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg bg-brand-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-700">{en ? 'Close' : 'Închide'}</button></div>
          </div>
        </div>
      )}
    </>
  )
}
