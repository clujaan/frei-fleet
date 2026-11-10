// Regenerează formularele PDF completabile pentru client (RO + EN).
// Rulare (din folderul proiectului):
//   npm i --no-save @pdf-lib/fontkit   (doar pentru acest script, NU se adaugă în package.json)
//   node scripts/build-client-forms.mjs
// Câmpurile PDF au nume stabile (citite de importul din Clienți):
//   c_*  client | l_* încărcare | u_* descărcare | g_* marfă | p_* preț
//   l_/u_: date, date2?, window, ref, company, street, zip, city, country, person, phone
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const require = createRequire(import.meta.url);
const vfs = require('pdfmake/build/vfs_fonts.js');
const OUT = path.resolve('public/forms');
const LOGO = fs.readFileSync(path.resolve('public/img/logo.png'));

const NAVY = rgb(0.043, 0.129, 0.263);
const GRAY = rgb(0.38, 0.4, 0.45);
const TXT = rgb(0.1, 0.12, 0.16);
const BORDER = [0.55, 0.6, 0.74];
const BG = [1, 0.96, 0.92];

// Datele firmei se dau la rulare, prin variabile de mediu (formularele sunt dezactivate în v1):
//   COMPANY_NAME="Firma SRL" COMPANY_CUI="RO123" COMPANY_REGCOM="J00/000/2000" COMPANY_PHONE="+40..." node scripts/build-client-forms.mjs
const CO = { name: process.env.COMPANY_NAME || 'Company name', cui: process.env.COMPANY_CUI || '', regcom: process.env.COMPANY_REGCOM || '', phone: process.env.COMPANY_PHONE || '' };
const fillDeep = (v) => typeof v === 'string'
  ? v.replaceAll('{COMPANY}', CO.name.toUpperCase()).replaceAll('{company}', CO.name).replaceAll('{cui}', CO.cui).replaceAll('{regcom}', CO.regcom).replaceAll('{phone}', CO.phone)
  : Array.isArray(v) ? v.map(fillDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x)])) : v;

const RAW = {
  ro: {
    file: 'Comanda_Transport_Client_RO.pdf',
    title: 'COMANDĂ DE TRANSPORT',
    sub: 'Formular client – completați și retrimiteți-l către {company}',
    intro: 'Vă rugăm completați toate câmpurile cunoscute și retrimiteți formularul către persoana de contact {company}. Comanda devine fermă după confirmarea {company}.',
    ident: '{COMPANY} · CUI: {cui} · Nr. Reg. Com.: {regcom} · Tel. {phone}',
    client: 'DATELE CLIENTULUI', company: 'Firma', cui: 'CUI / VAT ID', person: 'Persoană de contact', phone: 'Telefon', email: 'Email',
    ref: 'Referința dumneavoastră (nr. comandă / PO)', odate: 'Data comenzii',
    load: 'ÎNCĂRCARE', unload: 'DESCĂRCARE',
    ldate: 'Data încărcării (de la – până la)', udate: 'Data descărcării (de la – până la)', window: 'Interval orar', lref: 'Referință încărcare', uref: 'Referință descărcare',
    scompany: 'Companie / loc de încărcare', ucompany: 'Companie / loc de descărcare', street: 'Stradă și număr', zip: 'Cod poștal', city: 'Localitate', country: 'Țara',
    lperson: 'Persoană de contact la încărcare', uperson: 'Persoană de contact la descărcare', cphone: 'Telefon',
    cargo: 'MARFA', desc: 'Descrierea mărfii', weight: 'Greutate (kg)', pkgs: 'Colete / paleți (nr. și tip)', ldm: 'LDM / volum',
    vehicle: 'Tip vehicul', temp: 'Temperatură (marfă frigorifică)', adr: 'Marfă ADR', yes: 'DA', uit: 'Cod UIT (dacă există)',
    req: 'Cerințe speciale (lift, încărcare laterală, ambalare, documente etc.)',
    price: 'PREȚ ȘI PLATĂ', pp: 'Preț agreat (fără TVA)', cur: 'Moneda', terms: 'Termen de plată (zile)',
    cond: 'CONDIȚII',
    conds: [
      '1. Prețul este cel agreat cu {company}, în moneda indicată, fără TVA; TVA se aplică conform legii.',
      '2. Staționările peste intervalele convenite de încărcare/descărcare se tarifează conform înțelegerii dintre părți.',
      '3. Clientul răspunde de corectitudinea datelor despre marfă (greutate, dimensiuni, ADR, temperatură) și de ambalarea și pregătirea ei pentru transport.',
      '4. Transportul se supune convenției CMR (transport internațional) sau legislației române (transport național); răspunderea {company} este cea prevăzută de lege.',
      '5. Modificările după confirmare se fac în scris și pot modifica prețul. Plata se face la termenul indicat, pe baza facturii și a CMR-ului semnat / POD.',
    ],
    sigC: 'CLIENT – confirm comanda și condițiile', sigCfoot: 'Nume, funcție, semnătură și ștampilă · Data: ____ / ____ / ________',
    sigF: '{COMPANY} – confirmare', sigFfoot: 'Se completează de {company}',
    foot1: 'Retrimiteți formularul completat către persoana de contact {company}.', foot2: '{COMPANY} – Formular comandă client',
  },
  en: {
    file: 'Transport_Order_Customer_EN.pdf',
    title: 'TRANSPORT ORDER',
    sub: 'Customer form – please complete and return it to {company}',
    intro: 'Please complete all known fields and return the form to your {company} contact. The order becomes firm once confirmed by {company}.',
    ident: '{COMPANY} · VAT ID: {cui} · Trade Reg. No.: {regcom} · Tel. {phone}',
    client: 'CUSTOMER DETAILS', company: 'Company', cui: 'VAT ID', person: 'Contact person', phone: 'Phone', email: 'Email',
    ref: 'Your reference (order no. / PO)', odate: 'Order date',
    load: 'LOADING', unload: 'UNLOADING',
    ldate: 'Loading date (from – to)', udate: 'Unloading date (from – to)', window: 'Time window', lref: 'Loading reference', uref: 'Unloading reference',
    scompany: 'Company / loading place', ucompany: 'Company / unloading place', street: 'Street and number', zip: 'Postcode', city: 'City', country: 'Country',
    lperson: 'Contact person at loading', uperson: 'Contact person at unloading', cphone: 'Phone',
    cargo: 'CARGO', desc: 'Cargo description', weight: 'Weight (kg)', pkgs: 'Packages / pallets (no. and type)', ldm: 'LDM / volume',
    vehicle: 'Vehicle type', temp: 'Temperature (reefer cargo)', adr: 'ADR cargo', yes: 'YES', uit: 'UIT code (if any)',
    req: 'Special requirements (tail lift, side loading, packaging, documents etc.)',
    price: 'PRICE AND PAYMENT', pp: 'Agreed price (excl. VAT)', cur: 'Currency', terms: 'Payment term (days)',
    cond: 'CONDITIONS',
    conds: [
      '1. The price is the one agreed with {company}, in the stated currency, excluding VAT; VAT applies as required by law.',
      '2. Waiting time beyond the agreed loading/unloading windows is charged as agreed between the parties.',
      '3. The customer is responsible for the accuracy of the cargo data (weight, dimensions, ADR, temperature) and for its packing and preparation for transport.',
      '4. Transport is subject to the CMR Convention (international carriage) or Romanian law (domestic carriage); {company}’s liability is as provided by law.',
      '5. Changes after confirmation are made in writing and may change the price. Payment is due within the stated term, based on the invoice and the signed CMR / POD.',
    ],
    sigC: 'CUSTOMER – I confirm the order and conditions', sigCfoot: 'Name, position, signature and stamp · Date: ____ / ____ / ________',
    sigF: '{COMPANY} – confirmation', sigFfoot: 'To be completed by {company}',
    foot1: 'Please return the completed form to your {company} contact.', foot2: '{COMPANY} – Customer order form',
  },
};

export const T = fillDeep(RAW);

async function build(lang) {
  const t = T[lang];
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await pdf.embedFont(Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'), { subset: false });
  const med = await pdf.embedFont(Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'), { subset: false });
  const logo = await pdf.embedPng(LOGO);
  const page = pdf.addPage([595.28, 841.89]);
  const H = 841.89, X0 = 34, X1 = 562, W = X1 - X0;
  const form = pdf.getForm();
  const Y = (top) => H - top; // top-based coordinate -> pdf coordinate

  const text = (s, x, top, size, font = reg, color = GRAY) => page.drawText(s, { x, y: Y(top) - size * 0.8, size, font, color });
  const textR = (s, xr, top, size, font = reg, color = GRAY) => text(s, xr - font.widthOfTextAtSize(s, size), top, size, font, color);

  // header
  const lw = 150, lh = (lw * 203) / 1200;
  page.drawImage(logo, { x: X0, y: Y(26) - lh, width: lw, height: lh });
  textR(t.title, X1, 26, 17, med, NAVY);
  textR(t.sub, X1, 48, 8, reg, GRAY);
  textR(t.ident, X1, 62, 6.5, reg, GRAY);
  text(t.intro, X0, 84, 7, reg, GRAY);

  let top = 98;
  const FH = 16, LBL = 10, PITCH = 29;

  const bar = (label) => {
    page.drawRectangle({ x: X0, y: Y(top) - 13, width: W, height: 13, color: NAVY });
    text(label, X0 + 5, top + 3, 8, med, rgb(1, 1, 1));
    top += 16;
  };
  // fields: [name, label, x-fraction start, width fraction, opts]
  const style = (f, opts = {}) => {
    f.updateAppearances?.(reg);
  };
  const field = (name, label, x, w, opts = {}) => {
    text(label, x, top, 6.5, reg, GRAY);
    const h = opts.h || FH;
    const tf = form.createTextField(name);
    if (opts.multi) tf.enableMultiline();
    tf.addToPage(page, { x, y: Y(top + LBL) - h, width: w, height: h, borderColor: rgb(...BORDER), backgroundColor: rgb(...BG), borderWidth: 0.6, font: reg, textColor: TXT });
    tf.setFontSize(opts.multi ? 8 : 8.5);
    return tf;
  };
  const row = (cols, opts) => {
    // cols: [[name,label,fraction]]
    const gap = 6;
    const total = cols.reduce((s, c) => s + c[2], 0);
    const avail = W - gap * (cols.length - 1);
    let x = X0;
    cols.forEach(([n, l, fr]) => {
      const w = (avail * fr) / total;
      field(n, l, x, w, opts);
      x += w + gap;
    });
    top += (opts && opts.h ? opts.h + LBL + 4 : PITCH);
  };

  bar(t.client);
  row([['c_company', t.company, 3], ['c_cui', t.cui, 1.2]]);
  row([['c_person', t.person, 1.4], ['c_phone', t.phone, 1], ['c_email', t.email, 1.4]]);
  row([['c_ref', t.ref, 1.6], ['c_date', t.odate, 1]]);

  const stop = (p, barL, dateL, refL, compL, persL) => {
    bar(barL);
    row([[`${p}_date`, dateL, 1.5], [`${p}_window`, t.window, 1.2], [`${p}_ref`, refL, 1.2]]);
    row([[`${p}_company`, compL, 2], [`${p}_person`, persL, 1.3]]);
    row([[`${p}_street`, t.street, 2], [`${p}_phone`, t.cphone, 1.3]]);
    row([[`${p}_zip`, t.zip, 0.8], [`${p}_city`, t.city, 2], [`${p}_country`, t.country, 1.3]]);
  };
  stop('l', t.load, t.ldate, t.lref, t.scompany, t.lperson);
  stop('u', t.unload, t.udate, t.uref, t.ucompany, t.uperson);

  bar(t.cargo);
  row([['g_desc', t.desc, 1]]);
  row([['g_weight', t.weight, 1], ['g_pkgs', t.pkgs, 1.4], ['g_ldm', t.ldm, 1]]);
  // vehicle / temp / ADR / UIT
  {
    const gap = 6, fr = [1.1, 1.1, 0.55, 1.1];
    const avail = W - gap * 3, tot = fr.reduce((a, b) => a + b, 0);
    const ws = fr.map((f) => (avail * f) / tot);
    let x = X0;
    field('g_vehicle', t.vehicle, x, ws[0]); x += ws[0] + gap;
    field('g_temp', t.temp, x, ws[1]); x += ws[1] + gap;
    text(t.adr, x, top, 6.5, reg, GRAY);
    const cb = form.createCheckBox('g_adr');
    cb.addToPage(page, { x, y: Y(top + LBL) - FH, width: FH, height: FH, borderColor: rgb(...BORDER), backgroundColor: rgb(...BG), borderWidth: 0.6 });
    text(t.yes, x + FH + 4, top + LBL + 3.5, 8, reg, TXT);
    x += ws[2] + gap;
    field('g_uit', t.uit, x, ws[3]);
    top += PITCH;
  }
  {
    field('g_req', t.req, X0, W, { multi: true, h: 34 });
    top += 34 + LBL + 4;
  }

  bar(t.price);
  {
    const gap = 6, avail = W - gap * 2, w = avail / 3;
    field('p_price', t.pp, X0, w);
    text(t.cur, X0 + w + gap, top, 6.5, reg, GRAY);
    const dd = form.createDropdown('p_cur');
    dd.addOptions(['EUR', 'RON']);
    dd.addToPage(page, { x: X0 + w + gap, y: Y(top + LBL) - FH, width: w, height: FH, borderColor: rgb(...BORDER), backgroundColor: rgb(...BG), borderWidth: 0.6, font: reg, textColor: TXT });
    dd.setFontSize(8.5);
    field('p_terms', t.terms, X0 + 2 * (w + gap), w);
    top += PITCH;
  }

  bar(t.cond);
  t.conds.forEach((c) => { text(c, X0 + 2, top, 6.5, reg, TXT); top += 9; });
  top += 6;

  // signature boxes
  const sh = Math.min(70, 800 - top - 22);
  const sw = (W - 16) / 2;
  [[X0, t.sigC, t.sigCfoot], [X0 + sw + 16, t.sigF, t.sigFfoot]].forEach(([x, a, b]) => {
    page.drawRectangle({ x, y: Y(top) - sh, width: sw, height: sh, borderColor: rgb(...BORDER), borderWidth: 0.6 });
    text(a, x + 5, top + 5, 8, med, NAVY);
    text(b, x + 5, top + sh - 12, 6.5, reg, GRAY);
  });
  top += sh;

  text(t.foot1, X0, 818, 6.5, reg, GRAY);
  textR(t.foot2, X1, 818, 6.5, reg, GRAY);

  // aspect uniform pentru câmpuri
  form.updateFieldAppearances(reg);
  const bytes = await pdf.save();
  fs.writeFileSync(path.join(OUT, t.file), bytes);
  console.log(lang, 'ok, content bottom (top-coords):', Math.round(top), '/ 841');
}

if (process.argv[1] && process.argv[1].endsWith('build-client-forms.mjs')) {
  await build('ro');
  await build('en');
}
