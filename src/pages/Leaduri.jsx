import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { backdrop } from '../lib/backdrop'
import { useLang } from '../i18n'
import { EUROPE } from '../lib/places'
import { fmtDate, todayISO } from '../lib/format'
import { CHANNEL_ICON, CLIENTS, INTERACTIONS, LEADS, OPEN_STAGES, OWNERS, SOURCES, STAGES, STAGE_LABEL, STAGE_STYLE, convertLead, isOverdue, leadDue } from '../lib/sales'
import InteractionModal from '../components/InteractionModal'
import { CloseX, SaveButtons, useFlash } from '../components/ModalChrome'
import { useDeleteReason } from '../components/ReasonModal'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const L = (ro, en) => ({ ro, en })
const T = {
  title: L('Lead-uri', 'Leads'), newLead: L('Lead nou', 'New lead'), search: L('Caută firmă, contact, interes…', 'Search company, contact, interest…'),
  allOwners: L('Toți responsabilii', 'All owners'), due: L('Doar pași scadenți', 'Due steps only'), none: L('Niciun lead.', 'No leads.'),
  company: L('Firmă', 'Company'), contact: L('Contact', 'Contact'), stage: L('Stadiu', 'Stage'), step: L('Următorul pas', 'Next step'), owner: L('Responsabil', 'Owner'), last: L('Ultima interacțiune', 'Last interaction'),
  f_cui: L('CUI', 'VAT ID'), f_country: L('Țară', 'Country'), f_contact: L('Persoană de contact', 'Contact person'), f_role: L('Funcție', 'Role'), f_phone: L('Telefon', 'Phone'), f_email: L('Email', 'Email'),
  f_source: L('Sursă', 'Source'), f_interest: L('Marfă / rute de interes', 'Cargo / routes of interest'), f_vol: L('Volum estimat (curse/lună)', 'Estimated volume (trips/month)'),
  f_next: L('Următorul pas', 'Next step'), f_nextDate: L('Data pasului', 'Step date'), f_lost: L('Motiv pierdere', 'Lost reason'), f_notes: L('Observații', 'Notes'), f_added: L('Adăugat la', 'Added on'),
  needName: L('Completează numele firmei.', 'Enter the company name.'), needLost: L('Completează motivul pierderii.', 'Enter the reason for losing the lead.'),
  convert: L('Convertește în client', 'Convert to client'), converted: L('Client creat', 'Client created'), linked: L('Legat de clientul existent', 'Linked to existing client'),
  convertAsk: L('Creezi clientul din acest lead? Datele de contact se copiază, lead-ul devine „Convertit în client”.', 'Create a client from this lead? Contact details are copied and the lead becomes “Converted to client”.'),
  hist: L('Istoric interacțiuni', 'Interaction history'), addInt: L('＋ Interacțiune', '＋ Interaction'), noInt: L('Nicio interacțiune încă.', 'No interactions yet.'),
  delAsk: L('Ștergi lead-ul? Se șterg și interacțiunile lui.', 'Delete this lead? Its interactions are deleted too.'), save: L('Salvează', 'Save'), cancel: L('Anulează', 'Cancel'),
  overdue: L('întârziat', 'overdue'), today: L('azi', 'today'), open: L('Active', 'Open'), dueKpi: L('Pași scadenți', 'Due steps'),
}

function LeadModal({ initial, clients, interactions, leads, onClose, onSaved }) {
  const { lang } = useLang()
  const [rid, setRid] = useState(initial?.id || null)
  const editing = !!rid
  const [flash, ping] = useFlash()
  const [f, setF] = useState(() => ({ added_on: todayISO(), stage: 'Nou', ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? ''])) }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [intModal, setIntModal] = useState(null)
  const [hist, setHist] = useState(interactions)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const mine = (hist || []).filter((i) => i.lead_id === rid).sort((a, b) => String(b.occurred_on).localeCompare(String(a.occurred_on)))
  const client = f.client_id ? (clients || []).find((c) => c.id === f.client_id) : null
  const lockedStage = f.stage === 'Convertit în client'

  const save = async (exit = true) => {
    if (!String(f.company).trim()) return setErr(T.needName[lang])
    if (f.stage === 'Pierdut' && !String(f.lost_reason).trim()) return setErr(T.needLost[lang])
    setBusy(true)
    setErr('')
    try {
      const r = await LEADS.api.save(rid, { ...f, lost_reason: f.stage === 'Pierdut' ? f.lost_reason : '' })
      if (r?.id) { setRid(r.id); setF((s) => ({ ...s, id: r.id, code: r.code ?? s.code })) }
      setBusy(false)
      if (exit) onSaved(r)
      else { onSaved(r, true); ping() }
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }
  const convert = async () => {
    if (!window.confirm(T.convertAsk[lang])) return
    setBusy(true)
    setErr('')
    try {
      const r = await convertLead(f.id ? f : { ...f, id: rid }, clients)
      setF((s) => ({ ...s, stage: 'Convertit în client', client_id: r.client.id }))
      setInfo(`${r.linked ? T.linked[lang] : T.converted[lang]}: ${r.client.code} · ${r.client.company}`)
      setBusy(false)
      onSaved(r.lead, true)
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }
  const reloadHist = () => INTERACTIONS.api.list().then(setHist)

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-navy-950/60 p-4 sm:place-items-center" {...backdrop(onClose)}>
      <div className="relative my-4 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
<CloseX onClose={onClose} />
        <h2 className="text-[18px] font-semibold text-navy-800">{editing ? `${f.code || initial?.code || ""} · ${initial?.company ?? f.company}` : T.newLead[lang]}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-[12px] text-slate-600 sm:col-span-2">{T.company[lang]} *<input className={input} value={f.company ?? ''} onChange={set('company')} /></label>
          <label className="block text-[12px] text-slate-600">{T.f_cui[lang]}<input className={input} value={f.cui ?? ''} onChange={set('cui')} /></label>
          <label className="block text-[12px] text-slate-600">{T.f_country[lang]}
            <select className={input} value={f.country ?? ''} onChange={set('country')}><option value="">—</option>{EUROPE.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="block text-[12px] text-slate-600">{T.f_contact[lang]}<input className={input} value={f.contact_name ?? ''} onChange={set('contact_name')} /></label>
          <label className="block text-[12px] text-slate-600">{T.f_role[lang]}<input className={input} value={f.contact_role ?? ''} onChange={set('contact_role')} /></label>
          <label className="block text-[12px] text-slate-600">{T.f_phone[lang]}<input className={input} value={f.phone ?? ''} onChange={set('phone')} /></label>
          <label className="block text-[12px] text-slate-600">{T.f_email[lang]}<input className={input} value={f.email ?? ''} onChange={set('email')} /></label>
          <label className="block text-[12px] text-slate-600">{T.f_source[lang]}
            <select className={input} value={f.source ?? ''} onChange={set('source')}><option value="">—</option>{SOURCES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="block text-[12px] text-slate-600">{T.f_vol[lang]}<input inputMode="numeric" className={input} value={f.est_volume ?? ''} onChange={set('est_volume')} /></label>
          <label className="block text-[12px] text-slate-600 sm:col-span-2">{T.f_interest[lang]}<input className={input} value={f.interest ?? ''} onChange={set('interest')} /></label>
          <label className="block text-[12px] text-slate-600">{T.stage[lang]} *
            <select className={input} value={f.stage} onChange={set('stage')} disabled={lockedStage}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s][lang]}</option>)}</select>
          </label>
          <label className="block text-[12px] text-slate-600">{T.owner[lang]}
            <select className={input} value={f.owner ?? ''} onChange={set('owner')}><option value="">—</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select>
          </label>
          {f.stage === 'Pierdut' && <label className="block text-[12px] text-slate-600 sm:col-span-2">{T.f_lost[lang]} *<input className={input} value={f.lost_reason ?? ''} onChange={set('lost_reason')} /></label>}
          <label className="block text-[12px] text-slate-600">{T.f_next[lang]}<input className={input} value={f.next_step ?? ''} onChange={set('next_step')} /></label>
          <label className="block text-[12px] text-slate-600">{T.f_nextDate[lang]}<input type="date" className={input} value={f.next_step_date ?? ''} onChange={set('next_step_date')} /></label>
          <label className="block text-[12px] text-slate-600">{T.f_added[lang]}<input type="date" className={input} value={f.added_on ?? ''} onChange={set('added_on')} /></label>
          <label className="block text-[12px] text-slate-600 sm:col-span-2">{T.f_notes[lang]}<textarea rows={2} className={input} value={f.notes ?? ''} onChange={set('notes')} /></label>
        </div>

        {client && <p className="mt-3 rounded-lg bg-emerald-50 p-2.5 text-[12.5px] text-emerald-800">✓ {client.code} · {client.company}</p>}
        {info && <p className="mt-2 rounded-lg bg-emerald-50 p-2.5 text-[12.5px] text-emerald-800">✓ {info}</p>}

        {editing && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="mono-label text-[10.5px] text-slate-500">{T.hist[lang].toUpperCase()}</h3>
              <button onClick={() => setIntModal({ lead_id: rid, owner: f.owner || '' })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] text-brand-600 hover:bg-brand-500/10">{T.addInt[lang]}</button>
            </div>
            {mine.length === 0 ? <p className="mt-2 text-[13px] text-slate-500">{T.noInt[lang]}</p> : (
              <ul className="mt-2 space-y-2">
                {mine.map((i) => (
                  <li key={i.id} className="rounded-lg border border-slate-200 p-2.5 text-[13px]">
                    <div className="text-slate-500">{CHANNEL_ICON[i.channel] || ''} {i.channel} · {fmtDate(i.occurred_on)}{i.owner ? ` · ${i.owner}` : ''}</div>
                    {i.summary && <div className="mt-0.5 text-slate-800">{i.summary}</div>}
                    {i.next_step && <div className="mt-0.5 text-slate-600">→ {i.next_step}{i.next_step_date ? ` (${fmtDate(i.next_step_date)})` : ''}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {editing && !lockedStage && f.stage !== 'Pierdut' && <button disabled={busy} onClick={convert} className="mr-auto rounded-lg border border-emerald-400 px-4 py-2 text-[14px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{T.convert[lang]}</button>}
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-slate-600 hover:bg-slate-100">{T.cancel[lang]}</button>
          <SaveButtons busy={busy} onSave={save} flash={flash} />
        </div>
      </div>
      {intModal && <InteractionModal initial={intModal} leads={leads} clients={clients} onClose={() => setIntModal(null)} onSaved={(_, keep) => { if (!keep) setIntModal(null); reloadHist() }} />}
    </div>
  )
}

export default function Leaduri() {
  const { lang } = useLang()
  const [rows, setRows] = useState(null)
  const [ints, setInts] = useState([])
  const [clients, setClients] = useState([])
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null)
  const [q, setQ] = useState('')
  const [fStage, setFStage] = useState('')
  const [fOwner, setFOwner] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)

  const load = async () => {
    try {
      const [l, i, c] = await Promise.all([LEADS.api.list(), INTERACTIONS.api.list(), CLIENTS.api.list()])
      setRows(l); setInts(i); setClients(c)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  const lastInt = useMemo(() => {
    const m = {}
    for (const i of ints) if (i.lead_id && (!m[i.lead_id] || i.occurred_on > m[i.lead_id])) m[i.lead_id] = i.occurred_on
    return m
  }, [ints])
  const terms = fold(q).split(/\s+/).filter(Boolean)
  const view = (rows || [])
    .filter((r) => { const h = fold([r.code, r.company, r.contact_name, r.interest, r.email, r.phone, r.cui].join(' ')); return terms.every((w) => h.includes(w)) })
    .filter((r) => (!fStage || r.stage === fStage) && (!fOwner || r.owner === fOwner) && (!onlyDue || leadDue(r)))
    .sort((a, b) => {
      const da = leadDue(a) ? 0 : 1, db = leadDue(b) ? 0 : 1
      return da - db || String(a.next_step_date || '9999').localeCompare(String(b.next_step_date || '9999')) || b.code.localeCompare(a.code)
    })
  const count = (s) => (rows || []).filter((r) => r.stage === s).length
  const dueCount = (rows || []).filter(leadDue).length
  const [confirmDel, delNode] = useDeleteReason()
  const remove = async (r) => {
    if (!(await confirmDel({ entity: 'leads', id: r.id, code: `${r.code} · ${r.company}` }))) return
    await LEADS.api.remove(r.id).catch((e) => setErr(e.message))
    load()
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {T.title[lang].toUpperCase()}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{T.title[lang]}</h1>
        <button onClick={() => setModal({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {T.newLead[lang]}</button>
      </div>
      {err && <p className="mt-3 text-rose-600">{err}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={() => { setFStage(''); setOnlyDue(false) }} className={`rounded-xl border px-3 py-2 text-left text-[12px] ${!fStage && !onlyDue ? 'border-brand-500 bg-brand-500/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
          <div className="text-[18px] font-semibold text-navy-800">{(rows || []).filter((r) => OPEN_STAGES.includes(r.stage)).length}</div><div className="text-slate-500">{T.open[lang]}</div>
        </button>
        {STAGES.map((s) => (
          <button key={s} onClick={() => { setFStage(fStage === s ? '' : s); setOnlyDue(false) }} className={`rounded-xl border px-3 py-2 text-left text-[12px] ${fStage === s ? 'border-brand-500 bg-brand-500/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <div className="text-[18px] font-semibold text-navy-800">{count(s)}</div><div className="text-slate-500">{STAGE_LABEL[s][lang]}</div>
          </button>
        ))}
        <button onClick={() => { setOnlyDue(!onlyDue); setFStage('') }} className={`rounded-xl border px-3 py-2 text-left text-[12px] ${onlyDue ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
          <div className={`text-[18px] font-semibold ${dueCount ? 'text-rose-600' : 'text-navy-800'}`}>{dueCount}</div><div className="text-slate-500">{T.dueKpi[lang]}</div>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input className={`${input} !w-auto min-w-[240px] flex-1`} placeholder={T.search[lang]} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${input} !w-auto`} value={fOwner} onChange={(e) => setFOwner(e.target.value)}><option value="">{T.allOwners[lang]}</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows === null ? <p className="p-5 text-slate-500">…</p> : view.length === 0 ? <p className="p-5 text-slate-500">{T.none[lang]}</p> : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr><th className="px-3 py-2.5">Cod</th><th className="px-3 py-2.5">{T.company[lang]}</th><th className="px-3 py-2.5">{T.contact[lang]}</th><th className="px-3 py-2.5">{T.stage[lang]}</th><th className="px-3 py-2.5">{T.step[lang]}</th><th className="px-3 py-2.5">{T.owner[lang]}</th><th className="px-3 py-2.5">{T.last[lang]}</th><th /></tr>
            </thead>
            <tbody>
              {view.map((r) => {
                const due = leadDue(r)
                return (
                  <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal(r)}>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-navy-700">{r.code}</td>
                    <td className="px-3 py-3"><div className="font-medium text-navy-800">{r.company}</div><div className="text-[12px] text-slate-500">{[r.country, r.interest].filter(Boolean).join(' · ')}</div></td>
                    <td className="px-3 py-3"><div>{r.contact_name}</div><div className="text-[12px] text-slate-500">{r.phone}</div></td>
                    <td className="px-3 py-3"><span className={`mono-label inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[9.5px] ${STAGE_STYLE[r.stage] || ''}`}>{STAGE_LABEL[r.stage]?.[lang] || r.stage}</span></td>
                    <td className="px-3 py-3">
                      {r.next_step || r.next_step_date ? (
                        <div className={due ? 'font-medium text-rose-600' : ''}>{r.next_step}
                          {r.next_step_date && <div className="text-[12px]">{fmtDate(r.next_step_date)}{due ? ` · ${isOverdue(r.next_step_date) ? T.overdue[lang] : T.today[lang]}` : ''}</div>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-3">{r.owner}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{lastInt[r.id] ? fmtDate(lastInt[r.id]) : '—'}</td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}><button onClick={() => remove(r)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {delNode}
      {modal && <LeadModal initial={modal.id ? modal : null} clients={clients} leads={rows || []} interactions={ints} onClose={() => { setModal(null); load() }} onSaved={(_, keepOpen) => { if (keepOpen) { load() } else { setModal(null); load() } }} />}
    </div>
  )
}
