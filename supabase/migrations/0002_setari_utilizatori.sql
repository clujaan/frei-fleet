-- 0002: Utilizatori și roluri gestionate din aplicație (doar patronul).
-- Aditivă: nu modifică nimic din 0001, doar adaugă funcții.
--
-- Conturile de autentificare se creează manual în Supabase (Authentication -> Users).
-- Apoi patronul le „trece" în aplicație cu add_app_user(email, nume, rol).

-- 1) Lista completă a utilizatorilor (inclusiv cei dezactivați) — doar patron
create or replace function public.list_users()
returns table (user_id uuid, full_name text, email text, role text, active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'not allowed'; end if;
  return query
    select a.user_id, a.full_name, coalesce(a.email, u.email::text), a.role, a.active, a.created_at
    from public.app_users a
    left join auth.users u on u.id = a.user_id
    order by a.active desc, a.full_name nulls last;
end;
$$;

-- 2) Adaugă în aplicație un cont deja creat în Supabase Auth
create or replace function public.add_app_user(p_email text, p_full_name text, p_role text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  mail text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_app_admin() then raise exception 'not allowed'; end if;
  if p_role not in ('owner', 'dispatcher', 'accountant') then raise exception 'invalid role'; end if;
  if mail = '' then raise exception 'email required'; end if;
  select id into uid from auth.users where lower(email::text) = mail limit 1;
  if uid is null then raise exception 'no auth account for this email'; end if;
  insert into public.app_users (user_id, role, full_name, email, active)
  values (uid, p_role, nullif(btrim(coalesce(p_full_name, '')), ''), mail, true)
  on conflict (user_id) do update
    set role = excluded.role,
        full_name = coalesce(excluded.full_name, public.app_users.full_name),
        email = excluded.email,
        active = true;
  return uid;
end;
$$;

-- 3) Modifică numele / rolul / starea unui utilizator.
--    Aplicația nu poate rămâne fără niciun patron activ.
create or replace function public.update_app_user(p_user_id uuid, p_full_name text, p_role text, p_active boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  other_owners int;
begin
  if not public.is_app_admin() then raise exception 'not allowed'; end if;
  if p_role not in ('owner', 'dispatcher', 'accountant') then raise exception 'invalid role'; end if;
  if not exists (select 1 from public.app_users where user_id = p_user_id) then raise exception 'unknown user'; end if;
  select count(*) into other_owners from public.app_users
    where user_id <> p_user_id and active and role = 'owner';
  if other_owners = 0 and not (p_role = 'owner' and coalesce(p_active, true)) then
    raise exception 'last owner';
  end if;
  update public.app_users
     set full_name = nullif(btrim(coalesce(p_full_name, '')), ''),
         role = p_role,
         active = coalesce(p_active, true)
   where user_id = p_user_id;
end;
$$;

revoke execute on function public.list_users() from anon, public;
revoke execute on function public.add_app_user(text, text, text) from anon, public;
revoke execute on function public.update_app_user(uuid, text, text, boolean) from anon, public;
grant execute on function public.list_users() to authenticated;
grant execute on function public.add_app_user(text, text, text) to authenticated;
grant execute on function public.update_app_user(uuid, text, text, boolean) to authenticated;

insert into public.schema_version (version, name) values (2, '0002_setari_utilizatori');
