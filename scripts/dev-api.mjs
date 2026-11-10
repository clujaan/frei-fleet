// Rulează local funcțiile din /api (BNR, km, citire documente cu AI), fără Vercel.
// Este un plugin Vite: la `npm run dev` ele răspund pe același port, la /api/<nume>.
// Cheile externe sunt opționale; fără ele, funcția respectivă răspunde „indisponibilă local”, nu se strică aplicația.
import fs from 'node:fs'
import path from 'node:path'

// funcție -> [variabila de mediu necesară, ce nu merge fără ea]
const NEEDS = {
  'read-document': ['ANTHROPIC_API_KEY', 'Citirea documentelor cu AI'],
  'read-offer': ['ANTHROPIC_API_KEY', 'Citirea ofertelor din imagine'],
  'parse-client-form': ['ANTHROPIC_API_KEY', 'Citirea adreselor din formular'],
  km: ['ORS_API_KEY', 'Calculul kilometrilor'],
}

async function readJson(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return undefined
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return undefined
  try { return JSON.parse(raw) } catch { return undefined }
}

export function devApi(env = {}) {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      // handler-ele citesc SUPABASE_URL / SUPABASE_ANON_KEY (la Vercel sunt variabile de mediu separate)
      const set = (k, v) => { if (v && !process.env[k]) process.env[k] = v }
      set('SUPABASE_URL', env.SUPABASE_URL || env.VITE_SUPABASE_URL)
      set('SUPABASE_ANON_KEY', env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)
      for (const k of ['ANTHROPIC_API_KEY', 'ORS_API_KEY', 'ANTHROPIC_MODEL']) set(k, env[k])

      server.middlewares.use('/api', async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://local')
        const name = url.pathname.replace(/^\/+/, '')
        if (!/^[a-z0-9-]+$/.test(name)) return next() // exclude și fișierele cu prefix „_”
        const file = path.join(server.config.root, 'api', `${name}.js`)
        if (!fs.existsSync(file)) return next()

        const json = (code, body) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }
        const need = NEEDS[name]
        if (need && !process.env[need[0]]) return json(503, { error: `${need[1]} este indisponibilă local (lipsește ${need[0]} din .env.local).` })

        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          req.body = await readJson(req)
          req.query = Object.fromEntries(url.searchParams)
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (body) => { json(res.statusCode || 200, body); return res }
          await mod.default(req, res)
        } catch (e) {
          json(500, { error: `Eroare în funcția locală ${name}: ${e.message}` })
        }
      })
    },
  }
}
