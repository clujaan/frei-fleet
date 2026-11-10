import { OVERLINE } from '../config/brand'
import { Link } from 'react-router-dom'
import { useLang } from '../i18n'
import { MODULES } from '../lib/nav'

// Pagină-marcaj pentru un modul care urmează să fie construit.
export default function ModulePage({ moduleKey }) {
  const { t } = useLang()
  const info = MODULES[moduleKey] || { fields: [], links: [] }

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
      <div className="mono-label flex items-center gap-2 text-[10px] text-slate-500">
        <span className="h-px w-4 bg-brand-500" />
        {OVERLINE} / {t(`nav.${moduleKey}`).toUpperCase()}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-[30px] font-semibold tracking-tight text-navy-800">{t(`nav.${moduleKey}`)}</h1>
        <span className="mono-label rounded-full border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-[9.5px] text-brand-600">
          {t('module.status')}
        </span>
      </div>
      <p className="mt-2 text-[14px] text-slate-600">{t('module.intro')}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mono-label text-[10.5px] text-slate-500">{t('module.fields')}</h2>
          <ul className="mt-3 space-y-2 text-[14px] text-slate-800">
            {info.fields.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {f}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mono-label text-[10.5px] text-slate-500">{t('module.links')}</h2>
          <ul className="mt-3 space-y-2 text-[14px] text-slate-800">
            {info.links.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy-600" />
                {f}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Link to="/" className="mono-label mt-6 inline-block text-[10.5px] text-navy-700 hover:text-brand-600">
        ← {t('module.back')}
      </Link>
    </div>
  )
}
