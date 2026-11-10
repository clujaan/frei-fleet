// Export P&L în Excel și PDF, în același layout ca pagina din aplicație.
import { fmtDate } from './format'
import { brandingDataUrls, companyName, BRAND_PRIMARY } from './company'

const money = (n, cur) => `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)}`
const pc = (v) => (v == null ? '' : `${(v * 100).toFixed(1)}%`)
const vp = (v) => (v == null ? '' : Math.abs(v) >= 2 ? (v > 0 ? '200%+' : '-200%+') : pc(v))

export const fileBase = (meta) => `PL_${meta.kind === 'week' ? `${meta.year}_S${String(meta.week).padStart(2, '0')}` : meta.kind === 'month' ? meta.key : String(meta.year)}`

// meta: { title, subtitle, lines:[[label,value]], prevLabel, currency }
export async function exportPlXlsx(rows, meta) {
  const NAVY = BRAND_PRIMARY.slice(1)
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('P&L', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 2 }, { width: 2 }, { width: 2 }, { width: 38 }, { width: 2 }, { width: 2 }, { width: 16 }, { width: 10 }, { width: 16 }, { width: 10 }, { width: 14 }, { width: 10 }]
  ws.getCell('D2').value = companyName()
  ws.getCell('D2').font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } }
  ws.getCell('D3').value = meta.title
  ws.getCell('D3').font = { bold: true, size: 12 }
  meta.lines.forEach(([k, v], i) => { ws.getCell(`D${4 + i}`).value = k; ws.getCell(`G${4 + i}`).value = v })
  let r = 5 + meta.lines.length
  const head = ['', '', '', '', '', '', meta.curLabel, '% sales', meta.prevLabel, '% sales', 'Variance', '% var.']
  head.forEach((h, i) => {
    const c = ws.getCell(r, i + 1)
    c.value = h || null
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NAVY}` } }
    c.alignment = { horizontal: 'center' }
  })
  r += 1
  const fmt = '#,##0.00;[Red]-#,##0.00'
  for (const row of rows) {
    r += 1
    if (row.kind === 'section') {
      ws.getCell(`D${r}`).value = row.label
      ws.getCell(`D${r}`).font = { bold: true, color: { argb: `FF${NAVY}` } }
      continue
    }
    ws.getCell(`D${r}`).value = row.label
    if (row.kind === 'ratio') {
      ws.getCell(`G${r}`).value = row.cur
      ws.getCell(`I${r}`).value = row.prev
      ws.getCell(`G${r}`).numFmt = '0.0%'
      ws.getCell(`I${r}`).numFmt = '0.0%'
      continue
    }
    const vals = [[`G${r}`, row.cur, fmt], [`H${r}`, row.pctCur, '0.0%'], [`I${r}`, row.prev, fmt], [`J${r}`, row.pctPrev, '0.0%'], [`K${r}`, row.varAbs, fmt], [`L${r}`, row.varPct, '0.0%']]
    vals.forEach(([a, v, f]) => { ws.getCell(a).value = v; ws.getCell(a).numFmt = f })
    if (row.kind === 'total' || row.kind === 'key') {
      for (let c = 4; c <= 12; c += 1) {
        const cell = ws.getCell(r, c)
        cell.font = { bold: true }
        cell.border = { top: { style: 'thin' } }
        if (row.kind === 'key') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF0E4' } }
      }
    }
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export async function exportPlPdf(rows, meta) {
  const NAVY = BRAND_PRIMARY.slice(1)
  const [{ default: pdfMake }, fonts, logo] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts'), brandingDataUrls().then((b) => b.logo)])
  pdfMake.vfs = fonts.pdfMake?.vfs || fonts.default?.pdfMake?.vfs || fonts.default || fonts
  const cell = (text, extra = {}) => ({ text: text ?? '', fontSize: 8, margin: [3, 3, 3, 3], ...extra })
  const head = (t) => ({ text: t, bold: true, color: '#ffffff', fillColor: `#${NAVY}`, alignment: 'center', fontSize: 8, margin: [2, 4, 2, 4] })
  const body = [[head(''), head(meta.curLabel), head('% sales'), head(meta.prevLabel), head('% sales'), head('Variance'), head('% var.')]]
  for (const r of rows) {
    if (r.kind === 'section') { body.push([cell(r.label, { bold: true, color: `#${NAVY}`, colSpan: 7, fillColor: '#E6EBF5' }), {}, {}, {}, {}, {}, {}]); continue }
    const strong = r.kind === 'total' || r.kind === 'key'
    const fill = r.kind === 'key' ? '#FDF0E4' : undefined
    const base = { bold: strong, fillColor: fill, alignment: 'right' }
    if (r.kind === 'ratio') { body.push([cell(r.label, { bold: true }), cell(pc(r.cur), base), cell('', base), cell(pc(r.prev), base), cell('', base), cell('', base), cell('', base)]); continue }
    body.push([cell(r.label, { bold: strong, fillColor: fill }), cell(money(r.cur), base), cell(pc(r.pctCur), base), cell(money(r.prev), base), cell(pc(r.pctPrev), base), cell(money(r.varAbs), base), cell(vp(r.varPct), base)])
  }
  const dd = {
    pageSize: 'A4', pageMargins: [36, 30, 36, 40], defaultStyle: { font: 'Roboto', fontSize: 8, color: '#1b2540' },
    content: [
      { columns: [{ image: logo, width: 150 }, { text: [{ text: `${meta.title}\n`, bold: true, fontSize: 14, color: `#${NAVY}` }, { text: meta.subtitle, fontSize: 9 }], alignment: 'right' }] },
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 523, y2: 4, lineWidth: 2, lineColor: '#EC6A14' }], margin: [0, 0, 0, 8] },
      { table: { headerRows: 1, widths: ['*', 62, 40, 62, 40, 58, 42], body }, layout: { hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => '#c5cde0', vLineColor: () => '#c5cde0' } },
      { text: meta.footnote, italics: true, fontSize: 7, margin: [0, 6, 0, 0] },
    ],
    footer: () => ({ text: `${companyName()} – ${meta.title} · ${fmtDate(new Date().toISOString().slice(0, 10))}`, alignment: 'center', fontSize: 7, color: '#555555', margin: [0, 12, 0, 0] }),
  }
  return new Promise((resolve) => pdfMake.createPdf(dd).getBlob(resolve))
}
