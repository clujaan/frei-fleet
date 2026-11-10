import { useCallback, useEffect, useState } from 'react'
import { OVERLINE } from '../config/brand'
import { useLang } from '../i18n'
import { useAuth } from '../lib/auth'
import { loadTeam } from '../lib/people'
import { getCompany } from '../lib/company'
import { addUser, listUsers, updateUser } from '../lib/companyApi'

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-800 focus:border-brand-500 focus:outline-none'
const btn = 'rounded-lg px-4 py-2 text-[13.5px] font-medium disabled:opacity-50'
const ROLES = ['owner', 'dispatcher', 'accountant']
const ROLE_LABEL = {
  ro: { owner: 'Patron', dispatcher: 'Dispecer', accountant: 'Contabil' },
  en: { owner: 'Owner', dispatcher: 'Dispatcher', accountant: 'Accountant' },
}
const ROLE_INFO = {
  ro: {
    owner: 'Acces complet: setări, utilizatori, salarii, profit.',
    dispatcher: 'Clienți, comenzi, curse, flotă, documente. Fără salarii, profit pe șofer sau setări.',
    accountant: 'Deconturi, costuri, rapoarte, export. Salariile doar dacă patronul permite.',
  },
  en: {
    owner: 'Full access: settings, users, salaries, profit.',
    dispatcher: 'Clients, orders, trips, fleet, documents. No salaries, driver profit or settings.',
    accountant: 'Expense reports, costs, reports, export. Salaries only if the owner allows.',
  },
}
const ERR = {
  ro: {
    'no auth account for this email': 'Nu există cont de autentificare cu acest email. Creează-l întâi în Supabase (Authentication → Users).',
    'last owner': 'Trebuie să rămână cel puțin un patron activ.',
    'not allowed': 'Doar patronul poate face asta.',
    'invalid role': 'Rol invalid.',
    'email required': 'Introdu adresa de email.',
  },
  en: {
    'no auth account for this email': 'No sign-in account exists for this email. Create it first in Supabase (Authentication → Users).',
    'last owner': 'At least one active owner must remain.',
    'not allowed': 'Only the owner can do this.',
    'invalid role': 'Invalid role.',
    'email required': 'Enter the email address.',
  },
}

function Row({ u, me, en, onSaved, onError }) {
  const [name, setName] = useState(u.full_name || '')
  const [role, setRole] = useState(u.role)
  const [active, setActive] = useState(u.active)
  const [busy, setBusy] = useState(false)
  const dirty = name !== (u.full_name || '') || role !== u.role || active !== u.active
  const save = async () => {
    setBusy(true)
    try { await updateUser({ userId: u.user_id, fullName: name, role, active }); await onSaved() } catch (e) { onError(e.message) } finally { setBusy(false) }
  }
  return (
    <tr className={`border-t border-slate-100 ${active ? '' : 'opacity-60'}`}>
      <td className="px-3 py-2"><input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={en ? 'Full name' : 'Nume complet'} /></td>
      <td className="px-3 py-2 text-[13px] text-slate-600">{u.email}</td>
      <td className="px-3 py-2">
        <select className={input} value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[en ? 'en' : 'ro'][r]}</option>)}</select>
      </td>
      <td className="px-3 py-2 text-center"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} aria-label={en ? 'Active' : 'Activ'} /></td>
      <td className="px-3 py-2 text-right">
        <button disabled={!dirty || busy} onClick={save} className={`${btn} bg-brand-500 py-1.5 text-white hover:bg-brand-600`}>{busy ? '…' : en ? 'Save' : 'Salvează'}</button>
        {u.user_id === me && <span className="ml-2 text-[11.5px] text-slate-400">{en ? 'you' : 'tu'}</span>}
      </td>
    </tr>
  )
}

export default function Utilizatori() {
  const { lang } = useLang()
  const en = lang === 'en'
  const { role, user } = useAuth()
  const [users, setUsers] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [add, setAdd] = useState({ email: '', fullName: '', role: 'dispatcher' })
  const [busy, setBusy] = useState(false)
  const L = ERR[en ? 'en' : 'ro']
  const friendly = (m) => L[m] || m

  const reload = useCallback(async () => {
    try {
      setUsers(await listUsers())
      await loadTeam(getCompany().signers) // lista de „responsabil" din restul aplicației
    } catch (e) { setErr(friendly(e.message)) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (role === 'owner') reload() }, [role, reload])

  if (role !== 'owner') {
    return <p className="text-[14px] text-slate-600">{en ? 'Only the owner can manage users.' : 'Doar patronul poate gestiona utilizatorii.'}</p>
  }

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setMsg(''); setBusy(true)
    try {
      await addUser(add)
      setAdd({ email: '', fullName: '', role: 'dispatcher' })
      setMsg(en ? 'User added.' : 'Utilizator adăugat.')
      await reload()
    } catch (x) { setErr(friendly(x.message)) } finally { setBusy(false) }
  }

  return (
    <div className="max-w-5xl">
      <p className="mono-label text-[10px] text-slate-500">— {OVERLINE} / {(en ? 'Users' : 'Utilizatori').toUpperCase()}</p>
      <h1 className="mt-2 text-[28px] font-semibold text-navy-800">{en ? 'Users and roles' : 'Utilizatori și roluri'}</h1>
      <p className="mt-1 text-[13px] text-slate-500">{en ? 'Access is enforced in the database, not only in the screens.' : 'Accesul este aplicat în baza de date, nu doar în ecrane.'}</p>

      {(err || msg) && <p className={`mt-3 text-[13px] ${err ? 'text-rose-600' : 'text-emerald-700'}`}>{err || msg}</p>}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left">
          <thead><tr className="mono-label text-[10px] text-slate-500">
            <th className="px-3 py-2">{en ? 'Name' : 'Nume'}</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">{en ? 'Role' : 'Rol'}</th><th className="px-3 py-2 text-center">{en ? 'Active' : 'Activ'}</th><th />
          </tr></thead>
          <tbody>
            {users === null && <tr><td className="px-3 py-4 text-[13px] text-slate-500" colSpan={5}>…</td></tr>}
            {(users || []).map((u) => <Row key={`${u.user_id}:${u.role}:${u.active}:${u.full_name}`} u={u} me={user?.id} en={en} onSaved={async () => { setErr(''); setMsg(en ? 'Saved.' : 'Salvat.'); await reload() }} onError={(m) => { setMsg(''); setErr(friendly(m)) }} />)}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 space-y-1 text-[12.5px] text-slate-500">
        {ROLES.map((r) => <li key={r}><b className="text-slate-700">{ROLE_LABEL[en ? 'en' : 'ro'][r]}:</b> {ROLE_INFO[en ? 'en' : 'ro'][r]}</li>)}
      </ul>

      <form onSubmit={submit} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-[16px] font-semibold text-navy-800">{en ? 'Add a user' : 'Adaugă utilizator'}</h2>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[12.5px] text-slate-500">
          <li>{en ? 'Create the sign-in account in Supabase: Authentication → Users → Add user (email + password).' : 'Creează contul în Supabase: Authentication → Users → Add user (email + parolă).'}</li>
          <li>{en ? 'Enter the same email here and choose the role.' : 'Introdu aici același email și alege rolul.'}</li>
        </ol>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
          <input required type="email" className={input} placeholder="Email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} />
          <input className={input} placeholder={en ? 'Full name' : 'Nume complet'} value={add.fullName} onChange={(e) => setAdd({ ...add, fullName: e.target.value })} />
          <select className={input} value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[en ? 'en' : 'ro'][r]}</option>)}</select>
          <button disabled={busy} className={`${btn} bg-brand-500 text-white hover:bg-brand-600`}>{busy ? '…' : en ? 'Add' : 'Adaugă'}</button>
        </div>
      </form>
    </div>
  )
}
