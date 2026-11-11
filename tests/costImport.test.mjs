import test from 'node:test'
import assert from 'node:assert/strict'
import * as I from '../src/lib/costImport.js'

test('CSV: separator ghicit, ghilimele, rânduri goale', () => {
  const p = I.parseCsv('﻿Data;Nr auto;Litri;Suma\n04.11.2026;"XX 10 ABC";412,5;"1.234,56"\n\n05.11.2026;XX20DEF;100;150\n')
  assert.equal(p.sep, ';')
  assert.deepEqual(p.header, ['Data', 'Nr auto', 'Litri', 'Suma'])
  assert.deepEqual(p.rows[0], ['04.11.2026', 'XX 10 ABC', '412,5', '1.234,56'])
  assert.equal(p.rows.length, 2)
  assert.equal(I.parseCsv('a,b\n1,2').sep, ',')
})

test('sume și date în formatele obișnuite', () => {
  assert.equal(I.parseAmount('1.234,56'), 1234.56)
  assert.equal(I.parseAmount('1,234.56'), 1234.56)
  assert.equal(I.parseAmount('412,5'), 412.5)
  assert.equal(I.parseAmount('EUR 99.90'), 99.9)
  assert.equal(I.parseDateTime('04.11.2026', '14:35'), '2026-11-04T14:35')
  assert.equal(I.parseDateTime('2026-11-04 08:05'), '2026-11-04T08:05')
  assert.equal(I.parseDateTime('4/11/26'), '2026-11-04T12:00')
  assert.equal(I.parseDateTime('31.13.2026'), null)
  assert.equal(I.parseDateTime('ieri'), null)
})

test('coloanele se ghicesc din antet', () => {
  assert.deepEqual(I.guessMapping(['Data', 'Ora', 'Nr. auto', 'Litri', 'Suma', 'TVA', 'Moneda', 'Stație', 'Țara']), { date: 0, time: 1, plate: 2, liters: 3, amount: 4, vat: 5, currency: 6, vendor: 7, country: 8 })
})

test('rânduri de cost: camion după număr, erori pe linie, fără dubluri', () => {
  const trucks = [{ id: 'A', plate: 'XX10ABC' }]
  const rows = [
    ['04.11.2026', '10:00', 'XX-10-ABC', '400', '550,00', '95,45'],
    ['04.11.2026', '10:00', 'XX-10-ABC', '400', '550,00', '95,45'], // dublură în fișier
    ['05.11.2026', '', 'ZZ99ZZZ', '100', '140', '0'], // camion necunoscut
    ['xx', '', 'XX10ABC', '1', '1', '0'], // dată greșită
  ]
  const map = { date: 0, time: 1, plate: 2, liters: 3, amount: 4, vat: 5 }
  const r = I.buildCostRows(rows, { map, trucks, currency: 'EUR', vatIncluded: true })
  assert.equal(r.ok.length, 1)
  assert.equal(r.duplicates, 1)
  assert.deepEqual(r.errors.map((e) => [e.line, e.reason]), [[4, 'plate'], [5, 'date']])
  const c = r.ok[0]
  assert.equal(c.truck_id, 'A')
  assert.equal(c.occurred_at, '2026-11-04T10:00')
  assert.equal(c.amount, 454.55) // fără TVA
  assert.equal(c.liters, 400)
  assert.equal(c.source, 'import')
  // același fișier importat a doua oară: tot dubluri
  const again = I.buildCostRows(rows.slice(0, 1), { map, trucks, vatIncluded: true, existingKeys: new Set([c.import_key]) })
  assert.equal(again.ok.length, 0)
  assert.equal(again.duplicates, 1)
})
