import { APP_NAME, ASSETS, STORAGE_PREFIX } from '../config/brand'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { NAV } from '../lib/nav'
import { useLang } from '../i18n'
import { useAuth } from '../lib/auth'
import LangToggle from './LangToggle'

function NavItem({ item, number, onNavigate }) {
  const { t } = useLang()
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-lg border px-2.5 py-2 text-[14px] transition-colors ${
          isActive
            ? 'border-brand-500/60 bg-brand-500/10 text-white'
            : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`mono-label grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[9.5px] tracking-normal ${
              isActive ? 'border-brand-500/50 bg-brand-500/20 text-brand-300' : 'border-white/10 bg-white/5 text-slate-400'
            }`}
          >
            {String(number).padStart(2, '0')}
          </span>
          <span className="leading-snug">{t(`nav.${item.key}`)}</span>
        </>
      )}
    </NavLink>
  )
}

const KEY = `${STORAGE_PREFIX}_nav_collapsed_v1`
const readCollapsed = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}

export default function Sidebar({ onNavigate }) {
  const { t } = useLang()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = (key) => setCollapsed((c) => {
    const next = { ...c, [key]: !c[key] }
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* fără stocare */ }
    return next
  })
  const { user, role, signOut } = useAuth()
  let n = 0
  const initials = (user?.email || '??').slice(0, 2).toUpperCase()

  return (
    <div className="flex h-full flex-col bg-navy-900 text-slate-200">
      <div className="px-5 pt-6 pb-5">
        <img src={ASSETS.logoWhite} alt={APP_NAME} className="h-auto w-full max-w-[190px]" />
      </div>

      <div className="flex items-center justify-between border-y border-white/10 px-5 py-3">
        <span className="mono-label text-slate-400">{t('app.controlCenter')}</span>
        <span className="mono-label rounded-full border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 text-[9px] text-brand-300">
          {t(`role.${role}`)}
        </span>
      </div>

      <nav className="scroll-thin flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={t('nav.menu')}>
        {NAV.map((entry) => {
          if (entry.type === 'item') {
            n += 1
            return <NavItem key={entry.key} item={entry} number={n} onNavigate={onNavigate} />
          }
          const closed = !!collapsed[entry.key]
          const isHere = (it) => pathname === it.to || pathname.startsWith(`${it.to}/`)
          return (
            <div key={entry.key} className="pt-3">
              <button
                type="button"
                onClick={() => toggle(entry.key)}
                aria-expanded={!closed}
                className="mono-label flex w-full items-center gap-2 rounded-md px-2.5 pb-1.5 text-left text-[11px] font-semibold text-orange-300 hover:text-orange-200"
              >
                <span className="h-px w-3 bg-brand-500" />
                <span className="flex-1">{t(`nav.${entry.key}`)}</span>
                <span className={`text-[10px] transition-transform ${closed ? '-rotate-90' : ''}`} aria-hidden="true">▾</span>
              </button>
              <div className="space-y-1">
                {entry.items.filter((it) => !it.roles || it.roles.includes(role)).map((it) => {
                  n += 1
                  // dacă secțiunea e închisă, rămâne vizibilă doar pagina deschisă acum
                  if (closed && !isHere(it)) return null
                  return <NavItem key={it.key} item={it} number={n} onNavigate={onNavigate} />
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="mono-label grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-[11px] text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-white">{user?.email}</div>
            <button type="button" onClick={signOut} className="mono-label text-[9.5px] text-slate-400 hover:text-brand-300">
              {t('nav.logout')} →
            </button>
          </div>
        </div>
        <LangToggle className="mt-3" />
      </div>
    </div>
  )
}
