// Generează variantele Word (.docx) ale formularelor client, identice ca structură cu PDF-urile.
// Rulare: node scripts/build-client-forms-docx.mjs   (necesită pachetul "docx": npm i --no-save docx)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { T } from './build-client-forms.mjs';
const require = createRequire(import.meta.url);
const d = require('docx');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun, AlignmentType, Footer, TabStopType, HeightRule, VerticalAlign } = d;

const OUT = path.resolve('public/forms');
const LOGO = fs.readFileSync(path.resolve('public/img/logo.png'));
const NAVY = '0B2143', GRAY = '666B73', TXT = '1A1F29', BORDER = '8C99BD', BG = 'FFF5EB';
const W = 10466; // A4 cu margini 720
const GAP = 110;
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noB = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const lineB = { style: BorderStyle.SINGLE, size: 4, color: BORDER };
const boxB = { top: lineB, bottom: lineB, left: lineB, right: lineB };
const FONT = 'Roboto';
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 16, color: o.color || TXT, bold: o.bold });
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { before: 0, after: 0, line: o.line }, alignment: o.align, shading: o.shade ? { type: ShadingType.CLEAR, fill: o.shade, color: 'auto' } : undefined, indent: o.indent, keepNext: o.keepNext });

const bar = (label) => new Paragraph({
  children: [new TextRun({ text: ' ' + label, font: FONT, size: 16, bold: true, color: 'FFFFFF' })],
  shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' }, spacing: { before: 110, after: 40 }, keepNext: true,
});

// un rând de câmpuri: cols = [[label, fraction, opts]]
function fieldRow(cols, o = {}) {
  const gaps = cols.length - 1;
  const avail = W - GAP * gaps;
  const tot = cols.reduce((s, c) => s + c[1], 0);
  let ws = cols.map((c) => Math.round((avail * c[1]) / tot));
  ws[ws.length - 1] += avail - ws.reduce((a, b) => a + b, 0);
  const widths = []; const lab = []; const inp = [];
  cols.forEach((c, i) => {
    widths.push(ws[i]);
    lab.push(new TableCell({ width: { size: ws[i], type: WidthType.DXA }, borders: noB, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [para(run(c[0], { size: 13, color: GRAY }))] }));
    const content = c[2] && c[2].check
      ? [para([run('☐ ', { size: 20 }), run(c[2].check, { size: 16 })])]
      : [para(run(''))];
    inp.push(new TableCell({ width: { size: ws[i], type: WidthType.DXA }, borders: boxB, shading: { type: ShadingType.CLEAR, fill: BG, color: 'auto' }, verticalAlign: VerticalAlign.CENTER, margins: { top: 20, bottom: 20, left: 80, right: 80 }, children: content }));
    if (i < gaps) {
      widths.push(GAP);
      lab.push(new TableCell({ width: { size: GAP, type: WidthType.DXA }, borders: noB, children: [para(run(''))] }));
      inp.push(new TableCell({ width: { size: GAP, type: WidthType.DXA }, borders: noB, children: [para(run(''))] }));
    }
  });
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: widths, borders: { ...noB, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({ cantSplit: true, children: lab }),
      new TableRow({ cantSplit: true, height: { value: o.h || 330, rule: HeightRule.ATLEAST }, children: inp }),
    ],
  });
}
const spacer = (n = 50) => new Paragraph({ spacing: { before: 0, after: 0, line: n }, children: [run('', { size: 2 })] });

function build(lang) {
  const t = T[lang];
  const kids = [];
  // antet
  const lw = 150 * 15; // px→twips aprox
  kids.push(new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [4300, W - 4300], borders: { ...noB, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 4300, type: WidthType.DXA }, borders: noB, children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: LOGO, transformation: { width: 190, height: 32 }, altText: { title: 'Logo', description: 'Logo', name: 'logo' } })] })] }),
      new TableCell({ width: { size: W - 4300, type: WidthType.DXA }, borders: noB, children: [
        para(run(t.title, { size: 34, color: NAVY }), { align: AlignmentType.RIGHT }),
        para(run(t.sub, { size: 16, color: GRAY }), { align: AlignmentType.RIGHT }),
        para(run(t.ident, { size: 13, color: GRAY }), { align: AlignmentType.RIGHT }),
      ] }),
    ] })],
  }));
  kids.push(new Paragraph({ spacing: { before: 100, after: 0 }, children: [run(t.intro, { size: 14, color: GRAY })] }));

  kids.push(bar(t.client));
  kids.push(fieldRow([[t.company, 3], [t.cui, 1.2]])); kids.push(spacer());
  kids.push(fieldRow([[t.person, 1.4], [t.phone, 1], [t.email, 1.4]])); kids.push(spacer());
  kids.push(fieldRow([[t.ref, 1.6], [t.odate, 1]]));

  const stop = (barL, dateL, refL, compL, persL) => {
    kids.push(bar(barL));
    kids.push(fieldRow([[dateL, 1.5], [t.window, 1.2], [refL, 1.2]])); kids.push(spacer());
    kids.push(fieldRow([[compL, 2], [persL, 1.3]])); kids.push(spacer());
    kids.push(fieldRow([[t.street, 2], [t.cphone, 1.3]])); kids.push(spacer());
    kids.push(fieldRow([[t.zip, 0.8], [t.city, 2], [t.country, 1.3]]));
  };
  stop(t.load, t.ldate, t.lref, t.scompany, t.lperson);
  stop(t.unload, t.udate, t.uref, t.ucompany, t.uperson);

  kids.push(bar(t.cargo));
  kids.push(fieldRow([[t.desc, 1]])); kids.push(spacer());
  kids.push(fieldRow([[t.weight, 1], [t.pkgs, 1.4], [t.ldm, 1]])); kids.push(spacer());
  kids.push(fieldRow([[t.vehicle, 1.1], [t.temp, 1.1], [t.adr, 0.8, { check: t.yes }], [t.uit, 1.1]])); kids.push(spacer());
  kids.push(fieldRow([[t.req, 1]], { h: 700 }));

  kids.push(bar(t.price));
  kids.push(fieldRow([[t.pp, 1], [t.cur, 1], [t.terms, 1]]));

  kids.push(bar(t.cond));
  t.conds.forEach((c) => kids.push(new Paragraph({ spacing: { before: 0, after: 20 }, children: [run(c, { size: 13 })] })));
  kids.push(spacer(120));

  const sw = Math.round((W - 240) / 2);
  const sig = (a, b) => new TableCell({
    width: { size: sw, type: WidthType.DXA }, borders: boxB, margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [para(run(a, { size: 16, bold: true, color: NAVY })), para(run('', {}), { line: 1100 }), para(run(b, { size: 13, color: GRAY }))],
  });
  kids.push(new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [sw, 240, sw], borders: { ...noB, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({ cantSplit: true, children: [sig(t.sigC, t.sigCfoot), new TableCell({ width: { size: 240, type: WidthType.DXA }, borders: noB, children: [para(run(''))] }), sig(t.sigF, t.sigFfoot)] })],
  }));

  const footer = new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: W }], children: [run(t.foot1, { size: 13, color: GRAY }), new TextRun({ text: '\t' + t.foot2, font: FONT, size: 13, color: GRAY })] })] });
  return new Document({
    creator: process.env.COMPANY_NAME || 'Company name', title: t.title, styles: { default: { document: { run: { font: FONT, size: 16 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 500, bottom: 700, left: 720, right: 720, footer: 300 } } }, footers: { default: footer }, children: kids }],
  });
}

for (const lang of ['ro', 'en']) {
  const file = T[lang].file.replace(/\.pdf$/, '.docx');
  fs.writeFileSync(path.join(OUT, file), await Packer.toBuffer(build(lang)));
  console.log('ok', file);
}
