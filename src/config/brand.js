// Brandul PRODUSULUI (nu al clientului care îl folosește). Se schimbă numele final doar aici.
// Datele firmei-client (nume, CUI, logo, culori proprii) vin din „Setări firmă” (tabelul company_settings).

export const APP_NAME = 'FREI Fleet' // placeholder până la numele final
export const APP_SHORT_NAME = 'FREI'
export const APP_TAGLINE = { ro: 'Management de flotă', en: 'Fleet management' }
export const APP_DOMAIN = '' // ex. app.exemplu.ro (se completează la instalare)

// Prefix pentru cheile din localStorage / evenimentele din browser (unic per produs)
export const STORAGE_PREFIX = 'frei'

// Eticheta mică de deasupra titlurilor de pagină (ex. „FREI / CURSE”)
export const OVERLINE = APP_SHORT_NAME.toUpperCase()

// Culorile implicite (tokenurile de interfață sunt în src/index.css; aici sunt cele folosite în PDF-uri/PWA).
export const COLORS = {
  primary: '#14213D',
  secondary: '#2A9D8F',
  tint: '#E8F4F2',
  line: '#8d9bbd',
}

// Active implicite (neutre). Logo-ul și ștampila clientului vin din bucket-ul privat „branding”.
export const ASSETS = {
  logo: '/img/logo.png', // pe fundal deschis (PDF-uri)
  logoWhite: '/img/logo-white.png', // pe fundal închis (bară laterală, login)
  icon192: '/img/icon-192.png',
  icon512: '/img/icon-512.png',
  iconMaskable: '/img/icon-maskable-512.png',
  appleTouch: '/img/apple-touch-icon.png',
}

export const LOGIN_TEXT = {
  ro: { subtitle: 'Acces doar pentru utilizatorii autorizați.' },
  en: { subtitle: 'Access for authorised users only.' },
}

// Numele implicit afișat în documente până când firma își completează datele în Setări
export const PLACEHOLDER_COMPANY = { ro: 'Numele firmei', en: 'Company name' }
