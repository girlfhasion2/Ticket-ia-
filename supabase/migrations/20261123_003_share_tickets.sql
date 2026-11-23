-- =====================================================================
-- Ticket-ia: compartir tickets (versión 1, solo lectura para invitados)
--
-- NO modifica las reglas de seguridad de la tabla tickets: los invitados
-- nunca leen esa tabla directamente. Leen a través de funciones que
-- comprueban la pertenencia y devuelven el ticket SIN la imagen.
-- Solo el propietario (tickets.user_id) puede editar un ticket.
-- Ejecutar completo, una sola vez, en Supabase > SQL Editor.
-- =====================================================================

-- ---------- Miembros de un ticket (todos menos el propietario) ----------
-- ticket_id es text a propósito: así no depende del tipo de tickets.id.
create table if not exists public.ticket_members (
  ticket_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_id text,
  joined_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

-- Un nombre del ticket solo puede estar vinculado a una persona.
create unique index if not exists ticket_members_participant_unique
  on public.ticket_members (ticket_id, participant_id)
  where participant_id is not null;

create index if not exists ticket_members_user_idx on public.ticket_members (user_id);

alter table public.ticket_members enable row level security;
-- Sin políticas: nadie accede directamente, solo las funciones de abajo.

-- ---------- Enlaces de invitación ----------
create table if not exists public.ticket_invites (
  token text primary key,
  ticket_id text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ticket_invites_ticket_idx on public.ticket_invites (ticket_id);

alter table public.ticket_invites enable row level security;
-- Sin políticas, igual que arriba.

-- ---------- Limpieza al borrar un ticket ----------
create or replace function public.cleanup_ticket_sharing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.ticket_members where ticket_id = old.id::text;
  delete from public.ticket_invites where ticket_id = old.id::text;
  return old;
end $$;

drop trigger if exists tickets_cleanup_sharing on public.tickets;
create trigger tickets_cleanup_sharing
  after delete on public.tickets
  for each row execute function public.cleanup_ticket_sharing();

-- =====================================================================
-- Funciones auxiliares (no se exponen)
-- =====================================================================

create or replace function public.is_ticket_owner(p_ticket text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tickets t
    where t.id::text = p_ticket and t.user_id = auth.uid()
  );
$$;

create or replace function public.is_ticket_member(p_ticket text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ticket_members m
    where m.ticket_id = p_ticket and m.user_id = auth.uid()
  );
$$;

create or replace function public.ticket_has_participant(p_ticket text, p_participant text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.tickets t,
         jsonb_array_elements(coalesce((t.data::jsonb) -> 'participants', '[]'::jsonb)) p
    where t.id::text = p_ticket and p ->> 'id' = p_participant
  );
$$;

-- =====================================================================
-- Gestión por el propietario
-- =====================================================================

-- Vincular (o cambiar el nombre vinculado de) un amigo a un ticket.
-- p_participant null = tiene acceso pero sin nombre elegido.
create or replace function public.link_ticket_member(p_ticket text, p_user uuid, p_participant text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_owner(p_ticket) then
    raise exception 'No se encontró el ticket. Si es nuevo, haz algún cambio para guardarlo y vuelve a intentarlo.';
  end if;
  if p_user = me then raise exception 'Ya eres el propietario de este ticket.'; end if;

  -- Debe ser amigo aceptado, o ya ser miembro (por enlace).
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = me and f.addressee_id = p_user)
        or (f.requester_id = p_user and f.addressee_id = me))
  ) and not exists (
    select 1 from public.ticket_members m where m.ticket_id = p_ticket and m.user_id = p_user
  ) then
    raise exception 'Solo puedes vincular a tus amigos.';
  end if;

  if p_participant is not null and not public.ticket_has_participant(p_ticket, p_participant) then
    raise exception 'Ese nombre ya no está en el ticket.';
  end if;

  begin
    insert into public.ticket_members (ticket_id, user_id, participant_id)
    values (p_ticket, p_user, p_participant)
    on conflict (ticket_id, user_id) do update set participant_id = excluded.participant_id;
  exception when unique_violation then
    raise exception 'Ese nombre ya está vinculado a otra persona.';
  end;
end $$;

-- El propietario echa a cualquiera; cualquiera puede salirse él mismo.
create or replace function public.remove_ticket_member(p_ticket text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'No autenticado'; end if;
  if p_user <> me and not public.is_ticket_owner(p_ticket) then
    raise exception 'No tienes permiso para quitar a esa persona.';
  end if;
  delete from public.ticket_members where ticket_id = p_ticket and user_id = p_user;
end $$;

-- Miembros del ticket (lo ven el propietario y los propios miembros).
create or replace function public.list_ticket_members(p_ticket text)
returns table (user_id uuid, display_name text, participant_id text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not (public.is_ticket_owner(p_ticket) or public.is_ticket_member(p_ticket)) then
    raise exception 'No tienes acceso a este ticket.';
  end if;
  return query
    select m.user_id, p.display_name, m.participant_id, m.joined_at
    from public.ticket_members m
    join public.profiles p on p.id = m.user_id
    where m.ticket_id = p_ticket
    order by m.joined_at;
end $$;

-- ---------- Enlace de invitación ----------
-- Devuelve el enlace activo; si no hay, crea uno nuevo.
create or replace function public.create_ticket_invite(p_ticket text, p_days int default 14)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tok text;
begin
  if me is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_owner(p_ticket) then
    raise exception 'No se encontró el ticket. Si es nuevo, haz algún cambio para guardarlo y vuelve a intentarlo.';
  end if;

  select i.token into tok
  from public.ticket_invites i
  where i.ticket_id = p_ticket and not i.revoked and i.expires_at > now()
  order by i.created_at desc limit 1;
  if tok is not null then return tok; end if;

  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.ticket_invites (token, ticket_id, created_by, expires_at)
  values (tok, p_ticket, me, now() + make_interval(days => greatest(1, least(p_days, 60))));
  return tok;
end $$;

create or replace function public.get_active_ticket_invite(p_ticket text)
returns text language plpgsql stable security definer set search_path = public as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_owner(p_ticket) then return null; end if;
  select i.token into tok
  from public.ticket_invites i
  where i.ticket_id = p_ticket and not i.revoked and i.expires_at > now()
  order by i.created_at desc limit 1;
  return tok;
end $$;

create or replace function public.revoke_ticket_invites(p_ticket text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_owner(p_ticket) then
    raise exception 'No tienes permiso sobre este ticket.';
  end if;
  update public.ticket_invites set revoked = true where ticket_id = p_ticket and not revoked;
end $$;

-- =====================================================================
-- Lado del invitado
-- =====================================================================

-- Vista previa antes de unirse: solo lo imprescindible.
create or replace function public.get_invite_preview(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.ticket_invites;
  tk public.tickets;
  owner_name text;
  parts jsonb;
begin
  if me is null then raise exception 'No autenticado'; end if;

  select * into inv from public.ticket_invites
  where token = p_token and not revoked and expires_at > now();
  if not found then raise exception 'Este enlace no es válido o ha caducado.'; end if;

  select * into tk from public.tickets where id::text = inv.ticket_id;
  if not found then raise exception 'Este enlace no es válido o ha caducado.'; end if;

  select display_name into owner_name from public.profiles where id = tk.user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p ->> 'id',
           'name', p ->> 'name',
           'taken', exists (
             select 1 from public.ticket_members m
             where m.ticket_id = inv.ticket_id and m.participant_id = p ->> 'id'
           )
         )), '[]'::jsonb)
  into parts
  from jsonb_array_elements(coalesce((tk.data::jsonb) -> 'participants', '[]'::jsonb)) p;

  return jsonb_build_object(
    'ticket_id', inv.ticket_id,
    'merchant', (tk.data::jsonb) ->> 'merchant',
    'date', (tk.data::jsonb) ->> 'date',
    'owner_name', coalesce(owner_name, 'Alguien'),
    'is_owner', tk.user_id = me,
    'already_member', public.is_ticket_member(inv.ticket_id),
    'participants', parts
  );
end $$;

create or replace function public.join_ticket_via_invite(p_token text, p_participant text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.ticket_invites;
  tk public.tickets;
begin
  if me is null then raise exception 'No autenticado'; end if;

  select * into inv from public.ticket_invites
  where token = p_token and not revoked and expires_at > now();
  if not found then raise exception 'Este enlace no es válido o ha caducado.'; end if;

  select * into tk from public.tickets where id::text = inv.ticket_id;
  if not found then raise exception 'Este enlace no es válido o ha caducado.'; end if;

  if tk.user_id = me then return inv.ticket_id; end if;

  if p_participant is not null and not public.ticket_has_participant(inv.ticket_id, p_participant) then
    raise exception 'Ese nombre ya no está en el ticket.';
  end if;

  begin
    insert into public.ticket_members (ticket_id, user_id, participant_id)
    values (inv.ticket_id, me, p_participant)
    on conflict (ticket_id, user_id)
      do update set participant_id = coalesce(excluded.participant_id, public.ticket_members.participant_id);
  exception when unique_violation then
    raise exception 'Ese nombre ya lo ha elegido otra persona.';
  end;

  return inv.ticket_id;
end $$;

-- Tickets que otros han compartido conmigo (sin la imagen del ticket).
create or replace function public.list_shared_tickets()
returns table (ticket_id text, owner_name text, my_participant_id text, data jsonb)
language sql stable security definer set search_path = public as $$
  select t.id::text, coalesce(p.display_name, 'Alguien'), m.participant_id, ((t.data::jsonb) - 'imageBase64')
  from public.ticket_members m
  join public.tickets t on t.id::text = m.ticket_id
  left join public.profiles p on p.id = t.user_id
  where m.user_id = auth.uid()
  order by coalesce((t.data::jsonb) ->> 'date', '') desc;
$$;

create or replace function public.get_shared_ticket(p_ticket text)
returns table (ticket_id text, owner_name text, my_participant_id text, data jsonb)
language sql stable security definer set search_path = public as $$
  select t.id::text, coalesce(p.display_name, 'Alguien'), m.participant_id, ((t.data::jsonb) - 'imageBase64')
  from public.ticket_members m
  join public.tickets t on t.id::text = m.ticket_id
  left join public.profiles p on p.id = t.user_id
  where m.user_id = auth.uid() and m.ticket_id = p_ticket;
$$;

-- =====================================================================
-- Permisos de ejecución: solo usuarios con sesión
-- =====================================================================
revoke all on function public.cleanup_ticket_sharing() from public, anon, authenticated;
revoke all on function public.is_ticket_owner(text) from public, anon, authenticated;
revoke all on function public.is_ticket_member(text) from public, anon, authenticated;
revoke all on function public.ticket_has_participant(text, text) from public, anon, authenticated;

revoke all on function public.link_ticket_member(text, uuid, text) from public, anon;
revoke all on function public.remove_ticket_member(text, uuid) from public, anon;
revoke all on function public.list_ticket_members(text) from public, anon;
revoke all on function public.create_ticket_invite(text, int) from public, anon;
revoke all on function public.get_active_ticket_invite(text) from public, anon;
revoke all on function public.revoke_ticket_invites(text) from public, anon;
revoke all on function public.get_invite_preview(text) from public, anon;
revoke all on function public.join_ticket_via_invite(text, text) from public, anon;
revoke all on function public.list_shared_tickets() from public, anon;
revoke all on function public.get_shared_ticket(text) from public, anon;

grant execute on function public.link_ticket_member(text, uuid, text) to authenticated;
grant execute on function public.remove_ticket_member(text, uuid) to authenticated;
grant execute on function public.list_ticket_members(text) to authenticated;
grant execute on function public.create_ticket_invite(text, int) to authenticated;
grant execute on function public.get_active_ticket_invite(text) to authenticated;
grant execute on function public.revoke_ticket_invites(text) to authenticated;
grant execute on function public.get_invite_preview(text) to authenticated;
grant execute on function public.join_ticket_via_invite(text, text) to authenticated;
grant execute on function public.list_shared_tickets() to authenticated;
grant execute on function public.get_shared_ticket(text) to authenticated;

-- ---------- Deshacer (solo si hiciera falta) ----------
-- drop trigger if exists tickets_cleanup_sharing on public.tickets;
-- drop function if exists public.get_shared_ticket(text), public.list_shared_tickets(),
--   public.join_ticket_via_invite(text, text), public.get_invite_preview(text),
--   public.revoke_ticket_invites(text), public.get_active_ticket_invite(text),
--   public.create_ticket_invite(text, int), public.list_ticket_members(text),
--   public.remove_ticket_member(text, uuid), public.link_ticket_member(text, uuid, text),
--   public.ticket_has_participant(text, text), public.is_ticket_member(text),
--   public.is_ticket_owner(text), public.cleanup_ticket_sharing();
-- drop table if exists public.ticket_invites, public.ticket_members;
