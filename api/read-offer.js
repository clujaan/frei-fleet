// Funcție serverless Vercel: citește o captură de ecran a unei oferte din bursa de transport (Trans.eu, TimoCom, Bursatransport.ro)
// și returnează câmpurile pentru formularul „Ofertă nouă”. Cheia ANTHROPIC_API_KEY rămâne doar pe server.
// Variabile de mediu (aceleași ca la read-document): ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_MODEL (opțional).

const MAX_FILES = 3
const MAX_BASE64_CHARS = 4_000_000

const STOP = {
  type: 'object',
  properties: {
    country: { type: 'string', description: 'Cod țară ISO din 2 litere (RO, DE, NO ...).' },
    place: { type: 'string', description: 'Localitate și cod poștal dacă apare, ex. "Paide 72711". Fără județ/regiune dacă are cod poștal.' },
    date: { type: 'string', description: 'Prima dată a ferestrei, YYYY-MM-DD, sau gol.' },
  },
  required: ['country', 'place'],
}

const TOOL = {
  name: 'save_offer',
  description: 'Salvează datele citite dintr-o ofertă de transport.',
  input_schema: {
    type: 'object',
    properties: {
      exchange: { type: 'string', enum: ['Trans.eu', 'Timocom', 'Bursatransport.ro', 'Altă'], description: 'Bursa, după aspectul și textele capturii (ID TC / „TransCore” = Timocom; „Propose a rate” / FR/aaaa/... = Trans.eu; „Camion necesar”, „Distanta estimata” = Bursatransport.ro).' },
      company: { type: 'string', description: 'Firma care postează oferta, exact cum apare. Gol dacă nu se vede.' },
      contact_name: { type: 'string' },
      phone: { type: 'string', description: 'Telefon cu prefix internațional, ex. +40 747 279 754.' },
      email: { type: 'string' },
      load_country: { type: 'string', description: 'Cod ISO din 2 litere al încărcării principale.' },
      load_place: { type: 'string', description: 'Localitate și cod poștal încărcare principală, ex. "Timișoara 300001" sau "Paide 72711".' },
      load_date: { type: 'string', description: 'Prima dată a ferestrei de încărcare, YYYY-MM-DD.' },
      unload_country: { type: 'string' },
      unload_place: { type: 'string' },
      unload_date: { type: 'string', description: 'Prima dată a ferestrei de descărcare, YYYY-MM-DD.' },
      extra_loads: { type: 'array', items: STOP, description: 'Locuri de încărcare suplimentare, dacă sunt.' },
      extra_unloads: { type: 'array', items: STOP, description: 'Locuri de descărcare suplimentare, dacă sunt.' },
      km: { type: 'number', description: 'Distanța în km afișată de bursă (ex. 2409), sau null dacă nu apare.' },
      cargo: { type: 'string', description: 'Marfa pe scurt în română (ex. "4 europaleți 120x80x135", "Marfă generală"), max. 60 caractere.' },
      weight_t: { type: 'number', description: 'Greutatea în tone (ex. 7 sau 1.4), sau null.' },
      vehicle_type: { type: 'string', enum: ['Prelată', 'Frigorific', 'Megatrailer', 'Alt tip'], description: 'Prelată/duba/tautliner = Prelată; cooler/frigo/reefer = Frigorific; mega = Megatrailer (dacă sunt acceptate mai multe tipuri, alege cel mai general: Prelată).' },
      price: { type: 'number', description: 'Prețul oferit/publicat. NULL dacă scrie "de negociat", "to negotiate" sau lipsește.' },
      currency: { type: 'string', description: 'EUR, RON etc.; EUR dacă nu apare.' },
      notes: { type: 'string', description: 'Date utile care nu au câmp: ID-ul/referința ofertei, ferestrele complete de încărcare/descărcare cu ore, termen de plată, temperatură, metri de încărcare, TVA, tipuri de vehicul acceptate, alt. Scurt, în română.' },
      warnings: { type: 'array', items: { type: 'string' }, description: 'Neclarități sau lucruri de verificat, în română.' },
    },
    required: ['exchange', 'load_country', 'load_place', 'unload_country', 'unload_place'],
  },
}

const buildPrompt = (company) => `Ești asistent pentru o firmă de transport rutier${company.name ? ` (${company.name})` : ''}. Primești 1–3 capturi de ecran ale ACEEAȘI oferte de marfă dintr-o bursă (Trans.eu, TimoCom sau Bursatransport.ro), în română, engleză sau alte limbi.
Reguli:
- Extrage doar ce se vede. Nu inventa: ce lipsește rămâne gol sau null. Nu pune în "price" nimic dacă prețul e „de negociat”.
- Datele sunt în format zi.lună.an sau zi-lună-an (anul poate lipsi: folosește anul curent ${new Date().getFullYear()}); returnează YYYY-MM-DD. Pentru intervale folosește prima zi.
- Țările ca cod ISO (Estonia = EE, Norvegia = NO, Irlanda = IE, România = RO).
- Locul: localitatea cum e scrisă, cu diacritice, + codul poștal dacă apare (fără prefixul țării; ex. "EE 72711" -> "72711").
- Primul loc de încărcare/descărcare merge în câmpurile principale; celelalte în extra_loads / extra_unloads.
- Firma care postează e cea afișată ca emitentă a ofertei (nu firma noastră).
Răspunde NUMAI apelând unealta save_offer.`

// Numele și CUI-ul firmei vin din cererea utilizatorului autentificat (Setări firmă); le curățăm înainte de a le pune în prompt.
const clean = (v, n) => String(v ?? '').replace(/[^\p{L}\p{N} .,&()\-/]/gu, '').slice(0, n).trim()
const cleanCompany = (c) => ({ name: clean(c?.name, 80), cui: clean(c?.cui, 20) })

async function verifyUser(token) {
  const base = process.env.SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY
  if (!base || !anon) throw Object.assign(new Error('Serverul nu are SUPABASE_URL / SUPABASE_ANON_KEY.'), { status: 500 })
  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
  if (!who.ok) throw Object.assign(new Error('Sesiune invalidă.'), { status: 401 })
  const user = await who.json()
  const row = await fetch(`${base}/rest/v1/app_users?select=user_id&user_id=eq.${user.id}`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
  const rows = row.ok ? await row.json() : []
  if (!rows.length) throw Object.assign(new Error('Cont fără acces.'), { status: 403 })
  return user
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
    if (!files.length) return res.status(400).json({ error: 'Nu ai trimis nicio imagine.' })
    if (files.length > MAX_FILES) return res.status(400).json({ error: `Maximum ${MAX_FILES} imagini pentru o ofertă.` })
    const total = files.reduce((s, f) => s + String(f.data || '').length, 0)
    if (total > MAX_BASE64_CHARS) return res.status(413).json({ error: 'Imaginile sunt prea mari (max. ~3 MB în total).' })

    const content = files.map((f) => ({ type: 'image', source: { type: 'base64', media_type: f.mime || 'image/jpeg', data: f.data } }))
    content.push({ type: 'text', text: buildPrompt(cleanCompany(req.body?.company)) })

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 1500,
        tools: [TOOL],
        tool_choice: { type: 'auto' }, // modelul nu acceptă tool_choice forțat
        messages: [{ role: 'user', content }],
      }),
    })
    const out = await r.json()
    if (!r.ok) return res.status(502).json({ error: out?.error?.message || 'Eroare la serviciul de citire.' })
    let d = (out.content || []).find((c) => c.type === 'tool_use')?.input
    if (!d) {
      // Rezervă: dacă modelul a răspuns cu text, încercăm să extragem JSON-ul din el.
      const text = (out.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
      const m = text.match(/\{[\s\S]*\}/)
      try { d = m ? JSON.parse(m[0]) : null } catch { d = null }
    }
    if (!d) return res.status(502).json({ error: 'Nu am primit un rezultat de la citire. Încearcă din nou.' })
    return res.status(200).json({ data: d })
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Eroare internă.' })
  }
}
