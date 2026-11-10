-- 0003: Flotă (camioane, remorci, șoferi, salarii, diurnă), cursa-circuit, mai multe comenzi pe cursă,
--       grupaj (LTL) și distribuție subcontractată (un CT poate duce una sau mai multe mărfuri).
-- Aditivă: tabele și coloane noi. Se scot doar două indexuri unice și un blocaj vechi (fără date pierdute):
--   - client_orders_trip_uq        (o singură comandă client pe cursă)  -> acum mai multe comenzi pe cursă
--   - transport_orders_trip_active_uq (un singur CT activ pe cursă)      -> acum mai multe CT-uri
--   - lock_cc_trip                 (cursa unei comenzi client nu se mai schimba) -> marfa se poate muta pe altă cursă
-- Decizii: docs/DECIZII-grupaj-ltl.md.

-- ---------------------------------------------------------------------
-- 0) Cine are voie să vadă salariile: patronul; contabilul doar dacă patronul permite
-- ---------------------------------------------------------------------
create or replace function public.can_see_payroll()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users a
    where a.user_id = auth.uid() and a.active
      and (a.role = 'owner'
           or (a.role = 'accountant' and coalesce((select accountant_sees_payroll from public.company_settings limit 1), true)))
  );
$$;
revoke execute on function public.can_see_payroll() from anon, public;
grant  execute on function public.can_see_payroll() to authenticated;
-- (interfața o apelează prin rpc ca să știe dacă arată secțiunea de salariu; baza de date o aplică în RLS)

-- ---------------------------------------------------------------------
-- 1) Setări firmă: criteriul implicit de repartizare a costului cursei pe mărfuri
-- ---------------------------------------------------------------------
alter table public.company_settings
  add column if not exists cost_allocation_basis text not null default 'ldm'
    check (cost_allocation_basis in ('ldm', 'weight', 'pallets', 'revenue'));

-- ---------------------------------------------------------------------
-- 2) Numerotare: funcțiile acceptă și scriptul local de date de test (service_role)
-- ---------------------------------------------------------------------
create or replace function public.can_number()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_app_user() or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;
revoke execute on function public.can_number() from anon, public;
grant  execute on function public.can_number() to authenticated;

create or replace function public.next_code(p_kind text, p_default text)
returns text language plpgsql security definer set search_path = public as $$
declare
  p text := public.numbering_prefix(p_kind, p_default);
  y text := to_char(now() at time zone 'Europe/Bucharest', 'YYYY');
  n int;
begin
  if not public.can_number() then raise exception 'not allowed'; end if;
  insert into public.counters (key, value) values (p || '-' || y, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;
  return p || '-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;
revoke execute on function public.next_code(text, text) from anon, public;
grant  execute on function public.next_code(text, text) to authenticated;

create or replace function public.next_ct_code()
returns text language sql security definer set search_path = public as $$ select public.next_code('ct', 'CT'); $$;
create or replace function public.next_cc_code()
returns text language sql security definer set search_path = public as $$ select public.next_code('cc', 'CC'); $$;
create or replace function public.next_fd_code()
returns text language sql security definer set search_path = public as $$ select public.next_code('fd', 'FD'); $$;
create or replace function public.next_trip_code()
returns text language sql security definer set search_path = public as $$ select public.next_code('trip', 'CR'); $$;
revoke execute on function public.next_trip_code() from anon, public;
grant  execute on function public.next_trip_code() to authenticated;

-- Cursele noi primesc cod cu prefixul din Setări (ex. CR-2026-001); cele existente își păstrează codul.
alter table public.trips alter column code set default public.next_trip_code();

-- ---------------------------------------------------------------------
-- 3) Flotă: remorci
-- ---------------------------------------------------------------------
create sequence if not exists seq_trailers;
create table if not exists public.trailers (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null default ('RM-' || lpad(nextval('seq_trailers')::text, 3, '0')),
  plate        text not null,
  trailer_type text not null default 'Prelată' check (trailer_type in ('Prelată', 'Frigorific', 'Megatrailer', 'Platformă', 'Alt tip')),
  status       text not null default 'Activ' check (status in ('Activ', 'Inactiv')),
  notes        text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Camioane (tabelul din Tools, extins pentru Flotă)
alter table public.trucks
  add column if not exists vin                text,
  add column if not exists make               text,
  add column if not exists model              text,
  add column if not exists year               int,
  add column if not exists ref_consumption    numeric(6,2),   -- l/100 km (consum de referință)
  add column if not exists default_trailer_id uuid references public.trailers(id) on delete set null;

-- ---------------------------------------------------------------------
-- 4) Șoferi (fără CNP în v1). Salariul stă în tabel separat, protejat.
-- ---------------------------------------------------------------------
create sequence if not exists seq_drivers;
create table if not exists public.drivers (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null default ('SF-' || lpad(nextval('seq_drivers')::text, 3, '0')),
  full_name        text not null,
  phone            text,
  email            text,
  status           text not null default 'Activ' check (status in ('Activ', 'Inactiv')),
  default_truck_id uuid references public.trucks(id) on delete set null,
  notes            text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.driver_pay (
  id                  uuid primary key default gen_random_uuid(),
  driver_id           uuid not null unique references public.drivers(id) on delete cascade,
  monthly_gross       numeric(14,2),            -- salariu lunar brut
  employer_cost_month numeric(14,2),            -- cost total angajator pe lună (dacă e cunoscut)
  employer_pct        numeric(6,2),             -- sau: procent taxe angajator peste brut
  currency            text not null default 'RON' check (currency in ('RON', 'EUR')),
  updated_at          timestamptz not null default now()
);

-- Diurnă: tarif pe zi. driver_id gol = tarif implicit al firmei; country gol = oricare țară.
create table if not exists public.per_diem_rates (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid references public.drivers(id) on delete cascade,
  country    text,
  amount_day numeric(10,2) not null check (amount_day >= 0),
  currency   text not null default 'EUR' check (currency in ('RON', 'EUR')),
  valid_from date not null default date '2000-01-01',
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists per_diem_rates_driver_idx on public.per_diem_rates (driver_id);

-- ---------------------------------------------------------------------
-- 5) Cursa-circuit: bază -> ... -> bază, cu camion, remorcă, șofer(i)
-- ---------------------------------------------------------------------
alter table public.trips
  add column if not exists kind             text not null default 'own' check (kind in ('own', 'subcontracted')),
  add column if not exists truck_id         uuid references public.trucks(id) on delete set null,
  add column if not exists trailer_id       uuid references public.trailers(id) on delete set null,
  add column if not exists driver_id        uuid references public.drivers(id) on delete set null,
  add column if not exists driver2_id       uuid references public.drivers(id) on delete set null,
  add column if not exists start_at         timestamptz,     -- plecare din bază
  add column if not exists end_at           timestamptz,     -- întoarcere în bază
  add column if not exists km_start         int,
  add column if not exists km_end           int,
  add column if not exists countries        text[] not null default '{}',
  add column if not exists allocation_basis text check (allocation_basis in ('ldm', 'weight', 'pallets', 'revenue'));  -- gol = setarea firmei
create index if not exists trips_truck_idx  on public.trips (truck_id);
create index if not exists trips_driver_idx on public.trips (driver_id);
create index if not exists trips_start_idx  on public.trips (start_at);

-- ---------------------------------------------------------------------
-- 6) Comenzi client: mai multe pe cursă; primită / emisă; stare; curs valutar
-- ---------------------------------------------------------------------
drop index if exists public.client_orders_trip_uq;
drop trigger if exists lock_cc_trip on public.client_orders;

alter table public.client_orders
  add column if not exists direction text not null default 'received' check (direction in ('received', 'issued')),
  add column if not exists status    text not null default 'Confirmată'
    check (status in ('Ciornă', 'Trimisă', 'Confirmată', 'Semnată', 'Executată', 'Anulată')),
  add column if not exists fx_rate   numeric(10,4);   -- RON pentru 1 EUR, la data comenzii (pentru moneda de raportare)

-- ---------------------------------------------------------------------
-- 7) Comenzi de transport (CT): mai multe pe cursă; legate de mărfurile pe care le duc (distribuție)
-- ---------------------------------------------------------------------
drop index if exists public.transport_orders_trip_active_uq;

create table if not exists public.transport_order_goods (
  id                 uuid primary key default gen_random_uuid(),
  transport_order_id uuid not null references public.transport_orders(id) on delete cascade,
  client_order_id    uuid not null references public.client_orders(id) on delete cascade,
  created_at         timestamptz not null default now(),
  unique (transport_order_id, client_order_id)
);
create index if not exists transport_order_goods_cc_idx on public.transport_order_goods (client_order_id);

alter table public.transport_orders
  add column if not exists purpose text not null default 'distribution' check (purpose in ('distribution', 'subcontracted_trip')),
  add column if not exists fx_rate numeric(10,4);   -- RON pentru 1 EUR, la data comenzii (pentru moneda de raportare)
-- CT-urile existente legate de o cursă erau subcontractări de cursă
update public.transport_orders set purpose = 'subcontracted_trip' where trip_id is not null and purpose = 'distribution';

-- ---------------------------------------------------------------------
-- 8) updated_at, jurnal, RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['trailers', 'drivers', 'driver_pay', 'per_diem_rates']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['trailers', 'drivers', 'driver_pay', 'per_diem_rates', 'transport_order_goods']
  loop
    execute format('drop trigger if exists trg_log_change on public.%I', t);
    execute format('create trigger trg_log_change after insert or update or delete on public.%I for each row execute function public.log_change()', t);
  end loop;
  foreach t in array array['trailers', 'drivers', 'per_diem_rates', 'transport_order_goods']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "app users full access" on public.%I', t);
    execute format('create policy "app users full access" on public.%I for all to authenticated using (public.is_app_user()) with check (public.is_app_user())', t);
  end loop;
end $$;

-- Salariile: doar cine are voie (patron; contabil dacă e permis). Dispecerul nu vede nici rândurile.
alter table public.driver_pay enable row level security;
drop policy if exists "payroll access" on public.driver_pay;
create policy "payroll access" on public.driver_pay
  for all to authenticated using (public.can_see_payroll()) with check (public.can_see_payroll());

notify pgrst, 'reload schema';

insert into public.schema_version (version, name) values (3, '0003_flota_curse');
