import test from 'node:test'
import assert from 'node:assert/strict'
import * as F from '../src/lib/companyForm.js'

test('normalizeHex', () => {
  assert.equal(F.normalizeHex('14213d'), '#14213D')
  assert.equal(F.normalizeHex('#abc'), '#AABBCC')
  assert.equal(F.normalizeHex('  #2a9d8f '), '#2A9D8F')
  assert.equal(F.normalizeHex('xyz'), null)
  assert.equal(F.normalizeHex(''), null)
  assert.equal(F.normalizeHex('#12345'), null)
})

test('IBAN mod 97', () => {
  assert.equal(F.isValidIban('RO49 AAAA 1B31 0075 9384 0000'), true) // exemplu oficial
  assert.equal(F.isValidIban('GB82 WEST 1234 5698 7654 32'), true)
  assert.equal(F.isValidIban('RO49 AAAA 1B31 0075 9384 0001'), false)
  assert.equal(F.isValidIban('12345'), false)
  assert.equal(F.normalizeIban('ro49 aaaa 1b31'), 'RO49AAAA1B31')
})

test('CUI românesc', () => {
  assert.equal(F.isValidRoCui('18547290'), true) // cifra de control corectă
  assert.equal(F.isValidRoCui('RO 18547290'), true)
  assert.equal(F.isValidRoCui('18547291'), false)
  assert.equal(F.isValidRoCui('abc'), false)
  assert.equal(F.isValidCui('', 'RO'), true) // opțional
  assert.equal(F.isValidCui('HU12345678', 'HU'), true)
  assert.equal(F.isValidCui('!!', 'HU'), false)
})

test('prefixe numerotare', () => {
  assert.equal(F.isValidPrefix('ct'), true)
  assert.equal(F.isValidPrefix('CMD7'), true)
  assert.equal(F.isValidPrefix(''), false)
  assert.equal(F.isValidPrefix('PREFIX12'), false)
  assert.equal(F.isValidPrefix('C T'), false)
})

test('fișiere imagine', () => {
  assert.equal(F.validateImageFile({ type: 'image/png', size: 1000 }), null)
  assert.equal(F.validateImageFile({ type: 'image/gif', size: 1000 }), 'type')
  assert.equal(F.validateImageFile({ type: 'image/png', size: 2 * 1024 * 1024 }), 'size')
  assert.equal(F.validateImageFile(null), 'no_file')
  assert.equal(F.imageExt({ type: 'image/jpeg' }), 'jpg')
})

const ok = () => ({
  name: 'Demo Transport SRL', cui: '18547290', country: 'RO', email: 'office@example.test', mail_from: '',
  color_primary: '#14213D', color_secondary: '#2A9D8F', ibans: [{ bank: 'Banca X', iban: 'RO49AAAA1B31007593840000', currency: 'RON' }],
  numbering_prefixes: { ct: 'CT', cc: 'CC', trip: 'CR', fd: 'FD' }, default_payment_days: 30, active_languages: ['ro', 'en'],
})

test('validateCompany: formular corect', () => assert.deepEqual(F.validateCompany(ok()), {}))
test('validateCompany: erori', () => {
  const e = F.validateCompany({ ...ok(), name: ' ', cui: '18547291', email: 'x', color_primary: 'zzz', default_payment_days: -1,
    ibans: [{ iban: 'RO00' }], numbering_prefixes: { ct: 'CT', cc: 'CT', trip: '', fd: 'FD' }, active_languages: [], base_lat: 120 })
  assert.equal(e.name, 'required'); assert.equal(e.cui, 'cui'); assert.equal(e.email, 'email'); assert.equal(e.color_primary, 'color')
  assert.equal(e.default_payment_days, 'days'); assert.deepEqual(e.ibans, [0]); assert.deepEqual(e.prefixes, ['trip'])
  assert.equal(e.prefixes_unique, true); assert.equal(e.active_languages, 'required'); assert.equal(e.base_lat, 'range')
})

test('buildCompanyPatch curăță și normalizează', () => {
  const p = F.buildCompanyPatch({ ...ok(), cui: ' ro 18547290 ', name: ' Demo ', ibans: [{ bank: ' B ', iban: 'ro49 aaaa 1b31 0075 9384 0000', currency: 'x' }, { bank: '', iban: '' }],
    numbering_prefixes: { ct: 'cmd', cc: 'cc', trip: 'cr', fd: 'dec' }, signers: [{ name: ' Ana ', role: ' Director ' }, { name: ' ' }], phone: '  ', base_lat: '47.9' })
  assert.equal(p.cui, 'RO18547290'); assert.equal(p.name, 'Demo'); assert.equal(p.phone, null)
  assert.deepEqual(p.ibans, [{ bank: 'B', iban: 'RO49AAAA1B31007593840000', currency: 'EUR' }])
  assert.deepEqual(p.numbering_prefixes, { ct: 'CMD', cc: 'CC', trip: 'CR', fd: 'DEC' })
  assert.deepEqual(p.signers, [{ name: 'Ana', role: 'Director', email: '' }]); assert.equal(p.base_lat, 47.9); assert.equal(p.base_lng, null)
})

test('culori: lizibilitate și nuanță', () => {
  assert.equal(F.whiteTextReadable('#14213D'), true)
  assert.equal(F.whiteTextReadable('#FFFF00'), false)
  assert.equal(F.tintOf('#2A9D8F'), '#E5F3F2')
  assert.equal(F.tintOf('nope'), null)
})
