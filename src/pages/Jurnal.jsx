import { OVERLINE } from '../config/brand'
import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../i18n'
import ActivityList, { userName } from '../components/ActivityList'
import { ACTIVITY_API, ENTITY_LABEL, EVENT_LABEL, PAGE, fieldLabel } from '../lib/activity'
import { foldText } from '../lib/costs'

const input = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-navy-800 outline-none focus:border-brand-500'

export default function Jurnal() {
  const { t } = useLang()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [fEnt, setFEnt] = useState('')
  const [fAct, setFAct] = useState('')
  const [fUser, setFUser] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [users, setUsers] = useState([])

  const filters = useMemo(() => ({
    entity: fEnt, action: fAct, userEmail: fUser,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : '',
    to: to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString() : '',
  }), [fEnt, fAct, fUser, from, to])

  useEffect(() => {
    let live = true
    setRows(null)
    ACTIVITY_API.list(filters, 0).then((r) => {
      if (!live) return
      setRows(r)
      setMore(r.length === PAGE)
      setUsers((u) => [...new Set([...u, ...r.map((x) => x.user_email).filter(Boolean)])])
    }).catch((e) => { if (live) { setErr(e.message); setRows([]) } })
    return () => { live = false }
  }, [filters])

  const loadMore = async () => {
    setBusy(true)
    try {
      const r = await ACTIVITY_API.list(filters, rows.length)
      setRows((x) => [...x, ...r])
      setMore(r.length === PAGE)
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  const shown = useMemo(() => {
    if (!rows) return []
    if (!q.trim()) return rows
    const n = foldText(q)
    return rows.filter((r) => foldText([userName(r), r.user_email, r.record_code, ENTITY_LABEL[r.entity], r.entity, r.summary && EVENT_LABEL[r.summary], r.detail?.filename, r.detail?.reason, ...Object.entries(r.changes || {}).flatMap(([k, [a, b]]) => [fieldLabel(k), a, b])].map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(' | ')).includes(n))
  }, [rows, q])

  return (
    <div>
      <p className="mono-label text-[10px] text-slate-500">— {OVERLINE} / {t('nav.activity').toUpperCase()}</p>
      <h1 className="mt-2 text-[28px] font-semibold text-navy-800">{t('nav.activity')}</h1>
      <p className="mt-1 text-[13px] text-slate-500">{t('act.hint')}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input className={`${input} min-w-[220px] flex-1`} placeholder={t('act.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={input} value={fEnt} onChange={(e) => setFEnt(e.target.value)}><option value="">{t('act.allModules')}</option>{Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={input} value={fAct} onChange={(e) => setFAct(e.target.value)}>
          <option value="">{t('act.allActions')}</option><option value="create">Creat</option><option value="update">Modificat</option><option value="delete">Șters</option><option value="event">Eveniment</option>
        </select>
        <select className={input} value={fUser} onChange={(e) => setFUser(e.target.value)}><option value="">{t('act.allUsers')}</option>{users.map((u) => <option key={u}>{u}</option>)}</select>
        <label className="flex items-center gap-1 text-[12px] text-slate-500">{t('act.from')}<input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-1 text-[12px] text-slate-500">{t('act.to')}<input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      {err && <p className="mt-3 text-[13px] text-rose-600">{err}</p>}
      <div className="mt-4">
        {rows === null ? <p className="text-slate-500">…</p> : <ActivityList rows={shown} />}
      </div>
      {more && <button disabled={busy} onClick={loadMore} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-100">{t('act.more')}</button>}
    </div>
  )
}
