import { APP_NAME, ASSETS } from '../config/brand'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useLang } from '../i18n'
import LangToggle from '../components/LangToggle'

export default function Login() {
  const { user, signIn } = useAuth()
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (user) return <Navigate to="/" replace />

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await signIn(email.trim(), password)
    if (err) setError(t('login.error'))
    setBusy(false)
  }

  const field =
    'mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3.5 py-3 text-[15px] text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30'

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden bg-navy-950 px-4 py-10">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950/70 via-navy-950/60 to-navy-950/90" />

      <div className="relative w-full max-w-[400px]">
        <img src={ASSETS.logoWhite} alt={APP_NAME} className="mx-auto mb-8 h-auto w-[230px]" />
        <form onSubmit={onSubmit} className="rounded-2xl border border-white/10 bg-navy-900/80 p-6 shadow-2xl backdrop-blur-md">
          <div className="mono-label flex items-center gap-2 text-[10px] text-slate-400">
            <span className="h-px w-4 bg-brand-500" />
            {t('app.controlCenter')}
          </div>
          <h1 className="mt-2 text-[24px] font-semibold text-white">{t('login.title')}</h1>
          <p className="mt-1 text-[13px] text-slate-400">{t('login.subtitle')}</p>

          <label className="mt-5 block text-[13px] text-slate-300">
            {t('login.email')}
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>
          <label className="mt-4 block text-[13px] text-slate-300">
            {t('login.password')}
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          </label>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-[13px] text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-lg bg-brand-500 py-3 text-[15px] font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-400 disabled:opacity-60"
          >
            {busy ? t('login.busy') : t('login.submit')}
          </button>
        </form>
        <div className="mt-4 text-center">
          <LangToggle />
        </div>
      </div>
    </div>
  )
}
