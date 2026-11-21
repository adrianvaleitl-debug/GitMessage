-- Enable exact username lookup for adding friends and starting chats.
-- Safe to run more than once. Existing accounts and messages are untouched.
drop function if exists public.search_gitmessage_users(text);
create function public.search_gitmessage_users(search_query text)
returns table(user_id uuid, email text, username text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.id, u.email::text, p.username
  from auth.users u
  left join public.profiles p on p.id = u.id
  where auth.uid() is not null
    and u.id <> auth.uid()
    and lower(coalesce(p.username, '')) = lower(ltrim(trim(search_query), '@'))
  order by lower(coalesce(p.username, ''))
  limit 10;
$$;
revoke all on function public.search_gitmessage_users(text) from public, anon;
grant execute on function public.search_gitmessage_users(text) to authenticated;
