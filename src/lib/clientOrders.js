// Comanda Client (CC-AAAA-NNN): comanda de transport completată de firmă și trimisă clientului spre semnare.
// Model grupaj (docs/DECIZII-grupaj-ltl.md): comanda = marfa unui client = entitatea de venit. O cursă are mai multe comenzi;
// prețul stă pe comandă (sursa unică), venitul cursei = suma comenzilor. Comanda poate fi „primită" (de la client) sau „emisă" (PDF de semnat).
import { getCompany } from './company'
import { SENDERS } from './people'
import { makeEntityApi } from './entityApi'
import { foldText } from './costs'
import { stopsText, tripStops, emptyStop } from './places'

export { SENDERS }
export const PAY_FROM = ['invoice', 'original', 'electronic', 'unload', 'eom']

const YEAR = new Date().getFullYear()
const F = [
  ['lang', 'text'], ['order_date', 'date'], ['trip_id', 'text'], ['client_id', 'text'], ['client_ref', 'text'], ['stops', 'json'],
  ['cargo', 'text'], ['weight_kg', 'number'], ['packages', 'text'], ['ldm', 'number'], ['adr', 'bool'], ['temperature', 'text'], ['truck_type', 'text'], ['uit', 'text'],
  ['price', 'number'], ['currency', 'text'], ['payment_terms_days', 'number'], ['payment_terms_from', 'text'], ['special_conditions', 'text'], ['sender_name', 'text'],
  ['sent_at', 'text'], ['sent_to', 'text'], ['send_count', 'number'], ['notes', 'text'],
  ['direction', 'text'], ['status', 'text'], ['fx_rate', 'number'],
]
export const CC_STATUSES = ['Ciornă', 'Trimisă', 'Confirmată', 'Semnată', 'Executată', 'Anulată']
export const CC_STYLE = {
  Ciornă: 'border-slate-300 bg-slate-100 text-slate-600',
  Trimisă: 'border-sky-300 bg-sky-50 text-sky-700',
  Confirmată: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  Semnată: 'border-amber-300 bg-amber-50 text-amber-700',
  Executată: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  Anulată: 'border-rose-300 bg-rose-50 text-rose-700',
}
const CC_LABEL = { Ciornă: 'Draft', Trimisă: 'Sent', Confirmată: 'Confirmed', Semnată: 'Signed', Executată: 'Delivered', Anulată: 'Cancelled' }
export const ccStatusLabel = (s, lang = 'ro') => (lang === 'en' ? CC_LABEL[s] || s : s)
export const DIRECTIONS = { received: ['Primită de la client', 'Received from customer'], issued: ['Emisă de noi (PDF de semnat)', 'Issued by us (PDF to sign)'] }
export const CLIENT_ORDERS_API = makeEntityApi({
  table: 'client_orders',
  prefix: `CC-${YEAR}`,
  pad: 3,
  fields: F.map(([key, type]) => ({ key, type })),
  seed: [],
})

export const EMPTY_CC = {
  lang: 'ro', trip_id: '', client_id: '', client_ref: '', stops: [], cargo: '', weight_kg: '', packages: '', ldm: '', adr: false, temperature: '', truck_type: '', uit: '',
  price: '', currency: 'EUR', payment_terms_days: 30, payment_terms_from: 'invoice', special_conditions: '', sender_name: '', notes: '',
  direction: 'received', status: 'Confirmată', fx_rate: '',
}

// din client: limba (altă țară decât RO → EN), termenul de plată și moneda preferate
export const fromClient = (client) => ({
  client_id: client.id,
  lang: client.country && client.country !== 'RO' ? 'en' : 'ro',
  payment_terms_days: client.payment_terms_days ?? 30,
  currency: client.preferred_currency || 'EUR',
})

// din cursă: doar legătura (punctele și prețul sunt ale comenzii)
export const fromTrip = (trip) => ({ trip_id: trip.id })

// Prețul are o singură sursă: comanda. (Păstrat pentru apelurile vechi; nu mai ia nimic din cursă.)
export const withTripPrice = (o) => o

export const hasStops = (o) => Array.isArray(o.stops) && o.stops.some((s) => s && (s.company || s.street || s.city || s.country))

export function checkClientOrder(o, trip, reportCur = 'EUR') {
  const w = []
  if (o.status === 'Anulată') return w
  if (!o.client_id) w.push('client')
  if (!(Number(o.price) > 0)) w.push('price')
  if (!hasStops(o)) w.push('stops')
  const loads = (o.stops || []).filter((s) => s.side === 'load' && s.date)
  if (!loads.length) w.push('loadDate')
  if (Number(o.price) > 0 && (o.currency || 'EUR') !== reportCur && !(Number(o.fx_rate) > 0)) w.push('fx')
  if (trip?.status === 'Anulată') w.push('tripCancelled')
  return w
}

export const ccHaystack = (o, client, trip) => foldText([
  o.code, client, trip?.code, o.client_ref, o.cargo, o.truck_type, o.uit, o.price, o.currency, o.order_date, o.special_conditions, o.notes, o.sender_name,
  ...(Array.isArray(o.stops) ? o.stops.flatMap((s) => [s.company, s.street, s.zip, s.city, s.country, s.contact, s.ref]) : []),
].join(' | '))

export const defaultClientMail = (order, lang, route = '') => {
  if (lang === 'en') {
    return {
      subject: `Transport order ${order.code}${route ? ` – ${route}` : ''}`,
      body: `Hello,\n\nAttached is the transport order ${order.code}, filled in with the details we have agreed.\nPlease check it, then sign and stamp it and send it back to us.\n\nKind regards,\n${order.sender_name || ''}${getCompany().name ? `\n${getCompany().name}` : ''}`,
    }
  }
  return {
    subject: `Comandă de transport ${order.code}${route ? ` – ${route}` : ''}`,
    body: `Bună ziua,\n\nAtașat găsiți comanda de transport ${order.code}, completată cu datele convenite.\nVă rugăm să o verificați, să o semnați și să o ștampilați, apoi să ne-o trimiteți înapoi.\n\nCu stimă,\n${order.sender_name || ''}${getCompany().name ? `\n${getCompany().name}` : ''}`,
  }
}

export { stopsText, tripStops, emptyStop }
