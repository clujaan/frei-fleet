// Adaugă după foaia de decont documentele atașate (poze și PDF-uri), câte una pe pagină.
import { isIncluded } from './format'

const A4 = [595.28, 841.89]
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '')

// Poza -> JPEG (corectează orientarea EXIF, micșorează la max. 2000 px). Funcționează pentru jpg/png/webp.
export async function imageToJpeg(blob, maxSide = 2000) {
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k)
  const h = Math.round(bmp.height * k)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  return { bytes: new Uint8Array(await out.arrayBuffer()), w, h }
}

const isPdf = (bytes) => bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46

// foaieBlob: PDF-ul foii; rows: rândurile în ordine; docs: documents; getUrl(doc) -> url descărcabil.
// Returnează { blob, warnings }.
export async function appendAttachments(foaieBlob, report, rows, docs, getUrl) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const base = await PDFDocument.load(await foaieBlob.arrayBuffer())
  const font = await base.embedFont(StandardFonts.Helvetica)
  const warnings = []

  for (const [idx, row] of rows.entries()) {
    if (!isIncluded(row)) continue
    const mine = docs.filter((d) => d.entity_id === row.id)
    for (const d of mine) {
      try {
        const url = await getUrl(d)
        if (!url) throw new Error('fișier indisponibil')
        const blob = await (await fetch(url)).blob()
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const label = plain(`${report.code}  |  Rand ${idx + 1}  |  ${row.vendor}  |  ${row.doc_no}`)

        if (isPdf(bytes)) {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
          const pages = await base.copyPages(src, src.getPageIndices())
          pages.forEach((p, i) => {
            base.addPage(p)
            if (i === 0) p.drawText(label, { x: 20, y: p.getHeight() - 14, size: 8, font, color: rgb(0.35, 0.35, 0.35) })
          })
        } else {
          const { bytes: jpg, w, h } = await imageToJpeg(blob)
          const img = await base.embedJpg(jpg)
          const [pw, ph] = w > h ? [A4[1], A4[0]] : A4
          const page = base.addPage([pw, ph])
          const m = 28
          const top = 26
          const s = Math.min((pw - 2 * m) / w, (ph - m - top - m) / h)
          const dw = w * s
          const dh = h * s
          page.drawText(label, { x: m, y: ph - 20, size: 8, font, color: rgb(0.35, 0.35, 0.35) })
          page.drawImage(img, { x: (pw - dw) / 2, y: ph - top - m - dh, width: dw, height: dh })
        }
      } catch (e) {
        warnings.push(`${d.filename}: ${e.message}`)
      }
    }
  }
  const out = await base.save()
  return { blob: new Blob([out], { type: 'application/pdf' }), warnings }
}
