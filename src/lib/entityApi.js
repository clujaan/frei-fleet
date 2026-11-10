// CRUD generic pentru tabelele simple (clienți, transportatori…): Supabase sau demo (localStorage).
import { STORAGE_PREFIX } from '../config/brand'
import { supabase, isDemo } from './supabase'
import { demoLog, diffRows } from './activity'

const fail = (error) => {
  if (error) throw new Error(error.message || 'Eroare la baza de date.')
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))

// cfg: { table, prefix, pad, fields:[{key,type}] , seed:[] }
export function makeEntityApi(cfg) {
  const clean = (f) => {
    const o = {}
    for (const { key, type } of cfg.fields) {
      let v = f[key]
      if (type === 'number') v = v === '' || v == null ? null : Number(String(v).replace(',', '.'))
      else if (type === 'multi') v = Array.isArray(v) && v.length ? v : null
      else if (type === 'emails') v = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []
      else if (type === 'bool') v = !!v
      else if (type === 'json') v = Array.isArray(v) ? v : []
      else if (v === '' || v === undefined) v = null
      if (type === 'emails' && !v.length) v = null
      if (typeof v === 'string') v = v.trim()
      o[key] = v
    }
    return o
  }

  if (!isDemo) {
    return {
      async list() {
        const q = supabase.from(cfg.table).select('*')
        const { data, error } = await (cfg.orderBy ? q.order(cfg.orderBy, { ascending: false }).order('created_at', { ascending: false }) : q.order('code'))
        fail(error)
        return data
      },
      async save(id, fields) {
        const row = cfg.noUpdatedAt ? clean(fields) : { ...clean(fields), updated_at: new Date().toISOString() }
        const q = id ? supabase.from(cfg.table).update(row).eq('id', id) : supabase.from(cfg.table).insert(row)
        const { data, error } = await q.select().single()
        fail(error)
        return data
      },
      async remove(id) {
        const { error } = await supabase.from(cfg.table).delete().eq('id', id)
        fail(error)
      },
      async insertMany(rows) {
        let n = 0
        for (let i = 0; i < rows.length; i += 200) {
          const { data, error } = await supabase.from(cfg.table).insert(rows.slice(i, i + 200).map(clean)).select('id')
          fail(error)
          n += data.length
        }
        return n
      },
    }
  }

  const KEY = `${STORAGE_PREFIX}_demo_${cfg.table}_v1`
  let db
  try {
    db = JSON.parse(localStorage.getItem(KEY))
  } catch {
    db = null
  }
  if (!db) {
    db = { n: cfg.seed.length + 1, rows: cfg.seed.map((s, i) => ({ id: uid(), code: `${cfg.prefix}-${String(i + 1).padStart(cfg.pad, '0')}`, created_at: new Date().toISOString(), ...s })) }
  }
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      /* ignorat */
    }
  }
  return {
    async list() {
      return [...db.rows].sort((a, b) => a.code.localeCompare(b.code))
    },
    async save(id, fields) {
      const row = clean(fields)
      if (id) {
        const at = db.rows.findIndex((r) => r.id === id)
        const before = db.rows[at]
        db.rows[at] = { ...before, ...row }
        persist()
        const changes = diffRows(before, db.rows[at])
        if (Object.keys(changes).length) demoLog({ action: 'update', entity: cfg.table, entity_id: id, record_code: before.code, changes })
        return db.rows[at]
      }
      const r = { id: uid(), code: `${cfg.prefix}-${String(db.n++).padStart(cfg.pad, '0')}`, created_at: new Date().toISOString(), ...row }
      db.rows.push(r)
      persist()
      demoLog({ action: 'create', entity: cfg.table, entity_id: r.id, record_code: r.code, detail: r })
      return r
    },
    async remove(id) {
      const gone = db.rows.find((r) => r.id === id)
      db.rows = db.rows.filter((r) => r.id !== id)
      persist()
      if (gone) demoLog({ action: 'delete', entity: cfg.table, entity_id: id, record_code: gone.code, detail: gone })
    },
    async insertMany(rows) {
      for (const f of rows) {
        const row = clean(f)
        db.rows.push({ id: uid(), code: `${cfg.prefix}-${String(db.n++).padStart(cfg.pad, '0')}`, created_at: new Date().toISOString(), ...row })
      }
      persist()
      return rows.length
    },
  }
}
