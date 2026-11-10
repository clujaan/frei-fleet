// Trimite pozele / PDF-urile unui rând la funcția serverless /api/read-document și returnează câmpurile citite.
import { supabase, isDemo } from './supabase'
import { imageToJpeg } from './pdfAttachments'
import { getCompany } from './company'

const toBase64 = (bytes) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

const isPdfBlob = async (blob) => new TextDecoder().decode(new Uint8Array(await blob.slice(0, 4).arrayBuffer())) === '%PDF'

// blobs: [Blob] (poze sau PDF) ale aceluiași document.
export async function readDocument(blobs) {
  if (isDemo) throw new Error('Citirea automată nu e disponibilă în modul demo.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesiune expirată. Intră din nou în cont.')

  const files = []
  for (const blob of blobs) {
    if (await isPdfBlob(blob)) {
      files.push({ mime: 'application/pdf', data: toBase64(new Uint8Array(await blob.arrayBuffer())) })
    } else {
      const { bytes } = await imageToJpeg(blob, 1600)
      files.push({ mime: 'image/jpeg', data: toBase64(bytes) })
    }
  }

  const r = await fetch('/api/read-document', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ files, company: { name: getCompany().name, cui: getCompany().cui } }),
  })
  let body = null
  try {
    body = await r.json()
  } catch {
    /* răspuns non-JSON */
  }
  if (!r.ok) {
    if (r.status === 404 || !body) throw new Error('Funcția de citire nu rulează aici. Merge doar pe adresa publicată în Vercel.')
    throw new Error(body.error || 'Eroare la citire.')
  }
  return body // { data, warnings }
}
