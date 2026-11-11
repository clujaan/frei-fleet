// Structura meniului: Dashboard + 4 secțiuni pliabile. `key` = cheia de traducere din nav.*
export const NAV = [
  { type: 'item', key: 'dashboard', to: '/', end: true },
  {
    type: 'group',
    key: 'sales',
    items: [
      { key: 'leads', to: '/lead-uri' },
      { key: 'clients', to: '/clienti' },
      { key: 'interactions', to: '/interactiuni' },
    ],
  },
  {
    type: 'group',
    key: 'ops',
    items: [
      { key: 'offers', to: '/oferte' },
      { key: 'places', to: '/adrese' },
      { key: 'board', to: '/tabla-flotei' },
      { key: 'fleet', to: '/flota' },
      { key: 'fleetCosts', to: '/costuri-flota' },
      { key: 'trips', to: '/curse' },
      { key: 'orders', to: '/comenzi' },
      { key: 'clientOrders', to: '/comanda-client' },
      { key: 'carriers', to: '/transportatori' },
    ],
  },
  {
    type: 'group',
    key: 'finance',
    items: [
      { key: 'invoices', to: '/facturi' },
      { key: 'costs', to: '/cheltuieli' },
      { key: 'pl', to: '/pl' },
      { key: 'expenses', to: '/deconturi' },
    ],
  },
  {
    type: 'group',
    key: 'tools',
    items: [
      { key: 'trucks', to: '/tools/camioane' },
      { key: 'estimator', to: '/tools/estimator' },
      { key: 'tolls', to: '/tools/taxe-drum' },
      { key: 'margin', to: '/tools/marja' },
      { key: 'fxconv', to: '/tools/convertor' },
    ],
  },
  {
    type: 'group',
    key: 'system',
    items: [
      { key: 'settings', to: '/setari', roles: ['owner'] },
      { key: 'users', to: '/utilizatori', roles: ['owner'] },
      { key: 'activity', to: '/jurnal' },
      { key: 'exportData', to: '/export' },
    ],
  },
]

// Câmpurile planificate pentru fiecare modul (din specificația inițială a aplicației).
export const MODULES = {
  leads: {
    fields: ['Firmă, CUI, țară', 'Persoană de contact, funcție, telefon, email', 'Sursă, marfă / rute de interes, volum estimat', 'Stadiu (Nou → Contactat → Ofertă trimisă → Negociere → Pierdut / Convertit în client)', 'Următorul pas + data, responsabil, motiv pierdere'],
    links: ['Devine client (Clienți)', 'Jurnal în Interacțiuni'],
  },
  clients: {
    fields: ['Firmă, CUI, Nr. Reg. Com., adresă', 'Contact, email facturare', 'Termen de plată, limită de credit, monedă preferată', 'ID client SmartBill, responsabil, status', 'Calculat: nr. curse, facturat, neîncasat, ultima cursă'],
    links: ['Din Lead-uri', 'Curse și Facturi emise'],
  },
  interactions: {
    fields: ['Dată, canal (telefon, email, WhatsApp, întâlnire, bursă, LinkedIn), direcție', 'Rezumat, următorul pas + data, responsabil'],
    links: ['Legat de un lead sau de un client'],
  },
  offers: {
    fields: ['Bursă (Trans.eu, Timocom, Bursa Transport), referință ofertă', 'Încărcare / descărcare (țară, loc, date), km', 'Marfă, greutate, tip camion', 'Preț inițial cerut + monedă', 'Fiecare schimbare de preț sau stare = rând nou în istoric (≈ 8–10 oferte pe zi)'],
    links: ['Câștigată → Cursă', 'Lead / client opțional'],
  },
  trips: {
    fields: ['Client, transportator partener (fără flotă proprie)', 'Date încărcare / descărcare, locuri, km', 'Venit convenit și cost transportator, în RON sau EUR + curs', 'Data plății transportatorului, stare cursă', 'Calculat: marjă RON / EUR, marjă %'],
    links: ['Din Oferte', 'Facturi emise, Transportatori'],
  },
  carriers: {
    fields: ['Firmă, CUI, țară, contact', 'Tip camioane, nr. camioane', 'Asigurare CMR valabilă până la (alertă la 30 de zile)', 'Termen de plată, monedă, rating, status'],
    links: ['Curse'],
  },
  invoices: {
    fields: ['Serie + număr, data facturii, client', 'Valoare fără TVA, TVA, total, monedă + curs', 'Data scadenței, data încasării', 'Import automat din SmartBill API (la început introducere manuală)'],
    links: ['Curse, Clienți', 'Venitul intră în P&L la data încasării'],
  },
  costs: {
    fields: ['Sumă plătită (cu TVA), cotă TVA, TVA deductibil', 'Tip: recurent lunar / anual, unic amortizat, unic one time cost', 'Amortizare pe luni sau săptămâni, aleasă de tine (prag 500 RON)', 'Număr decont (FD-AAAA-NNN) și documente atașate'],
    links: ['Deconturi', 'Alimentează P&L-ul săptămânal'],
  },
  pl: {
    fields: ['Venituri încasate (fără TVA)', 'Costuri directe de transport (la data plății)', 'Costuri generale alocate pe săptămâni ISO', 'Marjă brută, profit net, profit cumulat, curse livrate', 'Raport în RON sau EUR'],
    links: ['Citește din Facturi, Curse și Cheltuieli generale'],
  },
  expenses: {
    fields: ['Poză bon / factură → citire automată (Claude API)', 'Regulă: fără CUI-ul firmei nu se decontează', 'Foaie de decont FD-AAAA-NNN, număr atribuit automat din registru', 'PDF pentru contabilă, stampilă în șablon, registru central'],
    links: ['Intră în Cheltuieli generale'],
  },
}
