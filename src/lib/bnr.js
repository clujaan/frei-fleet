// Cursul BNR (RON pentru 1 EUR) pentru o dată, prin funcția /api/bnr-rate. Rezultatele se rețin în memorie (o cerere pe zi).
const cache = new Map()

export async function fetchBnrRate(date) {
  if (cache.has(date)) return cache.get(date)
  const r = await fetch(`/api/bnr-rate?date=${encodeURIComponent(date)}`)
  let body = null
  try { body = await r.json() } catch { /* non-JSON */ }
  if (!r.ok || !body?.rate) throw new Error(body?.error || 'Cursul BNR nu e disponibil aici (merge doar pe adresa publicată).')
  cache.set(date, body)
  return body // { date, rate }
}

// Ca fetchBnrRate, dar întoarce null în loc să arunce eroare (pentru completări automate).
export async function bnrRateOrNull(date) {
  if (!date) return null
  try { return await fetchBnrRate(date) } catch { return null }
}

// Curs ECB pentru o altă monedă: câte unități la 1 EUR (ex. HUF). Se reține în memorie.
const cacheCur = new Map()
export async function fetchEurRate(date, currency) {
  const k = `${currency}|${date}`
  if (cacheCur.has(k)) return cacheCur.get(k)
  const r = await fetch(`/api/bnr-rate?date=${encodeURIComponent(date)}&currency=${encodeURIComponent(currency)}`)
  let body = null
  try { body = await r.json() } catch { /* non-JSON */ }
  if (!r.ok || !body?.rate) throw new Error(body?.error || `Cursul EUR/${currency} nu e disponibil aici (merge doar pe adresa publicată).`)
  cacheCur.set(k, body)
  return body // { date, rate, source }
}
