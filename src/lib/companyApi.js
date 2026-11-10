// Salvarea setărilor firmei și încărcarea imaginilor de brand (bucket privat "branding").
import { supabase, isDemo } from './supabase'
import { getCompany, setCompany } from './company'
import { buildCompanyPatch, imageExt, validateImageFile } from './companyForm'

export async function saveCompany(form) {
  const patch = buildCompanyPatch(form)
  if (isDemo) { setCompany({ ...getCompany(), ...patch }); return getCompany() }
  const id = getCompany().id
  if (!id) throw new Error('Setările firmei nu au putut fi încărcate. Reîncarcă pagina.')
  const { data, error } = await supabase.from('company_settings').update(patch).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  setCompany(data)
  return getCompany()
}

// Încarcă imaginea și returnează calea. Fișierul vechi se șterge abia după salvarea setărilor (vezi Setari.jsx).
export async function uploadBranding(kind, file) {
  const bad = validateImageFile(file)
  if (bad) throw new Error(bad)
  if (isDemo) return URL.createObjectURL(file)
  const path = `${kind}-${Date.now()}.${imageExt(file)}`
  const { error } = await supabase.storage.from('branding').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message)
  return path
}

export async function removeBranding(path) {
  if (!path || isDemo) return
  await supabase.storage.from('branding').remove([path]).catch(() => {})
}

// URL local pentru previzualizare
export async function brandingPreviewUrl(path) {
  if (!path) return null
  if (isDemo || path.startsWith('blob:')) return path
  const { data } = await supabase.storage.from('branding').download(path)
  return data ? URL.createObjectURL(data) : null
}

// Utilizatori (doar patron; funcțiile din baza de date verifică rolul)
export async function listUsers() {
  if (isDemo) return [{ user_id: 'demo', full_name: 'Demo User', email: 'demo@example.test', role: 'owner', active: true }]
  const { data, error } = await supabase.rpc('list_users')
  if (error) throw new Error(error.message)
  return data || []
}
export async function addUser({ email, fullName, role }) {
  const { error } = await supabase.rpc('add_app_user', { p_email: email, p_full_name: fullName, p_role: role })
  if (error) throw new Error(error.message)
}
export async function updateUser({ userId, fullName, role, active }) {
  const { error } = await supabase.rpc('update_app_user', { p_user_id: userId, p_full_name: fullName, p_role: role, p_active: active })
  if (error) throw new Error(error.message)
}
