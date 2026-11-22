-- Permisos explícitos de lectura para el rol authenticated.
-- Las reglas de seguridad (RLS) siguen limitando cada tabla a las filas propias.
-- Ejecutar una vez en Supabase > SQL Editor.

grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, discoverable_by_email) on public.profiles to authenticated;

grant select on public.friendships to authenticated;
grant select on public.friend_aliases to authenticated;
