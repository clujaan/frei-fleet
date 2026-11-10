// Persoanele din echipă (utilizatorii aplicației). Listele sunt tablouri MUTABILE, umplute o dată după autentificare,
// ca importurile existente (OWNERS, EMPLOYEES, SENDERS) să rămână simple constante.
import { supabase, isDemo } from './supabase'

export const TEAM = [] // [{ user_id, full_name, email, role }]
export const OWNERS = [] // responsabili (lead-uri, interacțiuni, clienți)
export const EMPLOYEES = [] // angajați (deconturi)
export const SENDERS = [] // cine semnează / expediază comenzile

const fill = (arr, values) => arr.splice(0, arr.length, ...values)
const uniq = (a) => Array.from(new Set(a.filter(Boolean)))

export function setTeam(team, signers = []) {
  fill(TEAM, team)
  const names = uniq(team.map((m) => m.full_name || m.email))
  fill(OWNERS, names)
  fill(EMPLOYEES, names)
  const signerNames = uniq((Array.isArray(signers) ? signers : []).map((s) => s?.name))
  fill(SENDERS, signerNames.length ? signerNames : names)
}

export async function loadTeam(signers) {
  if (isDemo) {
    setTeam([{ user_id: 'demo', full_name: 'Demo User', email: 'demo@example.test', role: 'owner' }], signers)
    return
  }
  const { data, error } = await supabase.rpc('list_team')
  if (error) {
    setTeam([], signers)
    return
  }
  setTeam(data || [], signers)
}

// Numele din echipă care corespunde adresei de email (sau primul din listă).
export function nameFromEmail(email, list = TEAM.map((m) => m.full_name || m.email)) {
  const e = String(email || '').toLowerCase()
  const hit = TEAM.find((m) => (m.email || '').toLowerCase() === e)
  return hit ? hit.full_name || hit.email : list[0] || ''
}
