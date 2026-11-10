// Trimite capturile de ecran ale unei oferte la /api/read-offer și întoarce câmpurile pentru formularul „Ofertă nouă”.
import { getCompany } from './company'
import { supabase, isDemo } from './supabase'
import { imageToJpeg } from './pdfAttachments'
import { extraStops, cleanExtraStops } from './offers'

const toBase64 = (bytes) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '')

// blobs: [Blob] (1–3 imagini ale aceleiași oferte)
export async function readOffer(blobs) {
  if (isDemo) throw new Error('Citirea din imagine nu e disponibilă în modul demo.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesiune expirată. Intră din nou în cont.')
  const files = []
  for (const blob of blobs) {
    const { bytes } = await imageToJpeg(blob, 1600)
    files.push({ mime: 'image/jpeg', data: toBase64(bytes) })
  }
  const r = await fetch('/api/read-offer', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ files, company: { name: getCompany().name } }) })
  let body = null
  try { body = await r.json() } catch { /* non-JSON */ }
  if (!r.ok) {
    if (r.status === 404 || !body) throw new Error('Citirea din imagine merge doar pe adresa publicată în Vercel.')
    throw new Error(body.error || 'Eroare la citire.')
  }
  return toForm(body.data || {})
}

const str = (v) => (v == null ? '' : String(v).trim())
const numStr = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' && Number(v) > 0 ? String(v) : '')

// Câmpurile ofertei, gata pentru formular (valorile necitite rămân goale; status și preț negociabil rămân goale)
export function toForm(d) {
  return {
    exchange: ['Trans.eu', 'Timocom', 'Bursatransport.ro', 'Altă'].includes(d.exchange) ? d.exchange : 'Altă',
    company: str(d.company), contact_name: str(d.contact_name), phone: str(d.phone), email: str(d.email),
    load_country: str(d.load_country).toUpperCase(), load_place: str(d.load_place), load_date: iso(d.load_date),
    unload_country: str(d.unload_country).toUpperCase(), unload_place: str(d.unload_place), unload_date: iso(d.unload_date),
    extra_loads: cleanExtraStops(extraStops(d.extra_loads).map((x) => ({ ...x, date: iso(x.date) }))),
    extra_unloads: cleanExtraStops(extraStops(d.extra_unloads).map((x) => ({ ...x, date: iso(x.date) }))),
    km: numStr(d.km), cargo: str(d.cargo), weight_t: numStr(d.weight_t),
    vehicle_type: ['Prelată', 'Frigorific', 'Megatrailer', 'Alt tip'].includes(d.vehicle_type) ? d.vehicle_type : 'Prelată',
    price: numStr(d.price), currency: str(d.currency) || 'EUR', notes: str(d.notes),
    _warnings: Array.isArray(d.warnings) ? d.warnings : [],
  }
}
