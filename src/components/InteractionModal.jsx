import { useState } from 'react'
import { backdrop } from '../lib/backdrop'
import { useLang } from '../i18n'
import { todayISO } from '../lib/format'
import { CHANNELS, CHANNEL_LABEL, DIRECTIONS, DIRECTION_LABEL, INTERACTIONS, LEADS, OPEN_STAGES, OWNERS } from '../lib/sales'
import { CloseX, SaveButtons, useFlash } from './ModalChrome'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const L = (ro, en) => ({ ro, en })
const T = {
  title: L('Interacțiune nouă', 'New interaction'), edit: L('Interacțiune', 'Interaction'),
  date: L('Data', 'Date'), kind: L('Legată de', 'Linked to'), lead: L('Lead', 'Lead'), client: L('Client', 'Client'), pick: L('— alege —', '— choose —'),
  channel: L('Canal', 'Channel'), dir: L('Direcție', 'Direction'), summary: L('Rezumat (ce s-a discutat)', 'Summary (what was discussed)'),
  next: L('Următorul pas', 'Next step'), nextDate: L('Data pasului', 'Step date'), owner: L('Responsabil', 'Owner'),
  sync: L('Actualizează pasul următor pe lead și trece lead-ul „Nou” în „Contactat”', 'Update the lead’s next step and move a “New” lead to “Contacted”'),
  needTarget: L('Alege lead-ul sau clientul.', 'Choose the lead or the client.'), needChannel: L('Alege canalul.', 'Choose the channel.'), save: L('Salvează', 'Save'), cancel: L('Anulează', 'Cancel'),
}

// initial: interacțiune existentă sau { lead_id } / { client_id } pre-completat
export default function InteractionModal({ initial, leads, clients, onClose, onSaved }) {
  const { lang } = useLang()
  const editing = !!initial?.id
  const [rid, setRid] = useState(initial?.id || null)
  const [flash, ping] = useFlash()
  const [kind, setKind] = useState(initial?.client_id && !initial?.lead_id ? 'client' : 'lead')
  const [f, setF] = useState({
    occurred_on: todayISO(), lead_id: '', client_id: '', channel: 'Telefon', direction: 'Inițiat', summary: '', next_step: '', next_step_date: '', owner: '',
    ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? ''])),
  })
  const [sync, setSync] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const lead = kind === 'lead' ? (leads || []).find((l) => l.id === f.lead_id) : null

  const save = async (exit = true) => {
    if (kind === 'lead' ? !f.lead_id : !f.client_id) return setErr(T.needTarget[lang])
    if (!f.channel) return setErr(T.needChannel[lang])
    setBusy(true)
    setErr('')
    try {
      const data = { ...f, lead_id: kind === 'lead' ? f.lead_id : '', client_id: kind === 'client' ? f.client_id : '' }
      const saved = await INTERACTIONS.api.save(rid, data)
      if (lead && sync && !rid) {
        const patch = { ...lead }
        if (f.next_step || f.next_step_date) { patch.next_step = f.next_step; patch.next_step_date = f.next_step_date }
        if (lead.stage === 'Nou') patch.stage = 'Contactat'
        if (OPEN_STAGES.includes(lead.stage)) await LEADS.api.save(lead.id, patch)
      }
      if (saved?.id) setRid(saved.id)
      setBusy(false)
      if (exit) onSaved(saved)
      else { onSaved(saved, true); ping() }
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{(editing ? T.edit : T.title)[lang]}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-[12px] text-slate-600">{T.date[lang]} *
            <input type="date" className={input} value={f.occurred_on} onChange={set('occurred_on')} />
          </label>
          <label className="block text-[12px] text-slate-600">{T.owner[lang]}
            <select className={input} value={f.owner} onChange={set('owner')}><option value="">—</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select>
          </label>
          <div className="sm:col-span-2">
            <div className="text-[12px] text-slate-600">{T.kind[lang]} *</div>
            <div className="mt-1 flex gap-2">
              <select className={`${input} !w-auto`} value={kind} onChange={(e) => setKind(e.target.value)} disabled={editing}>
                <option value="lead">{T.lead[lang]}</option><option value="client">{T.client[lang]}</option>
              </select>
              {kind === 'lead' ? (
                <select className={input} value={f.lead_id} onChange={set('lead_id')} disabled={editing}>
                  <option value="">{T.pick[lang]}</option>{(leads || []).map((l) => <option key={l.id} value={l.id}>{l.code} · {l.company}</option>)}
                </select>
              ) : (
                <select className={input} value={f.client_id} onChange={set('client_id')} disabled={editing}>
                  <option value="">{T.pick[lang]}</option>{(clients || []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.company}</option>)}
                </select>
              )}
            </div>
          </div>
          <label className="block text-[12px] text-slate-600">{T.channel[lang]} *
            <select className={input} value={f.channel} onChange={set('channel')}>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c][lang]}</option>)}</select>
          </label>
          <label className="block text-[12px] text-slate-600">{T.dir[lang]}
            <select className={input} value={f.direction} onChange={set('direction')}>{DIRECTIONS.map((c) => <option key={c} value={c}>{DIRECTION_LABEL[c][lang]}</option>)}</select>
          </label>
          <label className="block text-[12px] text-slate-600 sm:col-span-2">{T.summary[lang]}
            <textarea rows={3} className={input} value={f.summary} onChange={set('summary')} />
          </label>
          <label className="block text-[12px] text-slate-600">{T.next[lang]}
            <input className={input} value={f.next_step} onChange={set('next_step')} />
          </label>
          <label className="block text-[12px] text-slate-600">{T.nextDate[lang]}
            <input type="date" className={input} value={f.next_step_date} onChange={set('next_step_date')} />
          </label>
        </div>
        {lead && !editing && OPEN_STAGES.includes(lead.stage) && (
          <label className="mt-3 flex items-start gap-2 text-[12.5px] text-slate-600"><input type="checkbox" className="mt-0.5" checked={sync} onChange={(e) => setSync(e.target.checked)} />{T.sync[lang]}</label>
        )}
        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{T.cancel[lang]}</button>
          <SaveButtons busy={busy} onSave={save} flash={flash} />
        </div>
      </div>
    </div>
  )
}
