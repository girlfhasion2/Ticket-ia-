-- =====================================================================
-- Ticket-ia: buzón de avisos con leído / no leído
--
-- Los avisos se guardan en la base de datos y los crean las propias funciones
-- (solicitudes, vincular, pagos, recordatorios). Requiere las migraciones
-- 001, 003 y 004. Ejecutar completo, una sola vez, en Supabase > SQL Editor.
--
-- Tipos: friend_request, friend_accepted, added_to_ticket, member_joined,
--        payment_sent, payment_confirmed, payment_reopened, payment_reminder
-- "resolved" solo lo usan los avisos con acciones (friend_request, payment_sent).
-- =====================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  ticket_id text,
  data jsonb not null default '{}'::jsonb,
  resolved text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
-- Sin políticas: solo se accede mediante las funciones de abajo.

-- ---------- Auxiliares internas (no se exponen) ----------
create or replace function public._notify(p_user uuid, p_type text, p_actor uuid, p_ticket text, p_data jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, actor_id, ticket_id, data)
  values (p_user, p_type, p_actor, p_ticket, coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public._ticket_merchant(p_ticket text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((t.data::jsonb) ->> 'merchant', 'Ticket sin nombre')
  from public.tickets t where t.id::text = p_ticket;
$$;

-- Cierra los avisos con acciones de un tipo concreto y los marca como leídos.
create or replace function public._resolve_notifications(p_user uuid, p_type text, p_actor uuid, p_ticket text, p_resolution text)
returns void language sql security definer set search_path = public as $$
  update public.notifications
  set resolved = p_resolution, read_at = coalesce(read_at, now())
  where user_id = p_user and type = p_type and resolved is null
    and (p_actor is null or actor_id = p_actor)
    and (p_ticket is null or ticket_id = p_ticket);
$$;

-- Al borrar un ticket también se borran sus avisos.
create or replace function public.cleanup_ticket_sharing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.ticket_members where ticket_id = old.id::text;
  delete from public.ticket_invites where ticket_id = old.id::text;
  delete from public.ticket_payments where ticket_id = old.id::text;
  delete from public.notifications where ticket_id = old.id::text;
  return old;
end $$;

revoke all on function public.cleanup_ticket_sharing() from public, anon, authenticated;

-- =====================================================================
-- Funciones existentes, ahora con avisos
-- =====================================================================

-- ---------- Amistades ----------
create or replace function public.send_friend_request(p_email text default null, p_code text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  target uuid;
  rel public.friendships;
  new_id uuid;
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
      perform public._resolve_notifications(me, 'friend_request', rel.requester_id, null, 'accepted');
      perform public._notify(rel.requester_id, 'friend_accepted', me, null, '{}'::jsonb);
    end if;
    return; -- ya existe, aceptada o bloqueada: no se dice nada
  end if;

  begin
    insert into public.friendships (requester_id, addressee_id, status)
    values (me, target, 'pending')
    returning id into new_id;
    perform public._notify(target, 'friend_request', me, null, jsonb_build_object('friendship_id', new_id));
  exception when unique_violation then
    null;
  end;
end $$;

create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  req uuid;
begin
  if me is null then raise exception 'No autenticado'; end if;
  if p_accept then
    update public.friendships
    set status = 'accepted', responded_at = now()
    where id = p_id and addressee_id = me and status = 'pending'
    returning requester_id into req;
    if req is not null then
      perform public._resolve_notifications(me, 'friend_request', req, null, 'accepted');
      perform public._notify(req, 'friend_accepted', me, null, '{}'::jsonb);
    end if;
  else
    delete from public.friendships
    where id = p_id and addressee_id = me and status = 'pending'
    returning requester_id into req;
    if req is not null then
      perform public._resolve_notifications(me, 'friend_request', req, null, 'rejected');
    end if;
  end if;
end $$;

-- ---------- Compartir ----------
create or replace function public.link_ticket_member(p_ticket text, p_user uuid, p_participant text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  existed boolean;
  prev text;
begin
  if me is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_owner(p_ticket) then
    raise exception 'No se encontró el ticket. Si es nuevo, haz algún cambio para guardarlo y vuelve a intentarlo.';
  end if;
  if p_user = me then raise exception 'Ya eres el propietario de este ticket.'; end if;

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

  select m.participant_id into prev
  from public.ticket_members m where m.ticket_id = p_ticket and m.user_id = p_user;
  existed := found;

  begin
    insert into public.ticket_members (ticket_id, user_id, participant_id)
    values (p_ticket, p_user, p_participant)
    on conflict (ticket_id, user_id) do update set participant_id = excluded.participant_id;
  exception when unique_violation then
    raise exception 'Ese nombre ya está vinculado a otra persona.';
  end;

  if not existed or (p_participant is not null and prev is distinct from p_participant) then
    perform public._notify(p_user, 'added_to_ticket', me, p_ticket,
      jsonb_build_object('merchant', public._ticket_merchant(p_ticket)));
  end if;
end $$;

create or replace function public.join_ticket_via_invite(p_token text, p_participant text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.ticket_invites;
  tk public.tickets;
  existed boolean;
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

  existed := exists (
    select 1 from public.ticket_members m where m.ticket_id = inv.ticket_id and m.user_id = me
  );

  begin
    insert into public.ticket_members (ticket_id, user_id, participant_id)
    values (inv.ticket_id, me, p_participant)
    on conflict (ticket_id, user_id)
      do update set participant_id = coalesce(excluded.participant_id, public.ticket_members.participant_id);
  exception when unique_violation then
    raise exception 'Ese nombre ya lo ha elegido otra persona.';
  end;

  if not existed then
    perform public._notify(tk.user_id, 'member_joined', me, inv.ticket_id,
      jsonb_build_object('merchant', coalesce((tk.data::jsonb) ->> 'merchant', 'Ticket sin nombre')));
  end if;

  return inv.ticket_id;
end $$;

-- ---------- Pagos ----------
create or replace function public.mark_payment_sent(p_ticket text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  own_id uuid;
begin
  if me is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_member(p_ticket) then
    raise exception 'No tienes acceso a este ticket.';
  end if;
  if exists (
    select 1 from public.ticket_payments
    where ticket_id = p_ticket and user_id = me and status = 'confirmed'
  ) then
    raise exception 'Este pago ya está confirmado.';
  end if;
  insert into public.ticket_payments (ticket_id, user_id, status, updated_at)
  values (p_ticket, me, 'sent', now())
  on conflict (ticket_id, user_id)
    do update set status = 'sent', updated_at = now();

  select t.user_id into own_id from public.tickets t where t.id::text = p_ticket;
  if own_id is not null and not exists (
    select 1 from public.notifications n
    where n.user_id = own_id and n.type = 'payment_sent' and n.actor_id = me
      and n.ticket_id = p_ticket and n.resolved is null
  ) then
    perform public._notify(own_id, 'payment_sent', me, p_ticket,
      jsonb_build_object('merchant', public._ticket_merchant(p_ticket)));
  end if;
end $$;

create or replace function public.undo_payment_sent(p_ticket text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  own_id uuid;
begin
  if me is null then raise exception 'No autenticado'; end if;
  update public.ticket_payments
  set status = 'pending', updated_at = now()
  where ticket_id = p_ticket and user_id = me and status = 'sent';
  if found then
    select t.user_id into own_id from public.tickets t where t.id::text = p_ticket;
    if own_id is not null then
      perform public._resolve_notifications(own_id, 'payment_sent', me, p_ticket, 'undone');
    end if;
  end if;
end $$;

create or replace function public.confirm_payment(p_ticket text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prev text;
begin
  if me is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_owner(p_ticket) then
    raise exception 'Solo quien creó el ticket puede confirmar pagos.';
  end if;
  if not exists (
    select 1 from public.ticket_members where ticket_id = p_ticket and user_id = p_user
  ) then
    raise exception 'Esa persona no está en el ticket.';
  end if;

  select status into prev from public.ticket_payments where ticket_id = p_ticket and user_id = p_user;

  insert into public.ticket_payments (ticket_id, user_id, status, updated_at)
  values (p_ticket, p_user, 'confirmed', now())
  on conflict (ticket_id, user_id)
    do update set status = 'confirmed', updated_at = now();

  perform public._resolve_notifications(me, 'payment_sent', p_user, p_ticket, 'confirmed');
  if prev is distinct from 'confirmed' then
    perform public._notify(p_user, 'payment_confirmed', me, p_ticket,
      jsonb_build_object('merchant', public._ticket_merchant(p_ticket)));
  end if;
end $$;

create or replace function public.reopen_payment(p_ticket text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prev text;
begin
  if me is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_owner(p_ticket) then
    raise exception 'Solo quien creó el ticket puede cambiar el estado de un pago.';
  end if;

  select status into prev from public.ticket_payments where ticket_id = p_ticket and user_id = p_user;

  update public.ticket_payments
  set status = 'pending', updated_at = now()
  where ticket_id = p_ticket and user_id = p_user;

  if prev = 'sent' then
    perform public._resolve_notifications(me, 'payment_sent', p_user, p_ticket, 'rejected');
    perform public._notify(p_user, 'payment_reopened', me, p_ticket,
      jsonb_build_object('merchant', public._ticket_merchant(p_ticket)));
  end if;
end $$;

create or replace function public.remind_payment(p_ticket text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  last_at timestamptz;
  st text;
  hours_left int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_owner(p_ticket) then
    raise exception 'Solo quien creó el ticket puede enviar recordatorios.';
  end if;
  if not exists (
    select 1 from public.ticket_members where ticket_id = p_ticket and user_id = p_user
  ) then
    raise exception 'Esa persona no está en el ticket.';
  end if;

  select status, last_reminder_at into st, last_at
  from public.ticket_payments where ticket_id = p_ticket and user_id = p_user;

  if st = 'confirmed' then
    raise exception 'Ese pago ya está confirmado.';
  end if;
  if last_at is not null and last_at > now() - interval '24 hours' then
    hours_left := greatest(1, ceil(extract(epoch from (last_at + interval '24 hours' - now())) / 3600)::int);
    raise exception 'Ya enviaste un recordatorio. Podrás enviar otro en % h.', hours_left;
  end if;

  insert into public.ticket_payments (ticket_id, user_id, status, last_reminder_at, updated_at)
  values (p_ticket, p_user, 'pending', now(), now())
  on conflict (ticket_id, user_id)
    do update set last_reminder_at = now(), updated_at = now();

  perform public._notify(p_user, 'payment_reminder', auth.uid(), p_ticket,
    jsonb_build_object('merchant', public._ticket_merchant(p_ticket)));
end $$;

-- =====================================================================
-- Lectura y estado de lectura
-- =====================================================================

create or replace function public.list_notifications(p_limit int default 60)
returns table (
  id uuid, type text, actor_id uuid, actor_name text, ticket_id text,
  data jsonb, resolved text, read_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.actor_id, p.display_name, n.ticket_id,
         n.data, n.resolved, n.read_at, n.created_at
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
$$;

create or replace function public.mark_notification_read(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_id and user_id = auth.uid();
$$;

create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;

-- Lo que pide atención: avisos sin leer, y los que tienen acciones sin resolver.
create or replace function public.notification_attention_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.notifications n
  where n.user_id = auth.uid()
    and (n.read_at is null
         or (n.resolved is null and n.type in ('friend_request', 'payment_sent')));
$$;

-- =====================================================================
-- Rellenar con lo que ya está pendiente
-- =====================================================================
insert into public.notifications (user_id, type, actor_id, data, created_at)
select f.addressee_id, 'friend_request', f.requester_id,
       jsonb_build_object('friendship_id', f.id), f.created_at
from public.friendships f
where f.status = 'pending'
  and not exists (
    select 1 from public.notifications n
    where n.user_id = f.addressee_id and n.type = 'friend_request'
      and n.data ->> 'friendship_id' = f.id::text
  );

insert into public.notifications (user_id, type, actor_id, ticket_id, data, created_at)
select t.user_id, 'payment_sent', pay.user_id, pay.ticket_id,
       jsonb_build_object('merchant', coalesce((t.data::jsonb) ->> 'merchant', 'Ticket sin nombre')),
       pay.updated_at
from public.ticket_payments pay
join public.tickets t on t.id::text = pay.ticket_id
where pay.status = 'sent'
  and not exists (
    select 1 from public.notifications n
    where n.user_id = t.user_id and n.type = 'payment_sent'
      and n.actor_id = pay.user_id and n.ticket_id = pay.ticket_id and n.resolved is null
  );

-- ---------- Permisos de ejecución ----------
revoke all on function public._notify(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public._ticket_merchant(text) from public, anon, authenticated;
revoke all on function public._resolve_notifications(uuid, text, uuid, text, text) from public, anon, authenticated;

revoke all on function public.send_friend_request(text, text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.link_ticket_member(text, uuid, text) from public, anon;
revoke all on function public.join_ticket_via_invite(text, text) from public, anon;
revoke all on function public.mark_payment_sent(text) from public, anon;
revoke all on function public.undo_payment_sent(text) from public, anon;
revoke all on function public.confirm_payment(text, uuid) from public, anon;
revoke all on function public.reopen_payment(text, uuid) from public, anon;
revoke all on function public.remind_payment(text, uuid) from public, anon;
revoke all on function public.list_notifications(int) from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
revoke all on function public.notification_attention_count() from public, anon;

grant execute on function public.send_friend_request(text, text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.link_ticket_member(text, uuid, text) to authenticated;
grant execute on function public.join_ticket_via_invite(text, text) to authenticated;
grant execute on function public.mark_payment_sent(text) to authenticated;
grant execute on function public.undo_payment_sent(text) to authenticated;
grant execute on function public.confirm_payment(text, uuid) to authenticated;
grant execute on function public.reopen_payment(text, uuid) to authenticated;
grant execute on function public.remind_payment(text, uuid) to authenticated;
grant execute on function public.list_notifications(int) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.notification_attention_count() to authenticated;

-- ---------- Deshacer (las funciones vuelven a su versión anterior ejecutando de nuevo 001, 003 y 004) ----------
-- drop function if exists public.notification_attention_count(), public.mark_all_notifications_read(),
--   public.mark_notification_read(uuid), public.list_notifications(int),
--   public._resolve_notifications(uuid, text, uuid, text, text), public._ticket_merchant(text),
--   public._notify(uuid, text, uuid, text, jsonb);
-- drop table if exists public.notifications;
