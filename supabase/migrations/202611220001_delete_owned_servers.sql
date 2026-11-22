-- Allow a server owner to permanently delete their own server.
-- Existing ON DELETE CASCADE constraints remove its members, channels and messages.
create or replace function public.delete_gitmessage_server(target_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;

  delete from public.gitmessage_servers
  where id = target_server_id
    and owner_id = auth.uid();

  if not found then
    raise exception 'Only the server owner can delete this server, or the server no longer exists.';
  end if;
end
$fn$;

revoke all on function public.delete_gitmessage_server(uuid) from public, anon;
grant execute on function public.delete_gitmessage_server(uuid) to authenticated;
