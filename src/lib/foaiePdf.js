// Generează PDF-ul foii de decont, identic ca structură cu șablonul Excel (A4, 1 pagină).
// `buildDocDefinition` este o funcție pură (se poate testa și în Node); `generateFoaiePdf` rulează în browser.
import { lazy } from './lazyLoad'
import { COLORS } from '../config/brand'
import { brandingDataUrls, companyName, companyIds, companyAddress, getCompany, BRAND_PRIMARY as NAVY, BRAND_SECONDARY as ORANGE, BRAND_TINT as PEACH } from './company'
import { MAX_LINES, fmtDate, fmtMoneyPdf, isIncluded, computeTotals } from './format'

const LINE = COLORS.line
const COMPANY = {
  get name() { return companyName() },
  get ids() { return companyIds('ro').replace(' · ', '   |   ') },
  get address() { return companyAddress('ro') ? `Sediu social: ${companyAddress('ro')}` : '' },
  get phone() { return getCompany().phone ? `Telefon: ${getCompany().phone}` : '' },
}

const thin = { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => LINE, vLineColor: () => LINE }

export function buildDocDefinition({ report, items, logo, stamp }) {
  const lines = items.filter(isIncluded).slice(0, MAX_LINES)
  const totals = computeTotals(lines)

  const head = (text, extra = {}) => ({ text, bold: true, color: '#ffffff', fillColor: NAVY, alignment: 'center', fontSize: 8, margin: [0, 4, 0, 4], ...extra })
  const cell = (text, extra = {}) => ({ text: text ?? '', fontSize: 8, fillColor: PEACH, margin: [3, 4, 3, 4], ...extra })

  const rows = []
  for (let i = 0; i < MAX_LINES; i += 1) {
    const it = lines[i]
    rows.push([
      cell(String(i + 1), { alignment: 'center', color: '#555555', fillColor: '#ffffff' }),
      cell(it ? fmtDate(it.doc_date) : '', { alignment: 'center' }),
      cell(it?.vendor),
      cell(it?.doc_no, { alignment: 'center' }),
      cell(it?.description),
      cell(it ? fmtMoneyPdf(it.amount_gross) : '', { alignment: 'right' }),
      cell(it ? fmtMoneyPdf(it.vat_amount) : '', { alignment: 'right' }),
    ])
  }

  const dd = {
    pageSize: 'A4',
    pageMargins: [36, 30, 36, 46],
    defaultStyle: { font: 'Roboto', fontSize: 8, color: '#1b2540' },
    content: [
      {
        columns: [
          logo ? { image: logo, width: 175, margin: [0, 2, 0, 0] } : { text: companyName(), bold: true, fontSize: 20, color: NAVY },
          {
            width: '*',
            stack: [
              { text: 'FOAIE DE DECONT', bold: true, fontSize: 14, color: NAVY, alignment: 'right', margin: [0, 6, 0, 8] },
              {
                margin: [60, 0, 0, 0],
                table: {
                  widths: [64, '*'],
                  body: [
                    [
                      { text: 'Nr. foaie:', bold: true, alignment: 'right', fontSize: 8, border: [false, false, false, false], margin: [0, 3, 4, 3] },
                      { text: report.code, bold: true, alignment: 'center', fontSize: 9, fillColor: PEACH, margin: [0, 3, 0, 3] },
                    ],
                    [
                      { text: 'Data:', bold: true, alignment: 'right', fontSize: 8, border: [false, false, false, false], margin: [0, 3, 4, 3] },
                      { text: fmtDate(report.report_date), bold: true, alignment: 'center', fontSize: 9, fillColor: PEACH, margin: [0, 3, 0, 3] },
                    ],
                  ],
                },
                layout: thin,
              },
            ],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 523, y2: 4, lineWidth: 2, lineColor: ORANGE }], margin: [0, 0, 0, 8] },

      { text: COMPANY.name, bold: true, fontSize: 10.5, color: NAVY, margin: [0, 0, 0, 2] },
      { text: COMPANY.ids, fontSize: 7.5, margin: [0, 0, 0, 5] },
      { text: COMPANY.address, fontSize: 7.5, margin: [0, 0, 0, 5] },
      { text: COMPANY.phone, fontSize: 7.5, margin: [0, 0, 0, 10] },

      {
        table: {
          widths: [66, '*', 78, 112],
          body: [
            [head('DATE DECONT', { alignment: 'left', margin: [3, 3, 0, 3], colSpan: 4 }), {}, {}, {}],
            [
              cell('Nume angajat:', { bold: true, fillColor: '#F3F5F9' }),
              cell(report.employee, { bold: true }),
              cell('Metodă de plată:', { bold: true, alignment: 'right', fillColor: '#ffffff' }),
              cell(report.payment_method),
            ],
            [cell('Scop achiziții:', { bold: true, fillColor: '#F3F5F9' }), cell(report.purpose, { colSpan: 3 }), {}, {}],
          ],
        },
        layout: thin,
        margin: [0, 0, 0, 8],
      },

      {
        table: {
          headerRows: 1,
          widths: [22, 52, 84, 82, '*', 56, 52],
          heights: (r) => (r === 0 ? 'auto' : 18),
          body: [
            [head('Nr.\ncrt.'), head('Data'), head('Furnizor'), head('Nr. document\n(factură / bon)'), head('Descriere achiziție'), head('Total cu TVA\n(RON)'), head('din care TVA\n(RON)')],
            ...rows,
            [
              { text: 'TOTAL DE RAMBURSAT CĂTRE ANGAJAT', bold: true, alignment: 'right', fontSize: 9, fillColor: '#E6EBF5', color: NAVY, colSpan: 5, margin: [0, 5, 6, 5] },
              {}, {}, {}, {},
              { text: fmtMoneyPdf(totals.total_gross), bold: true, alignment: 'right', fontSize: 9, fillColor: '#E6EBF5', color: NAVY, margin: [3, 5, 3, 5] },
              { text: fmtMoneyPdf(totals.total_vat), bold: true, alignment: 'right', fontSize: 9, fillColor: '#E6EBF5', color: NAVY, margin: [3, 5, 3, 5] },
            ],
          ],
        },
        layout: thin,
      },
      { text: `Documente justificative anexate: ${totals.doc_count} (facturi / bonuri fiscale)`, italics: true, fontSize: 7.5, margin: [0, 3, 0, 14] },

      {
        table: {
          widths: ['*', '*', '*'],
          heights: (r) => (r === 0 ? 'auto' : 62),
          body: [
            [head('ÎNTOCMIT'), head('VERIFICAT'), head('APROBAT')],
            [
              { text: report.employee, bold: true, fontSize: 8.5, margin: [4, 4, 0, 0] },
              { text: '' },
              stamp ? { image: stamp, width: 54, alignment: 'center', margin: [0, 4, 0, 0] } : { text: '' },
            ],
          ],
        },
        layout: thin,
      },
      { text: 'Semnătură și dată', italics: true, alignment: 'center', fontSize: 7.5, margin: [0, 3, 0, 0] },
    ],
    footer: () => ({
      text: `${companyName()} – Foaie de decont${report.status === 'Ciornă' ? '  ·  CIORNĂ' : ''}`,
      alignment: 'center',
      fontSize: 7,
      color: '#555555',
      margin: [0, 14, 0, 0],
    }),
  }
  return dd
}

const imageCache = {}
export async function dataUrl(path) {
  if (imageCache[path]) return imageCache[path]
  const blob = await (await fetch(path)).blob()
  const url = await new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })
  imageCache[path] = url
  return url
}

// Browser: returnează un Blob PDF.
export async function generateFoaiePdf(report, items) {
  const [{ default: pdfMake }, fonts, logo, stamp] = await Promise.all([
    lazy(() => import('pdfmake/build/pdfmake')),
    lazy(() => import('pdfmake/build/vfs_fonts')),
    brandingDataUrls().then((b) => b.logo),
    brandingDataUrls().then((b) => b.stamp),
  ])
  const vfs = fonts.pdfMake?.vfs || fonts.default?.pdfMake?.vfs || fonts.default || fonts
  pdfMake.vfs = vfs
  const dd = buildDocDefinition({ report, items, logo, stamp })
  return new Promise((resolve) => pdfMake.createPdf(dd).getBlob(resolve))
}
