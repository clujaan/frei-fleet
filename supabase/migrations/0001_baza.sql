-- =====================================================================
-- 0001_baza.sql — schema de bază a produsului (Supabase / PostgreSQL)
--
-- Se aplică automat de `npx supabase start` / `npx supabase db reset`.
-- Construită din schema inițială + migrările 002–028 ale aplicației-sursă
-- (verificat: schema rezultată este identică cu cea obținută rulând
-- migrările pe rând), apoi adaptată pentru produsul nou în secțiunea
-- „Adaptări produs” de la sfârșit (roluri, setări firmă, numerotare
-- configurabilă, bucket pentru branding, registru de versiune).
--
-- Din acest punct, orice modificare se face într-o migrare NOUĂ
-- (0002_..., 0003_...), doar aditivă după ce există date reale.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Utilizatori permiși
--    Înregistrarea liberă e dezactivată în Supabase; utilizatorii se creează
--    manual (Authentication -> Users) și apoi se trec aici (vezi README).
-- ---------------------------------------------------------------------
create table public.app_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'dispatcher', 'accountant')),
  full_name  text,
  created_at timestamptz not null default now()
);

create or replace function public.is_app_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.app_users where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 2. Setări și contoare
-- ---------------------------------------------------------------------
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('amortization_threshold_ron', '500'),
  ('report_currency',            '"EUR"'),
  ('vat_rates',                  '[0.21, 0.11, 0]'),
  ('weeks_per_year',             '52');

create table public.counters (
  key   text primary key,
  value int not null default 0
);

-- Număr de decont: FD-AAAA-NNN, o singură serie pentru toți utilizatorii,
-- resetată în fiecare an. Atribuit automat, atomic (fără dubluri).
create or replace function public.next_fd_code()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  y text := to_char(now() at time zone 'Europe/Bucharest', 'YYYY');
  n int;
begin
  if not public.is_app_user() then raise exception 'not allowed'; end if;
  insert into public.counters (key, value) values ('FD-' || y, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;
  return 'FD-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Secvențe pentru ID-urile afișate în aplicație (LD-001, CL-001, ...)
create sequence seq_leads;
create sequence seq_clients;
create sequence seq_carriers;
create sequence seq_offers;
create sequence seq_trips;
create sequence seq_costs;

-- ---------------------------------------------------------------------
-- 3. Vânzări: lead-uri, clienți, interacțiuni
-- ---------------------------------------------------------------------
create table public.leads (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null default ('LD-' || lpad(nextval('seq_leads')::text, 3, '0')),
  added_on       date not null default current_date,
  company        text not null,
  cui            text,
  country        text,
  contact_name   text,
  contact_role   text,
  phone          text,
  email          text,
  source         text,
  interest       text,
  est_volume     int,
  stage          text not null default 'Nou'
                 check (stage in ('Nou', 'Contactat', 'Ofertă trimisă', 'Negociere', 'Pierdut', 'Convertit în client')),
  next_step      text,
  next_step_date date,
  owner          text,
  lost_reason    text,
  client_id      uuid,
  notes          text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.clients (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null default ('CL-' || lpad(nextval('seq_clients')::text, 3, '0')),
  company             text not null,
  cui                 text,
  reg_com             text,
  address             text,
  country             text,
  contact_name        text,
  phone               text,
  email               text,
  billing_email       text,
  payment_terms_days  int,
  credit_limit        numeric(14,2),
  preferred_currency  text check (preferred_currency in ('RON', 'EUR')),
  smartbill_client_id text,
  owner               text,
  status              text not null default 'Activ' check (status in ('Activ', 'Inactiv')),
  lead_id             uuid references public.leads(id) on delete set null,
  notes               text,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.leads
  add constraint leads_client_fk foreign key (client_id) references public.clients(id) on delete set null;

create table public.interactions (
  id             uuid primary key default gen_random_uuid(),
  occurred_on    date not null default current_date,
  lead_id        uuid references public.leads(id) on delete cascade,
  client_id      uuid references public.clients(id) on delete cascade,
  channel        text check (channel in ('Telefon', 'Email', 'WhatsApp', 'Întâlnire', 'Bursă', 'LinkedIn')),
  direction      text check (direction in ('Primit', 'Inițiat')),
  summary        text,
  next_step      text,
  next_step_date date,
  owner          text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint interaction_target check (lead_id is not null or client_id is not null)
);

-- ---------------------------------------------------------------------
-- 4. Operațional: transportatori, oferte din burse, actualizări, curse
-- ---------------------------------------------------------------------
create table public.carriers (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null default ('TR-' || lpad(nextval('seq_carriers')::text, 3, '0')),
  company             text not null,
  cui                 text,
  country             text,
  contact_name        text,
  phone               text,
  email               text,
  truck_types         text[],
  truck_count         int,
  cmr_insurance_until date,
  payment_terms_days  int,
  currency            text check (currency in ('RON', 'EUR')),
  rating              int check (rating between 1 and 5),
  status              text not null default 'Nou' check (status in ('Nou', 'Activ', 'Blocat')),
  notes               text,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null default ('OF-' || lpad(nextval('seq_offers')::text, 5, '0')),
  received_on   date not null default current_date,
  exchange      text check (exchange in ('Trans.eu', 'Timocom', 'Bursa Transport', 'Alta')),
  exchange_ref  text,
  load_country  text,
  load_place    text,
  unload_country text,
  unload_place  text,
  km            int,
  cargo         text,
  weight_kg     int,
  truck_type    text check (truck_type in ('Prelată', 'Frigorific', 'Megatrailer', 'Alt tip')),
  load_date     date,
  unload_date   date,
  asking_price  numeric(14,2),
  currency      text check (currency in ('RON', 'EUR')),
  lead_id       uuid references public.leads(id) on delete set null,
  client_id     uuid references public.clients(id) on delete set null,
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.trips (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null default ('CR-' || lpad(nextval('seq_trips')::text, 4, '0')),
  offer_id           uuid references public.offers(id) on delete set null,
  client_id          uuid references public.clients(id) on delete set null,
  carrier_id         uuid references public.carriers(id) on delete set null,
  load_date          date,
  unload_date        date,
  load_place         text,                     -- vechi, nefolosit
  unload_place       text,                     -- vechi, nefolosit
  load_company text, load_street text, load_zip text, load_city text, load_country text,
  unload_company text, unload_street text, unload_zip text, unload_city text, unload_country text,
  extra_loads jsonb not null default '[]'::jsonb,
  extra_unloads jsonb not null default '[]'::jsonb,
  load_window text, unload_window text, load_ref text, unload_ref text,   -- (migrare 020)
  load_date_alt date, unload_date_alt date,                               -- (migrare 023)
  load_goods jsonb not null default '[]'::jsonb, unload_goods jsonb not null default '[]'::jsonb,
  km                 int,
  service_type       text check (service_type in ('FTL intern', 'FTL internațional', 'LTL intern', 'LTL internațional')),
  revenue_currency   text check (revenue_currency in ('RON', 'EUR')),
  revenue            numeric(14,2),            -- fără TVA
  cost_currency      text check (cost_currency in ('RON', 'EUR')),
  cost               numeric(14,2),            -- cost transportator, fără TVA
  fx_rate            numeric(10,4),            -- RON pentru 1 EUR (doar dacă o sumă e în EUR)
  carrier_paid_on    date,                     -- costul intră în P&L la această dată
  client_invoice_no  text,
  status             text not null default 'Planificată'
                     check (status in ('Planificată', 'În curs', 'Livrată', 'Facturată', 'Încasată', 'Anulată')),
  notes              text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Istoricul fiecărei oferte: rând nou la fiecare schimbare de preț sau stare.
create table public.offer_updates (
  id           uuid primary key default gen_random_uuid(),
  offer_id     uuid not null references public.offers(id) on delete cascade,
  occurred_at  timestamptz not null default now(),
  kind         text not null check (kind in (
                 'Preț cerut de expeditor', 'Preț ofertat de noi', 'Contraofertă primită',
                 'Contraofertă de la noi', 'Preț final convenit', 'Rezultat')),
  amount       numeric(14,2),
  currency     text check (currency in ('RON', 'EUR')),
  status_after text check (status_after in ('Nouă', 'Ofertată', 'În negociere', 'Câștigată', 'Pierdută', 'Retrasă', 'Expirată')),
  trip_id      uuid references public.trips(id) on delete set null,
  note         text,
  created_by   uuid default auth.uid()
);

-- ---------------------------------------------------------------------
-- 5. Financiar: facturi emise (SmartBill), cheltuieli generale
-- ---------------------------------------------------------------------
create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  invoice_no    text unique not null,                 -- serie + număr
  issued_on     date not null,
  client_id     uuid references public.clients(id) on delete set null,
  currency      text not null check (currency in ('RON', 'EUR')),
  amount_net    numeric(14,2) not null,               -- fără TVA
  vat           numeric(14,2) not null default 0,
  fx_rate       numeric(10,4),                        -- RON pentru 1 EUR
  due_on        date,
  paid_on       date,                                 -- venitul intră în P&L la această dată
  source        text not null default 'manual' check (source in ('manual', 'smartbill')),
  smartbill_id  text,
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.invoice_trips (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  trip_id    uuid not null references public.trips(id) on delete cascade,
  primary key (invoice_id, trip_id)
);

-- Deconturi (foi de decont): FD-AAAA-NNN
-- Numărul se atribuie automat la crearea foii (nu mai e nevoie de rezervare manuală).
-- Stări (ca în Registrul din Excel): Ciornă = număr rezervat, foaie în lucru.
create table public.expense_reports (
  id                    uuid primary key default gen_random_uuid(),
  code                  text unique not null default public.next_fd_code(),
  employee              text not null,                      -- numele angajatului
  report_date           date not null default current_date, -- data foii
  purpose               text,                               -- scop achiziții
  payment_method        text not null default 'Card personal',
  status                text not null default 'Ciornă'
                        check (status in ('Ciornă', 'Emis', 'Trimis contabilă', 'Rambursat', 'Anulat')),
  total_gross           numeric(14,2) not null default 0,   -- total cu TVA (RON), recalculat la salvare
  total_vat             numeric(14,2) not null default 0,   -- din care TVA (RON)
  doc_count             int not null default 0,             -- nr. documente justificative
  sent_on               date,                               -- data trimiterii la contabilă
  reimbursed_on         date,                               -- data rambursării
  pdf_path              text,                               -- PDF-ul foii, în Storage
  notes                 text,
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.expense_items (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references public.expense_reports(id) on delete cascade,
  line_no           int not null check (line_no between 1 and 10),   -- max. 10 rânduri pe foaie
  doc_date          date,
  vendor            text,
  doc_no            text,                                -- serie factură sau "Bon fiscal: 0032"
  description       text,
  amount_gross      numeric(14,2) not null,              -- total cu TVA, în RON (ce s-a plătit efectiv)
  vat_amount        numeric(14,2) not null default 0,    -- TVA din document (sau calculat la 21%)
  vat_overridden    boolean not null default false,      -- true = TVA introdus de pe document
  original_amount   numeric(14,2),                       -- doar dacă documentul e în altă monedă
  original_currency text check (original_currency in ('EUR')),
  fx_rate           numeric(10,4),                       -- RON pentru 1 EUR (informativ)
  cui_ok            boolean not null default true,       -- fără CUI-ul firmei pe document nu se decontează
  ai_raw            jsonb,                               -- ce a citit AI-ul din poză (runda următoare)
  created_at        timestamptz not null default now(),
  unique (report_id, line_no) deferrable initially deferred   -- permite renumerotarea rândurilor într-o singură salvare
);

create table public.general_costs (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null default ('CG-' || lpad(nextval('seq_costs')::text, 3, '0')),
  description       text not null,
  category          text check (category in (
                      'Leasing', 'Asigurări', 'Software / abonamente', 'Burse transport', 'Contabilitate',
                      'Chirie / birou', 'Telecom', 'Echipamente birou', 'Consumabile birou',
                      'Taxe / impozite', 'Salarii', 'Marketing', 'Altele')),
  cost_type         text not null check (cost_type in (
                      'Recurent lunar', 'Recurent anual', 'Unic - amortizat', 'Unic - one time cost')),
  amount_gross      numeric(14,2) not null,           -- suma PLĂTITĂ, cu TVA
  currency          text not null default 'RON' check (currency in ('RON', 'EUR')),
  fx_rate           numeric(10,4),                    -- RON pentru 1 EUR
  vat_rate          numeric(5,4),                     -- 0.21 / 0.11 / 0
  vat_amount        numeric(14,2),                    -- TVA de pe document (opțional, înlocuiește cota)
  vat_deductible    boolean not null default true,    -- implicit Da; la Nu, TVA rămâne în cost
  start_on          date not null,
  period_unit       text check (period_unit in ('Luni', 'Săptămâni')),
  period_count      int,
  end_on            date,
  expense_report_id uuid references public.expense_reports(id) on delete set null,
  vendor            text,
  doc_no            text,
  doc_date          date,
  expense_item_id   uuid references public.expense_items(id) on delete set null,
  notes             text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index general_costs_expense_item_uq on public.general_costs (expense_item_id) where expense_item_id is not null;

-- Documente atașate oricărei înregistrări (facturi PDF, CMR, contracte, poze bonuri)
create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,                          -- ex. 'client', 'trip', 'carrier', 'expense_item'
  entity_id   uuid not null,
  path        text not null,                          -- cheia din Storage
  filename    text not null,
  mime        text,
  size_bytes  bigint,
  uploaded_by uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Indexuri
-- ---------------------------------------------------------------------
create index on public.leads (stage);
create index on public.leads (next_step_date) where next_step_date is not null;
create index on public.clients (status);
create index on public.interactions (lead_id);
create index on public.interactions (client_id);
create index on public.offers (received_on desc);
create index on public.offer_updates (offer_id, occurred_at);
create index on public.trips (unload_date);
create index on public.trips (load_date);
create index on public.trips (carrier_paid_on);
create index on public.invoices (paid_on);
create index on public.invoices (client_id);
create index on public.general_costs (start_on);
create index on public.expense_items (report_id);
create index on public.expense_items (doc_no);
create index on public.expense_reports (status);
create index on public.expense_reports (employee);
create index on public.documents (entity, entity_id);

-- ---------------------------------------------------------------------
-- 7. updated_at automat
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['leads', 'clients', 'carriers', 'offers', 'trips', 'invoices',
                           'expense_reports', 'general_costs', 'settings']
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. Securitate (RLS): doar utilizatorii din app_users văd și scriu date
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['leads', 'clients', 'interactions', 'carriers', 'offers', 'offer_updates',
                           'trips', 'invoices', 'invoice_trips', 'expense_reports', 'expense_items',
                           'general_costs', 'documents', 'settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "app users full access" on public.%I
         for all to authenticated
         using (public.is_app_user()) with check (public.is_app_user())', t);
  end loop;
end $$;

alter table public.app_users enable row level security;
create policy "read own row" on public.app_users
  for select to authenticated using (user_id = auth.uid());

alter table public.counters enable row level security;   -- fără politici: doar next_fd_code() îl modifică

revoke all on function public.next_fd_code() from public;
grant execute on function public.next_fd_code() to authenticated;

-- ---------------------------------------------------------------------
-- 9. Storage: bucket privat pentru documente și poze de bonuri
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "app users read documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.is_app_user());

create policy "app users upload documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_app_user());

create policy "app users update documents" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public.is_app_user());

create policy "app users delete documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_app_user());


-- =====================================================================
-- (din migrare_002_cheltuieli.sql)
-- =====================================================================
-- Migrare 002: Cheltuieli generale
-- 1) "Unic - cost imediat" devine "Unic - one time cost"
-- 2) coloane noi: furnizor, nr. document, data documentului, linia de decont de unde provine costul

alter table public.general_costs drop constraint if exists general_costs_cost_type_check;
update public.general_costs set cost_type = 'Unic - one time cost' where cost_type = 'Unic - cost imediat';
alter table public.general_costs add constraint general_costs_cost_type_check
  check (cost_type in ('Recurent lunar', 'Recurent anual', 'Unic - amortizat', 'Unic - one time cost'));

alter table public.general_costs add column if not exists vendor text;
alter table public.general_costs add column if not exists doc_no text;
alter table public.general_costs add column if not exists doc_date date;
alter table public.general_costs add column if not exists expense_item_id uuid references public.expense_items(id) on delete set null;

-- o linie de decont poate deveni cost o singură dată
create unique index if not exists general_costs_expense_item_uq on public.general_costs (expense_item_id) where expense_item_id is not null;
create index if not exists general_costs_doc_no_idx on public.general_costs (doc_no);

-- =====================================================================
-- (din migrare_003_curse.sql)
-- =====================================================================
-- Migrare 003: Curse – tipul de serviciu (pentru P&L săptămânal)
alter table public.trips add column if not exists service_type text;
alter table public.trips drop constraint if exists trips_service_type_check;
alter table public.trips add constraint trips_service_type_check
  check (service_type in ('FTL intern', 'FTL internațional', 'LTL intern', 'LTL internațional'));
create index if not exists trips_load_date_idx on public.trips (load_date);

-- =====================================================================
-- (din migrare_004_oferte.sql)
-- =====================================================================
-- Migrare 004: Burse și oferte – baza de date cu oferte primite de pe burse (o linie = o ofertă primită)
create sequence if not exists seq_freight_offers;

create table if not exists public.freight_offers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null default ('OF-' || lpad(nextval('seq_freight_offers')::text, 5, '0')),
  received_on     date not null default current_date,
  exchange        text check (exchange in ('Trans.eu', 'Timocom', 'Bursatransport.ro', 'Altă')),
  company         text,
  contact_name    text,
  phone           text,
  email           text,
  load_country    text,
  load_place      text,
  load_date       date,
  unload_country  text,
  unload_place    text,
  unload_date     date,
  km              int,
  cargo           text,
  weight_t        numeric(8,2),
  vehicle_type    text check (vehicle_type in ('Prelată', 'Frigorific', 'Megatrailer', 'Alt tip')),
  price           numeric(14,2),
  currency        text not null default 'EUR' check (currency in ('EUR', 'RON', 'SEK', 'NOK', 'DKK', 'PLN', 'Altă')),
  status          text check (status in ('Cerută', 'Ofertată', 'Acceptată', 'Respinsă', 'Fără răspuns', 'Expirată')),
  notes           text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists freight_offers_received_idx on public.freight_offers (received_on desc);
create index if not exists freight_offers_lane_idx on public.freight_offers (load_country, unload_country);

create trigger set_updated_at before update on public.freight_offers
  for each row execute function public.set_updated_at();

alter table public.freight_offers enable row level security;
create policy "app users full access" on public.freight_offers
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

-- =====================================================================
-- (din migrare_005_comenzi.sql)
-- =====================================================================
-- Migrare 005: Comenzi de transport către transportatori (CT-AAAA-NNN, o serie pe an)
create or replace function public.next_ct_code()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  y text := to_char(now() at time zone 'Europe/Bucharest', 'YYYY');
  n int;
begin
  insert into public.counters (key, value) values ('CT-' || y, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;
  return 'CT-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;
revoke all on function public.next_ct_code() from public;
grant execute on function public.next_ct_code() to authenticated;

create table if not exists public.transport_orders (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null default public.next_ct_code(),
  status           text not null default 'Ciornă'
                   check (status in ('Ciornă', 'Trimisă', 'Confirmată', 'Semnată încărcată', 'Executată', 'Anulată')),
  lang             text not null default 'ro' check (lang in ('ro', 'en')),
  order_date       date not null default current_date,
  trip_id          uuid references public.trips(id) on delete set null,
  carrier_id       uuid references public.carriers(id) on delete set null,
  load_date        date,
  load_address     text,
  load_contact     text,
  load_window      text,
  load_ref         text,
  unload_date      date,
  unload_address   text,
  unload_contact   text,
  unload_window    text,
  unload_ref       text,
  cargo            text,
  weight_kg        numeric(10,1),
  packages         text,
  ldm              numeric(5,2),
  adr              boolean not null default false,
  temperature      text,
  truck_type       text,
  price            numeric(14,2),
  currency         text not null default 'EUR' check (currency in ('RON', 'EUR')),
  payment_terms_days int,
  uit              text,
  plate_truck      text,
  plate_trailer    text,
  driver_name      text,
  driver_phone     text,
  special_conditions text,
  sent_on          date,
  confirmed_on     date,
  notes            text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists transport_orders_trip_idx on public.transport_orders (trip_id);
create index if not exists transport_orders_carrier_idx on public.transport_orders (carrier_id);

create trigger set_updated_at before update on public.transport_orders
  for each row execute function public.set_updated_at();

alter table public.transport_orders enable row level security;
create policy "app users full access" on public.transport_orders
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

-- =====================================================================
-- (din migrare_006_adrese_curse.sql)
-- =====================================================================
-- Migrare 006: adrese structurate în curse (firmă, stradă, cod poștal, localitate, țară) + puncte suplimentare
alter table public.trips
  add column if not exists load_company   text,
  add column if not exists load_street    text,
  add column if not exists load_zip       text,
  add column if not exists load_city      text,
  add column if not exists load_country   text,
  add column if not exists unload_company text,
  add column if not exists unload_street  text,
  add column if not exists unload_zip     text,
  add column if not exists unload_city    text,
  add column if not exists unload_country text,
  add column if not exists extra_loads    jsonb not null default '[]'::jsonb,
  add column if not exists extra_unloads  jsonb not null default '[]'::jsonb;
-- coloanele vechi load_place / unload_place rămân în tabel, dar aplicația nu le mai folosește.

-- =====================================================================
-- (din migrare_007_jurnal.sql)
-- =====================================================================
-- Migrare 007: Jurnal de activitate (cine, ce, când) — scris automat de baza de date.

create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  user_email  text,
  user_name   text,
  action      text not null check (action in ('create', 'update', 'delete', 'event')),
  entity      text not null,          -- numele tabelului (ex. transport_orders)
  entity_id   uuid,
  record_code text,                   -- ex. CT-2026-001
  summary     text,                   -- pentru evenimente: pdf_download, email_sent…
  changes     jsonb,                  -- la modificări: { câmp: [valoare veche, valoare nouă] }
  detail      jsonb                   -- la creare/ștergere: rândul întreg; la evenimente: detalii
);
create index if not exists activity_log_at_idx on public.activity_log (at desc);
create index if not exists activity_log_entity_idx on public.activity_log (entity, entity_id);
create index if not exists activity_log_user_idx on public.activity_log (user_id);

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and role = 'owner');
$$;

-- Declanșator generic: înregistrează crearea, modificarea (doar câmpurile schimbate) și ștergerea.
create or replace function public.log_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  em    text := nullif(auth.jwt() ->> 'email', '');
  nm    text;
  rec   jsonb;
  old_j jsonb;
  ch    jsonb := '{}'::jsonb;
  k     text;
  v     jsonb;
  act   text;
begin
  select full_name into nm from public.app_users where user_id = uid;
  if TG_OP = 'DELETE' then
    rec := to_jsonb(OLD); act := 'delete';
  else
    rec := to_jsonb(NEW);
    act := case when TG_OP = 'INSERT' then 'create' else 'update' end;
  end if;

  if TG_OP = 'UPDATE' then
    old_j := to_jsonb(OLD);
    for k, v in select * from jsonb_each(rec) loop
      if k in ('updated_at', 'created_at', 'created_by') then continue; end if;
      if v is distinct from (old_j -> k) then
        ch := ch || jsonb_build_object(k, jsonb_build_array(old_j -> k, v));
      end if;
    end loop;
    if ch = '{}'::jsonb then return NEW; end if;   -- nimic util de înregistrat
  end if;

  insert into public.activity_log (user_id, user_email, user_name, action, entity, entity_id, record_code, changes, detail)
  values (uid, em, nm, act, TG_TABLE_NAME, nullif(rec ->> 'id', '')::uuid, rec ->> 'code',
          case when act = 'update' then ch end,
          case when act <> 'update' then rec end);
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

-- Evenimente care nu sunt modificări de date (descărcare PDF, trimitere mail etc.), apelate din aplicație.
create or replace function public.log_event(p_entity text, p_entity_id uuid, p_code text, p_summary text, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nm  text;
begin
  if not public.is_app_user() then raise exception 'not allowed'; end if;
  select full_name into nm from public.app_users where user_id = uid;
  insert into public.activity_log (user_id, user_email, user_name, action, entity, entity_id, record_code, summary, detail)
  values (uid, nullif(auth.jwt() ->> 'email', ''), nm, 'event', p_entity, p_entity_id, p_code, p_summary, p_detail);
end;
$$;
revoke all on function public.log_event(text, uuid, text, text, jsonb) from public;
grant execute on function public.log_event(text, uuid, text, text, jsonb) to authenticated;

-- Declanșatoarele pe tabelele aplicației
do $$
declare t text;
begin
  foreach t in array array['leads', 'clients', 'interactions', 'carriers', 'offers', 'trips', 'invoices',
                           'expense_reports', 'expense_items', 'general_costs', 'documents', 'settings',
                           'freight_offers', 'transport_orders']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_log_change on public.%I', t);
      execute format('create trigger trg_log_change after insert or update or delete on public.%I
                      for each row execute function public.log_change()', t);
    end if;
  end loop;
end $$;

-- Securitate: doar administratorii citesc jurnalul; nimeni nu îl poate modifica sau șterge din aplicație.
alter table public.activity_log enable row level security;
drop policy if exists "admins read log" on public.activity_log;
create policy "admins read log" on public.activity_log for select to authenticated using (public.is_app_admin());
revoke insert, update, delete, truncate on public.activity_log from authenticated, anon;
grant select on public.activity_log to authenticated;

-- =====================================================================
-- (din migrare_008_email_transportatori.sql)
-- =====================================================================
-- Migrare 008: adrese de email suplimentare la transportatori (pentru trimiterea comenzilor)
alter table public.carriers add column if not exists extra_emails text[];

-- =====================================================================
-- (din migrare_009_clienti_locuri.sql)
-- =====================================================================
-- Migrare 009: clienți cu adresă completă + tip (Client transport / Loading/unloading place); județ și contact în curse
alter table public.clients
  add column if not exists client_type text not null default 'Client transport',
  add column if not exists zip text,
  add column if not exists city text,
  add column if not exists county text;
alter table public.clients drop constraint if exists clients_client_type_check;
alter table public.clients add constraint clients_client_type_check check (client_type in ('Client transport', 'Loading/unloading place'));

alter table public.trips
  add column if not exists load_county text, add column if not exists load_contact text, add column if not exists load_phone text,
  add column if not exists unload_county text, add column if not exists unload_contact text, add column if not exists unload_phone text;

notify pgrst, 'reload schema';

-- =====================================================================
-- (din migrare_010_o_comanda_pe_cursa.sql)
-- =====================================================================
-- Migrare 010: o cursă poate avea o singură comandă ACTIVĂ (orice status în afară de Anulată).
-- Cursa nu mai poate fi schimbată într-o comandă după creare.

do $$
begin
  if exists (
    select 1 from public.transport_orders
    where trip_id is not null and status <> 'Anulată'
    group by trip_id having count(*) > 1
  ) then
    raise exception 'Exista curse cu mai multe comenzi active. Sterge sau anuleaza duplicatele (Comenzi de transport), apoi ruleaza din nou.';
  end if;
end $$;

create unique index if not exists transport_orders_trip_active_uq
  on public.transport_orders (trip_id)
  where trip_id is not null and status <> 'Anulată';

create or replace function public.lock_order_trip()
returns trigger language plpgsql as $$
begin
  if old.trip_id is not null and new.trip_id is not null and new.trip_id <> old.trip_id then
    raise exception 'trip_locked: cursa unei comenzi nu mai poate fi schimbata';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_order_trip on public.transport_orders;
create trigger lock_order_trip before update on public.transport_orders
  for each row execute function public.lock_order_trip();

notify pgrst, 'reload schema';

-- =====================================================================
-- (din migrare_011_coduri_postale.sql)
-- =====================================================================
-- Migrare 011: baza de localități și coduri poștale (GeoNames), pentru sugestiile din Burse și oferte.

create table if not exists public.postal_places (
  id        bigserial primary key,
  country   text not null,            -- ISO alpha-2 (RO, SE, DE ...)
  postcode  text not null,            -- cum se scrie oficial (ex. 111 20)
  pc        text not null,            -- fără spații, majuscule (pentru căutare)
  place     text not null,            -- localitatea
  search    text not null,            -- localitatea fără diacritice, litere mici (pentru căutare)
  region    text,                     -- admin1
  county    text,                     -- admin2 (județ, unde există)
  lat       double precision,
  lon       double precision
);

create index if not exists postal_places_search_idx on public.postal_places (search text_pattern_ops);
create index if not exists postal_places_pc_idx on public.postal_places (pc text_pattern_ops);
create index if not exists postal_places_country_idx on public.postal_places (country);

alter table public.postal_places enable row level security;

drop policy if exists postal_places_read on public.postal_places;
create policy postal_places_read on public.postal_places for select to authenticated using (public.is_app_user());
-- Scrierea se face doar cu cheia service_role (scriptul de încărcare), care ocolește RLS.

notify pgrst, 'reload schema';

-- =====================================================================
-- (din migrare_012_oferte_locuri_suplimentare.sql)
-- =====================================================================
-- Migrare 012: locuri suplimentare de încărcare / descărcare la oferte (Burse și oferte).

alter table public.freight_offers
  add column if not exists extra_loads   jsonb not null default '[]'::jsonb,
  add column if not exists extra_unloads jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

-- =====================================================================
-- (din migrare_013_tools_camioane.sql)
-- =====================================================================
-- Migrare 013: Tools → Camioane (calcul cost/km pe cap tractor).

create sequence if not exists seq_trucks;

create table if not exists public.trucks (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null default ('TK-' || lpad(nextval('seq_trucks')::text, 3, '0')),
  plate               text not null,
  label               text,
  status              text not null default 'Activ' check (status in ('Activ', 'Inactiv')),
  currency            text not null default 'EUR' check (currency in ('EUR', 'RON')),
  fx_rate             numeric(12,4),
  notes               text,
  -- capital
  purchase_price      numeric(14,2),
  residual_value      numeric(14,2),
  depr_years          numeric(6,2),
  equip_price         numeric(14,2),
  equip_residual      numeric(14,2),
  equip_depr_years    numeric(6,2),
  interest_pct        numeric(6,2),
  financing           text default 'Achiziție',
  leasing_monthly     numeric(14,2),
  -- costuri fixe anuale
  road_tax            numeric(14,2),
  eurovignet          numeric(14,2),
  casco               numeric(14,2),
  rca                 numeric(14,2),
  cmr                 numeric(14,2),
  other_insurance     numeric(14,2),
  own_risk            numeric(14,2),
  phone_year          numeric(14,2),
  local_taxes         numeric(14,2),
  papers_year         numeric(14,2),
  -- șofer
  driver_salary_month numeric(14,2),
  driver_burden_pct   numeric(6,2),
  perdiem_ro_day      numeric(14,2),
  perdiem_ro_days     numeric(8,2),
  perdiem_abroad_day  numeric(14,2),
  perdiem_abroad_days numeric(8,2),
  lodging_night       numeric(14,2),
  lodging_nights      numeric(8,2),
  -- consum
  cons_light          numeric(8,2),
  cons_light_t        numeric(8,2),
  cons_heavy          numeric(8,2),
  cons_heavy_t        numeric(8,2),
  cons_empty          numeric(8,2),
  avg_load_t          numeric(8,2),
  diesel_price        numeric(10,4),
  adblue_pct          numeric(6,2),
  -- costuri variabile
  tyres_count         numeric(6,0),
  tyre_life_km        numeric(12,0),
  tyre_cost           numeric(14,2),
  maint_per_km        numeric(10,4),
  road_costs_per_km   numeric(10,4),
  clean_cost          numeric(14,2),
  clean_freq_km       numeric(12,0),
  parking_cost        numeric(14,2),
  parkings_year       numeric(8,0),
  -- utilizare și marje
  annual_km           numeric(12,0),
  empty_pct           numeric(6,2),
  avg_speed           numeric(6,2),
  overhead_pct        numeric(6,2),
  profit_pct          numeric(6,2),
  cost_items          jsonb not null default '[]'::jsonb,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.trucks enable row level security;
drop policy if exists "app users full access" on public.trucks;
create policy "app users full access" on public.trucks
  for all to authenticated using (public.is_app_user()) with check (public.is_app_user());

drop trigger if exists set_updated_at on public.trucks;
create trigger set_updated_at before update on public.trucks
  for each row execute function public.set_updated_at();

drop trigger if exists trg_log_change on public.trucks;
create trigger trg_log_change after insert or update or delete on public.trucks
  for each row execute function public.log_change();

notify pgrst, 'reload schema';

-- =====================================================================
-- (din migrare_014_camioane_remorca.sql)
-- =====================================================================
-- Migrare 014: tip remorcă (prelată / frigorific) și agregat frigorific la Tools → Camioane.

alter table public.trucks
  add column if not exists trailer_type     text default 'Prelată',
  add column if not exists reefer_temp      text,
  add column if not exists reefer_l_h       numeric(8,2),
  add column if not exists reefer_hours_day numeric(6,2),
  add column if not exists reefer_days_year numeric(8,0),
  add column if not exists reefer_maint_h   numeric(10,2);

notify pgrst, 'reload schema';

-- =====================================================================
-- (din migrare_015_taxe_drum.sql)
-- =====================================================================
-- Migrare 015: Tools → Taxe de drum (tarife pe țară + costuri suplimentare).
-- Profil de bază: ansamblu 40 t, 5 axe, Euro VI. Fiecare dată are sursă, dată de verificare și nivel de încredere.

create sequence if not exists seq_toll_countries;
create sequence if not exists seq_toll_extras;

create table if not exists public.toll_countries (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null default ('TC-' || lpad(nextval('seq_toll_countries')::text, 3, '0')),
  country_code   text unique not null,
  country_name   text not null,
  scheme         text,
  rate_eur       numeric(10,4),
  rate_other_eur numeric(10,4),
  rate_unit      text not null default 'km' check (rate_unit in ('km', 'tkm')),
  effective_from date,
  source_name    text,
  source_url     text,
  verified_on    date,
  confidence     text not null default 'Lipsă' check (confidence in ('Verificat', 'Sursă secundară', 'Estimat', 'Lipsă')),
  notes          text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.toll_extras (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null default ('TX-' || lpad(nextval('seq_toll_extras')::text, 3, '0')),
  name          text unique not null,
  kind          text not null,
  countries     text,
  applies       text not null default 'Depinde de traseu',
  price_eur     numeric(12,2),
  price_basis   text,
  source_name   text,
  source_url    text,
  verified_on   date,
  confidence    text not null default 'Lipsă' check (confidence in ('Verificat', 'Sursă secundară', 'Estimat', 'Lipsă')),
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.toll_countries enable row level security;
alter table public.toll_extras enable row level security;
drop policy if exists "app users full access" on public.toll_countries;
create policy "app users full access" on public.toll_countries for all to authenticated using (public.is_app_user()) with check (public.is_app_user());
drop policy if exists "app users full access" on public.toll_extras;
create policy "app users full access" on public.toll_extras for all to authenticated using (public.is_app_user()) with check (public.is_app_user());

drop trigger if exists set_updated_at on public.toll_countries;
create trigger set_updated_at before update on public.toll_countries for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.toll_extras;
create trigger set_updated_at before update on public.toll_extras for each row execute function public.set_updated_at();
drop trigger if exists trg_log_change on public.toll_countries;
create trigger trg_log_change after insert or update or delete on public.toll_countries for each row execute function public.log_change();
drop trigger if exists trg_log_change on public.toll_extras;
create trigger trg_log_change after insert or update or delete on public.toll_extras for each row execute function public.log_change();

insert into public.toll_countries (country_code, country_name, scheme, rate_eur, rate_other_eur, rate_unit, effective_from, source_name, source_url, verified_on, confidence, notes) values
  ('AT', 'Austria', 'Pe km', 0.5724, null, 'km', '2026-01-01', 'GO-Maut (oficial)', 'https://www.go-maut.at/en/paying-the-go-toll/go-toll-rates', '2026-10-15', 'Verificat', 'Fără TVA, 4+ axe, Euro VI, clasa CO2 1. Clasa 2: 0,5657; clasa 3: 0,5625; clasa 4: 0,5091; zero emisii: 0,1189. A12 Unterinntal: +25%. Secțiunile Brenner, Arlberg, Tauern, Karawanken, Gleinalm, Bosruck, Pyhrn au taxă separată (vezi Costuri suplimentare). Brenner: tarif de noapte separat 22:00–05:00.'),
  ('HU', 'Ungaria', 'Pe km', 0.53, 0.27, 'km', '2026-03-10', 'HU-GO – calculator oficial (utdijkalkulacio.hu)', 'https://utdijkalkulacio.hu/', '2026-10-15', 'Verificat', 'CU TVA 27% (cum afișează HU-GO). Medie din 9 trasee reale RO → HU → SK/AT: ≈ 204 HUF/km (J5, EURO6, 40 t) ⇒ ≈ 0,53 €/km la ~385 HUF/EUR. Pentru un calcul exact se folosesc traseele de mai jos (Trasee HU-GO): vamă de intrare + vamă de ieșire. Drumuri principale: valoare din 2025 (0,27 €, brut), neconfirmată pentru 2026.'),
  ('DE', 'Germania', 'Pe km', 0.348, null, 'km', '2026-01-01', 'Industrie-Fachwissen / TransConnect', 'https://industrie-fachwissen.de/transport/co2-maut-lkw-maut-transportkosten-einkauf-2026', '2026-10-15', 'Sursă secundară', 'Camion 40 t, 5 axe, Euro VI, clasa CO2 1 ≈ 34,8 ct/km (Hamburg–München ≈ 271 €). Clasele CO2 mai bune plătesc mai puțin (interval 0,303–0,348). Se aplică pe autostrăzi și drumuri federale. Se confirmă în tabelul Toll Collect.'),
  ('BE', 'Belgia', 'Pe km', 0.2, null, 'km', '2026-01-01', 'TransConnect', 'https://transconnect.com/en/blog/174-in-germany-286-in-austria-what-500-kilometres-of-tolls-really-cost-in-2026', '2026-10-15', 'Sursă secundară', 'Euro VI, peste 32 t: Flandra 0,204; Valonia 0,194; Bruxelles 0,267 €/km. Media 0,20 pentru un traseu obișnuit.'),
  ('NL', 'Olanda', 'Pe km', 0.201, null, 'km', '2026-07-01', 'TransConnect', 'https://transconnect.com/en/blog/174-in-germany-286-in-austria-what-500-kilometres-of-tolls-really-cost-in-2026', '2026-10-15', 'Sursă secundară', 'Taxă pe distanță de la 1 iulie 2026, ansamblu peste 32 t, Euro VI, clasa CO2 1. Eurovignette încetează la aceeași dată.'),
  ('RO', 'România', 'Pe km', 0.03, null, 'km', '2026-07-01', 'trans.info', 'https://trans.info/ro/romania-taxare-kilometru-2026-446609', '2026-10-15', 'Sursă secundară', 'TollRo, peste 12 t: Euro 6 = 0,1523 lei/km (≈ 0,03 €/km); Euro 5–4 = 0,1752; Euro 3–0 = 0,1980. Planificat din 1 iulie 2026 și înlocuiește rovinieta (1.425 €/an pentru 4+ axe). De confirmat că este în vigoare și rețeaua taxată.'),
  ('CH', 'Elveția', 'Pe tonă-km', 0.0255, null, 'tkm', '2026-01-01', 'Autopay (ghid șoferi)', 'https://mobility.autopay.eu/en/knowledge/drivers-guide/road-tolls-switzerland', '2026-10-15', 'Sursă secundară', 'LSVA Euro 6 ≈ 0,0239 CHF per tonă-km (≈ 0,0255 €), pe greutatea totală autorizată: 40 t ≈ 1,02 €/km. Orientativ; se confirmă la autoritatea vamală (BAZG).'),
  ('SI', 'Slovenia', 'Pe km', 0.27, null, 'km', '2026-01-01', 'Autopay (ghid șoferi)', 'https://mobility.autopay.eu/en/knowledge/drivers-guide/road-tolls-slovenia/', '2026-10-15', 'Estimat', 'DarsGo, clasa R4 (peste 3 axe și 3,5 t). Ghidul dă doar tarife orientative pentru 2 axe (0,16–0,25 €/km); valoarea pentru 5 axe este estimată. Tunelul Karawanken se plătește separat (13,13 € R4).'),
  ('CZ', 'Cehia', 'Pe km', 0.17, null, 'km', '2026-01-01', 'Myto CZ (tabel 2026)', 'https://myto.gov.cz/en/emytne/sazby-mytneho-2026', '2026-10-15', 'Estimat', 'Estimat. 2026: autostrăzi +0,7–1,5%, drumuri clasa I +10–42% (în special 4–5 axe și clase CO2 slabe). Tarifele exacte sunt pe site-ul oficial.'),
  ('SK', 'Slovacia', 'Pe km', 0.19, null, 'km', '2025-07-01', 'emyto.sk (calculator oficial)', 'https://mobility.autopay.eu/en/knowledge/drivers-guide/road-tolls-slovakia', '2026-10-15', 'Estimat', 'Estimat. Tarif pe componente (categorie, clasă de emisii, axe) din 1 iulie 2025; valorile exacte se obțin din calculatorul emyto.sk.'),
  ('PL', 'Polonia', 'Pe km', 0.14, null, 'km', '2026-02-01', 'e-TOLL (Ministerul Finanțelor)', 'https://e-toll.mf.gov.pl/en/news/change-in-e-toll-rates', '2026-10-15', 'Estimat', 'Estimat. Peste 3,5 t. Tarifele 2026 au crescut în ianuarie și în februarie (rețea extinsă cu 645 km); tabelul oficial este o imagine pe site. Anterior am găsit ≈ 0,56 PLN/km pe autostrăzi (Euro VI).'),
  ('BG', 'Bulgaria', 'Pe km', 0.17, null, 'km', '2026-03-01', 'Newsweek RO', 'https://newsweek.ro/economie/veste-proasta-pentru-camioane-si-autocare-traversarea-bulgariei-mai-scumpa-cu-30-130-de-la-1-martie', '2026-10-15', 'Estimat', 'Estimat. De la 1 martie 2026 se adaugă o componentă CO2 de 5–7 eurocenți/km pentru peste 12 t; creșteri de 30–130%. Tariful de bază BGTOLL trebuie confirmat.'),
  ('HR', 'Croația', 'Concesionar', 0.18, null, 'km', null, null, null, '2026-10-15', 'Estimat', 'Estimat. Taxă pe secțiune (HAC/ARZ), categoria IV; variază pe autostradă. Podul Krk nu se plătește pentru camioane în sens obișnuit, tunelurile Učka/Sv. Rok au taxă proprie.'),
  ('IT', 'Italia', 'Concesionar', 0.15, null, 'km', null, null, null, '2026-10-15', 'Estimat', 'Estimat. Clasa 5 (5+ axe), pe concesionar și relief; + TVA 22%. Tunelurile Mont Blanc / Fréjus / Gran San Bernardo și Brennero au taxe proprii.'),
  ('FR', 'Franța', 'Concesionar', 0.25, null, 'km', null, null, null, '2026-10-15', 'Estimat', 'Estimat. Clasa 4, fără TVA; variază pe concesionar (tarife 2026 ≈ +0,86% în medie). Viaductul Millau, Tancarville / Normandie au taxă proprie. Crit’Air obligatoriu în zonele cu emisii reduse.'),
  ('ES', 'Spania', 'Concesionar', 0.17, null, 'km', null, null, null, '2026-10-15', 'Estimat', 'Estimat. Doar pe autostrăzile cu taxă (AP-); autovías sunt gratuite. + TVA 10%.'),
  ('PT', 'Portugalia', 'Concesionar', 0.18, null, 'km', null, null, null, '2026-10-15', 'Estimat', 'Estimat. Clasa 4; plata electronică (Via Verde). Unele autostrăzi au taxă la porți.'),
  ('GR', 'Grecia', 'Concesionar', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Taxa se plătește la porți de autostradă (Egnatia, Attiki Odos, Olympia Odos etc.). Se introduce manual până la cercetare.'),
  ('RS', 'Serbia', 'Concesionar', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Taxă pe secțiune (Putevi Srbije), categoria IV. De cercetat.'),
  ('DK', 'Danemarca', 'Pe km', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Taxă pe km pentru camioane din 2025 (extindere planificată în 2027 la vehicule de la 3,5 t). Podurile Storebælt și Øresund sunt în Costuri suplimentare.'),
  ('SE', 'Suedia', 'Vinietă (timp)', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Eurovignette (pe timp), nu pe km. Taxe de congestie Stockholm / Göteborg și podul Øresund în Costuri suplimentare.'),
  ('FI', 'Finlanda', 'Fără taxă', 0, null, 'km', null, null, null, '2026-10-15', 'Estimat', 'Fără taxe rutiere pe km. Feribot Tallinn–Helsinki în Costuri suplimentare.'),
  ('EE', 'Estonia', 'Pe km', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Taxă pe km pentru camioane. De cercetat.'),
  ('LV', 'Letonia', 'Vinietă (timp)', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Vinietă pe timp. De cercetat.'),
  ('LT', 'Lituania', 'Vinietă (timp)', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Vinietă pe timp + taxă pe km pe unele drumuri. De cercetat.'),
  ('LU', 'Luxemburg', 'Vinietă (timp)', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Eurovignette. De cercetat.'),
  ('IE', 'Irlanda', 'Concesionar', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Taxe fixe la porți. De cercetat.'),
  ('NO', 'Norvegia', 'Concesionar', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Bompenger / ferry: taxe pe poartă, tuneluri și feriboturi, foarte variabile. De cercetat.'),
  ('GB', 'Marea Britanie', 'Vinietă (timp)', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'HGV Road User Levy (pe zi / an) + poduri/tuneluri cu taxă (Dartford etc.). Traversarea Canalului în Costuri suplimentare.'),
  ('TR', 'Turcia', 'Concesionar', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Autostrăzi, poduri (Bosfor, Osmangazi, Çanakkale 1915) cu sistem HGS. De cercetat.'),
  ('BA', 'Bosnia și Herțegovina', 'Concesionar', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Taxă pe secțiune. De cercetat.'),
  ('ME', 'Muntenegru', 'Concesionar', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Autostrada Bar–Boljare. De cercetat.'),
  ('MK', 'Macedonia de Nord', 'Concesionar', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Taxă la porți. De cercetat.'),
  ('AL', 'Albania', 'Concesionar', null, null, 'km', null, null, null, '2026-10-15', 'Lipsă', 'Taxe locale (ex. tunelul Kalimash). De cercetat.')
on conflict (country_code) do nothing;

insert into public.toll_extras (name, kind, countries, applies, price_eur, price_basis, source_name, source_url, verified_on, confidence, notes) values
  ('Tallinn – Helsinki (feribot)', 'Feribot / vapor', 'EE,FI', 'Obligatoriu pe rută', 280, 'per traversare, cap tractor + semiremorcă', 'Eckerö Line – cargo (cotație la cerere)', 'https://eckeroline.com/cargo', '2026-10-15', 'Estimat', 'Prețul de cargo se dă pe cotație. Eckerö: Muuga–Vuosaari (Finbo Cargo) și Tallinn A-Terminal–Helsinki West (Finlandia); vehicule până la 40 m. Alți operatori: Tallink, Viking Line. Sumă orientativă, de înlocuit cu oferta.'),
  ('Świnoujście – Trelleborg (feribot)', 'Feribot / vapor', 'PL,SE', 'Obligatoriu pe rută', 550, 'per traversare, cap tractor + semiremorcă', null, null, '2026-10-15', 'Estimat', 'Unity Line / TT-Line (≈ 7 h). Sumă orientativă, depinde de operator, sezon, lungime și dacă șoferul este însoțitor; cere cotație.'),
  ('Rostock – Trelleborg (feribot)', 'Feribot / vapor', 'DE,SE', 'Depinde de traseu', 480, 'per traversare, cap tractor + semiremorcă', null, null, '2026-10-15', 'Estimat', 'Stena Line / TT-Line. Orientativ; cere cotație.'),
  ('Travemünde / Sassnitz – Trelleborg (feribot)', 'Feribot / vapor', 'DE,SE', 'Depinde de traseu', null, 'per traversare', null, null, '2026-10-15', 'Lipsă', 'Alternative pe Marea Baltică către Suedia. Preț de cercetat.'),
  ('Rostock – Gedser (feribot)', 'Feribot / vapor', 'DE,DK', 'Depinde de traseu', 250, 'per traversare', null, null, '2026-10-15', 'Estimat', 'Scandlines. Orientativ; cere cotație.'),
  ('Puttgarden – Rødby (feribot)', 'Feribot / vapor', 'DE,DK', 'Depinde de traseu', 190, 'per traversare', null, null, '2026-10-15', 'Estimat', 'Scandlines (tunelul Fehmarnbelt nu este încă deschis). Orientativ.'),
  ('Helsingør – Helsingborg (feribot)', 'Feribot / vapor', 'DK,SE', 'Depinde de traseu', 95, 'per traversare', null, null, '2026-10-15', 'Estimat', 'Scandlines / ForSea. Orientativ.'),
  ('Podul Øresund (Copenhaga – Malmö)', 'Pod', 'DK,SE', 'Depinde de traseu', 195, 'per trecere, cap tractor + semiremorcă', null, null, '2026-10-15', 'Estimat', 'Cel mai folosit acces DK–SE. Verifică tariful camioanelor pe oresundsbron.com.'),
  ('Podul Storebælt (Great Belt)', 'Pod', 'DK', 'Depinde de traseu', 110, 'per trecere', null, null, '2026-10-15', 'Estimat', 'Între Zealand și Funen; verifică tariful pe sundogbaelt.dk.'),
  ('Ancona / Bari – Igoumenitsa / Patras (feribot)', 'Feribot / vapor', 'IT,GR', 'Obligatoriu pe rută', 800, 'per traversare, cap tractor + semiremorcă', null, null, '2026-10-15', 'Estimat', 'Superfast / Minoan / Anek. Foarte variabil după sezon și lungime; cere cotație.'),
  ('Calais – Dover (feribot)', 'Tunel submarin / Eurotunnel', 'FR,GB', 'Obligatoriu pe rută', 350, 'per traversare', null, null, '2026-10-15', 'Estimat', 'P&O / DFDS. Orientativ; cere cotație.'),
  ('Eurotunnel Le Shuttle Freight (Calais – Folkestone)', 'Tunel submarin / Eurotunnel', 'FR,GB', 'Obligatoriu pe rută', 300, 'per traversare', null, null, '2026-10-15', 'Estimat', 'Preț pe cotație/contract. Orientativ.'),
  ('Strâmtoarea Messina (Villa S. Giovanni – Messina)', 'Feribot / vapor', 'IT', 'Depinde de traseu', 110, 'per traversare', null, null, '2026-10-15', 'Estimat', 'Doar pentru curse spre/dinspre Sicilia.'),
  ('Tunelul Karawanken (AT–SI)', 'Tunel', 'AT,SI', 'Depinde de traseu', 13.13, 'per trecere, clasa R4 (4+ axe)', 'Autopay (ghid Slovenia)', 'https://mobility.autopay.eu/en/knowledge/drivers-guide/road-tolls-slovenia/', '2026-10-15', 'Sursă secundară', 'Taxa se plătește separat de DarsGo. Tarifele pentru alte categorii au crescut de la 1 ianuarie 2026.'),
  ('Tunelul Grand-Saint-Bernard (CH–IT)', 'Tunel', 'CH,IT', 'Depinde de traseu', 202, 'per sens; 91,50–202,00 după număr de axe', 'Autopay (ghid Elveția)', 'https://mobility.autopay.eu/en/knowledge/drivers-guide/road-tolls-switzerland', '2026-10-15', 'Sursă secundară', 'Am pus limita de sus (axe multe); confirmă pentru 5 axe. Retur: 146,50–323,00 €. Se plătește doar la ghișeele de la intrare.'),
  ('Tunelul Mont Blanc (FR–IT)', 'Tunel', 'FR,IT', 'Depinde de traseu', null, 'per trecere, după categorie', null, null, '2026-10-15', 'Lipsă', 'Taxă mare pentru camioane, pe categorii; de verificat pe atmb.com / tunnel-mont-blanc.com.'),
  ('Tunelul Fréjus (FR–IT)', 'Tunel', 'FR,IT', 'Depinde de traseu', null, 'per trecere, după categorie', null, null, '2026-10-15', 'Lipsă', 'De verificat pe tunneldufrejus.com / sitaf.it.'),
  ('Brenner (A13 / A22) – secțiune cu taxă separată', 'Pas montan / secțiune', 'AT,IT', 'Depinde de traseu', null, 'per trecere', null, null, '2026-10-15', 'Lipsă', 'Secțiune cu taxă proprie în sistemul GO (tarif de noapte 22:00–05:00 separat); în PDF-ul „GO toll rates 2026 – Section toll”.'),
  ('Alte secțiuni austriece (Arlberg, Tauern, Katschberg, Gleinalm, Bosruck, Pyhrn)', 'Pas montan / secțiune', 'AT', 'Depinde de traseu', null, 'per trecere', null, null, '2026-10-15', 'Lipsă', 'Taxe separate de GO; tarifele sunt în PDF-ul „GO toll rates 2026 – Section toll” de la go-maut.at.'),
  ('Podul Dartford Crossing (Londra)', 'Pod', 'GB', 'Depinde de traseu', null, 'per trecere', null, null, '2026-10-15', 'Lipsă', 'Se plătește online; de verificat tariful HGV.'),
  ('Poduri Turcia (Osmangazi, Çanakkale 1915, Yavuz Sultan Selim)', 'Pod', 'TR', 'Depinde de traseu', null, 'per trecere, după categorie', null, null, '2026-10-15', 'Lipsă', 'Taxă electronică HGS/OGS; categoria camion 5 axe. De cercetat.'),
  ('Stockholm – taxă de congestie', 'Zonă / oraș', 'SE', 'Depinde de traseu', null, 'per trecere de punct de control', null, null, '2026-10-15', 'Lipsă', 'Se aplică în funcție de oră; de verificat tariful pentru vehicule grele.'),
  ('Zone cu emisii reduse (Crit’Air FR, LEZ BE/NL/DE/IT)', 'Zonă / oraș', '', 'Depinde de traseu', null, 'autocolant / înregistrare', null, null, '2026-10-15', 'Lipsă', 'Franța: autocolant Crit’Air obligatoriu în 25 de zone; Bruxelles: înregistrare LEZ pentru străini (amenzi până la 350 €). Euro VI intră de regulă, dar înregistrarea trebuie făcută.')
on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- =====================================================================
-- (din migrare_016_taxe_rute_salvate.sql)
-- =====================================================================
-- Migrare 016: Tools → Taxe de drum: rute salvate (încărcare, descărcare, țări de evitat).

create sequence if not exists seq_toll_routes;

create table if not exists public.toll_routes (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null default ('TR-' || lpad(nextval('seq_toll_routes')::text, 3, '0')),
  name           text not null,
  load_country   text,
  load_place     text,
  load_lat       numeric(10,6),
  load_lon       numeric(10,6),
  unload_country text,
  unload_place   text,
  unload_lat     numeric(10,6),
  unload_lon     numeric(10,6),
  avoid          text,
  notes          text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.toll_routes enable row level security;
drop policy if exists "app users full access" on public.toll_routes;
create policy "app users full access" on public.toll_routes for all to authenticated using (public.is_app_user()) with check (public.is_app_user());

drop trigger if exists set_updated_at on public.toll_routes;
create trigger set_updated_at before update on public.toll_routes for each row execute function public.set_updated_at();
drop trigger if exists trg_log_change on public.toll_routes;
create trigger trg_log_change after insert or update or delete on public.toll_routes for each row execute function public.log_change();

notify pgrst, 'reload schema';

-- =====================================================================
-- (din migrare_017_ungaria_2026.sql)
-- =====================================================================
-- Migrare 017: Ungaria, tarif mediu 2026 CU TVA (din 9 trasee reale HU-GO). Se poate rula oricând (update idempotent).
update public.toll_countries set
  rate_eur = 0.53,
  effective_from = '2026-03-10',
  verified_on = current_date,
  confidence = 'Verificat',
  source_name = 'HU-GO – calculator oficial (utdijkalkulacio.hu)',
  source_url = 'https://utdijkalkulacio.hu/',
  notes = 'CU TVA 27% (cum afișează HU-GO). Medie din 9 trasee reale RO → HU → SK/AT: ≈ 204 HUF/km (J5, EURO6, 40 t) ⇒ ≈ 0,53 €/km la ~385 HUF/EUR. Pentru un calcul exact se folosesc traseele de mai jos (Trasee HU-GO): vamă de intrare + vamă de ieșire. Drumuri principale: valoare din 2025 (0,27 €, brut), neconfirmată pentru 2026.'
where country_code = 'HU';

-- =====================================================================
-- (din migrare_018_taxe_trasee.sql)
-- =====================================================================
-- Migrare 018: Tools → Taxe de drum: trasee exacte (vamă de intrare → vamă de ieșire) calculate pe calculatoare oficiale.
-- Început cu Ungaria (HU-GO, J5 · EURO6 · 40 t, sume brute cu TVA 27%, în HUF).

create sequence if not exists seq_toll_corridors;

create table if not exists public.toll_corridors (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null default ('TQ-' || lpad(nextval('seq_toll_corridors')::text, 3, '0')),
  country_code   text not null,
  entry_label    text not null,
  exit_label     text not null,
  entry_country  text,
  exit_country   text,
  km             numeric(10,2),
  fee_infra      numeric(14,2),
  fee_external   numeric(14,2),
  fee_total      numeric(14,2) not null,
  currency       text not null default 'HUF',
  vat_included   boolean not null default true,
  profile        text,
  source_name    text,
  source_url     text,
  verified_on    date,
  confidence     text not null default 'Verificat' check (confidence in ('Verificat', 'Sursă secundară', 'Estimat', 'Lipsă')),
  notes          text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (country_code, entry_label, exit_label)
);

alter table public.toll_corridors enable row level security;
drop policy if exists "app users full access" on public.toll_corridors;
create policy "app users full access" on public.toll_corridors for all to authenticated using (public.is_app_user()) with check (public.is_app_user());
drop trigger if exists set_updated_at on public.toll_corridors;
create trigger set_updated_at before update on public.toll_corridors for each row execute function public.set_updated_at();
drop trigger if exists trg_log_change on public.toll_corridors;
create trigger trg_log_change after insert or update or delete on public.toll_corridors for each row execute function public.log_change();

insert into public.toll_corridors (country_code, entry_label, exit_label, entry_country, exit_country, km, fee_infra, fee_external, fee_total, currency, vat_included, profile, source_name, source_url, verified_on, confidence, notes) values
  ('HU', 'Petea → Csengersima', 'Tornyosnémeti (→ SK Milhosť)', 'RO', 'SK', 252.09, 37177, 10207, 47384, 'HUF', true, 'J5 · EURO6 · 40 t', 'HU-GO – calculator oficial', 'https://utdijkalkulacio.hu/', '2026-10-15', 'Verificat', 'HU-GO avertizează: ruta include secțiuni cu acces restricționat.'),
  ('HU', 'Petea → Csengersima', 'Rajka (→ SK)', 'RO', 'SK', 525.02, 83613, 22313, 105926, 'HUF', true, 'J5 · EURO6 · 40 t', 'HU-GO – calculator oficial', 'https://utdijkalkulacio.hu/', '2026-10-15', 'Verificat', 'HU-GO avertizează: ruta include secțiuni cu acces restricționat.'),
  ('HU', 'Petea → Csengersima', 'Hegyeshalom (→ AT Nickelsdorf)', 'RO', 'AT', 513.98, 82491, 22025, 104516, 'HUF', true, 'J5 · EURO6 · 40 t', 'HU-GO – calculator oficial', 'https://utdijkalkulacio.hu/', '2026-10-15', 'Verificat', 'HU-GO avertizează: ruta include secțiuni cu acces restricționat.'),
  ('HU', 'Bors → Nagykereki (Biharkeresztes)', 'Tornyosnémeti (→ SK Milhosť)', 'RO', 'SK', 220.7, 38049, 9829, 47878, 'HUF', true, 'J5 · EURO6 · 40 t', 'HU-GO – calculator oficial', 'https://utdijkalkulacio.hu/', '2026-10-15', 'Verificat', 'Punct de ieșire în HU-GO: Tornyosnémeti Zöldhatár (lângă vamă).'),
  ('HU', 'Bors → Nagykereki (Biharkeresztes)', 'Rajka (→ SK)', 'RO', 'SK', 428.06, 62121, 17656, 79777, 'HUF', true, 'J5 · EURO6 · 40 t', 'HU-GO – calculator oficial', 'https://utdijkalkulacio.hu/', '2026-10-15', 'Verificat', 'HU-GO avertizează: ruta include secțiuni cu acces restricționat.'),
  ('HU', 'Bors → Nagykereki (Biharkeresztes)', 'Hegyeshalom (→ AT Nickelsdorf)', 'RO', 'AT', 417.21, 60999, 17368, 78367, 'HUF', true, 'J5 · EURO6 · 40 t', 'HU-GO – calculator oficial', 'https://utdijkalkulacio.hu/', '2026-10-15', 'Verificat', null),
  ('HU', 'Nădlac II → Csanádpalota (M43)', 'Tornyosnémeti (→ SK Milhosť)', 'RO', 'SK', 442.5, 76321, 19835, 96156, 'HUF', true, 'J5 · EURO6 · 40 t', 'HU-GO – calculator oficial', 'https://utdijkalkulacio.hu/', '2026-10-15', 'Verificat', 'HU-GO avertizează: ruta include secțiuni cu acces restricționat.'),
  ('HU', 'Nădlac II → Csanádpalota (M43)', 'Rajka (→ SK)', 'RO', 'SK', 391.15, 67180, 17493, 84673, 'HUF', true, 'J5 · EURO6 · 40 t', 'HU-GO – calculator oficial', 'https://utdijkalkulacio.hu/', '2026-10-15', 'Verificat', 'HU-GO avertizează: ruta include secțiuni cu acces restricționat.'),
  ('HU', 'Nădlac II → Csanádpalota (M43)', 'Hegyeshalom (→ AT Nickelsdorf)', 'RO', 'AT', 383.72, 65877, 17161, 83038, 'HUF', true, 'J5 · EURO6 · 40 t', 'HU-GO – calculator oficial', 'https://utdijkalkulacio.hu/', '2026-10-15', 'Verificat', 'HU-GO avertizează: ruta include secțiuni cu acces restricționat.')
on conflict (country_code, entry_label, exit_label) do nothing;

notify pgrst, 'reload schema';

-- =====================================================================
-- (din migrare_019_romania_tollro_polonia.sql)
-- =====================================================================
-- Migrare 019: România TollRO (din 1 oct. 2026, lei/km, CU TVA, două tarife) + Polonia e-TOLL (din 1 feb. 2026).
alter table public.toll_countries add column if not exists currency text;
alter table public.toll_countries add column if not exists rate_local numeric;
alter table public.toll_countries add column if not exists rate_other_local numeric;

update public.toll_countries set
  rate_eur = 0.0912,
  rate_other_eur = 0.0456,
  currency = 'RON',
  rate_local = 0.48,
  rate_other_local = 0.24,
  effective_from = '2026-10-01',
  verified_on = current_date,
  confidence = 'Sursă secundară',
  source_name = 'trans.info / SafeFleet / Newsweek RO (TollRO)',
  source_url = 'https://trans.info/ro/tollro-in-romania-cat-vor-plati-camioanele-pe-kilometru-504385',
  notes = 'TollRO din 1 octombrie 2026 (înlocuiește rovinieta), peste 12 t, Euro VI, CU TVA (brut). Autostradă și drum expres: 0,48 lei/km (≈ 0,091 €); drum național: 0,24 lei/km (≈ 0,046 €). Euro V–IV: +15%; Euro III–0: +30%. Tarifele se indexează anual (ianuarie). Calculatorul ia km pe autostradă din rută, iar restul km din România îi taxează cu tariful de drum național (variantă acoperitoare: drumurile județene/comunale pot fi netaxate). Valorile în EUR din tabel sunt orientative; calculul folosește lei și cursul BNR din ziua calculului. Sursă oficială (tollro.ro) de confirmat; de calibrat cu facturi reale.'
where country_code = 'RO';

update public.toll_countries set
  rate_eur = 0.12,
  rate_other_eur = 0.096,
  effective_from = '2026-02-01',
  verified_on = current_date,
  confidence = 'Sursă secundară',
  source_name = 'e-TOLL – tarife din 1 februarie 2026 (tachospeed.pl, e-prawnik.pl, trans.info)',
  source_url = 'https://tachospeed.pl/blog/zmiany-w-e-toll-od-1-lutego-2026/',
  notes = 'e-TOLL din 1 februarie 2026, ≥ 12 t, min. EURO 5: autostrăzi și drumuri expres (A, S) 0,56 PLN/km (≈ 0,128 €); drumuri principale (GP, G) 0,42 PLN/km (≈ 0,096 €), la ≈ 0,229 EUR/PLN. Tabelul din ianuarie 2026 (0,42 / 0,32 PLN) este depășit. Valoarea 0,12 €/km este media pentru tranzit majoritar pe A/S. Sursă oficială (etoll.gov.pl / Monitor Polski) de confirmat; TVA neconfirmat. Autostrăzile cu concesionar privat (A1 Gdańsk–Toruń, A4 Katowice–Kraków) au taxare separată: de verificat prețul pentru camioane.'
where country_code = 'PL';

-- =====================================================================
-- (din migrare_020_marfa_puncte.sql)
-- =====================================================================
-- Migrare 020: interval orar, referință și marfă (rânduri) pentru punctul principal de încărcare / descărcare al cursei.
-- Punctele suplimentare păstrează aceste date direct în extra_loads / extra_unloads (jsonb), fără coloane noi.
alter table public.trips
  add column if not exists load_window   text,
  add column if not exists unload_window text,
  add column if not exists load_ref      text,
  add column if not exists unload_ref    text,
  add column if not exists load_goods    jsonb not null default '[]'::jsonb,
  add column if not exists unload_goods  jsonb not null default '[]'::jsonb;

-- =====================================================================
-- (din migrare_021_comenzi_puncte.sql)
-- =====================================================================
-- Migrare 021: punctele comenzii de transport (încărcări / descărcări numerotate, cu dată, interval, referință și marfă).
-- Câmpurile vechi (load_address etc.) rămân și se completează din puncte.
alter table public.transport_orders
  add column if not exists stops jsonb not null default '[]'::jsonb;

-- =====================================================================
-- (din migrare_022_oferte_transportatori.sql)
-- =====================================================================
-- Migrare 022: oferte primite de la transportatori pentru o ofertă de bursă (mai multe pe ofertă).
-- Fiecare element: { carrier, price, currency, exchange, ext_id, contact, email, phone }
alter table public.freight_offers
  add column if not exists carrier_quotes jsonb not null default '[]'::jsonb;

-- =====================================================================
-- (din migrare_023_date_alternative.sql)
-- =====================================================================
-- Migrare 023: a doua zi posibilă de încărcare / descărcare (ex. „joi sau vineri”), pe curse și pe oferte.
-- La curse, punctele suplimentare păstrează data alternativă direct în extra_loads / extra_unloads (jsonb).
alter table public.trips
  add column if not exists load_date_alt   date,
  add column if not exists unload_date_alt date;
alter table public.freight_offers
  add column if not exists load_date_alt   date,
  add column if not exists unload_date_alt date;

-- =====================================================================
-- (din migrare_024_termen_plata_start.sql)
-- =====================================================================
-- Migrare 024: de când începe termenul de plată pe comenzile de transport.
-- Valori: invoice | original | electronic | unload | eom. Comenzile existente rămân cu „electronic” (textul actual din PDF).
alter table public.transport_orders
  add column if not exists payment_terms_from text;

-- =====================================================================
-- (din migrare_025_securitate_functii.sql)
-- =====================================================================
-- Migrare 025 — întărire securitate funcții (rezolvă avertismentele Security Advisor)

-- 1) Utilizatorii neautentificați (anon) nu mai pot apela funcțiile din baza de date.
--    (Supabase dă implicit EXECUTE rolului anon; "revoke from public" nu era suficient.)
revoke execute on function public.is_app_admin()  from anon, public;
revoke execute on function public.is_app_user()   from anon, public;
revoke execute on function public.next_fd_code()  from anon, public;
revoke execute on function public.next_ct_code()  from anon, public;
revoke execute on function public.log_event(text, uuid, text, text, jsonb) from anon, public;

-- 2) log_change() e doar funcție de trigger: nu trebuie apelabilă de nimeni prin API.
revoke execute on function public.log_change() from anon, authenticated, public;

-- 3) Utilizatorii logați rămân cu EXECUTE doar unde e nevoie (politici RLS, numerotare, jurnal).
grant execute on function public.is_app_admin()  to authenticated;
grant execute on function public.is_app_user()   to authenticated;
grant execute on function public.next_fd_code()  to authenticated;
grant execute on function public.next_ct_code()  to authenticated;
grant execute on function public.log_event(text, uuid, text, text, jsonb) to authenticated;

-- 4) Numerotarea (FD-/CT-) funcționează doar pentru utilizatorii aplicației (nu poate fi "consumată" de alt cont).
create or replace function public.next_fd_code()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  y text := to_char(now() at time zone 'Europe/Bucharest', 'YYYY');
  n int;
begin
  if not public.is_app_user() then raise exception 'not allowed'; end if;
  insert into public.counters (key, value) values ('FD-' || y, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;
  return 'FD-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;

create or replace function public.next_ct_code()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  y text := to_char(now() at time zone 'Europe/Bucharest', 'YYYY');
  n int;
begin
  if not public.is_app_user() then raise exception 'not allowed'; end if;
  insert into public.counters (key, value) values ('CT-' || y, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;
  return 'CT-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;

-- (create or replace păstrează drepturile de mai sus; le reafirmăm ca să fim siguri)
revoke execute on function public.next_fd_code() from anon, public;
revoke execute on function public.next_ct_code() from anon, public;
grant  execute on function public.next_fd_code() to authenticated;
grant  execute on function public.next_ct_code() to authenticated;

-- 5) search_path fixat pe funcțiile de trigger rămase.
alter function public.set_updated_at()  set search_path = public;
alter function public.lock_order_trip() set search_path = public;

-- 6) Funcțiile create de acum încolo nu mai primesc automat EXECUTE pentru anon.
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- =====================================================================
-- (din migrare_026_comanda_client.sql)
-- =====================================================================
-- Migrare 026: Comanda Client (CC-AAAA-NNN) — comanda de transport trimisă clientului spre semnare.
-- DOAR ADĂUGARE: tabel nou + funcție nouă. Nu atinge cursele, comenzile de transport sau clienții existenți.

create or replace function public.next_cc_code()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  y text := to_char(now() at time zone 'Europe/Bucharest', 'YYYY');
  n int;
begin
  if not public.is_app_user() then raise exception 'not allowed'; end if;
  insert into public.counters (key, value) values ('CC-' || y, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;
  return 'CC-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;
revoke execute on function public.next_cc_code() from anon, public;
grant  execute on function public.next_cc_code() to authenticated;

create table if not exists public.client_orders (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null default public.next_cc_code(),
  lang               text not null default 'ro' check (lang in ('ro', 'en')),
  order_date         date not null default current_date,
  trip_id            uuid references public.trips(id) on delete set null,
  client_id          uuid references public.clients(id) on delete set null,
  client_ref         text,
  stops              jsonb not null default '[]'::jsonb,
  cargo              text,
  weight_kg          numeric(10,1),
  packages           text,
  ldm                numeric(5,2),
  adr                boolean not null default false,
  temperature        text,
  truck_type         text,
  uit                text,
  price              numeric(14,2),
  currency           text not null default 'EUR' check (currency in ('RON', 'EUR')),
  payment_terms_days int,
  payment_terms_from text,
  special_conditions text,
  sender_name        text,
  sent_at            timestamptz,
  sent_to            text,
  send_count         int not null default 0,
  notes              text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists client_orders_trip_idx   on public.client_orders (trip_id);
create index if not exists client_orders_client_idx on public.client_orders (client_id);
-- o singură comandă client pe cursă
create unique index if not exists client_orders_trip_uq on public.client_orders (trip_id) where trip_id is not null;

drop trigger if exists set_updated_at on public.client_orders;
create trigger set_updated_at before update on public.client_orders
  for each row execute function public.set_updated_at();

alter table public.client_orders enable row level security;
drop policy if exists "app users full access" on public.client_orders;
create policy "app users full access" on public.client_orders
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

-- jurnal de activitate (cine, ce, când)
drop trigger if exists trg_log_change on public.client_orders;
create trigger trg_log_change after insert or update or delete on public.client_orders
  for each row execute function public.log_change();

-- =====================================================================
-- (din migrare_027_blocare_si_amprente.sql)
-- =====================================================================
-- Migrare 027 — blocare la editare (un singur utilizator odată) + amprente „trimis" (avertizare la modificări după trimitere)

-- 1) Amprente: ce date aveau cursa și comanda în momentul trimiterii (comenzi transport / comenzi client)
create table if not exists public.sent_snapshots (
  entity     text not null,            -- 'transport_orders' | 'client_orders'
  entity_id  uuid not null,
  snapshot   jsonb not null,
  taken_at   timestamptz not null default now(),
  taken_by   uuid default auth.uid(),
  primary key (entity, entity_id)
);
alter table public.sent_snapshots enable row level security;
drop policy if exists "app users full access" on public.sent_snapshots;
create policy "app users full access" on public.sent_snapshots
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

-- 2) Blocări de editare (cine are deschisă o cursă / comandă)
create table if not exists public.edit_locks (
  entity     text not null,            -- 'trips' | 'transport_orders' | 'client_orders'
  entity_id  uuid not null,
  user_id    uuid not null,
  user_name  text,
  since      timestamptz not null default now(),
  heartbeat  timestamptz not null default now(),
  primary key (entity, entity_id)
);
alter table public.edit_locks enable row level security;
drop policy if exists "app users read locks" on public.edit_locks;
create policy "app users read locks" on public.edit_locks
  for select to authenticated using (public.is_app_user());
-- scrierea se face doar prin funcțiile de mai jos (nu direct)

-- Obține / reînnoiește blocarea. Întoarce {ok:true} sau {ok:false, user_name, since} dacă altcineva o are (activă = semnal de viață în ultimele 90 s).
create or replace function public.acquire_edit_lock(p_entity text, p_id uuid, p_name text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare r public.edit_locks;
begin
  if not public.is_app_user() then raise exception 'not allowed'; end if;
  insert into public.edit_locks as l (entity, entity_id, user_id, user_name, since, heartbeat)
  values (p_entity, p_id, auth.uid(), p_name, now(), now())
  on conflict (entity, entity_id) do update
    set user_name = excluded.user_name,
        since     = case when l.user_id = auth.uid() and l.heartbeat > now() - interval '90 seconds' then l.since else now() end,
        user_id   = auth.uid(),
        heartbeat = now()
    where l.user_id = auth.uid() or l.heartbeat < now() - interval '90 seconds'
  returning * into r;
  if found then return jsonb_build_object('ok', true); end if;
  select * into r from public.edit_locks where entity = p_entity and entity_id = p_id;
  return jsonb_build_object('ok', false, 'user_name', r.user_name, 'since', r.since);
end;
$$;

-- Eliberează blocarea (doar pe a ta)
create or replace function public.release_edit_lock(p_entity text, p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_app_user() then raise exception 'not allowed'; end if;
  delete from public.edit_locks where entity = p_entity and entity_id = p_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.acquire_edit_lock(text, uuid, text) from anon, public;
revoke execute on function public.release_edit_lock(text, uuid)       from anon, public;
grant  execute on function public.acquire_edit_lock(text, uuid, text) to authenticated;
grant  execute on function public.release_edit_lock(text, uuid)       to authenticated;

-- =====================================================================
-- (din migrare_028_comanda_client_cursa_blocata.sql)
-- =====================================================================
-- Migrare 028 — cursa unei comenzi client nu mai poate fi schimbată (ca la comanda de transport)

create or replace function public.lock_cc_trip()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.trip_id is not null and new.trip_id is not null and new.trip_id <> old.trip_id then
    raise exception 'trip_locked: cursa unei comenzi client nu mai poate fi schimbata';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_cc_trip on public.client_orders;
create trigger lock_cc_trip before update on public.client_orders
  for each row execute function public.lock_cc_trip();

revoke execute on function public.lock_cc_trip() from anon, authenticated, public;


-- =====================================================================
-- ADAPTĂRI PRODUS NOU
-- =====================================================================

-- 1) Utilizatori: email, activ/inactiv
alter table public.app_users add column if not exists email  text;
alter table public.app_users add column if not exists active boolean not null default true;

create or replace function public.is_app_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and active);
$$;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and active and role = 'owner');
$$;

-- 2) Setările firmei (un singur rând). Datele firmei care folosește aplicația:
--    identitate, bază, branding, numerotare, condiții generale, email.
create table public.company_settings (
  id                      uuid primary key default gen_random_uuid(),
  name                    text,
  cui                     text,
  reg_com                 text,
  address                 text,
  address_en              text,
  country                 text not null default 'RO',
  phone                   text,
  email                   text,
  website                 text,
  ibans                   jsonb not null default '[]'::jsonb,            -- [{ bank, iban, currency }]
  base_name               text,                                          -- baza de unde pleacă și unde se termină cursele
  base_address            text,
  base_lat                numeric,
  base_lng                numeric,
  logo_path               text,                                          -- căi în bucket-ul privat "branding"
  stamp_path              text,
  signature_path          text,
  color_primary           text not null default '#14213D',
  color_secondary         text not null default '#2A9D8F',
  default_currency        text not null default 'EUR' check (default_currency in ('EUR', 'RON')),
  report_currency         text not null default 'EUR' check (report_currency in ('EUR', 'RON')),
  numbering_prefixes      jsonb not null default '{"ct":"CT","cc":"CC","trip":"CR","fd":"FD"}'::jsonb,
  active_languages        text[] not null default array['ro', 'en'],
  signers                 jsonb not null default '[]'::jsonb,            -- [{ name, role, email }]
  terms_ro                text,                                          -- condiții generale (text editabil)
  terms_en                text,
  default_payment_days    int not null default 30,
  mail_provider           text not null default 'microsoft' check (mail_provider in ('microsoft', 'google', 'smtp_service')),
  mail_from               text,
  accountant_sees_payroll boolean not null default true,
  updated_at              timestamptz not null default now()
);
create unique index company_settings_singleton on public.company_settings ((true));   -- un singur rând
insert into public.company_settings default values;

create trigger set_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();
create trigger trg_log_change after insert or update or delete on public.company_settings
  for each row execute function public.log_change();

alter table public.company_settings enable row level security;
create policy "app users read company" on public.company_settings
  for select to authenticated using (public.is_app_user());
create policy "owner updates company" on public.company_settings
  for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
-- (nu există politici de insert/delete: rândul unic există deja și nu poate fi șters)

-- 3) Numerotare cu prefix configurabil (company_settings.numbering_prefixes)
create or replace function public.numbering_prefix(p_kind text, p_default text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(numbering_prefixes ->> p_kind, '') from public.company_settings limit 1), p_default);
$$;
revoke execute on function public.numbering_prefix(text, text) from anon, public;
grant  execute on function public.numbering_prefix(text, text) to authenticated;

create or replace function public.next_fd_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  p text := public.numbering_prefix('fd', 'FD');
  y text := to_char(now() at time zone 'Europe/Bucharest', 'YYYY');
  n int;
begin
  if not public.is_app_user() then raise exception 'not allowed'; end if;
  insert into public.counters (key, value) values (p || '-' || y, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;
  return p || '-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;

create or replace function public.next_ct_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  p text := public.numbering_prefix('ct', 'CT');
  y text := to_char(now() at time zone 'Europe/Bucharest', 'YYYY');
  n int;
begin
  if not public.is_app_user() then raise exception 'not allowed'; end if;
  insert into public.counters (key, value) values (p || '-' || y, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;
  return p || '-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;

create or replace function public.next_cc_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  p text := public.numbering_prefix('cc', 'CC');
  y text := to_char(now() at time zone 'Europe/Bucharest', 'YYYY');
  n int;
begin
  if not public.is_app_user() then raise exception 'not allowed'; end if;
  insert into public.counters (key, value) values (p || '-' || y, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;
  return p || '-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;

-- 4) Storage: bucket privat pentru branding (logo, ștampilă, semnătură); scriere doar pentru patron
insert into storage.buckets (id, name, public) values ('branding', 'branding', false)
on conflict (id) do nothing;

create policy "app users read branding" on storage.objects
  for select to authenticated using (bucket_id = 'branding' and public.is_app_user());
create policy "owner uploads branding" on storage.objects
  for insert to authenticated with check (bucket_id = 'branding' and public.is_app_admin());
create policy "owner updates branding" on storage.objects
  for update to authenticated using (bucket_id = 'branding' and public.is_app_admin());
create policy "owner deletes branding" on storage.objects
  for delete to authenticated using (bucket_id = 'branding' and public.is_app_admin());

-- 5) Registru de versiune a schemei (se completează câte o linie la fiecare migrare)
create table public.schema_version (
  version    int primary key,
  name       text not null,
  applied_at timestamptz not null default now()
);
insert into public.schema_version (version, name) values (1, '0001_baza');
alter table public.schema_version enable row level security;
create policy "app users read schema_version" on public.schema_version
  for select to authenticated using (public.is_app_user());

-- 6) Lista colegilor (nume, rol) pentru liste de „responsabil”, „expeditor” etc.
--    Fiecare utilizator vede doar propriul rând în app_users; lista echipei trece prin această funcție.
create or replace function public.list_team()
returns table (user_id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select a.user_id, a.full_name, coalesce(a.email, u.email::text), a.role
  from public.app_users a
  left join auth.users u on u.id = a.user_id
  where a.active and public.is_app_user()
  order by a.full_name nulls last;
$$;
revoke execute on function public.list_team() from anon, public;
grant  execute on function public.list_team() to authenticated;
