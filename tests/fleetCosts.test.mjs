import test from 'node:test'
import assert from 'node:assert/strict'
import * as F from '../src/lib/fleetCosts.js'

// Date fictive. Orele sunt la mijlocul zilei ca să nu depindă de fusul orar.
const T1 = { id: 'T1', kind: 'own', status: 'Livrată', truck_id: 'A', driver_id: 'D1', start_at: '2026-11-02T08:00:00Z', end_at: '2026-11-07T14:00:00Z', km_start: 412300, km_end: 416050, allocation_basis: 'ldm' }
const goods = (ldm) => [{ side: 'load', goods: [{ type: 'euro', qty: '10', weight: '1000', ldm: String(ldm) }] }]
const TUR = { id: 'tur', client_id: 'C1', price: 1800, currency: 'EUR', fx_rate: 5, stops: goods(4.8) }
const RETUR = { id: 'retur', client_id: 'C2', price: 5000, currency: 'RON', fx_rate: 5, stops: goods(3.2) }

test('alocare automată: același camion, data între plecare și întoarcere', () => {
  const trips = [T1, { id: 'T0', kind: 'own', status: 'Anulată', truck_id: 'A', start_at: '2026-11-01T08:00:00Z', end_at: '2026-11-09T08:00:00Z' }]
  assert.equal(F.matchTrip({ truck_id: 'A', occurred_at: '2026-11-04T10:00:00Z' }, trips), 'T1')
  assert.equal(F.matchTrip({ truck_id: 'B', occurred_at: '2026-11-04T10:00:00Z' }, trips), null)
  assert.equal(F.matchTrip({ truck_id: 'A', occurred_at: '2026-11-08T10:00:00Z' }, trips), null, 'după întoarcere = nealocat')
  assert.equal(F.matchTrip({ truck_id: 'A', occurred_at: '2026-11-08T10:00:00Z', alloc_mode: 'trip', trip_id: 'TX' }, trips), 'TX', 'manual câștigă')
  assert.equal(F.matchTrip({ truck_id: 'A', occurred_at: '2026-11-04T10:00:00Z', alloc_mode: 'truck' }, trips), null, 'cost lunar al camionului')
  // cursă încă pe drum: până „acum"
  const run = { id: 'R', kind: 'own', status: 'În curs', truck_id: 'A', start_at: '2026-11-10T08:00:00Z' }
  assert.equal(F.matchTrip({ truck_id: 'A', moved_at: '2026-11-11T09:00:00Z' }, [run], Date.parse('2026-11-11T12:00:00Z')), 'R')
})

test('splitByTrip: pe cursă, cost lunar al camionului, nealocate', () => {
  const items = [
    { id: 1, truck_id: 'A', occurred_at: '2026-11-03T10:00:00Z' },
    { id: 2, truck_id: 'A', occurred_at: '2026-11-20T10:00:00Z' },
    { id: 3, truck_id: 'A', occurred_at: '2026-11-20T10:00:00Z', alloc_mode: 'truck' },
    { id: 4, kind: 'in', moved_at: '2026-11-03T10:00:00Z' },
  ]
  const s = F.splitByTrip(items, [T1])
  assert.deepEqual(s.byTrip.T1.map((x) => x.id), [1])
  assert.deepEqual(s.unallocated.map((x) => x.id), [2])
  assert.deepEqual(s.truckMonth.map((x) => x.id), [3])
})

test('rezervor bază: cost mediu ponderat la data fiecărei ieșiri', () => {
  const L = F.fuelLedger([
    { id: 'i1', kind: 'in', moved_at: '2026-11-01T08:00:00Z', liters: 1000, unit_price: 6, currency: 'RON' },
    { id: 'i2', kind: 'in', moved_at: '2026-11-02T08:00:00Z', liters: 1000, unit_price: 7, currency: 'RON' },
    { id: 'o1', kind: 'out', moved_at: '2026-11-03T08:00:00Z', liters: 400 },
    { id: 'i3', kind: 'in', moved_at: '2026-11-04T08:00:00Z', liters: 600, unit_price: 8, currency: 'RON' },
    { id: 'o2', kind: 'out', moved_at: '2026-11-05T08:00:00Z', liters: 200 },
  ], 'RON')
  assert.equal(L.outs.o1.cost, 2600) // 400 × 6,50
  assert.equal(L.outs.o2.cost, 1381.82) // 200 × (10.400 + 4.800) / 2.200
  assert.equal(L.stockLiters, 2000)
  assert.equal(L.negative.length, 0)
  // ieșire peste stoc: semnalată, costată la ultimul preț mediu
  const N = F.fuelLedger([{ id: 'i', kind: 'in', moved_at: '2026-11-01T08:00:00Z', liters: 100, unit_price: 5, currency: 'RON' }, { id: 'o', kind: 'out', moved_at: '2026-11-02T08:00:00Z', liters: 150 }], 'RON')
  assert.deepEqual(N.negative, ['o'])
  assert.equal(N.outs.o.cost, 750)
  // intrare în RON fără curs, raport în EUR: nu intră în stoc, e semnalată
  assert.deepEqual(F.fuelLedger([{ id: 'x', kind: 'in', moved_at: '2026-11-01', liters: 10, unit_price: 6, currency: 'RON' }], 'EUR').missingFx, ['x'])
})

test('diurnă pe cursă: zile × tarif, pentru ambii șoferi, convertit', () => {
  const rates = [{ driver_id: 'D1', amount_day: 75, currency: 'EUR', valid_from: '2026-01-01' }, { driver_id: null, amount_day: 23, currency: 'RON', valid_from: '2026-01-01' }]
  const p = F.perDiemForTrip({ ...T1, driver2_id: 'D2' }, rates, 'EUR', 5)
  assert.equal(p.days, 6)
  assert.deepEqual(p.byDriver.map((x) => x.amount), [450, 27.6]) // 6 × 75 EUR; 6 × 23 RON / 5
  assert.equal(p.total, 477.6)
  assert.deepEqual(F.perDiemForTrip(T1, [], 'EUR', 5).missingRate, ['D1'])
})

test('profitul cursei: venit − costuri directe, repartizat pe mărfuri după LDM', () => {
  const costs = [
    { id: 'c1', category: 'fuel_card', amount: 900, currency: 'EUR', liters: 800 },
    { id: 'c2', category: 'toll', amount: 1250, currency: 'RON', fx_rate: 5 },
  ]
  const cts = [{ id: 'ct', purpose: 'distribution', price: 600, currency: 'RON', fx_rate: 5, status: 'Confirmată' }]
  const links = [{ transport_order_id: 'ct', client_order_id: 'retur' }]
  const rates = [{ driver_id: 'D1', amount_day: 75, currency: 'EUR', valid_from: '2026-01-01' }]
  const p = F.tripPnL(T1, { orders: [TUR, RETUR], costs, fuelOuts: [{ id: 'o', liters: 300, cost: 650 }], cts, links, rates, fx: 5, refConsumption: 30, cur: 'EUR' })
  assert.equal(p.revenue, 2800)
  assert.deepEqual([p.lines.fuel_card, p.lines.fuel_base, p.lines.toll, p.lines.per_diem, p.lines.distribution], [900, 650, 250, 450, 120])
  assert.equal(p.direct, 2370)
  assert.equal(p.contribution, 430)
  assert.equal(p.km, 3750)
  assert.equal(p.liters, 1100)
  assert.equal(p.consumption, 29.33)
  // costul propriu 2.250 împărțit 60/40 după LDM; distribuția (120) doar pe retur
  assert.deepEqual(p.byOrder.tur, { client_id: 'C1', revenue: 1800, ownCost: 1350, distribution: 0, cost: 1350, profit: 450, share: 0.6 })
  assert.equal(p.byOrder.retur.ownCost, 900)
  assert.equal(p.byOrder.retur.distribution, 120)
  assert.equal(p.byOrder.retur.profit, -20)
  assert.equal(p.byOrder.tur.profit + p.byOrder.retur.profit, p.contribution)
  assert.deepEqual(p.warnings, [])
})

test('profitul cursei: diurna trecută de mână înlocuiește calculul; curs lipsă e semnalat', () => {
  const p = F.tripPnL(T1, { orders: [TUR], costs: [{ id: 'pd', category: 'per_diem', amount: 400, currency: 'EUR' }, { id: 'nf', category: 'toll', amount: 100, currency: 'RON' }], rates: [{ driver_id: 'D1', amount_day: 75, currency: 'EUR' }], cur: 'EUR' })
  assert.equal(p.lines.per_diem, 400)
  assert.equal(p.perDiem, null)
  assert.ok(p.warnings.includes('fx'))
  assert.deepEqual(p.missingFx, ['nf'])
})

test('zile în lună și cost fix proporțional', () => {
  assert.equal(F.daysInMonth('2026-10-29', '2026-11-03', '2026-11'), 3)
  assert.equal(F.daysInMonth('2026-11-02T08:00:00Z', '2026-11-07T14:00:00Z', '2026-11'), 6)
  assert.equal(F.daysInMonth('2026-12-01', null, '2026-11'), 0)
  assert.deepEqual(F.fixedCostInMonth({ amount_month: 3000, currency: 'EUR', valid_from: '2026-11-16' }, '2026-11', 'EUR'), { value: 1500, ok: true })
  assert.deepEqual(F.fixedCostInMonth({ amount_month: 3000, currency: 'EUR', valid_from: '2026-01-01', valid_to: '2026-10-31' }, '2026-11', 'EUR'), { value: 0, ok: true })
})

test('salariul lunii: rândul lunar câștigă, altfel fișa de salariu', () => {
  const pay = [{ driver_id: 'D1', monthly_gross: 5000, employer_pct: 2.25, currency: 'RON' }]
  assert.equal(F.driverMonthCost('D1', '2026-11', [], pay, 'EUR', 5).value, 1022.5)
  assert.equal(F.driverMonthCost('D1', '2026-11', [{ driver_id: 'D1', month: '2026-11-01', gross: 5000, employer_taxes: 112.5, bonus: 887.5, currency: 'RON' }], pay, 'EUR', 5).value, 1200)
  assert.equal(F.driverMonthCost('D9', '2026-11', [], pay, 'EUR', 5).value, 0)
})

test('cheltuieli generale în lună (lunar, anual, unic)', () => {
  const rows = [
    { cost_type: 'Recurent lunar', amount_gross: 1210, vat_rate: 0.21, currency: 'RON', fx_rate: 5, start_on: '2026-01-01' },
    { cost_type: 'Recurent anual', amount_gross: 1200, vat_rate: 0, currency: 'EUR', start_on: '2026-01-01' },
    { cost_type: 'Unic - one time cost', amount_gross: 121, vat_rate: 0.21, currency: 'EUR', start_on: '2026-11-05' },
    { cost_type: 'Unic - one time cost', amount_gross: 999, currency: 'EUR', start_on: '2026-10-05' },
  ]
  assert.equal(F.overheadInMonth(rows, '2026-11', 'EUR'), 400) // 200 + 100 + 100
})

test('raport pe lună: camion, șofer, client, flotă', () => {
  const tripB = { id: 'T2', kind: 'own', status: 'Livrată', truck_id: 'B', driver_id: 'D1', start_at: '2026-11-10T08:00:00Z', end_at: '2026-11-13T14:00:00Z' }
  const pnl = (contribution, clientId) => ({ km: 0, revenue: contribution, direct: 0, contribution, byOrder: { x: { client_id: clientId, revenue: contribution, cost: 0, profit: contribution } } })
  const R = F.monthReport({
    ym: '2026-11', cur: 'EUR', fx: 5,
    trips: [{ trip: T1, pnl: pnl(430, 'C1') }, { trip: tripB, pnl: pnl(200, 'C2') }],
    trucks: [{ id: 'A' }, { id: 'B' }],
    drivers: [{ id: 'D1' }],
    fixedCosts: [{ id: 'f', truck_id: 'A', amount_month: 1500, currency: 'EUR', valid_from: '2026-01-01' }],
    truckItems: [{ item: { truck_id: 'A', occurred_at: '2026-11-20T10:00:00Z' }, value: 100 }, { item: { truck_id: 'A', occurred_at: '2026-10-20T10:00:00Z' }, value: 999 }],
    pay: [{ driver_id: 'D1', monthly_gross: 5000, employer_pct: 2.25, currency: 'RON' }],
    overhead: 300,
  })
  const A = R.trucks.find((x) => x.truck_id === 'A')
  const B = R.trucks.find((x) => x.truck_id === 'B')
  // salariul 1.022,50 EUR: 6 zile pe A, 4 zile pe B
  assert.deepEqual([A.salary, B.salary], [613.5, 409])
  assert.equal(A.profit, -1783.5) // 430 − 1500 − 100 − 613,5
  assert.equal(B.profit, -209)
  assert.equal(R.drivers[0].profit, -392.5) // 630 − 1022,5
  assert.equal(R.total.fleetProfit, -1992.5)
  assert.equal(R.total.netProfit, -2292.5)
  assert.deepEqual(R.clients.map((c) => [c.client_id, c.profit]), [['C1', 430], ['C2', 200]])
})
