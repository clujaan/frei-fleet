-- 0005: Tabla flotei + găsirea returului (Etapa 4b).
-- Aditivă: două coloane noi pe curse. Calculele (retur lipsă, oferte potrivite, km goi) sunt în src/lib/fleetBoard.js.
--   km_empty      = km fără marfă pe cursă (trecuți de dispecer); intră în „% km goi" pe camion și lună
--   no_return_ok  = camionul se întoarce intenționat gol: cursa nu mai apare ca „fără retur"

alter table public.trips add column if not exists km_empty integer check (km_empty is null or km_empty >= 0);
alter table public.trips add column if not exists no_return_ok boolean not null default false;

notify pgrst, 'reload schema';

insert into public.schema_version (version, name) values (5, '0005_tabla_flotei');
