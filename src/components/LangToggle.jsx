import { useLang } from '../i18n'

export default function LangToggle({ className = '' }) {
  const { lang, setLang } = useLang()
  return (
    <div className={`mono-label inline-flex items-center gap-1 ${className}`} role="group" aria-label="Language">
      {['ro', 'en'].map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded px-1.5 py-0.5 transition-colors ${
            lang === l ? 'bg-brand-500/20 text-brand-300' : 'text-slate-400 hover:text-white'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
