# FREI Fleet

TMS pentru transportatori cu flotă proprie: comenzi, curse, flotă, costuri, deconturi.
Stack: React 18 + Vite 5 + Tailwind v4 + Supabase (Postgres, Auth, Storage, RLS).

## Pornire locală

Cerințe: Node 20+, Docker Desktop pornit.

```
npm install
npx supabase init          # o singură dată (creează supabase/config.toml)
npx supabase start         # pornește Supabase local în Docker
npx supabase db reset      # aplică migrările din supabase/migrations
```

Creează `.env.local` pornind de la `.env.example`; valorile (URL și anon key) apar în
rezultatul comenzii `npx supabase status`. `.env.local` nu se comite niciodată.

```
npm run seed:dev           # utilizatori și date FICTIVE de test
npm run dev                # aplicația + /api local
```

Utilizatori de test (doar local): `patron@demo.test`, `dispecer@demo.test`,
`contabil@demo.test`, parola `Demo-12345!`.

## Teste

```
npm test
```

## Roluri

`owner` (patron), `dispatcher` (dispecer), `accountant` (contabil) — aplicate prin RLS în baza de date.

Utilizator nou: creezi contul în Supabase (Authentication → Users → Add user), apoi patronul îl adaugă în aplicație la Sistem → Utilizatori și roluri.

## Reguli

- Migrările din `supabase/migrations` sunt aditive; nu se editează cele aplicate.
- Date de test doar fictive; fără date reale în repo.
- Logica de calcul stă în funcții pure, cu teste Node.
- Brandul se schimbă din `src/config/brand.js`; datele firmei vin din tabela `company_settings`.
