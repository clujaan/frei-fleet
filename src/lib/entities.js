// Configurația modulelor simple: Clienți și Transportatori.
import { OWNERS } from './people'
import { makeEntityApi } from './entityApi'

export const CLIENT_TYPES = ['Client transport', 'Loading/unloading place']
const PLACE_TYPE = 'Loading/unloading place'

export const COUNTRIES = ['RO', 'DE', 'NL', 'PL', 'IT', 'HU', 'AT', 'BG', 'FR', 'ES', 'BE', 'CZ', 'SK', 'DK', 'SE', 'NO', 'FI', 'LT', 'LV', 'EE', 'Alta']
export const TRUCK_TYPES = ['Prelată', 'Frigorific', 'Megatrailer', 'Alt tip']
export { OWNERS }

const L = (ro, en) => ({ ro, en })

export const CLIENTS = {
  key: 'clients',
  nav: 'nav.clients',
  title: L('Clienți', 'Clients'),
  newLabel: L('Client nou', 'New client'),
  table: 'clients',
  prefix: 'CL',
  pad: 3,
  statuses: ['Activ', 'Inactiv'],
  statusStyle: { Activ: 'border-emerald-300 bg-emerald-50 text-emerald-700', Inactiv: 'border-slate-300 bg-slate-100 text-slate-600' },
  fixed: { client_type: 'Client transport' }, // pagina Clienți arată doar clienții; adresele au pagina lor
  scope: (r) => (r.client_type || 'Client transport') !== PLACE_TYPE,
  fields: [
    { key: 'company', type: 'text', label: L('Firmă', 'Company'), required: true, wide: true },
    { key: 'cui', type: 'text', label: L('CUI', 'VAT ID'), clientOnly: true },
    { key: 'reg_com', type: 'text', label: L('Nr. Reg. Com.', 'Trade reg. no.'), clientOnly: true },
    { key: 'address', type: 'text', label: L('Stradă și număr', 'Street and number'), wide: true },
    { key: 'zip', type: 'text', label: L('Cod poștal', 'Postcode') },
    { key: 'city', type: 'text', label: L('Localitate', 'City') },
    { key: 'country', type: 'select', options: 'EUROPE', label: L('Țară', 'Country') },
    { key: 'county', type: 'county', label: L('Județ', 'County') },
    { key: 'contact_name', type: 'text', label: L('Persoană de contact', 'Contact person') },
    { key: 'phone', type: 'text', label: L('Telefon', 'Phone') },
    { key: 'email', type: 'text', label: L('Email contact', 'Contact email') },
    { key: 'billing_email', type: 'text', label: L('Email facturare', 'Billing email'), clientOnly: true },
    { key: 'payment_terms_days', type: 'number', label: L('Termen de plată (zile)', 'Payment terms (days)'), clientOnly: true },
    { key: 'credit_limit', type: 'number', label: L('Limită de credit', 'Credit limit'), clientOnly: true },
    { key: 'preferred_currency', type: 'select', options: ['RON', 'EUR'], defaultValue: 'EUR', label: L('Monedă preferată', 'Preferred currency'), clientOnly: true },
    { key: 'smartbill_client_id', type: 'text', label: L('ID client SmartBill', 'SmartBill client ID'), clientOnly: true },
    { key: 'owner', type: 'select', options: OWNERS, label: L('Responsabil', 'Owner'), clientOnly: true },
    { key: 'status', type: 'select', options: ['Activ', 'Inactiv'], label: L('Status', 'Status'), required: true, noBlank: true },
    { key: 'client_type', type: 'select', options: CLIENT_TYPES, label: L('Tip', 'Type'), required: true, noBlank: true },
    { key: 'notes', type: 'textarea', label: L('Observații', 'Notes'), wide: true },
    { key: 'lead_id', type: 'text', hidden: true, label: L('Lead', 'Lead') },
  ],
  columns: ['code', 'company', 'city', 'country', 'contact_name', 'status'],
  seed: [
    { company: 'Exemplu Logistic SRL', cui: 'RO12345678', country: 'RO', contact_name: 'Ion Popescu', phone: '0740 000 000', email: 'ion@exemplu.ro', payment_terms_days: 30, preferred_currency: 'RON', owner: 'Sergiu', status: 'Activ' },
    { company: 'Beispiel Spedition GmbH', cui: 'DE123456789', country: 'DE', contact_name: 'Anna Schmidt', payment_terms_days: 45, preferred_currency: 'EUR', owner: 'Silviu', status: 'Activ' },
  ],
}

// Adrese de încărcare / descărcare: aceeași bază de date ca Clienții (tabelul clients), filtrată pe tipul „Loading/unloading place”.
export const PLACES = {
  ...CLIENTS,
  key: 'places',
  nav: 'nav.places',
  title: L('Adrese încărcare / descărcare', 'Loading / unloading addresses'),
  newLabel: L('Adresă nouă', 'New address'),
  fixed: { client_type: PLACE_TYPE },
  scope: (r) => r.client_type === PLACE_TYPE,
  columns: ['code', 'company', 'address', 'city', 'country', 'contact_name', 'phone', 'status'],
}

export const CARRIERS = {
  key: 'carriers',
  nav: 'nav.carriers',
  title: L('Transportatori', 'Carriers'),
  newLabel: L('Transportator nou', 'New carrier'),
  table: 'carriers',
  prefix: 'TR',
  pad: 3,
  statuses: ['Nou', 'Activ', 'Blocat'],
  statusStyle: { Nou: 'border-sky-300 bg-sky-50 text-sky-700', Activ: 'border-emerald-300 bg-emerald-50 text-emerald-700', Blocat: 'border-rose-300 bg-rose-50 text-rose-700' },
  fields: [
    { key: 'company', type: 'text', label: L('Firmă', 'Company'), required: true, wide: true },
    { key: 'cui', type: 'text', label: L('CUI', 'VAT ID') },
    { key: 'country', type: 'select', options: 'COUNTRIES', label: L('Țară', 'Country') },
    { key: 'contact_name', type: 'text', label: L('Persoană de contact', 'Contact person') },
    { key: 'phone', type: 'text', label: L('Telefon', 'Phone') },
    { key: 'email', type: 'text', label: L('Email (pentru comenzi)', 'Email (for orders)'), requiredOnCreate: true },
    { key: 'extra_emails', type: 'emails', label: L('Adrese de email suplimentare', 'Additional email addresses'), wide: true },
    { key: 'truck_types', type: 'multi', options: TRUCK_TYPES, label: L('Tip camioane', 'Truck types'), wide: true },
    { key: 'truck_count', type: 'number', label: L('Nr. camioane', 'No. of trucks') },
    { key: 'cmr_insurance_until', type: 'date', label: L('Asigurare CMR valabilă până la', 'CMR insurance valid until') },
    { key: 'payment_terms_days', type: 'number', label: L('Termen de plată (zile)', 'Payment terms (days)') },
    { key: 'currency', type: 'select', options: ['RON', 'EUR'], label: L('Monedă', 'Currency') },
    { key: 'rating', type: 'select', options: ['1', '2', '3', '4', '5'], label: L('Rating intern (1–5)', 'Internal rating (1–5)'), asNumber: true },
    { key: 'status', type: 'select', options: ['Nou', 'Activ', 'Blocat'], label: L('Status', 'Status'), required: true, noBlank: true },
    { key: 'notes', type: 'textarea', label: L('Observații', 'Notes'), wide: true },
  ],
  columns: ['code', 'company', 'cui', 'country', 'truck_types', 'cmr_insurance_until', 'status'],
  seed: [
    { company: 'Exemplu Trans SRL', cui: 'RO87654321', country: 'RO', contact_name: 'Vasile Ionescu', truck_types: ['Prelată'], truck_count: 6, cmr_insurance_until: '2027-03-31', payment_terms_days: 30, currency: 'EUR', rating: 4, status: 'Activ' },
  ],
}

for (const cfg of [CLIENTS, CARRIERS]) cfg.api = makeEntityApi(cfg)
PLACES.api = CLIENTS.api // aceeași instanță: o singură bază pentru clienți și adrese
