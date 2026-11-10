// PDF „Comandă de transport” către client (RO / EN, A4), completat de prestator; clientul doar o verifică, o semnează și o ștampilează.
// `buildClientOrderDoc` e pură; `generateClientOrderPdf` rulează în browser.
import { lazy } from './lazyLoad'
import { fmtDate } from './format'
import { COLORS } from '../config/brand'
import { brandingDataUrls, companyName, companyIds, companyAddress, getCompany, fillCompany, BRAND_PRIMARY as NAVY, BRAND_TINT as PEACH } from './company'
import { goodsLine, goodsTotals, cleanGoods } from './goods'
import { countryName } from './places'

const LINE = COLORS.line
const COMPANY = {
  get name() { return companyName() },
  ids: { get ro() { return companyIds('ro') }, get en() { return companyIds('en') } },
  get address() { return companyAddress('ro') },
  get addressEn() { return companyAddress('en') },
  get phone() { return getCompany().phone || '' },
}

// Condițiile comenzii către client (variantă scurtă, pe aceeași pagină cu semnăturile)
export const CLIENT_TERMS = {
  ro: {
    title: 'CONDIȚII',
    items: [
      'Prețul este cel agreat cu {company}, în moneda indicată, fără TVA; TVA se aplică conform legii.',
      'Staționările peste intervalele convenite de încărcare / descărcare se tarifează conform înțelegerii dintre părți.',
      'Clientul răspunde de corectitudinea datelor despre marfă (greutate, dimensiuni, ADR, temperatură) și de ambalarea și pregătirea ei pentru transport.',
      'Transportul se supune convenției CMR (transport internațional) sau legislației române (transport național); răspunderea {company} este cea prevăzută de lege.',
      'Modificările după confirmare se fac în scris și pot modifica prețul. Plata se face la termenul indicat, pe baza facturii și a CMR-ului semnat / POD.',
    ],
  },
  en: {
    title: 'CONDITIONS',
    items: [
      'The price is the one agreed with {company}, in the currency stated, excluding VAT; VAT is applied as required by law.',
      'Waiting time beyond the agreed loading / unloading windows is charged as agreed between the parties.',
      'The customer is responsible for the accuracy of the data about the goods (weight, dimensions, ADR, temperature) and for their packing and preparation for transport.',
      'The transport is governed by the CMR Convention (international transport) or by Romanian law (domestic transport); {company}’s liability is as provided by law.',
      'Changes after confirmation must be made in writing and may change the price. Payment is made within the term stated, on the basis of the invoice and the signed CMR / POD.',
    ],
  },
}

const TXT = {
  ro: {
    title: 'COMANDĂ DE TRANSPORT', orderNo: 'Nr. comandă', date: 'Data', yourRef: 'Referința dumneavoastră', provider: 'PRESTATOR (EXPEDITOR LOGISTIC)', client: 'CLIENT', contact: 'Contact', phone: 'Tel.', email: 'Email', vat: 'CUI', regCom: 'Reg. Com.', sender: 'Persoană de contact',
    load: 'ÎNCĂRCARE', unload: 'DESCĂRCARE', company: 'Nume companie', street: 'Stradă', zipCity: 'Cod poștal / Localitate', countryL: 'Țara', goodsL: 'Marfă', totalL: 'Total punct', when: 'Data', window: 'Interval orar', person: 'Persoană de contact', ref: 'Referință',
    cargo: 'MARFA ȘI VEHICULUL', cargoDesc: 'Marfă', weight: 'Greutate', pkgs: 'Colete / paleți', ldm: 'LDM', adr: 'ADR', yes: 'DA', no: 'NU', temp: 'Temperatură', truck: 'Tip vehicul', uit: 'Cod UIT (RO e-Transport)',
    price: 'PREȚ ȘI PLATĂ', freight: 'Preț transport (fără TVA)', terms: 'Termen de plată', atUnload: 'plata la descărcare',
    from: { invoice: 'zile de la data emiterii facturii', original: 'zile de la primirea documentelor în original', electronic: 'zile de la primirea documentelor în format electronic', unload: 'zile de la data descărcării', eom: 'zile de la sfârșitul lunii în care este emisă factura' },
    special: 'Detalii suplimentare / comentarii',
    signClient: 'CLIENT – confirm comanda și condițiile', signClientSub: 'Nume, funcție, semnătură și ștampilă', signDate: 'Data', signCompany: '{COMPANY}',
    footer: '{COMPANY} – Comandă de transport',
  },
  en: {
    title: 'TRANSPORT ORDER', orderNo: 'Order no.', date: 'Date', yourRef: 'Your reference', provider: 'SERVICE PROVIDER (FREIGHT FORWARDER)', client: 'CUSTOMER', contact: 'Contact', phone: 'Tel.', email: 'Email', vat: 'VAT ID', regCom: 'Trade Reg.', sender: 'Contact person',
    load: 'LOADING', unload: 'UNLOADING', company: 'Company name', street: 'Street', zipCity: 'Postcode / City', countryL: 'Country', goodsL: 'Goods', totalL: 'Point total', when: 'Date', window: 'Time window', person: 'Contact person', ref: 'Reference',
    cargo: 'CARGO AND VEHICLE', cargoDesc: 'Cargo', weight: 'Weight', pkgs: 'Packages / pallets', ldm: 'LDM', adr: 'ADR', yes: 'YES', no: 'NO', temp: 'Temperature', truck: 'Vehicle type', uit: 'UIT code (RO e-Transport)',
    price: 'PRICE AND PAYMENT', freight: 'Freight price (excl. VAT)', terms: 'Payment terms', atUnload: 'payment at unloading',
    from: { invoice: 'days from the invoice issue date', original: 'days from receipt of the original documents', electronic: 'days from receipt of the documents in electronic form', unload: 'days from the unloading date', eom: 'days from the end of the month in which the invoice is issued' },
    special: 'Additional details / comments',
    signClient: 'CUSTOMER – I confirm the order and the conditions', signClientSub: 'Name, position, signature and stamp', signDate: 'Date', signCompany: '{COMPANY}',
    footer: '{COMPANY} – Transport order',
  },
}

const money = (n, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)

export function buildClientOrderDoc({ order, client, logo, stamp }) {
  const lang = order.lang === 'en' ? 'en' : 'ro'
  const L = fillCompany(TXT[lang], lang)
  const C = fillCompany(CLIENT_TERMS[lang], lang)
  const th = (text) => ({ text, bold: true, color: '#ffffff', fillColor: NAVY, fontSize: 8.5, margin: [4, 3, 4, 3] })
  const lab = (text) => ({ text, fontSize: 8, color: '#555555', margin: [4, 2, 2, 2] })
  const val = (text, o = {}) => ({ text: text || '—', fontSize: 9, margin: [2, 2, 4, 2], ...o })
  const grid = { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => LINE, vLineColor: () => LINE }
  const kv = (rows) => ({ table: { widths: [95, '*'], body: rows.map(([k, v]) => [lab(k), val(v)]) }, layout: grid, margin: [0, 0, 0, 5] })
  const kv4 = (rows) => ({
    table: { widths: [96, '*', 70, '*'], body: rows.map((r) => (r.length === 2 ? [lab(r[0]), { ...val(r[1]), colSpan: 3 }, {}, {}] : [lab(r[0]), val(r[1]), lab(r[2]), val(r[3])])) },
    layout: grid, margin: [0, 0, 0, 5],
  })
  const block = (title, rows) => ({ stack: [{ table: { widths: ['*'], body: [[th(title)]] }, layout: 'noBorders' }, kv(rows)] })

  const price = Number(order.price) > 0 ? `${money(order.price, lang)} ${order.currency}` : ''
  const stops = (Array.isArray(order.stops) ? order.stops : []).filter((x) => x && (x.company || x.street || x.city || x.country || x.date))
  const sideList = (side) => stops.filter((x) => x.side === side)

  const stopBlock = (side, x, i, n, compact = false) => {
    const title = `${side === 'load' ? L.load : L.unload}${n > 1 ? ` ${i + 1}` : ''}`
    const cleaned = cleanGoods(x.goods)
    const tot = goodsTotals(cleaned)
    const dec = lang === 'en' ? '.' : ','
    const totTxt = [tot.pallets > 0 && `${tot.pallets} ${lang === 'en' ? 'pallets' : 'paleți'}`, tot.weight > 0 && `${String(tot.weight).replace('.', dec)} kg`, tot.ldm > 0 && `${String(tot.ldm).replace('.', dec)} LDM`].filter(Boolean).join(' · ')
    const rows = [
      [L.when, [fmtDate(x.date), x.date_alt && fmtDate(x.date_alt)].filter((d) => d && d !== '—').join(lang === 'en' ? ' or ' : ' sau '), L.window, x.window],
      [L.company, x.company],
      [L.street, x.street],
      [L.zipCity, [x.zip, x.city].filter(Boolean).join(' '), L.countryL, x.country ? countryName(x.country, lang) : ''],
      [L.person, [x.contact, x.phone].filter(Boolean).join(', '), L.ref, x.ref],
    ]
    const flat = compact ? rows.flatMap((r) => (r.length === 4 ? [[r[0], r[1]], [r[2], r[3]]] : [r])) : rows
    const body = flat.map((r) => (compact ? [lab(r[0]), val(r[1])] : r.length === 2 ? [lab(r[0]), { ...val(r[1]), colSpan: 3 }, {}, {}] : [lab(r[0]), val(r[1]), lab(r[2]), val(r[3])]))
    if (cleaned.length) {
      const goods = { stack: [...cleaned.map((g) => ({ text: goodsLine(g, lang), fontSize: 9 })), ...(cleaned.length > 1 && totTxt ? [{ text: `${L.totalL}: ${totTxt}`, fontSize: 8.5, bold: true, margin: [0, 2, 0, 0] }] : [])], margin: [2, 2, 4, 2] }
      body.push(compact ? [lab(L.goodsL), goods] : [lab(L.goodsL), { ...goods, colSpan: 3 }, {}, {}])
    }
    return { stack: [{ table: { widths: ['*'], body: [[th(title)]] }, layout: 'noBorders' }, { table: { widths: compact ? [74, '*'] : [74, '*', 62, '*'], body }, layout: grid, margin: [0, 0, 0, 5] }], unbreakable: true }
  }
  const stopsContent = () => {
    const ls = sideList('load')
    const us = sideList('unload')
    if (ls.length === 1 && us.length === 1) return [{ columns: [{ width: '*', stack: [stopBlock('load', ls[0], 0, 1, true)] }, { width: 10, text: '' }, { width: '*', stack: [stopBlock('unload', us[0], 0, 1, true)] }] }]
    return [...ls.map((x, i) => stopBlock('load', x, i, ls.length)), ...us.map((x, i) => stopBlock('unload', x, i, us.length))]
  }

  const clientAddr = [client?.address, [client?.zip, client?.city].filter(Boolean).join(' '), client?.country ? countryName(client.country, lang) : ''].filter(Boolean).join(', ')
  const payTxt = Number(order.payment_terms_days) > 0
    ? `${order.payment_terms_days} ${L.from[order.payment_terms_from] || L.from.invoice}`
    : (order.payment_terms_days === 0 || order.payment_terms_days === '0') ? L.atUnload : ''

  const content = [
    {
      columns: [
        logo ? { image: logo, width: 120 } : { text: companyName(), bold: true, fontSize: 20, color: NAVY },
        {
          width: '*',
          stack: [
            { text: L.title, bold: true, fontSize: 14, color: NAVY, alignment: 'right', margin: [0, 0, 0, 3] },
            { text: `${L.orderNo}: ${order.code}`, bold: true, fontSize: 11, alignment: 'right' },
            { text: `${L.date}: ${fmtDate(order.order_date)}`, fontSize: 9, alignment: 'right', margin: [0, 2, 0, 0] },
            ...(order.client_ref ? [{ text: `${L.yourRef}: ${order.client_ref}`, fontSize: 9, bold: true, alignment: 'right', margin: [0, 2, 0, 0] }] : []),
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
            { table: { widths: ['*'], body: [[th(L.provider)]] }, layout: 'noBorders' },
            { table: { widths: ['*'], body: [[{ stack: [{ text: COMPANY.name, bold: true, fontSize: 10 }, { text: COMPANY.ids[lang], fontSize: 8.5 }, { text: lang === 'en' ? COMPANY.addressEn : COMPANY.address, fontSize: 8.5 }, { text: [order.sender_name && `${L.sender}: ${order.sender_name}`, `${L.phone} ${COMPANY.phone}`].filter(Boolean).join(' · '), fontSize: 8.5 }], margin: [4, 4, 4, 4] }]] }, layout: grid },
          ],
        },
        { width: 10, text: '' },
        {
          width: '*',
          stack: [
            { table: { widths: ['*'], body: [[th(L.client)]] }, layout: 'noBorders' },
            {
              table: { widths: ['*'], body: [[{ stack: [
                { text: client?.company || '—', bold: true, fontSize: 10 },
                { text: [client?.cui && `${L.vat}: ${client.cui}`, client?.reg_com && `${L.regCom}: ${client.reg_com}`].filter(Boolean).join(' · '), fontSize: 8.5 },
                { text: clientAddr, fontSize: 8.5 },
                { text: [client?.contact_name, client?.phone && `${L.phone} ${client.phone}`, client?.email].filter(Boolean).join(' · '), fontSize: 8.5 },
              ], margin: [4, 4, 4, 4] }]] },
              layout: grid,
            },
          ],
        },
      ],
      margin: [0, 0, 0, 6],
    },
    ...stopsContent(),
    { unbreakable: true, stack: [{ table: { widths: ['*'], body: [[th(L.cargo)]] }, layout: 'noBorders' }, kv4([
      [L.cargoDesc, order.cargo],
      [L.weight, order.weight_kg ? `${order.weight_kg} kg` : '', L.pkgs, order.packages],
      [L.ldm, order.ldm, L.adr, order.adr ? L.yes : L.no],
      [L.temp, order.temperature, L.truck, order.truck_type],
      ...(order.uit ? [[L.uit, order.uit]] : []),
    ])] },
    block(L.price, [[L.freight, price && { text: price, bold: true, fontSize: 11 }], [L.terms, payTxt]]),
    order.special_conditions ? { table: { widths: ['*'], body: [[{ stack: [{ text: L.special, bold: true, fontSize: 8.5 }, { text: order.special_conditions, fontSize: 8.5, margin: [0, 2, 0, 0] }], fillColor: PEACH, margin: [4, 4, 4, 4] }]] }, layout: grid, margin: [0, 2, 0, 6] } : { text: '' },
    {
      unbreakable: true,
      stack: [
        { text: C.title, bold: true, fontSize: 9, color: NAVY, margin: [0, 2, 0, 3] },
        ...C.items.map((t, i) => ({ text: `${i + 1}. ${t}`, fontSize: 8, alignment: 'justify', margin: [0, 0, 0, 2] })),
        {
          margin: [0, 10, 0, 0],
          columns: [
            { width: '*', stack: [
              { text: L.signCompany, bold: true, fontSize: 8.5 },
              { text: COMPANY.ids[lang], fontSize: 7.5, color: '#555555', margin: [0, 2, 0, 0] },
              { text: lang === 'en' ? COMPANY.addressEn : COMPANY.address, fontSize: 7.5, color: '#555555' },
              { text: order.sender_name || '', bold: true, fontSize: 10, margin: [0, 6, 0, 0] },
              { text: `${L.signDate}: ${fmtDate(order.order_date)}`, fontSize: 8, margin: [0, 2, 0, 0] },
              stamp ? { image: stamp, width: 70, margin: [0, 2, 0, 0] } : { text: '' },
            ] },
            { width: 20, text: '' },
            { width: '*', stack: [{ text: L.signClient, bold: true, fontSize: 8.5 }, { text: `${L.signClientSub} · ${L.signDate}`, fontSize: 7.5, color: '#555555', margin: [0, 2, 0, 0] }, { text: '', margin: [0, 40, 0, 0] }] },
          ],
        },
      ],
    },
  ]

  return {
    pageSize: 'A4',
    pageMargins: [34, 22, 34, 36],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1b2540' },
    content,
    footer: (page, pages) => ({ text: `${L.footer} ${order.code}  ·  ${page}/${pages}`, alignment: 'center', fontSize: 7, color: '#555555', margin: [0, 14, 0, 0] }),
  }
}

export async function generateClientOrderPdf(order, client) {
  const [{ default: pdfMake }, fonts, logo, stamp] = await Promise.all([
    lazy(() => import('pdfmake/build/pdfmake')),
    lazy(() => import('pdfmake/build/vfs_fonts')),
    brandingDataUrls().then((b) => b.logo),
    brandingDataUrls().then((b) => b.stamp),
  ])
  pdfMake.vfs = fonts.pdfMake?.vfs || fonts.default?.pdfMake?.vfs || fonts.default || fonts
  const dd = buildClientOrderDoc({ order, client, logo, stamp })
  return new Promise((resolve) => pdfMake.createPdf(dd).getBlob(resolve))
}
