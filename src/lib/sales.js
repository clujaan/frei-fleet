// Vânzări: Lead-uri și Interacțiuni (tabelele leads și interactions din schema.sql).
import { makeEntityApi } from './entityApi'
import { CLIENTS, COUNTRIES, OWNERS } from './entities'
import { todayISO } from './format'

const L = (ro, en) => ({ ro, en })

export const STAGES = ['Nou', 'Contactat', 'Ofertă trimisă', 'Negociere', 'Pierdut', 'Convertit în client']
export const OPEN_STAGES = ['Nou', 'Contactat', 'Ofertă trimisă', 'Negociere']
export const STAGE_LABEL = {
  Nou: L('Nou', 'New'), Contactat: L('Contactat', 'Contacted'), 'Ofertă trimisă': L('Ofertă trimisă', 'Offer sent'),
  Negociere: L('Negociere', 'Negotiation'), Pierdut: L('Pierdut', 'Lost'), 'Convertit în client': L('Convertit în client', 'Converted to client'),
}
export const STAGE_STYLE = {
  Nou: 'border-sky-300 bg-sky-50 text-sky-700',
  Contactat: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  'Ofertă trimisă': 'border-amber-300 bg-amber-50 text-amber-700',
  Negociere: 'border-orange-300 bg-orange-50 text-orange-700',
  Pierdut: 'border-rose-300 bg-rose-50 text-rose-700',
  'Convertit în client': 'border-emerald-300 bg-emerald-50 text-emerald-700',
}
export const SOURCES = ['Bursă (Trans.eu, TimoCom…)', 'Recomandare', 'LinkedIn', 'Email', 'Telefon', 'Eveniment', 'Site', 'Altele']
export const CHANNELS = ['Telefon', 'Email', 'WhatsApp', 'Întâlnire', 'Bursă', 'LinkedIn']
export const CHANNEL_LABEL = {
  Telefon: L('Telefon', 'Phone'), Email: L('Email', 'Email'), WhatsApp: L('WhatsApp', 'WhatsApp'), Întâlnire: L('Întâlnire', 'Meeting'), Bursă: L('Bursă', 'Freight exchange'), LinkedIn: L('LinkedIn', 'LinkedIn'),
}
export const DIRECTIONS = ['Inițiat', 'Primit']
export const DIRECTION_LABEL = { Inițiat: L('Inițiat de noi', 'Initiated by us'), Primit: L('Primit', 'Received') }
export const CHANNEL_ICON = { Telefon: '☎', Email: '✉', WhatsApp: '💬', Întâlnire: '🤝', Bursă: '🚛', LinkedIn: 'in' }

export const LEADS = {
  key: 'leads',
  table: 'leads',
  prefix: 'LD',
  pad: 3,
  fields: [
    { key: 'added_on', type: 'date' },
    { key: 'company', type: 'text' },
    { key: 'cui', type: 'text' },
    { key: 'country', type: 'text' },
    { key: 'contact_name', type: 'text' },
    { key: 'contact_role', type: 'text' },
    { key: 'phone', type: 'text' },
    { key: 'email', type: 'text' },
    { key: 'source', type: 'text' },
    { key: 'interest', type: 'text' },
    { key: 'est_volume', type: 'number' },
    { key: 'stage', type: 'text' },
    { key: 'next_step', type: 'text' },
    { key: 'next_step_date', type: 'date' },
    { key: 'owner', type: 'text' },
    { key: 'lost_reason', type: 'text' },
    { key: 'client_id', type: 'text' },
    { key: 'notes', type: 'text' },
  ],
  seed: [
    { added_on: todayISO(), company: 'Exemplu Prospect SRL', country: 'RO', contact_name: 'Maria Pop', contact_role: 'Director logistică', phone: '0740 111 222', email: 'maria@prospect.ro', source: 'Recomandare', interest: 'Marfă generală RO–DE, 2 curse/săptămână', est_volume: 8, stage: 'Contactat', next_step: 'Trimite ofertă de preț', next_step_date: todayISO(), owner: 'Sergiu' },
    { added_on: todayISO(), company: 'Muster Logistik GmbH', country: 'DE', contact_name: 'Hans Meyer', source: 'Bursă (Trans.eu, TimoCom…)', interest: 'Frigorific DE–RO', stage: 'Nou', owner: 'Silviu' },
  ],
}

export const INTERACTIONS = {
  key: 'interactions',
  table: 'interactions',
  prefix: 'INT',
  pad: 4,
  orderBy: 'occurred_on',
  noUpdatedAt: true,
  fields: [
    { key: 'occurred_on', type: 'date' },
    { key: 'lead_id', type: 'text' },
    { key: 'client_id', type: 'text' },
    { key: 'channel', type: 'text' },
    { key: 'direction', type: 'text' },
    { key: 'summary', type: 'text' },
    { key: 'next_step', type: 'text' },
    { key: 'next_step_date', type: 'date' },
    { key: 'owner', type: 'text' },
  ],
  seed: [],
}

LEADS.api = makeEntityApi(LEADS)
INTERACTIONS.api = makeEntityApi(INTERACTIONS)

export { CLIENTS, COUNTRIES, OWNERS }

export const isOverdue = (date) => !!date && date < todayISO()
export const isDueToday = (date) => date === todayISO()

// Lead activ cu pas următor scadent (azi sau întârziat)
export const leadDue = (l) => OPEN_STAGES.includes(l.stage) && !!l.next_step_date && l.next_step_date <= todayISO()

// Convertește un lead în client: creează clientul (sau leagă unul existent cu același CUI/nume) și închide lead-ul.
export async function convertLead(lead, clients) {
  const digits = (s) => String(s ?? '').replace(/\D/g, '')
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const existing = (clients || []).find((c) => (c.client_type || 'Client transport') !== 'Loading/unloading place' && ((digits(lead.cui).length >= 6 && digits(c.cui) === digits(lead.cui)) || (norm(c.company).length >= 4 && norm(c.company) === norm(lead.company))))
  const client = existing || (await CLIENTS.api.save(null, {
    company: lead.company, cui: lead.cui || '', country: lead.country || '', contact_name: lead.contact_name || '', phone: lead.phone || '', email: lead.email || '',
    owner: lead.owner || '', status: 'Activ', client_type: 'Client transport', lead_id: lead.id, notes: lead.notes || '',
  }))
  const saved = await LEADS.api.save(lead.id, { ...lead, stage: 'Convertit în client', client_id: client.id, lost_reason: '' })
  return { client, lead: saved, linked: !!existing }
}
