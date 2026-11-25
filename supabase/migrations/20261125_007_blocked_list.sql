-- =====================================================================
-- Ticket-ia: lista de usuarios bloqueados (para verla y desbloquear en Ajustes)
-- unblock_user ya existe desde la migración 001.
-- Ejecutar completo, una sola vez, en Supabase > SQL Editor.
-- =====================================================================

create or replace function public.list_blocked()
returns table (user_id uuid, display_name text, blocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.addressee_id, coalesce(p.display_name, 'Usuario'), f.responded_at
  from public.friendships f
  left join public.profiles p on p.id = f.addressee_id
  where f.status = 'blocked' and f.requester_id = auth.uid()
  order by f.responded_at desc nulls last;
$$;

revoke all on function public.list_blocked() from public, anon;
grant execute on function public.list_blocked() to authenticated;
