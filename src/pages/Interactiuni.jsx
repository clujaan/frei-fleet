import { OVERLINE } from '../config/brand'
import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import { fmtDate, todayISO } from '../lib/format'
import { CHANNELS, CHANNEL_ICON, CHANNEL_LABEL, CLIENTS, DIRECTION_LABEL, INTERACTIONS, LEADS, OWNERS, isOverdue } from '../lib/sales'
import InteractionModal from '../components/InteractionModal'
import { useDeleteReason } from '../components/ReasonModal'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const L = (ro, en) => ({ ro, en })
const T = {
  title: L('Interacțiuni', 'Interactions'), newInt: L('Interacțiune nouă', 'New interaction'), search: L('Caută în rezumat, firmă…', 'Search summary, company…'),
  allChannels: L('Toate canalele', 'All channels'), allOwners: L('Toți responsabilii', 'All owners'), allKinds: L('Lead-uri și clienți', 'Leads and clients'), leads: L('Doar lead-uri', 'Leads only'), clients: L('Doar clienți', 'Clients only'),
  due: L('Doar pași scadenți', 'Due steps only'), none: L('Nicio interacțiune.', 'No interactions.'), date: L('Data', 'Date'), who: L('Legat de', 'Linked to'), ch: L('Canal', 'Channel'),
  summary: L('Rezumat', 'Summary'), step: L('Următorul pas', 'Next step'), owner: L('Responsabil', 'Owner'), delAsk: L('Ștergi interacțiunea?', 'Delete this interaction?'),
  lead: L('Lead', 'Lead'), client: L('Client', 'Client'), overdue: L('întârziat', 'overdue'),
}

export default function Interactiuni() {
  const { lang } = useLang()
  const [rows, setRows] = useState(null)
  const [leads, setLeads] = useState([])
  const [clients, setClients] = useState([])
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null)
  const [q, setQ] = useState('')
  const [fCh, setFCh] = useState('')
  const [fOwner, setFOwner] = useState('')
  const [fKind, setFKind] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)

  const load = async () => {
    try {
      const [i, l, c] = await Promise.all([INTERACTIONS.api.list(), LEADS.api.list(), CLIENTS.api.list()])
      setRows(i); setLeads(l); setClients(c)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  const target = (r) => {
    if (r.lead_id) { const l = leads.find((x) => x.id === r.lead_id); return l ? { kind: 'lead', label: `${l.code} · ${l.company}` } : { kind: 'lead', label: '—' } }
    const c = clients.find((x) => x.id === r.client_id)
    return { kind: 'client', label: c ? `${c.code} · ${c.company}` : '—' }
  }
  const terms = fold(q).split(/\s+/).filter(Boolean)
  const view = (rows || [])
    .filter((r) => { const h = fold([r.summary, r.next_step, target(r).label, r.owner].join(' ')); return terms.every((w) => h.includes(w)) })
    .filter((r) => (!fCh || r.channel === fCh) && (!fOwner || r.owner === fOwner) && (!fKind || target(r).kind === fKind) && (!onlyDue || (!!r.next_step_date && r.next_step_date <= todayISO())))
    .sort((a, b) => String(b.occurred_on).localeCompare(String(a.occurred_on)) || String(b.created_at).localeCompare(String(a.created_at)))

  const [confirmDel, delNode] = useDeleteReason()
  const remove = async (r) => {
    if (!(await confirmDel({ entity: 'interactions', id: r.id, code: r.code || '' }))) return
    await INTERACTIONS.api.remove(r.id).catch((e) => setErr(e.message))
    load()
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px w-4 bg-brand-500" />{OVERLINE} / {T.title[lang].toUpperCase()}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{T.title[lang]}</h1>
        <button onClick={() => setModal({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-600">＋ {T.newInt[lang]}</button>
      </div>
      {err && <p className="mt-3 text-rose-600">{err}</p>}

      <div className="mt-5"><input className={`${input} !py-2.5`} placeholder={T.search[lang]} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select className={`${input} !w-auto`} value={fCh} onChange={(e) => setFCh(e.target.value)}><option value="">{T.allChannels[lang]}</option>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c][lang]}</option>)}</select>
        <select className={`${input} !w-auto`} value={fOwner} onChange={(e) => setFOwner(e.target.value)}><option value="">{T.allOwners[lang]}</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select>
        <select className={`${input} !w-auto`} value={fKind} onChange={(e) => setFKind(e.target.value)}><option value="">{T.allKinds[lang]}</option><option value="lead">{T.leads[lang]}</option><option value="client">{T.clients[lang]}</option></select>
        <label className="flex items-center gap-1.5 px-2 text-[13px] text-slate-600"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />{T.due[lang]}</label>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows === null ? <p className="p-5 text-slate-500">…</p> : view.length === 0 ? <p className="p-5 text-slate-500">{T.none[lang]}</p> : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr><th className="px-3 py-2.5">{T.date[lang]}</th><th className="px-3 py-2.5">{T.who[lang]}</th><th className="px-3 py-2.5">{T.ch[lang]}</th><th className="px-3 py-2.5">{T.summary[lang]}</th><th className="px-3 py-2.5">{T.step[lang]}</th><th className="px-3 py-2.5">{T.owner[lang]}</th><th /></tr>
            </thead>
            <tbody>
              {view.map((r) => {
                const tg = target(r)
                const late = isOverdue(r.next_step_date)
                return (
                  <tr key={r.id} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50" onClick={() => setModal(r)}>
                    <td className="whitespace-nowrap px-3 py-3">{fmtDate(r.occurred_on)}</td>
                    <td className="px-3 py-3"><span className={`mono-label mr-1.5 inline-block rounded-full border px-2 py-0.5 text-[9px] ${tg.kind === 'lead' ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>{T[tg.kind][lang]}</span>{tg.label}</td>
                    <td className="whitespace-nowrap px-3 py-3">{CHANNEL_ICON[r.channel]} {CHANNEL_LABEL[r.channel]?.[lang]}<div className="text-[12px] text-slate-500">{DIRECTION_LABEL[r.direction]?.[lang]}</div></td>
                    <td className="max-w-[360px] px-3 py-3 text-slate-700">{r.summary}</td>
                    <td className="px-3 py-3">{r.next_step || r.next_step_date ? <div className={late ? 'font-medium text-rose-600' : ''}>{r.next_step}{r.next_step_date && <div className="text-[12px]">{fmtDate(r.next_step_date)}{late ? ` · ${T.overdue[lang]}` : ''}</div>}</div> : '—'}</td>
                    <td className="px-3 py-3">{r.owner}</td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}><button onClick={() => remove(r)} className="rounded px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {delNode}
      {modal && <InteractionModal initial={modal.id ? modal : null} leads={leads} clients={clients} onClose={() => setModal(null)} onSaved={(_, keep) => { if (!keep) setModal(null); load() }} />}
    </div>
  )
}
