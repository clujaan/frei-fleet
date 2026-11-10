import { useEffect, useMemo, useRef, useState } from 'react'
import { OVERLINE } from '../config/brand'
import { useLang } from '../i18n'
import { useAuth } from '../lib/auth'
import { getCompany, loadCompany } from '../lib/company'
import { loadTeam } from '../lib/people'
import { brandingPreviewUrl, removeBranding, saveCompany, uploadBranding } from '../lib/companyApi'
import { normalizeHex, validateCompany, whiteTextReadable } from '../lib/companyForm'
import { ALLOCATION_BASES, basisLabel } from '../lib/tripMoney'

const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-800 focus:border-brand-500 focus:outline-none disabled:bg-slate-50'
const card = 'mt-5 rounded-2xl border border-slate-200 bg-white p-5'
const h2 = 'text-[16px] font-semibold text-navy-800'
const lbl = 'block text-[12.5px] font-medium text-slate-600'
const btn = 'rounded-lg px-4 py-2 text-[13.5px] font-medium disabled:opacity-50'

const ERR = {
  ro: { required: 'Câmp obligatoriu.', cui: 'CUI invalid (verifică cifrele).', email: 'Email invalid.', color: 'Culoare invalidă (ex. #14213D).', days: 'Număr întreg între 0 și 365.', range: 'Valoare în afara intervalului.' },
  en: { required: 'Required.', cui: 'Invalid tax ID (check the digits).', email: 'Invalid email.', color: 'Invalid colour (e.g. #14213D).', days: 'Whole number from 0 to 365.', range: 'Out of range.' },
}
const IMG_ERR = {
  ro: { type: 'Folosește PNG, JPG sau WebP.', size: 'Fișierul depășește 1 MB.', no_file: 'Nu ai ales un fișier.' },
  en: { type: 'Use PNG, JPG or WebP.', size: 'File is larger than 1 MB.', no_file: 'No file chosen.' },
}

function Field({ label, error, children, className = '' }) {
  return (
    <label className={`${lbl} ${className}`}>
      {label}
      {children}
      {error && <span className="mt-1 block text-[12px] text-rose-600">{error}</span>}
    </label>
  )
}

function ImagePicker({ kind, label, hint, path, onChange, en }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    let alive = true
    let made = null
    brandingPreviewUrl(path).then((u) => { made = u; if (alive) setUrl(u) })
    return () => { alive = false; if (made && made.startsWith('blob:')) URL.revokeObjectURL(made) }
  }, [path])
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr(''); setBusy(true)
    try {
      onChange(await uploadBranding(kind, file))
    } catch (x) {
      setErr((IMG_ERR[en ? 'en' : 'ro'][x.message]) || x.message)
    } finally { setBusy(false) }
  }
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className={lbl}>{label}</p>
      <div className="mt-2 grid h-24 place-items-center rounded-lg border border-dashed border-slate-300 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
        {url ? <img src={url} alt={label} className="max-h-20 max-w-full object-contain" /> : <span className="text-[12px] text-slate-400">{en ? 'Default / none' : 'Implicit / lipsă'}</span>}
      </div>
      <p className="mt-1.5 text-[11.5px] text-slate-500">{hint}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={() => ref.current?.click()} className={`${btn} border border-slate-300 py-1.5 text-slate-700 hover:bg-slate-50`}>{busy ? '…' : en ? 'Upload' : 'Încarcă'}</button>
        {path && <button type="button" onClick={() => onChange(null)} className={`${btn} py-1.5 text-rose-600 hover:bg-rose-50`}>{en ? 'Remove' : 'Șterge'}</button>}
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
      </div>
      {err && <p className="mt-1 text-[12px] text-rose-600">{err}</p>}
    </div>
  )
}

export default function Setari() {
  const { lang } = useLang()
  const en = lang === 'en'
  const { role } = useAuth()
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(null) // starea salvată, pentru a șterge imaginile înlocuite abia la salvare
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [fail, setFail] = useState('')
  const E = ERR[en ? 'en' : 'ro']

  useEffect(() => {
    loadCompany().then((c) => { const copy = JSON.parse(JSON.stringify(c)); setForm(copy); setSaved(copy) })
  }, [])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setNested = (k, sub, v) => setForm((f) => ({ ...f, [k]: { ...f[k], [sub]: v } }))
  const dirty = useMemo(() => form && saved && JSON.stringify(form) !== JSON.stringify(saved), [form, saved])

  if (role !== 'owner') {
    return <p className="text-[14px] text-slate-600">{en ? 'Only the owner can change company settings.' : 'Doar patronul poate modifica setările firmei.'}</p>
  }
  if (!form) return <p className="text-[14px] text-slate-500">…</p>

  const save = async () => {
    const errs = validateCompany(form)
    setErrors(errs); setMsg(''); setFail('')
    if (Object.keys(errs).length) { setFail(en ? 'Fix the highlighted fields.' : 'Corectează câmpurile marcate.'); return }
    setBusy(true)
    try {
      const done = await saveCompany(form)
      // imaginile înlocuite sau șterse se elimină din bucket doar după ce salvarea a reușit
      for (const k of ['logo_path', 'stamp_path', 'signature_path']) {
        if (saved[k] && saved[k] !== done[k]) await removeBranding(saved[k])
      }
      await loadTeam(done.signers)
      const copy = JSON.parse(JSON.stringify(getCompany()))
      setForm(copy); setSaved(copy)
      setMsg(en ? 'Settings saved. New PDFs use them right away.' : 'Setări salvate. PDF-urile noi le folosesc imediat.')
    } catch (e) {
      setFail(e.message)
    } finally { setBusy(false) }
  }

  const ibans = form.ibans || []
  const signers = form.signers || []
  const colorField = (k, label) => {
    const hex = normalizeHex(form[k])
    return (
      <Field label={label} error={errors[k] && E.color}>
        <div className="mt-1 flex items-center gap-2">
          <input type="color" value={hex || '#000000'} onChange={(e) => set(k, e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded border border-slate-300 p-0.5" />
          <input className={`${input} mt-0`} value={form[k] || ''} onChange={(e) => set(k, e.target.value)} />
        </div>
        {k === 'color_primary' && hex && !whiteTextReadable(hex) && (
          <span className="mt-1 block text-[12px] text-amber-700">{en ? 'Light colour: white text on table headers may be hard to read.' : 'Culoare deschisă: textul alb din antetele de tabel poate fi greu de citit.'}</span>
        )}
      </Field>
    )
  }

  return (
    <div className="max-w-4xl pb-24">
      <p className="mono-label text-[10px] text-slate-500">— {OVERLINE} / {(en ? 'Company settings' : 'Setări firmă').toUpperCase()}</p>
      <h1 className="mt-2 text-[28px] font-semibold text-navy-800">{en ? 'Company settings' : 'Setări firmă'}</h1>
      <p className="mt-1 text-[13px] text-slate-500">{en ? 'These details appear on orders, reports and PDFs. Only the owner can change them.' : 'Aceste date apar pe comenzi, deconturi și în PDF-uri. Le poate modifica doar patronul.'}</p>

      <section className={card}>
        <h2 className={h2}>{en ? 'Company' : 'Firma'}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label={en ? 'Company name *' : 'Denumire firmă *'} error={errors.name && E.required}><input className={input} value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label={en ? 'Country (code)' : 'Țară (cod)'}><input className={input} maxLength={2} value={form.country || ''} onChange={(e) => set('country', e.target.value.toUpperCase())} /></Field>
          <Field label={en ? 'Tax ID (CUI / VAT)' : 'CUI'} error={errors.cui && E.cui}><input className={input} value={form.cui || ''} onChange={(e) => set('cui', e.target.value)} /></Field>
          <Field label={en ? 'Trade register no.' : 'Nr. Reg. Com.'}><input className={input} value={form.reg_com || ''} onChange={(e) => set('reg_com', e.target.value)} /></Field>
          <Field label={en ? 'Address (RO)' : 'Adresă (RO)'} className="sm:col-span-2"><input className={input} value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label={en ? 'Address (EN, for English documents)' : 'Adresă (EN, pentru documente în engleză)'} className="sm:col-span-2"><input className={input} value={form.address_en || ''} onChange={(e) => set('address_en', e.target.value)} /></Field>
          <Field label="Telefon"><input className={input} value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email" error={errors.email && E.email}><input className={input} value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Website"><input className={input} value={form.website || ''} onChange={(e) => set('website', e.target.value)} /></Field>
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>{en ? 'Base' : 'Baza'}</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">{en ? 'Every trip starts and ends here.' : 'Punctul din care pleacă și în care se termină fiecare cursă.'}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label={en ? 'Base name' : 'Nume bază'}><input className={input} value={form.base_name || ''} onChange={(e) => set('base_name', e.target.value)} /></Field>
          <Field label={en ? 'Base address' : 'Adresa bazei'}><input className={input} value={form.base_address || ''} onChange={(e) => set('base_address', e.target.value)} /></Field>
          <Field label="Latitudine" error={errors.base_lat && E.range}><input className={input} inputMode="decimal" value={form.base_lat ?? ''} onChange={(e) => set('base_lat', e.target.value)} /></Field>
          <Field label="Longitudine" error={errors.base_lng && E.range}><input className={input} inputMode="decimal" value={form.base_lng ?? ''} onChange={(e) => set('base_lng', e.target.value)} /></Field>
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>{en ? 'Bank accounts' : 'Conturi bancare'}</h2>
        <div className="mt-3 space-y-3">
          {ibans.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.6fr_90px_auto]">
              <input className={input} placeholder={en ? 'Bank' : 'Banca'} value={r.bank || ''} onChange={(e) => set('ibans', ibans.map((x, j) => (j === i ? { ...x, bank: e.target.value } : x)))} />
              <div>
                <input className={input} placeholder="IBAN" value={r.iban || ''} onChange={(e) => set('ibans', ibans.map((x, j) => (j === i ? { ...x, iban: e.target.value } : x)))} />
                {errors.ibans?.includes(i) && <span className="mt-1 block text-[12px] text-rose-600">{en ? 'Invalid IBAN.' : 'IBAN invalid.'}</span>}
              </div>
              <select className={input} value={r.currency || 'EUR'} onChange={(e) => set('ibans', ibans.map((x, j) => (j === i ? { ...x, currency: e.target.value } : x)))}><option>EUR</option><option>RON</option></select>
              <button type="button" onClick={() => set('ibans', ibans.filter((_, j) => j !== i))} className={`${btn} text-rose-600 hover:bg-rose-50`}>{en ? 'Remove' : 'Șterge'}</button>
            </div>
          ))}
          <button type="button" onClick={() => set('ibans', [...ibans, { bank: '', iban: '', currency: 'EUR' }])} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>+ {en ? 'Add account' : 'Adaugă cont'}</button>
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>Branding</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">{en ? 'Used on PDFs and Excel files. PNG, JPG or WebP, up to 1 MB each.' : 'Folosite în PDF-uri și fișiere Excel. PNG, JPG sau WebP, maxim 1 MB fiecare.'}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <ImagePicker en={en} kind="logo" label="Logo" hint={en ? 'On a light background.' : 'Pe fundal deschis (antet PDF).'} path={form.logo_path} onChange={(p) => set('logo_path', p)} />
          <ImagePicker en={en} kind="stamp" label={en ? 'Stamp' : 'Ștampilă'} hint={en ? 'Omitted from PDFs if missing.' : 'Se omite din PDF dacă lipsește.'} path={form.stamp_path} onChange={(p) => set('stamp_path', p)} />
          <ImagePicker en={en} kind="signature" label={en ? 'Signature' : 'Semnătură'} hint={en ? 'Optional.' : 'Opțională.'} path={form.signature_path} onChange={(p) => set('signature_path', p)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {colorField('color_primary', en ? 'Primary colour (table headers, titles)' : 'Culoare principală (antete tabel, titluri)')}
          {colorField('color_secondary', en ? 'Secondary colour (accents)' : 'Culoare secundară (accente)')}
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>{en ? 'Numbering' : 'Numerotare documente'}</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">{en ? 'Prefix of document numbers, e.g. CT-2026-001. Applies to new documents only.' : 'Prefixul numerelor de document, ex. CT-2026-001. Se aplică doar documentelor noi.'}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          {[['ct', en ? 'Transport orders' : 'Comenzi transport'], ['cc', en ? 'Client orders' : 'Comenzi client'], ['trip', en ? 'Trips' : 'Curse'], ['fd', en ? 'Expense reports' : 'Deconturi']].map(([k, l]) => (
            <Field key={k} label={l} error={errors.prefixes?.includes(k) && (en ? '1–6 letters or digits.' : '1–6 litere sau cifre.')}>
              <input className={input} maxLength={6} value={form.numbering_prefixes?.[k] || ''} onChange={(e) => setNested('numbering_prefixes', k, e.target.value.toUpperCase())} />
            </Field>
          ))}
        </div>
        {errors.prefixes_unique && <p className="mt-2 text-[12px] text-rose-600">{en ? 'Prefixes must be different.' : 'Prefixele trebuie să fie diferite.'}</p>}
        <p className="mt-2 text-[11.5px] text-slate-500">{en ? 'New trips get codes like CR-2026-001 with the prefix above; existing trips keep their code.' : 'Cursele noi primesc coduri ca CR-2026-001 cu prefixul de mai sus; cursele existente își păstrează codul.'}</p>
      </section>

      <section className={card}>
        <h2 className={h2}>{en ? 'Currency, language, payment' : 'Monede, limbi, plată'}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <Field label={en ? 'Default currency' : 'Moneda implicită'}><select className={input} value={form.default_currency} onChange={(e) => set('default_currency', e.target.value)}><option>EUR</option><option>RON</option></select></Field>
          <Field label={en ? 'Reporting currency' : 'Moneda de raportare'}><select className={input} value={form.report_currency} onChange={(e) => set('report_currency', e.target.value)}><option>EUR</option><option>RON</option></select></Field>
          <Field label={en ? 'Split trip cost across goods by' : 'Costul cursei se împarte pe mărfuri după'}><select className={input} value={form.cost_allocation_basis || 'ldm'} onChange={(e) => set('cost_allocation_basis', e.target.value)}>{ALLOCATION_BASES.map((b) => <option key={b} value={b}>{basisLabel(b, en ? 'en' : 'ro')}</option>)}</select></Field>
          <Field label={en ? 'Default payment term (days)' : 'Termen de plată implicit (zile)'} error={errors.default_payment_days && E.days}><input className={input} inputMode="numeric" value={form.default_payment_days ?? ''} onChange={(e) => set('default_payment_days', e.target.value)} /></Field>
          <div>
            <p className={lbl}>{en ? 'Document languages' : 'Limbi documente'}</p>
            <div className="mt-2 flex gap-4 text-[14px]">
              {['ro', 'en'].map((l) => (
                <label key={l} className="flex items-center gap-1.5"><input type="checkbox" checked={(form.active_languages || []).includes(l)} onChange={(e) => set('active_languages', e.target.checked ? [...new Set([...(form.active_languages || []), l])] : (form.active_languages || []).filter((x) => x !== l))} />{l.toUpperCase()}</label>
              ))}
            </div>
            {errors.active_languages && <span className="text-[12px] text-rose-600">{E.required}</span>}
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>{en ? 'Signatories' : 'Persoane care semnează'}</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">{en ? 'Appear in the sender list of orders and in the email signature.' : 'Apar în lista de expeditori a comenzilor și în semnătura emailului.'}</p>
        <div className="mt-3 space-y-3">
          {signers.map((s, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              {['name', 'role', 'email'].map((k) => (
                <input key={k} className={input} placeholder={{ name: en ? 'Name' : 'Nume', role: en ? 'Role' : 'Funcție', email: 'Email' }[k]} value={s[k] || ''} onChange={(e) => set('signers', signers.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
              ))}
              <button type="button" onClick={() => set('signers', signers.filter((_, j) => j !== i))} className={`${btn} text-rose-600 hover:bg-rose-50`}>{en ? 'Remove' : 'Șterge'}</button>
            </div>
          ))}
          <button type="button" onClick={() => set('signers', [...signers, { name: '', role: '', email: '' }])} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>+ {en ? 'Add person' : 'Adaugă persoană'}</button>
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>{en ? 'General terms (on orders)' : 'Condiții generale (pe comenzi)'}</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">
          {en ? 'Leave empty to use the default text. Write {company} where the company name should appear. The text is used in the next stage (editable terms in PDFs).' : 'Lasă gol pentru textul implicit. Scrie {company} unde trebuie să apară numele firmei. Textul se folosește în PDF-uri într-o etapă următoare (condiții editabile).'}
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <Field label="Română"><textarea rows={8} className={input} value={form.terms_ro || ''} onChange={(e) => set('terms_ro', e.target.value)} /></Field>
          <Field label="English"><textarea rows={8} className={input} value={form.terms_en || ''} onChange={(e) => set('terms_en', e.target.value)} /></Field>
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>Email</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label={en ? 'Email provider' : 'Furnizor email'}>
            <select className={input} value={form.mail_provider} onChange={(e) => set('mail_provider', e.target.value)}>
              <option value="microsoft">Microsoft 365</option><option value="google">Google (Gmail)</option><option value="smtp_service">{en ? 'Email service (SMTP)' : 'Serviciu email (SMTP)'}</option>
            </select>
          </Field>
          <Field label={en ? 'Sender address' : 'Adresa expeditorului'} error={errors.mail_from && E.email}><input className={input} value={form.mail_from || ''} onChange={(e) => set('mail_from', e.target.value)} /></Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-[14px] text-slate-700">
          <input type="checkbox" checked={form.accountant_sees_payroll !== false} onChange={(e) => set('accountant_sees_payroll', e.target.checked)} />
          {en ? 'The accountant can see driver salaries' : 'Contabilul poate vedea salariile șoferilor'}
        </label>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur lg:left-[320px]">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <button type="button" disabled={busy || !dirty} onClick={save} className={`${btn} bg-brand-500 text-white hover:bg-brand-600`}>{busy ? '…' : en ? 'Save settings' : 'Salvează setările'}</button>
          {dirty && !busy && <span className="text-[12.5px] text-amber-700">{en ? 'Unsaved changes' : 'Modificări nesalvate'}</span>}
          {msg && <span className="text-[13px] text-emerald-700">{msg}</span>}
          {fail && <span className="text-[13px] text-rose-600">{fail}</span>}
        </div>
      </div>
    </div>
  )
}
