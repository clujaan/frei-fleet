// Trimitere email din căsuța utilizatorului, prin Microsoft Graph (autentificare Microsoft doar la trimitere).
import { getCompany } from './company'
import { PublicClientApplication } from '@azure/msal-browser'

const CLIENT_ID = import.meta.env.VITE_MS_CLIENT_ID
const TENANT_ID = import.meta.env.VITE_MS_TENANT_ID
export const mailConfigured = !!(CLIENT_ID && TENANT_ID)
const SCOPES = ['Mail.Send', 'User.Read']
const MAX_ATTACH = 3 * 1024 * 1024 // trimiterea simplă prin Graph acceptă atașamente de până la ~3 MB

let app = null
async function client() {
  if (!app) {
    app = new PublicClientApplication({
      auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT_ID}`, redirectUri: `${window.location.origin}/` },
      cache: { cacheLocation: 'localStorage' },
    })
    await app.initialize()
  }
  return app
}

// Pregătește clientul Microsoft din timp (la deschiderea ferestrei de email), ca fereastra de login să se deschidă imediat la apăsarea butonului.
export const warmUpMail = () => { if (mailConfigured) client().catch(() => {}) }

// întoarce { token, email, name } — deschide fereastra Microsoft doar dacă e nevoie
async function signIn(loginHint) {
  const c = await client()
  const known = c.getAllAccounts().find((a) => !loginHint || a.username.toLowerCase() === loginHint.toLowerCase()) || null
  const req = { scopes: SCOPES, loginHint: loginHint || undefined }
  let res
  try {
    if (!known) throw new Error('interactive')
    res = await c.acquireTokenSilent({ ...req, account: known })
  } catch {
    res = await c.acquireTokenPopup({ ...req, prompt: known ? undefined : 'select_account' })
  }
  return { token: res.accessToken, email: res.account.username, name: res.account.name }
}

export const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1])
  r.onerror = () => reject(new Error('Nu am putut citi fișierul PDF.'))
  r.readAsDataURL(blob)
})

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const html = (text) => `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${esc(text).replace(/\r?\n/g, '<br>')}</div>`

// Întoarce adresa de pe care a plecat mesajul.
export async function sendMail({ to, cc = [], subject, body, attachment, loginHint }) {
  if (!mailConfigured) throw new Error('Trimiterea pe email nu e configurată (lipsesc VITE_MS_CLIENT_ID și VITE_MS_TENANT_ID).')
  // Autentificarea se face PRIMA, direct din apăsarea butonului: browserul blochează fereastra Microsoft dacă se deschide după generarea PDF-ului.
  let who
  try {
    who = await signIn(loginHint)
  } catch (e) {
    if (e?.errorCode === 'user_cancelled') throw new Error('Autentificarea Microsoft a fost anulată.')
    if (['popup_window_error', 'empty_window_error'].includes(e?.errorCode)) throw new Error('Browserul a blocat fereastra de login Microsoft. Permite ferestrele pop-up pentru această adresă (iconița din bara de adrese), apoi apasă din nou Trimite.')
    throw new Error(`Autentificarea Microsoft a eșuat: ${e?.errorMessage || e?.message || e}`)
  }
  let blob = attachment?.blob
  if (attachment && !blob) blob = await attachment.make()
  if (blob && blob.size > MAX_ATTACH) throw new Error('PDF-ul depășește 3 MB și nu poate fi trimis din aplicație.')
  const rcpt = (a) => ({ emailAddress: { address: a } })
  const message = {
    subject,
    body: { contentType: 'HTML', content: html(body) },
    toRecipients: to.map(rcpt),
    ccRecipients: [...new Set([...cc, who.email].map((x) => x.toLowerCase()))].filter((x) => !to.map((y) => y.toLowerCase()).includes(x)).map(rcpt),
  }
  if (attachment) {
    message.attachments = [{ '@odata.type': '#microsoft.graph.fileAttachment', name: attachment.name, contentType: 'application/pdf', contentBytes: await blobToBase64(blob) }]
  }
  const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  })
  if (!r.ok) {
    let msg = ''
    try { msg = (await r.json())?.error?.message || '' } catch { /* ignorat */ }
    if (r.status === 401 || r.status === 403) throw new Error(`Microsoft a refuzat trimiterea (${r.status}). Verifică permisiunea Mail.Send și acordul administratorului. ${msg}`)
    throw new Error(`Trimiterea a eșuat (${r.status}). ${msg}`)
  }
  return { from: who.email, cc: message.ccRecipients.map((x) => x.emailAddress.address) }
}

const coSuffix = () => (getCompany().name ? ` – ${getCompany().name}` : '')
export const defaultMail = (order, lang) => {
  const route = [order.load_city, order.unload_city].filter(Boolean).join(' → ')
  if (lang === 'en') {
    return {
      subject: `Transport order ${order.code}${coSuffix()}`,
      body: 'Hello,\n\nAttached is the transport order as agreed.\nPlease send us the signed and stamped order, together with a copy of the CMR insurance and the transport licence.\n\nThank you,',
    }
  }
  return {
    subject: `Comandă de transport ${order.code}${coSuffix()}`,
    body: 'Bună ziua,\n\nAtașat comanda de transport conform înțelegerii.\nVă rugăm să ne trimiteți comanda de transport semnată și ștampilată, precum și copie după asigurarea CMR și a licenței de transport.\n\nMulțumesc,',
    route,
  }
}
