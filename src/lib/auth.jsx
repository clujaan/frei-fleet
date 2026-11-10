import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, isDemo } from './supabase'
import { loadCompany, getCompany } from './company'
import { loadTeam } from './people'

const AuthContext = createContext(null)

// Încarcă (o dată după autentificare) rolul utilizatorului, datele firmei și lista echipei.
async function bootstrap(uid) {
  if (isDemo) {
    await loadCompany()
    await loadTeam(getCompany().signers)
    return { role: 'owner', fullName: 'Demo User' }
  }
  const [{ data: me }] = await Promise.all([supabase.from('app_users').select('role, full_name, active').eq('user_id', uid).maybeSingle(), loadCompany()])
  if (!me || me.active === false) return { role: null, fullName: null }
  await loadTeam(getCompany().signers)
  return { role: me.role, fullName: me.full_name }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState({ role: null, fullName: null })
  const [loading, setLoading] = useState(true)

  // sesiunea Supabase (în demo nu există)
  useEffect(() => {
    if (isDemo) {
      bootstrap(null).then((p) => { setProfile(p); setLoading(false) })
      return undefined
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // la schimbarea utilizatorului: rol + setări firmă + echipă
  const uid = session?.user?.id ?? null
  useEffect(() => {
    if (isDemo) return undefined
    let live = true
    if (!uid) {
      setProfile({ role: null, fullName: null })
      supabase.auth.getSession().then(({ data }) => { if (live && !data.session) setLoading(false) })
      return () => { live = false }
    }
    setLoading(true)
    bootstrap(uid).then((p) => { if (live) { setProfile(p); setLoading(false) } }).catch(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => {
    const user = isDemo ? { email: 'demo@example.test' } : session?.user ?? null
    return {
      user,
      loading,
      isDemo,
      role: profile.role, // owner | dispatcher | accountant (null = cont fără acces)
      fullName: profile.fullName,
      hasAccess: isDemo || !!profile.role,
      signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
      signOut: () => (isDemo ? Promise.resolve() : supabase.auth.signOut()),
    }
  }, [session, loading, profile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
