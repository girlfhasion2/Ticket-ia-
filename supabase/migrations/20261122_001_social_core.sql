-- =====================================================================
-- Ticket-ia: núcleo social (versión 1)
-- Perfiles, amistades por código o correo, apodos privados.
-- NO modifica las tablas existentes (tickets, categories).
-- Ejecutar completo, una sola vez, en Supabase > SQL Editor.
-- =====================================================================

-- ---------- Perfiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  friend_code text not null unique,
  discoverable_by_email boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- El usuario solo puede cambiar estas dos columnas (no friend_code ni id).
revoke update on public.profiles from authenticated;
grant update (display_name, discoverable_by_email) on public.profiles to authenticated;

-- ---------- Generador de código de amigo ----------
create or replace function public.generate_friend_code()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end $$;

-- ---------- Perfil automático al registrarse ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, friend_code)
  values (
    new.id,
    left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'Usuario'), 40),
    public.generate_friend_code()
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles para las cuentas que ya existen
do $$
declare u record;
begin
  for u in select id, email from auth.users loop
    insert into public.profiles (id, display_name, friend_code)
    values (
      u.id,
      left(coalesce(nullif(split_part(u.email, '@', 1), ''), 'Usuario'), 40),
      public.generate_friend_code()
    )
    on conflict (id) do nothing;
  end loop;
end $$;

-- ---------- Amistades ----------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- Una sola relación por pareja, sin importar quién la inició
create unique index if not exists friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

drop policy if exists friendships_select_own on public.friendships;
create policy friendships_select_own on public.friendships
  for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
-- Sin políticas de insert/update/delete: todo cambio pasa por las funciones de abajo.

-- ---------- Apodos privados ----------
create table if not exists public.friend_aliases (
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 40),
  primary key (owner_id, friend_id)
);

alter table public.friend_aliases enable row level security;

drop policy if exists aliases_select_own on public.friend_aliases;
create policy aliases_select_own on public.friend_aliases
  for select to authenticated using (owner_id = auth.uid());
-- Cambios solo mediante set_friend_alias.

-- ---------- Registro de intentos (límite de frecuencia) ----------
create table if not exists public.friend_request_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists friend_request_attempts_user_idx
  on public.friend_request_attempts (user_id, created_at);

alter table public.friend_request_attempts enable row level security;
-- Sin políticas: solo accesible desde las funciones.

-- =====================================================================
-- Funciones (todas security definer; solo para usuarios con sesión)
-- =====================================================================

-- Enviar solicitud por código o por correo.
-- Responde siempre igual exista o no la cuenta, para no revelar quién tiene cuenta.
create or replace function public.send_friend_request(p_email text default null, p_code text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  target uuid;
  rel public.friendships;
begin
  if me is null then raise exception 'No autenticado'; end if;

  delete from public.friend_request_attempts where created_at < now() - interval '1 day';
  if (select count(*) from public.friend_request_attempts
      where user_id = me and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Demasiados intentos. Inténtalo de nuevo más tarde.';
  end if;
  insert into public.friend_request_attempts (user_id) values (me);

  if nullif(trim(coalesce(p_code, '')), '') is not null then
    select id into target from public.profiles
    where friend_code = upper(trim(p_code));
  elsif nullif(trim(coalesce(p_email, '')), '') is not null then
    select u.id into target
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(p_email))
      and u.email_confirmed_at is not null
      and p.discoverable_by_email;
  end if;

  if target is null or target = me then return; end if;

  select * into rel from public.friendships
  where least(requester_id, addressee_id) = least(me, target)
    and greatest(requester_id, addressee_id) = greatest(me, target);

  if found then
    -- Si la otra persona ya me había enviado solicitud, se acepta directamente.
    if rel.status = 'pending' and rel.addressee_id = me then
      update public.friendships
      set status = 'accepted', responded_at = now()
      where id = rel.id;
    end if;
    return; -- ya existe, aceptada o bloqueada: no se dice nada
  end if;

  begin
    insert into public.friendships (requester_id, addressee_id, status)
    values (me, target, 'pending');
  exception when unique_violation then
    null;
  end;
end $$;

-- Aceptar o rechazar una solicitud recibida
create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'No autenticado'; end if;
  if p_accept then
    update public.friendships
    set status = 'accepted', responded_at = now()
    where id = p_id and addressee_id = me and status = 'pending';
  else
    delete from public.friendships
    where id = p_id and addressee_id = me and status = 'pending';
  end if;
end $$;

-- Eliminar amistad (borra también mi apodo)
create or replace function public.remove_friend(p_friend uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'No autenticado'; end if;
  delete from public.friendships
  where status = 'accepted'
    and ((requester_id = me and addressee_id = p_friend)
      or (requester_id = p_friend and addressee_id = me));
  delete from public.friend_aliases where owner_id = me and friend_id = p_friend;
end $$;

-- Bloquear: borra cualquier relación previa y deja constancia del bloqueo
create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'No autenticado'; end if;
  if p_user = me then return; end if;
  delete from public.friendships
  where (requester_id = me and addressee_id = p_user)
     or (requester_id = p_user and addressee_id = me);
  delete from public.friend_aliases where owner_id = me and friend_id = p_user;
  insert into public.friendships (requester_id, addressee_id, status, responded_at)
  values (me, p_user, 'blocked', now());
end $$;

create or replace function public.unblock_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'No autenticado'; end if;
  delete from public.friendships
  where requester_id = me and addressee_id = p_user and status = 'blocked';
end $$;

-- Poner, cambiar o quitar el apodo de un amigo (texto vacío = quitar)
create or replace function public.set_friend_alias(p_friend uuid, p_alias text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  clean text := trim(coalesce(p_alias, ''));
begin
  if me is null then raise exception 'No autenticado'; end if;
  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = me and addressee_id = p_friend)
        or (requester_id = p_friend and addressee_id = me))
  ) then
    raise exception 'Solo puedes poner apodo a tus amigos.';
  end if;
  if clean = '' then
    delete from public.friend_aliases where owner_id = me and friend_id = p_friend;
  else
    insert into public.friend_aliases (owner_id, friend_id, alias)
    values (me, p_friend, left(clean, 40))
    on conflict (owner_id, friend_id) do update set alias = excluded.alias;
  end if;
end $$;

-- Mis amigos, con mi apodo si lo he puesto
create or replace function public.list_friends()
returns table (friend_id uuid, display_name text, alias text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, a.alias, f.responded_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  left join public.friend_aliases a
    on a.owner_id = auth.uid() and a.friend_id = p.id
  where f.status = 'accepted'
    and auth.uid() in (f.requester_id, f.addressee_id)
  order by coalesce(a.alias, p.display_name);
$$;

-- Solicitudes pendientes. De las recibidas se ve el nombre; de las enviadas, no.
create or replace function public.list_friend_requests()
returns table (id uuid, direction text, other_id uuid, display_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id,
         case when f.addressee_id = auth.uid() then 'incoming' else 'outgoing' end,
         case when f.addressee_id = auth.uid() then f.requester_id else f.addressee_id end,
         case when f.addressee_id = auth.uid() then p.display_name else null end,
         f.created_at
  from public.friendships f
  left join public.profiles p on p.id = f.requester_id
  where f.status = 'pending'
    and auth.uid() in (f.requester_id, f.addressee_id)
  order by f.created_at desc;
$$;

-- ---------- Permisos de ejecución: solo usuarios con sesión ----------
revoke all on function public.generate_friend_code() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.send_friend_request(text, text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.set_friend_alias(uuid, text) from public, anon;
revoke all on function public.list_friends() from public, anon;
revoke all on function public.list_friend_requests() from public, anon;

grant execute on function public.send_friend_request(text, text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.set_friend_alias(uuid, text) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.list_friend_requests() to authenticated;

-- ---------- Deshacer (solo si hiciera falta, en este orden) ----------
-- drop function if exists public.list_friend_requests(), public.list_friends(),
--   public.set_friend_alias(uuid, text), public.unblock_user(uuid), public.block_user(uuid),
--   public.remove_friend(uuid), public.respond_friend_request(uuid, boolean),
--   public.send_friend_request(text, text);
-- drop table if exists public.friend_request_attempts, public.friend_aliases, public.friendships;
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_user(), public.generate_friend_code();
-- drop table if exists public.profiles;
