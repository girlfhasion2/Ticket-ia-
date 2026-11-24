-- =====================================================================
-- Ticket-ia: estados de pago en dos pasos y recordatorios
--
-- Supone que quien creó el ticket (propietario) es quien lo pagó, y que
-- cada miembro vinculado a un nombre le debe su parte.
--   pending   -> aún sin pagar (también si no hay fila)
--   sent      -> el deudor marca "enviado"; falta que el propietario lo confirme
--   confirmed -> el propietario confirma que lo ha recibido
-- Requiere haber ejecutado antes la migración 003.
-- Ejecutar completo, una sola vez, en Supabase > SQL Editor.
-- =====================================================================

create table if not exists public.ticket_payments (
  ticket_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'confirmed')),
  last_reminder_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

alter table public.ticket_payments enable row level security;
-- Sin políticas: solo se accede mediante las funciones de abajo.

-- Al borrar un ticket o quitar a un miembro se borra también su estado de pago.
create or replace function public.cleanup_ticket_sharing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.ticket_members where ticket_id = old.id::text;
  delete from public.ticket_invites where ticket_id = old.id::text;
  delete from public.ticket_payments where ticket_id = old.id::text;
  return old;
end $$;

create or replace function public.remove_ticket_member(p_ticket text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'No autenticado'; end if;
  if p_user <> me and not public.is_ticket_owner(p_ticket) then
    raise exception 'No tienes permiso para quitar a esa persona.';
  end if;
  delete from public.ticket_members where ticket_id = p_ticket and user_id = p_user;
  delete from public.ticket_payments where ticket_id = p_ticket and user_id = p_user;
end $$;

-- ---------- Lado del deudor ----------
create or replace function public.mark_payment_sent(p_ticket text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
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
end $$;

-- Deshacer "enviado" (solo si el propietario aún no lo ha confirmado)
create or replace function public.undo_payment_sent(p_ticket text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'No autenticado'; end if;
  update public.ticket_payments
  set status = 'pending', updated_at = now()
  where ticket_id = p_ticket and user_id = me and status = 'sent';
end $$;

-- ---------- Lado del propietario ----------
-- Confirma que ha recibido el pago (también sirve para "cobrado en efectivo").
create or replace function public.confirm_payment(p_ticket text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_owner(p_ticket) then
    raise exception 'Solo quien creó el ticket puede confirmar pagos.';
  end if;
  if not exists (
    select 1 from public.ticket_members where ticket_id = p_ticket and user_id = p_user
  ) then
    raise exception 'Esa persona no está en el ticket.';
  end if;
  insert into public.ticket_payments (ticket_id, user_id, status, updated_at)
  values (p_ticket, p_user, 'confirmed', now())
  on conflict (ticket_id, user_id)
    do update set status = 'confirmed', updated_at = now();
end $$;

-- "No lo he recibido" o deshacer un cobro: vuelve a pendiente.
create or replace function public.reopen_payment(p_ticket text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.is_ticket_owner(p_ticket) then
    raise exception 'Solo quien creó el ticket puede cambiar el estado de un pago.';
  end if;
  update public.ticket_payments
  set status = 'pending', updated_at = now()
  where ticket_id = p_ticket and user_id = p_user;
end $$;

-- Recordatorio de pago, como máximo uno cada 24 horas por deuda.
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
end $$;

-- ---------- Lecturas (se recrean con más columnas) ----------
drop function if exists public.list_shared_tickets();
drop function if exists public.get_shared_ticket(text);

create or replace function public.list_shared_tickets()
returns table (
  ticket_id text, owner_id uuid, owner_name text, my_participant_id text,
  my_payment_status text, last_reminder_at timestamptz, data jsonb
)
language sql stable security definer set search_path = public as $$
  select t.id::text, t.user_id, coalesce(p.display_name, 'Alguien'), m.participant_id,
         coalesce(pay.status, 'pending'), pay.last_reminder_at,
         ((t.data::jsonb) - 'imageBase64')
  from public.ticket_members m
  join public.tickets t on t.id::text = m.ticket_id
  left join public.profiles p on p.id = t.user_id
  left join public.ticket_payments pay on pay.ticket_id = m.ticket_id and pay.user_id = m.user_id
  where m.user_id = auth.uid()
  order by coalesce((t.data::jsonb) ->> 'date', '') desc;
$$;

create or replace function public.get_shared_ticket(p_ticket text)
returns table (
  ticket_id text, owner_id uuid, owner_name text, my_participant_id text,
  my_payment_status text, last_reminder_at timestamptz, data jsonb
)
language sql stable security definer set search_path = public as $$
  select t.id::text, t.user_id, coalesce(p.display_name, 'Alguien'), m.participant_id,
         coalesce(pay.status, 'pending'), pay.last_reminder_at,
         ((t.data::jsonb) - 'imageBase64')
  from public.ticket_members m
  join public.tickets t on t.id::text = m.ticket_id
  left join public.profiles p on p.id = t.user_id
  left join public.ticket_payments pay on pay.ticket_id = m.ticket_id and pay.user_id = m.user_id
  where m.user_id = auth.uid() and m.ticket_id = p_ticket;
$$;

-- Mis tickets que tienen miembros, con el estado de pago de cada uno.
create or replace function public.list_owned_shared_tickets()
returns table (ticket_id text, data jsonb, members jsonb)
language sql stable security definer set search_path = public as $$
  select t.id::text,
         ((t.data::jsonb) - 'imageBase64'),
         (select jsonb_agg(jsonb_build_object(
                   'user_id', m.user_id,
                   'display_name', coalesce(p.display_name, 'Alguien'),
                   'participant_id', m.participant_id,
                   'status', coalesce(pay.status, 'pending'),
                   'last_reminder_at', pay.last_reminder_at
                 ) order by m.joined_at)
          from public.ticket_members m
          left join public.profiles p on p.id = m.user_id
          left join public.ticket_payments pay on pay.ticket_id = m.ticket_id and pay.user_id = m.user_id
          where m.ticket_id = t.id::text)
  from public.tickets t
  where t.user_id = auth.uid()
    and exists (select 1 from public.ticket_members m2 where m2.ticket_id = t.id::text)
  order by coalesce((t.data::jsonb) ->> 'date', '') desc;
$$;

-- ---------- Permisos de ejecución ----------
revoke all on function public.mark_payment_sent(text) from public, anon;
revoke all on function public.undo_payment_sent(text) from public, anon;
revoke all on function public.confirm_payment(text, uuid) from public, anon;
revoke all on function public.reopen_payment(text, uuid) from public, anon;
revoke all on function public.remind_payment(text, uuid) from public, anon;
revoke all on function public.list_shared_tickets() from public, anon;
revoke all on function public.get_shared_ticket(text) from public, anon;
revoke all on function public.list_owned_shared_tickets() from public, anon;
revoke all on function public.cleanup_ticket_sharing() from public, anon, authenticated;

grant execute on function public.mark_payment_sent(text) to authenticated;
grant execute on function public.undo_payment_sent(text) to authenticated;
grant execute on function public.confirm_payment(text, uuid) to authenticated;
grant execute on function public.reopen_payment(text, uuid) to authenticated;
grant execute on function public.remind_payment(text, uuid) to authenticated;
grant execute on function public.list_shared_tickets() to authenticated;
grant execute on function public.get_shared_ticket(text) to authenticated;
grant execute on function public.list_owned_shared_tickets() to authenticated;

-- ---------- Deshacer (solo si hiciera falta; recrea las lecturas de la 003 a mano) ----------
-- drop function if exists public.list_owned_shared_tickets(), public.remind_payment(text, uuid),
--   public.reopen_payment(text, uuid), public.confirm_payment(text, uuid),
--   public.undo_payment_sent(text), public.mark_payment_sent(text);
-- drop table if exists public.ticket_payments;
