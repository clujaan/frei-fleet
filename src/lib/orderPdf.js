// PDF „Comandă de transport” către transportator, în română sau engleză (A4).
// `buildOrderDoc` e pură (testabilă în Node); `generateOrderPdf` rulează în browser.
import { lazy } from './lazyLoad'
import { fmtDate } from './format'
import { GENERAL_TERMS } from './orderTerms'
import { COLORS } from '../config/brand'
import { brandingDataUrls, companyName, companyIds, companyAddress, getCompany, fillCompany, BRAND_PRIMARY as NAVY, BRAND_TINT as PEACH } from './company'
import { goodsLine, goodsTotals, cleanGoods } from './goods'
import { countryName } from './places'

const LINE = COLORS.line
// Datele firmei se citesc la fiecare generare (Setări firmă); fără ele, valori neutre.
const COMPANY = {
  get name() { return companyName() },
  ids: { get ro() { return companyIds('ro') }, get en() { return companyIds('en') } },
  get address() { return companyAddress('ro') },
  get phone() { return getCompany().phone || '' },
}

const TXT = {
  ro: {
    title: 'COMANDĂ DE TRANSPORT', orderNo: 'Nr. comandă', date: 'Data', orderer: 'COMANDANT (EXPEDITOR LOGISTIC)', carrier: 'TRANSPORTATOR', contact: 'Contact', phone: 'Tel.', email: 'Email', vat: 'CUI',
    load: 'ÎNCĂRCARE', unload: 'DESCĂRCARE', company: 'Nume companie', street: 'Stradă', zipCity: 'Cod poștal / Localitate', countryL: 'Țara', goodsL: 'Marfă', totalL: 'Total punct', when: 'Data', window: 'Interval orar', address: 'Adresa', person: 'Persoană de contact', ref: 'Referință',
    cargo: 'MARFA ȘI VEHICULUL', cargoDesc: 'Marfă', weight: 'Greutate', pkgs: 'Colete / paleți', ldm: 'LDM', adr: 'ADR', yes: 'DA', no: 'NU', temp: 'Temperatură', truck: 'Tip vehicul', uit: 'Cod UIT (RO e-Transport)',
    plates: 'Nr. înmatriculare (cap tractor / remorcă)', driver: 'Șofer', price: 'PREȚ ȘI PLATĂ', freight: 'Preț transport (fără TVA)', terms: 'Termen de plată', days: 'zile de la primirea documentelor în format electronic (conform condițiilor generale)', atUnload: 'plata la descărcare, la primirea documentelor (conform condițiilor generale)',
    from: { invoice: 'zile de la data facturii', original: 'zile de la primirea documentelor în original', electronic: 'zile de la primirea documentelor în format electronic (conform condițiilor generale)', unload: 'zile de la data descărcării', eom: 'zile de la sfârșitul lunii în care este emisă factura' }, docsTo: 'Documente în original se trimit la', docsToVal: 'obligatoriu prin curier, la adresa:',
    conditions: 'CONDIȚII CONVENITE', special: 'Detalii suplimentare / comentarii', sign1: 'COMANDANT – {COMPANY}', sign2: 'TRANSPORTATOR – confirm și accept comanda', signName: 'Nume, semnătură și ștampilă', signDate: 'Data',
    footer: '{COMPANY} – Comandă de transport', draft: 'CIORNĂ',
  },
  en: {
    title: 'TRANSPORT ORDER', orderNo: 'Order no.', date: 'Date', orderer: 'ORDERING PARTY (FREIGHT FORWARDER)', carrier: 'CARRIER', contact: 'Contact', phone: 'Tel.', email: 'Email', vat: 'VAT ID',
    load: 'LOADING', unload: 'UNLOADING', company: 'Company name', street: 'Street', zipCity: 'Postcode / City', countryL: 'Country', goodsL: 'Goods', totalL: 'Point total', when: 'Date', window: 'Time window', address: 'Address', person: 'Contact person', ref: 'Reference',
    cargo: 'CARGO AND VEHICLE', cargoDesc: 'Cargo', weight: 'Weight', pkgs: 'Packages / pallets', ldm: 'LDM', adr: 'ADR', yes: 'YES', no: 'NO', temp: 'Temperature', truck: 'Vehicle type', uit: 'UIT code (RO e-Transport)',
    plates: 'Plates (tractor / trailer)', driver: 'Driver', price: 'PRICE AND PAYMENT', freight: 'Freight price (excl. VAT)', terms: 'Payment terms', days: 'days from receipt of the documents in electronic form (see general conditions)', atUnload: 'payment at unloading, on receipt of the documents (see general conditions)',
    from: { invoice: 'days from the invoice date', original: 'days from receipt of the original documents', electronic: 'days from receipt of the documents in electronic form (see general conditions)', unload: 'days from the unloading date', eom: 'days from the end of the month in which the invoice is issued' }, docsTo: 'Original documents must be sent to', docsToVal: 'mandatory, by courier, to:',
    conditions: 'AGREED CONDITIONS', special: 'Additional details / comments', sign1: 'ORDERING PARTY – {COMPANY}', sign2: 'CARRIER – I confirm and accept this order', signName: 'Name, signature and stamp', signDate: 'Date',
    footer: '{COMPANY} – Transport order', draft: 'DRAFT',
  },
}

const money = (n, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)

export function buildOrderDoc({ order, carrier, logo, stamp, withStamp = true }) {
  const L = fillCompany(TXT[order.lang === 'en' ? 'en' : 'ro'], order.lang)
  const lang = order.lang === 'en' ? 'en' : 'ro'
  const G = fillCompany(GENERAL_TERMS[lang], lang)
  const th = (text, o = {}) => ({ text, bold: true, color: '#ffffff', fillColor: NAVY, fontSize: 8.5, margin: [4, 3, 4, 3], ...o })
  const lab = (text) => ({ text, fontSize: 8, color: '#555555', margin: [4, 2, 2, 2] })
  const val = (text, o = {}) => ({ text: text || '—', fontSize: 9, margin: [2, 2, 4, 2], ...o })
  const grid = { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => LINE, vLineColor: () => LINE }
  const kv = (rows) => ({ table: { widths: [95, '*'], body: rows.map(([k, v]) => [lab(k), val(v)]) }, layout: grid, margin: [0, 0, 0, 5] })
  const kv4 = (rows) => ({
    table: {
      widths: [96, '*', 70, '*'],
      body: rows.map((r) => (r.length === 2 ? [lab(r[0]), { ...val(r[1]), colSpan: 3 }, {}, {}] : [lab(r[0]), val(r[1]), lab(r[2]), val(r[3])])),
    },
    layout: grid,
    margin: [0, 0, 0, 5],
  })
  const block = (title, rows) => ({ stack: [{ table: { widths: ['*'], body: [[th(title)]] }, layout: 'noBorders' }, kv(rows)] })

  const price = Number(order.price) > 0 ? `${money(order.price, lang)} ${order.currency}` : ''
  const adr = order.adr ? L.yes : L.no
  const place = (p) => [
    [L.when, [fmtDate(p.date), p.window].filter((x) => x && x !== '—').join(' · ')], [L.address, p.address], [L.person, p.contact], [L.ref, p.ref],
  ]

  // Puncte structurate (comenzi noi): fiecare încărcare / descărcare e numerotată (doar când sunt mai multe) și are adresa pe câmpuri, program și marfă.
  const stops = Array.isArray(order.stops) ? order.stops.filter((x) => x && (x.company || x.street || x.city || x.country || x.date)) : []
  const sideList = (side) => stops.filter((x) => x.side === side)
  const stopBlock = (side, x, i, n, compact = false) => {
    const title = `${side === 'load' ? L.load : L.unload}${n > 1 ? ` ${i + 1}` : ''}`
    const cleaned = cleanGoods(x.goods)
    const tot = goodsTotals(cleaned)
    const totTxt = [tot.pallets > 0 && `${tot.pallets} ${lang === 'en' ? 'pallets' : 'paleți'}`, tot.weight > 0 && `${String(tot.weight).replace('.', lang === 'en' ? '.' : ',')} kg`, tot.ldm > 0 && `${String(tot.ldm).replace('.', lang === 'en' ? '.' : ',')} LDM`].filter(Boolean).join(' · ')
    const rows = [
      [L.when, [fmtDate(x.date), x.date_alt && fmtDate(x.date_alt)].filter((d) => d && d !== '—').join(lang === 'en' ? ' or ' : ' sau '), L.window, x.window],
      [L.company, x.company],
      [L.street, x.street],
      [L.zipCity, [x.zip, x.city].filter(Boolean).join(' '), L.countryL, x.country ? countryName(x.country, lang) : ''],
      [L.person, [x.contact, x.phone].filter(Boolean).join(', '), L.ref, x.ref],
    ]
    const flat = compact ? rows.flatMap((r) => (r.length === 4 ? [[r[0], r[1]], [r[2], r[3]]] : [r])) : rows
    const body = flat.map((r) => (compact ? [lab(r[0]), val(r[1])] : r.length === 2 ? [lab(r[0]), { ...val(r[1]), colSpan: 3 }, {}, {}] : [lab(r[0]), val(r[1]), lab(r[2]), val(r[3])]))
    if (cleaned.length) body.push(compact ? [lab(L.goodsL), { stack: [...cleaned.map((g) => ({ text: goodsLine(g, lang), fontSize: 9 })), ...(cleaned.length > 1 && totTxt ? [{ text: `${L.totalL}: ${totTxt}`, fontSize: 8.5, bold: true, margin: [0, 2, 0, 0] }] : [])], margin: [2, 2, 4, 2] }] : [lab(L.goodsL), { stack: [...cleaned.map((g) => ({ text: goodsLine(g, lang), fontSize: 9 })), ...(cleaned.length > 1 && totTxt ? [{ text: `${L.totalL}: ${totTxt}`, fontSize: 8.5, bold: true, margin: [0, 2, 0, 0] }] : [])], colSpan: 3, margin: [2, 2, 4, 2] }, {}, {}])
    return { stack: [{ table: { widths: ['*'], body: [[th(title)]] }, layout: 'noBorders' }, { table: { widths: compact ? [74, '*'] : [74, '*', 62, '*'], body }, layout: grid, margin: [0, 0, 0, 5] }], unbreakable: true }
  }
  const stopsContent = () => {
    const ls = sideList('load')
    const us = sideList('unload')
    if (ls.length === 1 && us.length === 1) return [{ columns: [{ width: '*', stack: [stopBlock('load', ls[0], 0, 1, true)] }, { width: 10, text: '' }, { width: '*', stack: [stopBlock('unload', us[0], 0, 1, true)] }] }]
    return [...ls.map((x, i) => stopBlock('load', x, i, ls.length)), ...us.map((x, i) => stopBlock('unload', x, i, us.length))]
  }

  const content = [
    {
      columns: [
        logo ? { image: logo, width: 120, margin: [0, 0, 0, 0] } : { text: companyName(), bold: true, fontSize: 20, color: NAVY },
        {
          width: '*',
          stack: [
            { text: L.title, bold: true, fontSize: 14, color: NAVY, alignment: 'right', margin: [0, 0, 0, 3] },
            { text: `${L.orderNo}: ${order.code}`, bold: true, fontSize: 11, alignment: 'right' },
            { text: `${L.date}: ${fmtDate(order.order_date)}`, fontSize: 9, alignment: 'right', margin: [0, 2, 0, 0] },
          ],
        },
      ],
      margin: [0, 0, 0, 6],
    },
    {
      columns: [
        {
          width: '*',
          stack: [
            { table: { widths: ['*'], body: [[th(L.orderer)]] }, layout: 'noBorders' },
            { table: { widths: ['*'], body: [[{ stack: [{ text: COMPANY.name, bold: true, fontSize: 10 }, { text: COMPANY.ids[lang], fontSize: 8.5 }, { text: COMPANY.address, fontSize: 8.5 }, { text: `${L.phone} ${COMPANY.phone}`, fontSize: 8.5 }], margin: [4, 4, 4, 4] }]] }, layout: grid },
          ],
        },
        { width: 10, text: '' },
        {
          width: '*',
          stack: [
            { table: { widths: ['*'], body: [[th(L.carrier)]] }, layout: 'noBorders' },
            {
              table: { widths: ['*'], body: [[{ stack: [
                { text: carrier?.company || '—', bold: true, fontSize: 10 },
                { text: `${L.vat}: ${carrier?.cui || '—'}${carrier?.country ? ` · ${carrier.country}` : ''}`, fontSize: 8.5 },
                { text: [carrier?.contact_name, carrier?.phone && `${L.phone} ${carrier.phone}`].filter(Boolean).join(' · ') || '', fontSize: 8.5 },
                { text: carrier?.email ? `${L.email}: ${carrier.email}` : '', fontSize: 8.5 },
              ], margin: [4, 4, 4, 4] }]] },
              layout: grid,
            },
          ],
        },
      ],
      margin: [0, 0, 0, 6],
    },
    ...(stops.length ? stopsContent() : [
    {
      columns: [
        { width: '*', stack: [block(L.load, place({ date: order.load_date, window: order.load_window, address: order.load_address, contact: order.load_contact, ref: order.load_ref }))] },
        { width: 10, text: '' },
        { width: '*', stack: [block(L.unload, place({ date: order.unload_date, window: order.unload_window, address: order.unload_address, contact: order.unload_contact, ref: order.unload_ref }))] },
      ],
    }
    ]),
    { unbreakable: true, stack: [{ table: { widths: ['*'], body: [[th(L.cargo)]] }, layout: 'noBorders' }, kv4([
      [L.cargoDesc, order.cargo],
      [L.weight, order.weight_kg ? `${order.weight_kg} kg` : '', L.pkgs, order.packages],
      [L.ldm, order.ldm, L.adr, adr],
      [L.temp, order.temperature, L.truck, order.truck_type],
      [L.uit, order.uit, L.driver, [order.driver_name, order.driver_phone].filter(Boolean).join(' · ')],
      [L.plates, [order.plate_truck, order.plate_trailer].filter(Boolean).join(' / ')],
    ])] },
    block(L.price, [
      [L.freight, price && { text: price, bold: true, fontSize: 11 }],
      [L.terms, Number(order.payment_terms_days) > 0 ? `${order.payment_terms_days} ${L.from[order.payment_terms_from] || L.days}` : (order.payment_terms_days === 0 || order.payment_terms_days === '0') ? L.atUnload : ''],
      ...(order.payment_terms_from === 'original' && Number(order.payment_terms_days) > 0 ? [[L.docsTo, `${L.docsToVal} ${COMPANY.name}, ${COMPANY.address}`]] : []),
    ]),
    order.special_conditions ? { table: { widths: ['*'], body: [[{ stack: [{ text: L.special, bold: true, fontSize: 8.5 }, { text: order.special_conditions, fontSize: 8.5, margin: [0, 2, 0, 0] }], fillColor: PEACH, margin: [4, 4, 4, 4] }]] }, layout: grid, margin: [0, 2, 0, 6] } : { text: '' },
    { text: G.note, fontSize: 8, italics: true, color: '#555555', margin: [0, 4, 0, 0] },
    {
      unbreakable: true,
      margin: [0, 6, 0, 0],
      columns: [
        { width: '*', stack: [{ text: L.sign1, bold: true, fontSize: 8.5 }, { text: L.signName, fontSize: 7.5, color: '#555555', margin: [0, 2, 0, 0] }, withStamp && stamp ? { image: stamp, width: 70, margin: [0, 2, 0, 0] } : { text: '', margin: [0, 32, 0, 0] }] },
        { width: 20, text: '' },
        { width: '*', stack: [{ text: L.sign2, bold: true, fontSize: 8.5 }, { text: `${L.signName} · ${L.signDate}`, fontSize: 7.5, color: '#555555', margin: [0, 2, 0, 0] }, { text: '', margin: [0, 32, 0, 0] }] },
      ],
    },
    { text: G.title, bold: true, fontSize: 12, color: NAVY, pageBreak: 'before', margin: [0, 0, 0, 4] },
    { text: G.intro, fontSize: 8.5, color: '#555555', margin: [0, 0, 0, 6] },
    ...G.items.map(([h, t], i) => ({ text: [{ text: `${i + 1}. ${h}. `, bold: true, color: NAVY }, t], fontSize: 9.2, alignment: 'justify', margin: [0, 0, 0, 6] })),
  ]

  return {
    pageSize: 'A4',
    pageMargins: [34, 22, 34, 36],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1b2540' },
    content,
    footer: (page, pages) => ({
      text: `${L.footer} ${order.code}${order.status === 'Ciornă' ? `  ·  ${L.draft}` : ''}  ·  ${page}/${pages}`,
      alignment: 'center', fontSize: 7, color: '#555555', margin: [0, 14, 0, 0],
    }),
  }
}

export async function generateOrderPdf(order, carrier, opts = {}) {
  const [{ default: pdfMake }, fonts, logo, stamp] = await Promise.all([
    lazy(() => import('pdfmake/build/pdfmake')),
    lazy(() => import('pdfmake/build/vfs_fonts')),
    brandingDataUrls().then((b) => b.logo),
    brandingDataUrls().then((b) => b.stamp),
  ])
  pdfMake.vfs = fonts.pdfMake?.vfs || fonts.default?.pdfMake?.vfs || fonts.default || fonts
  const dd = buildOrderDoc({ order, carrier, logo, stamp, ...opts })
  return new Promise((resolve) => pdfMake.createPdf(dd).getBlob(resolve))
}
