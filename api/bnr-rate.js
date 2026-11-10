// Funcție serverless Vercel: cursul BNR RON/EUR pentru o dată (ultimul curs publicat cel târziu la acea dată).
// GET /api/bnr-rate?date=2026-10-13  ->  { date: '2026-10-13', rate: 5.0712, source: 'BNR' }
// Datele BNR sunt publice, deci nu cere autentificare; adresele BNR sunt fixe (nu e proxy deschis).

const parseRates = (xml) => {
  const out = []
  for (const m of xml.matchAll(/<Cube\b[^>]*?\bdate\s*=\s*["'](\d{4}-\d{2}-\d{2})["'][^>]*>([\s\S]*?)<\/Cube>/gi)) {
    const r = m[2].match(/<Rate\b[^>]*?\bcurrency\s*=\s*["']EUR["'][^>]*>\s*([\d.,]+)\s*<\/Rate>/i)
    if (r) out.push({ date: m[1], rate: Number(r[1].replace(',', '.')) })
  }
  return out
}

// BNR poate refuza clienți fără aspect de browser, așa că trimitem antete obișnuite
async function get(url) {
  const r = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      accept: 'application/xml,text/xml,*/*',
      'accept-language': 'ro-RO,ro;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`BNR ${r.status} la ${url.replace('https://www.bnr.ro', '')}`)
  return r.text()
}

export default async function handler(req, res) {
  const date = String(req.query?.date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Parametrul date trebuie să fie YYYY-MM-DD.' })

  // ?currency=HUF (sau PLN, CZK…): câți unități de monedă la 1 EUR, curs de referință ECB (BNR nu e necesar aici)
  const cur = String(req.query?.currency || '').toUpperCase()
  if (cur) {
    if (!/^[A-Z]{3}$/.test(cur) || cur === 'EUR' || cur === 'RON') return res.status(400).json({ error: 'Moneda trebuie să fie un cod de 3 litere (ex. HUF).' })
    for (const base of ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app']) {
      try {
        const r = await fetch(`${base}/${date}?base=EUR&symbols=${cur}`, { signal: AbortSignal.timeout(8000) })
        const j = await r.json()
        if (r.ok && j?.rates?.[cur]) {
          res.setHeader('cache-control', 'public, max-age=3600')
          return res.status(200).json({ date: j.date, rate: Number(j.rates[cur]), source: 'ECB', currency: cur })
        }
      } catch { /* următoarea adresă */ }
    }
    return res.status(404).json({ error: `Nu am găsit cursul EUR/${cur}.` })
  }
  const year = Number(date.slice(0, 4))
  const notes = []
  const load = async (path) => {
    try {
      const body = await get(`https://www.bnr.ro${path}`)
      const list = parseRates(body)
      if (!list.length) notes.push(`${path}: răspuns fără cursuri (${body.length} caractere: ${body.replace(/\s+/g, ' ').slice(0, 100)})`)
      return list
    } catch (e) {
      notes.push(e.message)
      return []
    }
  }
  try {
    // cel mai recent curs publicat cel târziu la data cerută
    let list = [
      ...(await load(`/files/xml/years/nbrfxrates${year}.xml`)),
      ...(await load('/nbrfxrates.xml')),
      ...(await load('/nbrfxrates10days.xml')),
    ]
    let hit = list.filter((x) => x.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]
    if (!hit && year > 2005) {
      list = await load(`/files/xml/years/nbrfxrates${year - 1}.xml`)
      hit = list.sort((a, b) => b.date.localeCompare(a.date))[0]
    }
    if (!hit) {
      // BNR blochează uneori serverele (Request Rejected): rezervă = cursul de referință ECB (frankfurter), marcat ca atare
      for (const base of ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app']) {
        try {
          const r = await fetch(`${base}/${date}?base=EUR&symbols=RON`, { signal: AbortSignal.timeout(8000) })
          const j = await r.json()
          if (r.ok && j?.rates?.RON) {
            res.setHeader('cache-control', 'public, max-age=3600')
            return res.status(200).json({ date: j.date, rate: Number(j.rates.RON), source: 'ECB' })
          }
          notes.push(`ECB ${r.status}`)
        } catch (e) {
          notes.push(`ECB: ${e.message}`)
        }
      }
      return res.status(404).json({ error: `Nu am găsit curs pentru această dată. ${notes.join(' | ')}` })
    }
    res.setHeader('cache-control', 'public, max-age=3600')
    return res.status(200).json({ date: hit.date, rate: hit.rate, source: 'BNR' })
  } catch (e) {
    return res.status(502).json({ error: `Nu am putut citi cursul BNR (${e.message}). Introdu-l manual.` })
  }
}
