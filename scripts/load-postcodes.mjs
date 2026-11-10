// Încarcă codurile poștale GeoNames în tabelul postal_places din Supabase.
//
// Pași (vezi și README-ul din răspuns):
//   1. Descarcă RO.zip, SE.zip, DE.zip ... de la https://download.geonames.org/export/zip/ și dezarhivează-le.
//      Pune fișierele RO.txt, SE.txt etc. într-un folder, ex. C:\Users\cluja\geonames
//   2. Probă (nu scrie nimic):
//        node scripts/load-postcodes.mjs C:\Users\cluja\geonames RO SE DE
//   3. Încărcare reală (adaugă --go):
//        node scripts/load-postcodes.mjs C:\Users\cluja\geonames RO SE DE --go
//
// Variabile de mediu (setate DOAR în terminalul tău, nu în Vercel, nu în cod, nu în Git):
//   SUPABASE_URL                 ex. https://REF.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    Supabase → Project Settings → API → service_role (secret)
//
// Rularea repetată pentru aceeași țară înlocuiește datele țării (nu dublează).

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const go = args.includes('--go')
const rest = args.filter((a) => a !== '--go')
const dir = rest[0]
const countries = rest.slice(1).map((c) => c.toUpperCase())
if (!dir || !countries.length) {
  console.error('Folosire: node scripts/load-postcodes.mjs <folder> <TARA> [<TARA> ...] [--go]')
  process.exit(1)
}

const EXTRA = { ß: 'ss', ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' }
const fold = (s) => s.toLowerCase().replace(/[ßøæœłđðþı]/g, (c) => EXTRA[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null }

function parse(file, cc) {
  const seen = new Set()
  const rows = []
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line) continue
    const c = line.split('\t')
    // țară, cod, localitate, admin1, cod1, admin2, cod2, admin3, cod3, lat, lon, acuratețe
    const postcode = (c[1] || '').trim()
    const place = (c[2] || '').trim()
    if (!postcode || !place) continue
    const key = `${postcode}|${place}|${c[5] || c[3] || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      country: cc, postcode, pc: postcode.replace(/\s+/g, '').toUpperCase(), place, search: fold(place),
      region: (c[3] || '').trim() || null, county: (c[5] || '').trim() || null, lat: num(c[9]), lon: num(c[10]),
    })
  }
  return rows
}

const BYTES_PER_ROW = 200 // estimare: date + indexuri
const all = {}
let total = 0
for (const cc of countries) {
  const file = path.join(dir, `${cc}.txt`)
  if (!fs.existsSync(file)) { console.error(`Lipsește ${file} — sar peste ${cc}.`); continue }
  all[cc] = parse(file, cc)
  total += all[cc].length
  console.log(`${cc}: ${all[cc].length.toLocaleString('ro-RO')} rânduri`)
}
console.log(`TOTAL: ${total.toLocaleString('ro-RO')} rânduri ≈ ${(total * BYTES_PER_ROW / 1048576).toFixed(0)} MB în Supabase (estimare)`)

if (!go) {
  console.log('\nProbă: nu am scris nimic. Adaugă --go ca să încarc.')
  process.exit(0)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Setează SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY în terminal.'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

for (const [cc, rows] of Object.entries(all)) {
  const del = await sb.from('postal_places').delete().eq('country', cc)
  if (del.error) { console.error(`${cc}: ștergere eșuată — ${del.error.message}`); process.exit(1) }
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.from('postal_places').insert(rows.slice(i, i + 1000))
    if (error) { console.error(`${cc}: eroare la rândul ${i} — ${error.message}`); process.exit(1) }
  }
  console.log(`${cc}: încărcat ${rows.length.toLocaleString('ro-RO')}`)
}
console.log('Gata.')
