import test from 'node:test'
import assert from 'node:assert/strict'
import * as M from '../src/lib/tripMoney.js'

// Mărfuri fictive: rânduri de marfă pe punctele de încărcare
const goods = (rows) => [{ side: 'load', goods: rows }]
const euro = (qty, weight, ldm) => ({ type: 'euro', qty: String(qty), dims: '120×80', weight: String(weight), ldm: String(ldm) })

test('conversie RON/EUR', () => {
  assert.deepEqual(M.convert(100, 'EUR', 'EUR', null), { value: 100, ok: true })
  assert.deepEqual(M.convert(100, 'EUR', 'RON', 5), { value: 500, ok: true })
  assert.deepEqual(M.convert(500, 'RON', 'EUR', 5), { value: 100, ok: true })
  assert.deepEqual(M.convert(500, 'RON', 'EUR', null), { value: 0, ok: false })
  assert.deepEqual(M.convert('1.234,5'.replace('.', ''), 'EUR', 'EUR'), { value: 1234.5, ok: true })
})

test('acceptare Etapa 3: cursă cu 2 comenzi (tur EUR, retur RON) -> venit corect în moneda de raportare', () => {
  const orders = [
    { id: 'tur', price: 1800, currency: 'EUR', fx_rate: 4.97 },
    { id: 'retur', price: 4970, currency: 'RON', fx_rate: 4.97 },
  ]
  const eur = M.tripRevenue(orders, 'EUR')
  assert.equal(eur.total, 2800) // 1800 + 4970/4,97
  assert.equal(eur.count, 2)
  assert.deepEqual(eur.missingFx, [])
  const ron = M.tripRevenue(orders, 'RON')
  assert.equal(ron.total, 13916) // 1800×4,97 + 4970
})

test('venit: comenzile anulate nu intră; lipsa cursului e semnalată', () => {
  const r = M.tripRevenue([
    { id: 'a', price: 1000, currency: 'EUR' },
    { id: 'b', price: 900, currency: 'EUR', status: 'Anulată' },
    { id: 'c', price: 500, currency: 'RON' },
  ], 'EUR')
  assert.equal(r.total, 1000)
  assert.equal(r.count, 2)
  assert.deepEqual(r.missingFx, ['c'])
})

test('măsurile mărfii: din rânduri, altfel din câmpurile comenzii', () => {
  assert.deepEqual(M.orderMeasures({ stops: goods([euro(2, 800, 0.8), euro(1, 300, 0.4)]) }), { ldm: 1.2, weight: 1100, pallets: 3 })
  assert.deepEqual(M.orderMeasures({ stops: [], ldm: 2.5, weight_kg: 1200 }), { ldm: 2.5, weight: 1200, pallets: 0 })
  // marfa trecută doar la descărcare
  assert.deepEqual(M.orderMeasures({ stops: [{ side: 'unload', goods: [euro(4, 1000, 1.6)] }] }), { ldm: 1.6, weight: 1000, pallets: 4 })
})

test('repartizare implicită după LDM', () => {
  const s = M.allocationShares([
    { id: 'a', price: 1000, currency: 'EUR', stops: goods([euro(10, 4000, 4)]) },
    { id: 'b', price: 1000, currency: 'EUR', stops: goods([euro(5, 6000, 2)]) },
    { id: 'c', price: 1000, currency: 'EUR', stops: goods([euro(5, 2000, 2)]) },
  ], 'ldm')
  assert.equal(s.basis, 'ldm')
  assert.equal(s.fallback, false)
  assert.deepEqual(s.shares, { a: 0.5, b: 0.25, c: 0.25 })
})

test('repartizare: dacă o comandă nu are LDM, se trece la greutate pentru toată cursa', () => {
  const s = M.allocationShares([
    { id: 'a', price: 1000, currency: 'EUR', stops: goods([euro(10, 3000, 4)]) },
    { id: 'b', price: 1000, currency: 'EUR', weight_kg: 1000 },
  ], 'ldm')
  assert.equal(s.basis, 'weight')
  assert.equal(s.fallback, true)
  assert.deepEqual(s.shares, { a: 0.75, b: 0.25 })
})

test('repartizare după venit, în moneda de raportare', () => {
  const s = M.allocationShares([
    { id: 'a', price: 1500, currency: 'EUR', fx_rate: 5 },
    { id: 'b', price: 2500, currency: 'RON', fx_rate: 5 },
  ], 'revenue', 'EUR')
  assert.equal(s.basis, 'revenue')
  assert.deepEqual(s.shares, { a: 0.75, b: 0.25 })
})

test('repartizare fără nicio dată comună: părți egale; comenzile anulate nu primesc cost', () => {
  const s = M.allocationShares([{ id: 'a' }, { id: 'b' }, { id: 'x', status: 'Anulată', price: 100 }], 'ldm')
  assert.equal(s.basis, 'equal')
  assert.deepEqual(Object.keys(s.shares).sort(), ['a', 'b'])
  assert.deepEqual(M.allocationShares([], 'ldm').shares, {})
})

test('împărțirea sumei la ban: suma părților = suma inițială', () => {
  const parts = M.allocateAmount(100, { a: 1 / 3, b: 1 / 3, c: 1 / 3 })
  assert.equal(Math.round((parts.a + parts.b + parts.c) * 100), 10000)
  assert.deepEqual(Object.values(parts).sort(), [33.33, 33.33, 33.34])
  assert.deepEqual(M.allocateAmount(1000, { a: 0.5, b: 0.25, c: 0.25 }), { a: 500, b: 250, c: 250 })
  assert.deepEqual(M.allocateAmount(50, {}), {})
})

test('cost distribuție: un CT cu două mărfuri se împarte după LDM; CT anulat sau fără curs nu intră', () => {
  const orders = {
    a: { id: 'a', price: 900, currency: 'EUR', stops: goods([euro(6, 2400, 2.4)]) },
    b: { id: 'b', price: 600, currency: 'EUR', stops: goods([euro(2, 800, 0.8)]) },
    c: { id: 'c', price: 500, currency: 'EUR', stops: goods([euro(2, 800, 0.8)]) },
  }
  const cts = [
    { id: 'ct1', price: 1000, currency: 'RON', fx_rate: 5 }, // 200 EUR pentru a + b
    { id: 'ct2', price: 150, currency: 'EUR' }, // 150 EUR doar pentru c
    { id: 'ct3', price: 999, currency: 'EUR', status: 'Anulată' },
    { id: 'ct4', price: 300, currency: 'RON' }, // fără curs
  ]
  const links = [
    { transport_order_id: 'ct1', client_order_id: 'a' }, { transport_order_id: 'ct1', client_order_id: 'b' },
    { transport_order_id: 'ct2', client_order_id: 'c' },
    { transport_order_id: 'ct3', client_order_id: 'a' },
    { transport_order_id: 'ct4', client_order_id: 'c' },
  ]
  const r = M.distributionCosts(cts, links, orders, 'ldm', 'EUR')
  assert.deepEqual(r.byOrder, { a: 150, b: 50, c: 150 })
  assert.deepEqual(r.missingFx, ['ct4'])
})

test('zile și km ale cursei', () => {
  assert.equal(M.tripDays('2026-11-02T06:00:00', '2026-11-06T18:00:00'), 5)
  assert.equal(M.tripDays('2026-11-02T06:00:00', '2026-11-02T20:00:00'), 1)
  assert.equal(M.tripDays('2026-11-02', null), 0)
  assert.equal(M.tripKm({ km_start: 100000, km_end: 103250 }), 3250)
  assert.equal(M.tripKm({ km: 2800 }), 2800)
})

test('tarif diurnă: șofer+țară -> șofer -> firmă+țară -> firmă, la data cursei', () => {
  const rates = [
    { id: 'f', driver_id: null, country: null, amount_day: 40, valid_from: '2026-01-01' },
    { id: 'fDE', driver_id: null, country: 'DE', amount_day: 50, valid_from: '2026-01-01' },
    { id: 'd1', driver_id: 'd1', country: null, amount_day: 45, valid_from: '2026-01-01' },
    { id: 'd1IT', driver_id: 'd1', country: 'IT', amount_day: 55, valid_from: '2026-01-01' },
    { id: 'd1ITnou', driver_id: 'd1', country: 'IT', amount_day: 60, valid_from: '2026-07-01' },
  ]
  assert.equal(M.pickPerDiemRate(rates, 'd1', 'IT', '2026-03-10').id, 'd1IT')
  assert.equal(M.pickPerDiemRate(rates, 'd1', 'it', '2026-08-10').id, 'd1ITnou')
  assert.equal(M.pickPerDiemRate(rates, 'd1', 'DE', '2026-03-10').id, 'd1')
  assert.equal(M.pickPerDiemRate(rates, 'd2', 'DE', '2026-03-10').id, 'fDE')
  assert.equal(M.pickPerDiemRate(rates, 'd2', 'FR', '2026-03-10').id, 'f')
  assert.equal(M.pickPerDiemRate(rates, 'd2', 'FR', '2025-03-10'), null)
})

test('avertizări cursă proprie', () => {
  assert.deepEqual(M.checkOwnTrip({ kind: 'own', status: 'Planificată' }), ['truck', 'driver', 'start'])
  const ok = { kind: 'own', truck_id: 't', driver_id: 'd', start_at: '2026-11-02T06:00', end_at: '2026-11-06T18:00', status: 'În curs' }
  assert.deepEqual(M.checkOwnTrip(ok, [{ id: 'a' }]), [])
  assert.deepEqual(M.checkOwnTrip(ok, [{ id: 'a', status: 'Anulată' }]), ['noOrders'])
  assert.deepEqual(M.checkOwnTrip({ ...ok, driver2_id: 'd', end_at: '2026-11-01T00:00' }, [{ id: 'a' }]), ['sameDriver', 'dates'])
})
