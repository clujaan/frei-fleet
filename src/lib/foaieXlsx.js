// Export Excel al foii de decont: aceeași structură ca șablonul (A4, A1:G32), cu formule pentru totaluri și TVA automat.
import { MAX_LINES, isIncluded } from './format'
import { EMPLOYEES } from './people'
import { brandingImages, companyName, companyIds, companyAddress, BRAND_PRIMARY, BRAND_SECONDARY, BRAND_TINT } from './company'

const argb = (hex) => `FF${hex.slice(1)}`
const TOTAL = 'FFE6EAF2'
const LINE = 'FF8C96A8'

const side = (style = 'thin', color = LINE) => ({ style, color: { argb: color } })
const box = { top: side(), left: side(), bottom: side(), right: side() }
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb }, bgColor: { indexed: 64 } })
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
const font = (o = {}) => ({ name: 'Arial', size: 10, color: { argb: 'FF000000' }, ...o })

const toDate = (iso) => {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

// ExcelJS: clasa importată; logo/stamp: { buffer, ratio } sau null.
export function buildWorkbook(ExcelJS, { report, items, logo, stamp }) {
  const NAVY = argb(BRAND_PRIMARY)
  const ORANGE = argb(BRAND_SECONDARY) // eslint-disable-line no-unused-vars
  const PEACH = argb(BRAND_TINT) // eslint-disable-line no-unused-vars
  const lines = items.filter(isIncluded).slice(0, MAX_LINES)
  const wb = new ExcelJS.Workbook()
  wb.creator = companyName()
  const ws = wb.addWorksheet('Foaie decont', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      printArea: 'A1:G32',
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
    headerFooter: { oddFooter: `&C&8${companyName()} – Foaie de decont` },
  })

  ;[6, 12, 24, 22.7, 26.4, 15, 13].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  const heights = { 1: 18.75, 2: 18.75, 3: 18.75, 4: 18.75, 5: 3.75, 6: 19.5, 7: 15, 8: 27, 9: 15, 10: 7.5, 11: 18, 12: 19.5, 13: 19.5, 14: 7.5, 15: 31.5, 26: 24, 27: 18, 28: 10, 29: 18, 30: 18, 31: 43.5, 32: 14 }
  Object.entries(heights).forEach(([r, h]) => { ws.getRow(Number(r)).height = h })
  for (let r = 16; r <= 25; r += 1) ws.getRow(r).height = 36

  const set = (addr, value, { f, a, fl, b, nf } = {}) => {
    const c = ws.getCell(addr)
    c.value = value
    c.font = f || font()
    if (a) c.alignment = a
    if (fl) c.fill = fl
    if (b) c.border = b
    if (nf) c.numFmt = nf
    return c
  }
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true }
  const left = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }
  const right = { horizontal: 'right', vertical: 'middle' }
  const merge = (r) => ws.mergeCells(r)

  // Antet
  merge('D1:G2')
  set('D1', 'FOAIE DE DECONT', { f: font({ bold: true, size: 18, color: { argb: NAVY } }), a: right })
  set('D3', 'Nr. foaie:', { f: font({ bold: true, color: { argb: NAVY } }), a: right })
  merge('E3:G3')
  set('E3', report.code, { f: font({ bold: true, size: 11 }), a: center, fl: fill(PEACH), b: box })
  set('D4', 'Data:', { f: font({ bold: true, color: { argb: NAVY } }), a: right })
  merge('E4:G4')
  set('E4', toDate(report.report_date), { f: font({ bold: true, size: 11 }), a: center, fl: fill(PEACH), b: box, nf: 'dd\\.mm\\.yyyy' })
  for (const col of 'ABCDEFG') ws.getCell(`${col}5`).fill = fill(ORANGE)
  for (const c of ['F3', 'G3', 'F4', 'G4']) ws.getCell(c).border = box

  // Firma
  merge('A6:G6'); set('A6', companyName(), { f: font({ bold: true, size: 13, color: { argb: NAVY } }), a: left })
  merge('A7:G7'); set('A7', companyIds('ro').replace(' · ', '   |   '), { f: font({ size: 9.5 }), a: left })
  merge('A8:G8'); set('A8', companyAddress('ro') ? `Sediu social: ${companyAddress('ro')}` : '', { f: font({ size: 9.5 }), a: left })
  merge('A9:G9'); set('A9', 'Telefon: 0770801390', { f: font({ size: 9.5, color: { argb: 'FF333333' } }), a: left, fl: fill(PEACH) })

  // Date decont
  merge('A11:G11'); set('A11', 'DATE DECONT', { f: font({ bold: true, color: { argb: 'FFFFFFFF' } }), a: left, fl: fill(NAVY) })
  merge('A12:B12'); set('A12', 'Nume angajat:', { f: font({ bold: true, color: { argb: NAVY } }), a: right })
  merge('C12:D12'); set('C12', report.employee, { f: font({ bold: true }), a: left, fl: fill(PEACH), b: box })
  ws.getCell('D12').border = box
  set('E12', 'Metodă de plată:', { f: font({ bold: true, color: { argb: NAVY } }), a: right })
  merge('F12:G12'); set('F12', report.payment_method, { a: left, fl: fill(PEACH), b: box })
  ws.getCell('G12').border = box
  merge('A13:B13'); set('A13', 'Scop achiziții:', { f: font({ bold: true, color: { argb: NAVY } }), a: right })
  merge('C13:G13'); set('C13', report.purpose || '', { a: left, fl: fill(PEACH), b: box })
  for (const c of ['D13', 'E13', 'F13', 'G13']) ws.getCell(c).border = box

  // Tabel
  const heads = ['Nr.\ncrt.', 'Data', 'Furnizor', 'Nr. document\n(factură / bon)', 'Descriere achiziție', 'Total cu TVA\n(RON)', 'din care TVA\n(RON)']
  heads.forEach((h, i) => set(ws.getCell(15, i + 1).address, h, { f: font({ bold: true, size: 9.5, color: { argb: 'FFFFFFFF' } }), a: center, fl: fill(NAVY), b: box }))
  for (let i = 0; i < MAX_LINES; i += 1) {
    const r = 16 + i
    const it = lines[i]
    set(`A${r}`, i + 1, { f: font({ color: { argb: 'FF595959' } }), a: center, b: box })
    set(`B${r}`, it ? toDate(it.doc_date) : null, { a: center, fl: fill(PEACH), b: box, nf: 'dd\\.mm\\.yyyy' })
    set(`C${r}`, it?.vendor || null, { a: center, fl: fill(PEACH), b: box })
    set(`D${r}`, it?.doc_no || null, { a: center, fl: fill(PEACH), b: box })
    set(`E${r}`, it?.description || null, { a: center, fl: fill(PEACH), b: box })
    set(`F${r}`, it ? Number(it.amount_gross) : null, { f: font({ bold: true }), a: center, fl: fill(PEACH), b: box, nf: '#,##0.00;[Red]\\-#,##0.00;\\-' })
    // TVA automat (formula) dacă nu e modificat manual; altfel valoarea de pe document.
    const auto = { formula: `IF(F${r}="","",ROUND(F${r}*21/121,2))`, result: it ? round2((Number(it.amount_gross) * 21) / 121) : '' }
    set(`G${r}`, it?.vat_overridden ? Number(it.vat_amount) : auto, { a: center, fl: fill(PEACH), b: box, nf: '0.00' })
  }

  merge('A26:E26')
  const tf = font({ bold: true, size: 11, color: { argb: NAVY } })
  const tb = { top: side('medium', NAVY), left: side(), bottom: side(), right: side() }
  set('A26', 'TOTAL DE RAMBURSAT CĂTRE ANGAJAT', { f: tf, a: right, fl: fill(TOTAL), b: tb })
  for (const c of ['B26', 'C26', 'D26', 'E26']) { ws.getCell(c).fill = fill(TOTAL); ws.getCell(c).border = tb }
  const sumF = round2(lines.reduce((a, it) => a + Number(it.amount_gross), 0))
  const sumG = round2(lines.reduce((a, it) => a + (it.vat_overridden ? Number(it.vat_amount) : round2((Number(it.amount_gross) * 21) / 121)), 0))
  set('F26', { formula: 'SUM(F16:F25)', result: sumF }, { f: tf, a: right, fl: fill(TOTAL), b: tb, nf: '#,##0.00;[Red]\\-#,##0.00;0.00' })
  set('G26', { formula: 'SUM(G16:G25)', result: sumG }, { f: tf, a: right, fl: fill(TOTAL), b: tb, nf: '#,##0.00;[Red]\\-#,##0.00;0.00' })
  merge('A27:G27')
  set('A27', { formula: '"Documente justificative anexate: "&COUNTA(D16:D25)&" (facturi / bonuri fiscale)"', result: `Documente justificative anexate: ${lines.filter((it) => String(it.doc_no || '').trim()).length} (facturi / bonuri fiscale)` }, { f: font({ italic: true, size: 9.5, color: { argb: 'FF595959' } }), a: { vertical: 'middle' } })

  // Semnături
  merge('A29:B29'); merge('C29:D29'); merge('E29:G29')
  set('A29', 'ÎNTOCMIT', { f: font({ bold: true, color: { argb: 'FFFFFFFF' } }), a: center, fl: fill(NAVY), b: box })
  set('C29', 'VERIFICAT', { f: font({ bold: true, color: { argb: 'FFFFFFFF' } }), a: center, fl: fill(NAVY), b: box })
  set('E29', 'APROBAT', { f: font({ bold: true, color: { argb: 'FFFFFFFF' } }), a: center, fl: fill(NAVY), b: box })
  for (const c of ['B29', 'D29', 'F29', 'G29']) { ws.getCell(c).fill = fill(NAVY); ws.getCell(c).border = box }
  merge('A30:B30'); merge('C30:D30'); merge('E30:G30')
  merge('A31:B31'); merge('C31:D31'); merge('E31:G31')
  set('A30', { formula: 'C12', result: report.employee }, { f: font({ bold: true }), a: center })
  const sig = { left: side(), right: side() }
  for (const c of ['A30', 'B30', 'C30', 'D30', 'E30', 'F30', 'G30']) ws.getCell(c).border = { ...sig, ...(c === 'A30' || c === 'C30' || c === 'E30' ? {} : {}) }
  for (const c of ['A31', 'B31', 'C31', 'D31', 'E31', 'F31', 'G31']) ws.getCell(c).border = { left: side(), right: side(), bottom: side() }
  merge('A32:G32')
  set('A32', 'Semnătură și dată', { f: font({ italic: true, size: 8, color: { argb: 'FF595959' } }), a: { horizontal: 'center', vertical: 'middle' } })

  // Validări de date
  const emp = EMPLOYEES.join(',').replaceAll('"', '')
  if (emp && emp.length <= 250) ws.getCell('C12').dataValidation = { type: 'list', allowBlank: false, formulae: [`"${emp}"`] }
  ws.getCell('F12').dataValidation = { type: 'list', allowBlank: false, formulae: ['"Card personal,Numerar,Altă metodă"'] }

  // Imagini
  if (logo) {
    const id = wb.addImage({ buffer: logo.buffer, extension: 'png' })
    const w = 315
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: w, height: Math.round(w / logo.ratio) } })
  }
  if (stamp) {
    const id = wb.addImage({ buffer: stamp.buffer, extension: 'png' })
    ws.addImage(id, { tl: { col: 4.55, row: 29.1 }, ext: { width: 74, height: Math.round(74 / stamp.ratio) } })
  }
  wb.calcProperties.fullCalcOnLoad = true
  return wb
}

// Browser: returnează un Blob .xlsx
export async function generateFoaieXlsx(report, items) {
  const [{ default: ExcelJS }, { logo, stamp }] = await Promise.all([import('exceljs'), brandingImages()])
  const wb = buildWorkbook(ExcelJS, { report, items, logo, stamp })
  const out = await wb.xlsx.writeBuffer()
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
