-- =====================================================================
-- Ticket-ia: amigos como participantes (apodos por persona + aviso diferido)
--
-- 1) Cada persona ve a los participantes vinculados con SU apodo
--    (get_ticket_participant_labels).
-- 2) El aviso "te han añadido a un ticket" no se envía hasta que el ticket
--    tenga al menos un producto. Mientras tanto el ticket no aparece en la
--    lista del invitado.
--
-- Requiere las migraciones 001 a 005. Ejecutar completo, una sola vez,
-- en Supabase > SQL Editor.
-- =====================================================================

-- ---------- Aviso pendiente ----------
alter table public.ticket_members
  add column if not exists notify_pending boolean not null default false;

-- ---------- Auxiliar: ¿tiene el ticket algún producto? ----------
create or replace function public._data_has_lines(p_data jsonb)
returns boolean language sql immutable as $$
  select case
    when jsonb_typeof(p_data -> 'lines') = 'array'
      then jsonb_array_length(p_data -> 'lines') > 0
    else false
  end;
$$;

-- ---------- Vincular: avisa solo si ya hay productos ----------
create or replace function public.link_ticket_member(p_ticket text, p_user uuid, p_participant text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  existed boolean;
  prev text;
  has_lines boolean;
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
    select public._data_has_lines(t.data::jsonb) into has_lines
    from public.tickets t where t.id::text = p_ticket;

    if coalesce(has_lines, false) then
      perform public._notify(p_user, 'added_to_ticket', me, p_ticket,
        jsonb_build_object('merchant', public._ticket_merchant(p_ticket)));
    else
      update public.ticket_members set notify_pending = true
      where ticket_id = p_ticket and user_id = p_user;
    end if;
  end if;
end $$;

-- ---------- Al guardarse el ticket con productos, se envían los avisos retenidos ----------
create or replace function public.release_pending_member_notices()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- Comprobación barata primero: casi siempre no hay nada retenido.
  if not exists (
    select 1 from public.ticket_members m
    where m.ticket_id = new.id::text and m.notify_pending
  ) then
    return new;
  end if;

  if not public._data_has_lines(new.data::jsonb) then
    return new;
  end if;

  for r in
    select m.user_id from public.ticket_members m
    where m.ticket_id = new.id::text and m.notify_pending
  loop
    perform public._notify(r.user_id, 'added_to_ticket', new.user_id, new.id::text,
      jsonb_build_object('merchant', coalesce((new.data::jsonb) ->> 'merchant', 'Ticket sin nombre')));
  end loop;

  update public.ticket_members set notify_pending = false
  where ticket_id = new.id::text and notify_pending;

  return new;
end $$;

drop trigger if exists tickets_release_member_notices on public.tickets;
create trigger tickets_release_member_notices
  after insert or update on public.tickets
  for each row execute function public.release_pending_member_notices();

-- ---------- El invitado no ve el ticket mientras su aviso esté retenido ----------
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
  where m.user_id = auth.uid() and not m.notify_pending
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
  where m.user_id = auth.uid() and m.ticket_id = p_ticket and not m.notify_pending;
$$;

-- ---------- Nombres de los participantes vinculados, según quien mira ----------
-- alias = el apodo que QUIEN MIRA tiene guardado para esa persona (null si no
-- es su amigo o no le puso apodo). No se devuelve el identificador del usuario.
create or replace function public.get_ticket_participant_labels(p_ticket text)
returns table (participant_id text, display_name text, alias text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not (public.is_ticket_owner(p_ticket) or public.is_ticket_member(p_ticket)) then
    raise exception 'No tienes acceso a este ticket.';
  end if;
  return query
    select m.participant_id, p.display_name, a.alias
    from public.ticket_members m
    join public.profiles p on p.id = m.user_id
    left join public.friend_aliases a
      on a.owner_id = auth.uid() and a.friend_id = m.user_id
    where m.ticket_id = p_ticket and m.participant_id is not null;
end $$;

-- ---------- Permisos de ejecución ----------
revoke all on function public._data_has_lines(jsonb) from public, anon, authenticated;
revoke all on function public.release_pending_member_notices() from public, anon, authenticated;
revoke all on function public.link_ticket_member(text, uuid, text) from public, anon;
revoke all on function public.list_shared_tickets() from public, anon;
revoke all on function public.get_shared_ticket(text) from public, anon;
revoke all on function public.get_ticket_participant_labels(text) from public, anon;

grant execute on function public.link_ticket_member(text, uuid, text) to authenticated;
grant execute on function public.list_shared_tickets() to authenticated;
grant execute on function public.get_shared_ticket(text) to authenticated;
grant execute on function public.get_ticket_participant_labels(text) to authenticated;
