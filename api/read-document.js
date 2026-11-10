// Funcție serverless Vercel: citește un bon / o factură (poze sau PDF) cu Claude și returnează câmpurile pentru decont.
// Cheia ANTHROPIC_API_KEY rămâne doar aici, pe server (variabilă de mediu în Vercel), niciodată în browser.
//
// Variabile de mediu necesare în Vercel:
//   ANTHROPIC_API_KEY   cheia din Anthropic Console
//   SUPABASE_URL        la fel ca VITE_SUPABASE_URL (https://REF.supabase.co)
//   SUPABASE_ANON_KEY   la fel ca VITE_SUPABASE_ANON_KEY (cheia publishable)
//   ANTHROPIC_MODEL     opțional (implicit claude-sonnet-5-5)

const MAX_FILES = 6
const MAX_BASE64_CHARS = 4_000_000 // limita Vercel pentru corpul cererii este ~4,5 MB

const TOOL = {
  name: 'save_document',
  description: 'Salvează datele citite dintr-un bon fiscal sau dintr-o factură.',
  input_schema: {
    type: 'object',
    properties: {
      doc_type: { type: 'string', enum: ['factura', 'bon_fiscal', 'altul'] },
      vendor: { type: 'string', description: 'Numele furnizorului (emitentul), așa cum apare, fără adresă.' },
      doc_no: {
        type: 'string',
        description:
          'Factură: seria și numărul exact (ex. F225068726-43691 sau 2635928210550952, câmpul "Nr. document"). Bon fiscal: "Bon fiscal: NNNN" cu numărul bonului (nu seria casei de marcat, nu codul fiscal).',
      },
      doc_date: { type: 'string', description: 'Data documentului, format YYYY-MM-DD.' },
      total_gross: { type: 'number', description: 'Totalul de plată cu TVA, în moneda documentului.' },
      vat_total: { type: 'number', description: 'TVA total, citit din rândul de totaluri al documentului. NU îl calcula.' },
      vat_breakdown: {
        type: 'array',
        description: 'Defalcarea TVA pe cote, exact cum apare în document.',
        items: {
          type: 'object',
          properties: { rate: { type: 'number' }, net: { type: 'number' }, vat: { type: 'number' }, gross: { type: 'number' } },
          required: ['rate', 'vat'],
        },
      },
      currency: { type: 'string', description: 'RON, EUR, USD etc.' },
      buyer_name: { type: 'string', description: 'Cumpărătorul / clientul, dacă apare.' },
      buyer_cui: { type: 'string', description: 'CUI / CIF al cumpărătorului exact cum apare (ex. RO55652303), dacă apare.' },
      has_company_cui: { type: 'boolean', description: 'true doar dacă pe document apare ca cumpărător CUI-ul firmei noastre indicat în instrucțiuni (cu sau fără RO). Dacă nu s-a indicat un CUI, pune true.' },
      description: {
        type: 'string',
        description: 'Rezumat foarte scurt în română al achiziției (max. 70 de caractere), nu lista completă de produse.',
      },
      notes: { type: 'array', items: { type: 'string' }, description: 'Doar probleme reale sau valori neclare care trebuie verificate de om. NU pune informatii normale (metoda de plata, reduceri, numar de pagini, poze rotite). Lista goala daca totul e clar.' },
    },
    required: ['doc_type', 'vendor', 'doc_no', 'doc_date', 'total_gross', 'vat_total', 'currency', 'has_company_cui', 'description'],
  },
}

const buildPrompt = (company) => `Ești asistent de contabilitate pentru ${company.name || 'firma noastră'}${company.cui ? ` (CUI ${company.cui})` : ''}. Primești poze sau PDF-uri ale unui SINGUR document (bon fiscal sau factură). Mai multe poze sunt pagini ale aceluiași document; pozele pot fi rotite, înclinate sau pe fundal.
Reguli:
- Citește totalul de plată cu TVA și TVA-ul total din rândurile de totaluri ale documentului. Nu calcula TVA cu o cotă presupusă: documentele pot avea mai multe cote (21%, 11%, 9%, 5% sau 0).
- Numerele românești folosesc virgulă pentru zecimale (447,75). Returnează numere normale (447.75).
- Dacă o valoare nu se vede clar, pune-o cât mai bine și explică în "notes". Nu inventa.
- ${company.cui ? `Cumpărătorul (firma noastră) are CUI ${company.cui} (poate apărea cu prefixul RO). Setează has_company_cui doar dacă îl vezi.` : 'Nu s-a indicat un CUI al firmei: setează has_company_cui = true.'}
- Dacă factura are mai multe pagini, folosește paginile cu totaluri pentru sume.
Apelează unealta save_document cu rezultatul. Raspunde numai apeland aceasta unealta.`

// Numele și CUI-ul firmei vin din cererea utilizatorului autentificat (Setări firmă); le curățăm înainte de a le pune în prompt.
const clean = (v, n) => String(v ?? '').replace(/[^\p{L}\p{N} .,&()\-/]/gu, '').slice(0, n).trim()
const cleanCompany = (c) => ({ name: clean(c?.name, 80), cui: clean(c?.cui, 20) })

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const near = (a, b, tol = 0.05) => a !== null && b !== null && Math.abs(a - b) <= tol

async function verifyUser(token) {
  const base = process.env.SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY
  if (!base || !anon) throw Object.assign(new Error('Serverul nu are SUPABASE_URL / SUPABASE_ANON_KEY.'), { status: 500 })
  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
  if (!who.ok) throw Object.assign(new Error('Sesiune invalidă.'), { status: 401 })
  const user = await who.json()
  // Doar utilizatorii din app_users (RLS: fiecare își vede propriul rând).
  const row = await fetch(`${base}/rest/v1/app_users?select=user_id&user_id=eq.${user.id}`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  })
  const rows = row.ok ? await row.json() : []
  if (!rows.length) throw Object.assign(new Error('Cont fără acces.'), { status: 403 })
  return user
}

function checks(d, company) {
  const warnings = [...(Array.isArray(d.notes) ? d.notes : [])]
  const gross = num(d.total_gross)
  const vat = num(d.vat_total)
  const parts = Array.isArray(d.vat_breakdown) ? d.vat_breakdown : []
  if (parts.length > 1) {
    const sum = parts.reduce((s, p) => s + (num(p.vat) ?? 0), 0)
    if (!near(sum, vat, 0.06)) warnings.push(`TVA pe cote (${sum.toFixed(2)}) nu se potrivește cu TVA total (${vat}). Verifică.`)
  }
  if (parts.length && parts.every((p) => num(p.net) !== null) && gross !== null) {
    const net = parts.reduce((s, p) => s + p.net, 0)
    if (!near(net + (vat ?? 0), gross, 0.06)) warnings.push('Net + TVA nu dă totalul documentului. Verifică sumele.')
  }
  if (company.cui && !d.has_company_cui) warnings.push('Nu am găsit CUI-ul firmei pe document: rândul nu se rambursează fără el.')
  if (d.currency && d.currency !== 'RON') warnings.push(`Document în ${d.currency}: introdu manual suma în RON.`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.doc_date || '')) warnings.push('Data nu a putut fi citită sigur.')
  return warnings
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodă nepermisă.' })
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Lipsește autentificarea.' })
    await verifyUser(token)

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return res.status(500).json({ error: 'Serverul nu are ANTHROPIC_API_KEY.' })

    const files = Array.isArray(req.body?.files) ? req.body.files : []
    if (!files.length) return res.status(400).json({ error: 'Nu ai trimis niciun fișier.' })
    if (files.length > MAX_FILES) return res.status(400).json({ error: `Maximum ${MAX_FILES} fișiere.` })
    const total = files.reduce((s, f) => s + String(f.data || '').length, 0)
    if (total > MAX_BASE64_CHARS) return res.status(413).json({ error: 'Fișierele sunt prea mari (max. ~3 MB în total).' })

    const content = files.map((f) =>
      f.mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } }
        : { type: 'image', source: { type: 'base64', media_type: f.mime || 'image/jpeg', data: f.data } },
    )
    const company = cleanCompany(req.body?.company)
    content.push({ type: 'text', text: buildPrompt(company) })

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 1500,
        tools: [TOOL],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content }],
      }),
    })
    const out = await r.json()
    if (!r.ok) return res.status(502).json({ error: out?.error?.message || 'Eroare la serviciul de citire.' })
    const call = (out.content || []).find((c) => c.type === 'tool_use')
    const d0 = call ? call.input : null; if (!d0) return res.status(502).json({ error: 'Nu am primit un rezultat de la citire. Incearca din nou.' })

    const d = d0
    return res.status(200).json({ data: d, warnings: checks(d, company) })
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Eroare internă.' })
  }
}
