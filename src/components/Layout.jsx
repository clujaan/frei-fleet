import { APP_NAME, ASSETS } from '../config/brand'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useLang } from '../i18n'
import { useAuth } from '../lib/auth'

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { t } = useLang()
  const { isDemo } = useAuth()
  const { pathname } = useLocation()
  const dark = pathname === '/'

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="flex h-full">
      {/* Bară laterală fixă pe desktop */}
      <aside className="hidden w-[260px] shrink-0 border-r border-white/10 lg:block">
        <Sidebar />
      </aside>

      {/* Sertar pe telefon */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Închide meniul" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-2xl">
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/10 bg-navy-900 px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('nav.menu')}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <img src={ASSETS.logoWhite} alt={APP_NAME} className="h-6 w-auto" />
        </header>

        {isDemo && (
          <div className="mono-label bg-brand-500 px-4 py-1.5 text-center text-[10px] font-medium text-white">{t('demoBanner')}</div>
        )}

        <main className={`scroll-thin min-h-0 flex-1 overflow-y-auto ${dark ? 'dash-bg' : 'bg-paper'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
