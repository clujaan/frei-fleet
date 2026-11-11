-- 0004: Costurile flotei (Etapa 4): costuri directe (card combustibil, taxe de drum, cheltuieli șofer, service...),
--       rezervorul bazei (intrări/ieșiri, cost mediu ponderat), costuri fixe pe camion/remorcă, salarii pe lună.
-- Aditivă: doar tabele noi. Calculele (alocare pe cursă, cost mediu, profit) sunt în src/lib/fleetCosts.js.
-- Decizii: docs/DECIZII-grupaj-ltl.md („Plan extins").

-- ---------------------------------------------------------------------
-- 1) Costuri directe ale flotei (un rând = un bon / o tranzacție)
-- alloc_mode: auto  = se leagă singur de cursa camionului dacă data e între plecare și întoarcere
--             trip  = legat manual de cursa trip_id
--             truck = cost al camionului pe lună (nu ține de o cursă; ex. service, anvelope)
-- ---------------------------------------------------------------------
create sequence if not exists public.seq_fleet_costs;
create table if not exists public.costs (
  id            uuid primary key default gen_random_uuid(),
  code          text not null default ('CO-' || lpad(nextval('public.seq_fleet_costs')::text, 4, '0')),
  occurred_at   timestamptz not null default now(),
  category      text not null default 'other'
                check (category in ('fuel_card', 'toll', 'driver_expense', 'per_diem', 'service', 'tires', 'parking', 'fine', 'other')),
  paid_by       text not null default 'company' check (paid_by in ('company', 'driver')),
  vendor        text,
  doc_no        text,
  amount        numeric not null check (amount >= 0),          -- fără TVA deductibil (ce intră în cost)
  vat_amount    numeric not null default 0,
  currency      text not null default 'EUR' check (currency in ('RON', 'EUR')),
  fx_rate       numeric,                                       -- RON pentru 1 EUR, la data documentului
  truck_id      uuid references public.trucks(id) on delete set null,
  driver_id     uuid references public.drivers(id) on delete set null,
  trip_id       uuid references public.trips(id) on delete set null,
  alloc_mode    text not null default 'auto' check (alloc_mode in ('auto', 'trip', 'truck')),
  country       text,
  liters        numeric,
  odometer      integer,
  source        text not null default 'manual' check (source in ('manual', 'import', 'decont')),
  import_key    text,                                          -- amprenta rândului importat (să nu se importe de două ori)
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists costs_truck_time_idx on public.costs (truck_id, occurred_at);
create index if not exists costs_trip_idx on public.costs (trip_id);
create unique index if not exists costs_import_key_uq on public.costs (import_key) where import_key is not null;

-- ---------------------------------------------------------------------
-- 2) Rezervorul bazei: intrări (cumpărări) și ieșiri (alimentări camioane)
-- ---------------------------------------------------------------------
create sequence if not exists public.seq_fuel_moves;
create table if not exists public.fuel_stock_movements (
  id            uuid primary key default gen_random_uuid(),
  code          text not null default ('RZ-' || lpad(nextval('public.seq_fuel_moves')::text, 4, '0')),
  moved_at      timestamptz not null default now(),
  kind          text not null check (kind in ('in', 'out')),
  liters        numeric not null check (liters > 0),
  unit_price    numeric,                                       -- doar la intrare, fără TVA, în `currency`
  currency      text not null default 'RON' check (currency in ('RON', 'EUR')),
  fx_rate       numeric,
  vendor        text,
  doc_no        text,
  truck_id      uuid references public.trucks(id) on delete set null,   -- doar la ieșire
  odometer      integer,
  trip_id       uuid references public.trips(id) on delete set null,
  alloc_mode    text not null default 'auto' check (alloc_mode in ('auto', 'trip', 'truck')),
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (kind = 'out' or unit_price is not null)
);
create index if not exists fuel_moves_time_idx on public.fuel_stock_movements (moved_at);

-- ---------------------------------------------------------------------
-- 3) Costuri fixe lunare pe camion sau remorcă (leasing, asigurări, impozit...)
-- ---------------------------------------------------------------------
create sequence if not exists public.seq_fixed_costs;
create table if not exists public.fixed_costs (
  id            uuid primary key default gen_random_uuid(),
  code          text not null default ('CF-' || lpad(nextval('public.seq_fixed_costs')::text, 3, '0')),
  truck_id      uuid references public.trucks(id) on delete cascade,
  trailer_id    uuid references public.trailers(id) on delete cascade,
  kind          text not null default 'Altele'
                check (kind in ('Leasing', 'Rată credit', 'RCA', 'CASCO', 'Asigurare CMR', 'Impozit', 'Rovinietă / vinietă', 'ITP', 'Revizie planificată', 'GPS / telematică', 'Altele')),
  amount_month  numeric not null check (amount_month >= 0),
  currency      text not null default 'EUR' check (currency in ('RON', 'EUR')),
  fx_rate       numeric,
  valid_from    date not null default current_date,
  valid_to      date,
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (truck_id is not null or trailer_id is not null),
  check (valid_to is null or valid_to >= valid_from)
);

-- ---------------------------------------------------------------------
-- 4) Salarii pe lună (suprascriu valoarea din driver_pay pentru luna respectivă). Protejate ca driver_pay.
-- ---------------------------------------------------------------------
create table if not exists public.payroll_months (
  id            uuid primary key default gen_random_uuid(),
  driver_id     uuid not null references public.drivers(id) on delete cascade,
  month         date not null check (extract(day from month) = 1),  -- prima zi a lunii
  gross         numeric,
  employer_taxes numeric,
  bonus         numeric,
  total_cost    numeric,                                       -- dacă e completat, câștigă
  currency      text not null default 'RON' check (currency in ('RON', 'EUR')),
  fx_rate       numeric,
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (driver_id, month)
);

-- ---------------------------------------------------------------------
-- 5) updated_at, jurnal, RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['costs', 'fuel_stock_movements', 'fixed_costs', 'payroll_months']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('drop trigger if exists trg_log_change on public.%I', t);
    execute format('create trigger trg_log_change after insert or update or delete on public.%I for each row execute function public.log_change()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['costs', 'fuel_stock_movements', 'fixed_costs']
  loop
    execute format('drop policy if exists "app users full access" on public.%I', t);
    execute format('create policy "app users full access" on public.%I for all to authenticated using (public.is_app_user()) with check (public.is_app_user())', t);
  end loop;
end $$;

drop policy if exists "payroll access" on public.payroll_months;
create policy "payroll access" on public.payroll_months
  for all to authenticated using (public.can_see_payroll()) with check (public.can_see_payroll());

notify pgrst, 'reload schema';

insert into public.schema_version (version, name) values (4, '0004_costuri_combustibil');
