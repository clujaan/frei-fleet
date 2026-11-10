import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fără chei în .env aplicația rulează în MOD DEMO (fără login, fără date reale).
export const isDemo = !url || !key
export const supabase = isDemo ? null : createClient(url, key)
