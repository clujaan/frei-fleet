import test from 'node:test'
import assert from 'node:assert/strict'
import * as B from '../src/lib/fleetBoard.js'

const stop = (side, country, date, city = 'Oraș') => ({ side, country, date, city })
const order = (id, stops, status = 'Confirmată') => ({ id, status, stops })

test('punctele cursei: după dată, încărcarea înaintea descărcării; comenzile anulate nu contează', () => {
  const s = B.tripStops([
    order('a', [stop('load', 'RO', '2026-11-02'), stop('unload', 'DE', '2026-11-04')]),
    order('b', [stop('unload', 'RO', '2026-11-07'), stop('load', 'DE', '2026-11-05')]),
    order('x', [stop('unload', 'FR', '2026-11-09')], 'Anulată'),
  ])
  assert.deepEqual(s.map((x) => `${x.side}:${x.country}`), ['load:RO', 'unload:DE', 'load:DE', 'unload:RO'])
})

test('retur lipsă: ultima descărcare în străinătate, cursa încă deschisă', () => {
  const trip = { id: 'T', kind: 'own', status: 'În curs', start_at: '2026-11-10T08:00:00Z' }
  const tur = order('a', [stop('load', 'RO', '2026-11-10'), stop('unload', 'PL', '2026-11-12', 'Miasto')])
  const p = B.tripPlan(trip, [tur])
  assert.equal(p.needsReturn, true)
  assert.deepEqual(p.freeAt, { date: '2026-11-12', country: 'PL', city: 'Miasto' })
  assert.equal(p.startDay, '2026-11-10')
  assert.equal(p.endDay, '2026-11-12')
  assert.equal(p.estimatedEnd, true)
  // cu retur spre RO: nu mai lipsește
  const retur = order('b', [stop('load', 'PL', '2026-11-13'), stop('unload', 'RO', '2026-11-15')])
  assert.equal(B.tripPlan(trip, [tur, retur]).needsReturn, false)
  // întoarcere goală acceptată, cursă încheiată, subcontractată: nu se semnalează
  assert.equal(B.tripPlan({ ...trip, no_return_ok: true }, [tur]).needsReturn, false)
  assert.equal(B.tripPlan({ ...trip, end_at: '2026-11-14T10:00:00Z' }, [tur]).needsReturn, false)
  assert.equal(B.tripPlan({ ...trip, kind: 'subcontracted' }, [tur]).needsReturn, false)
})

test('tabla: bare tăiate la fereastră, camion liber azi, suprapuneri', () => {
  const trucks = [{ id: 'A' }, { id: 'B' }, { id: 'C', status: 'Inactiv' }]
  const trips = [
    { id: 'T1', truck_id: 'A', kind: 'own', status: 'Livrată', start_at: '2026-11-02T08:00:00Z', end_at: '2026-11-07T14:00:00Z' },
    { id: 'T2', truck_id: 'A', kind: 'own', status: 'Planificată', start_at: '2026-11-14T08:00:00Z' },
    { id: 'T3', truck_id: 'B', kind: 'own', status: 'În curs', start_at: '2026-11-09T08:00:00Z' },
    { id: 'T4', truck_id: 'B', kind: 'own', status: 'Anulată', start_at: '2026-11-09T08:00:00Z' },
  ]
  const ordersByTrip = { T2: [order('o', [stop('load', 'RO', '2026-11-14'), stop('unload', 'DE', '2026-11-16')])] }
  const rows = B.boardRows({ trucks, trips, ordersByTrip, from: '2026-11-05', days: 10, today: '2026-11-11' })
  assert.equal(rows.length, 2, 'camionul inactiv nu apare')
  const [a, b] = rows
  assert.deepEqual(a.bars.map((x) => [x.trip.id, x.start, x.span, x.cutLeft, x.cutRight]), [['T1', 0, 3, true, false], ['T2', 9, 1, false, true]])
  assert.equal(a.busyToday, false)
  assert.equal(a.needsReturn.length, 1, 'T2 descarcă în DE și nu are retur')
  // cursa pe drum fără sfârșit: bara merge până azi
  assert.deepEqual(b.bars.map((x) => [x.trip.id, x.start, x.span]), [['T3', 4, 3]])
  assert.equal(b.busyToday, true)
  assert.equal(a.overlap, false)
})

test('oferte de retur: țara (sau vecina), data, spre RO; cele mai bune primele', () => {
  const freeAt = { date: '2026-11-12', country: 'PL', city: 'Miasto' }
  const offers = [
    { id: 1, status: 'Ofertată', load_country: 'PL', load_date: '2026-11-13', unload_country: 'RO', price: 1100, currency: 'EUR', km: 1000 },
    { id: 2, status: 'Cerută', load_country: 'DE', load_date: '2026-11-12', unload_country: 'RO', price: 1500, currency: 'EUR', km: 1400 },
    { id: 3, status: 'Cerută', load_country: 'PL', load_date: '2026-11-20', unload_country: 'RO', price: 900, currency: 'EUR' }, // prea târziu
    { id: 4, status: 'Respinsă', load_country: 'PL', load_date: '2026-11-12', unload_country: 'RO', price: 900, currency: 'EUR' },
    { id: 5, status: 'Cerută', load_country: 'PL', load_date: '2026-11-12', unload_country: 'HU', price: 900, currency: 'EUR' }, // nu vine spre RO
    { id: 6, status: 'Cerută', load_country: 'PL', load_date: '2026-11-10', load_date_alt: '2026-11-14', unload_country: 'HU', extra_unloads: [{ country: 'RO' }], price: 5000, currency: 'RON', km: 1100 },
    { id: 7, status: 'Cerută', load_country: 'FR', load_date: '2026-11-12', unload_country: 'RO', price: 2000, currency: 'EUR' }, // nu e vecină cu PL
  ]
  const c = B.returnCandidates(freeAt, offers, { cur: 'EUR', fx: 5, costPerKm: 0.8 })
  assert.deepEqual(c.map((x) => x.offer.id), [6, 1, 2])
  assert.deepEqual([c[0].dayDiff, c[0].revenue, c[0].cost, c[0].profit], [0, 1000, 880, 120]) // interval care cuprinde ziua; 5.000 RON / 5
  assert.deepEqual([c[1].dayDiff, c[1].revenue, c[1].cost, c[1].profit, c[1].perKm], [1, 1100, 800, 300, 1.1])
  assert.equal(c[2].sameCountry, false)
})

test('cost pe km pentru estimare: camionul, altfel flota', () => {
  const r = (id, truck, km, direct, end = '2026-11-07') => ({ trip: { id, truck_id: truck, kind: 'own', status: 'Livrată', end_at: end }, pnl: { km, direct } })
  const rows = [r(1, 'A', 1000, 800), r(2, 'A', 1000, 1000), r(3, 'B', 2000, 1200), r(4, 'A', 500, 9999, null)]
  assert.deepEqual(B.avgCostPerKm(rows, 'A'), { value: 0.9, source: 'truck' })
  assert.deepEqual(B.avgCostPerKm(rows, 'Z'), { value: 0.75, source: 'fleet' })
  assert.deepEqual(B.avgCostPerKm([], 'A'), { value: null, source: 'none' })
})

test('km goi pe camion și lună', () => {
  const trips = [
    { truck_id: 'A', kind: 'own', status: 'Livrată', start_at: '2026-11-02T08:00:00Z', km_start: 1000, km_end: 4000, km_empty: 300 },
    { truck_id: 'A', kind: 'own', status: 'Livrată', start_at: '2026-11-10T08:00:00Z', km: 1000, km_empty: 200 },
    { truck_id: 'A', kind: 'own', status: 'Livrată', start_at: '2026-11-20T08:00:00Z', km: 800 }, // fără km goi trecuți
    { truck_id: 'A', kind: 'own', status: 'Livrată', start_at: '2026-10-20T08:00:00Z', km: 800, km_empty: 800 }, // altă lună
  ]
  assert.deepEqual(B.emptyKmByTruck(trips, '2026-11').A, { km: 4000, empty: 500, pct: 12.5, trips: 3, missing: 1 })
})
