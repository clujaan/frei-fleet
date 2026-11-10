// Funcție serverless Vercel: împarte adresele scrise pe un singur rând (din formularul clientului) în stradă, cod poștal, localitate, județ, țară.
// Cheia ANTHROPIC_API_KEY rămâne doar pe server. Variabile de mediu: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_MODEL (opțional).

const TOOL = {
  name: 'save_addresses',
  description: 'Salvează adresele împărțite pe câmpuri.',
  input_schema: {
    type: 'object',
    properties: {
      addresses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Cheia primită, neschimbată.' },
            company: { type: 'string', description: 'Numele firmei/locației dacă apare în text (ex. „Zone Industrielle les Paluds”), altfel gol.' },
            street: { type: 'string', description: 'Strada și numărul (ex. „28 bis Avenue du Vent d’Autan”), fără cod poștal și localitate.' },
            zip: { type: 'string', description: 'Codul poștal, fără prefixul țării.' },
            city: { type: 'string', description: 'Localitatea (la sat: satul, ex. Cojocna).' },
            county: { type: 'string', description: 'Județul/regiunea dacă apare (ex. Cluj), altfel gol.' },
            country: { type: 'string', description: 'Cod ISO din 2 litere (FR, RO, DE...). Dacă lipsește din text, deduce-l din localitate/limbă sau folosește indiciul primit.' },
          },
          required: ['key', 'street', 'city', 'country'],
        },
      },
    },
    required: ['addresses'],
  },
}

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
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodă nepermisă.' })
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Lipsește autentificarea.' })
    await verifyUser(token)
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return res.status(500).json({ error: 'Serverul nu are ANTHROPIC_API_KEY.' })
    const list = (Array.isArray(req.body?.addresses) ? req.body.addresses : []).slice(0, 6)
      .map((a) => ({ key: String(a.key || '').slice(0, 20), text: String(a.text || '').slice(0, 400), hint: String(a.hint || '').slice(0, 3) }))
      .filter((a) => a.key && a.text)
    if (!list.length) return res.status(400).json({ error: 'Nu ai trimis nicio adresă.' })

    const prompt = `Împarte aceste adrese scrise pe un singur rând pe câmpuri. Nu inventa: ce lipsește rămâne gol. Păstrează diacriticele și scrierea corectă a numelor de străzi (corectează greșeli evidente de tastare, nu schimba sensul). Țara ca cod ISO din 2 litere; „hint” e țara probabilă din restul formularului (poate fi goală).\n\n${JSON.stringify(list)}\n\nRăspunde NUMAI apelând unealta save_addresses.`
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 1000, tools: [TOOL], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: prompt }] }),
    })
    const out = await r.json()
    if (!r.ok) return res.status(502).json({ error: out?.error?.message || 'Eroare la serviciul de citire.' })
    let d = (out.content || []).find((c) => c.type === 'tool_use')?.input
    if (!d) {
      const text = (out.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
      const m = text.match(/\{[\s\S]*\}/)
      try { d = m ? JSON.parse(m[0]) : null } catch { d = null }
    }
    if (!d || !Array.isArray(d.addresses)) return res.status(502).json({ error: 'Nu am primit un rezultat. Încearcă din nou.' })
    return res.status(200).json({ addresses: d.addresses })
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Eroare internă.' })
  }
}
