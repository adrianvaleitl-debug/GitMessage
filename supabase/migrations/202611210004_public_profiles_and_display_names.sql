-- Public profile viewing and display-name-aware account discovery.
-- Only profile fields are exposed; email addresses remain private to account search.

drop function if exists public.search_gitmessage_users(text);
create function public.search_gitmessage_users(search_query text)
returns table(user_id uuid, email text, username text, display_name text, avatar_path text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.id, u.email::text, p.username, p.display_name, p.avatar_path
  from auth.users u
  left join public.profiles p on p.id = u.id
  where auth.uid() is not null
    and u.id <> auth.uid()
    and (
      lower(coalesce(p.username, '')) = lower(ltrim(trim(search_query), '@'))
      or lower(coalesce(u.email, '')) = lower(trim(search_query))
    )
  order by case when lower(coalesce(p.username,'')) = lower(ltrim(trim(search_query), '@')) then 0 else 1 end
  limit 10;
$$;
revoke all on function public.search_gitmessage_users(text) from public, anon;
grant execute on function public.search_gitmessage_users(text) to authenticated;

drop function if exists public.get_my_gitmessage_friends();
create function public.get_my_gitmessage_friends()
returns table(user_id uuid, username text, display_name text, email text, avatar_path text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.id, p.username, p.display_name, u.email::text, p.avatar_path
  from public.user_contacts uc
  join auth.users u on u.id = uc.contact_id
  left join public.profiles p on p.id = u.id
  where uc.user_id = auth.uid()
  group by u.id, p.username, p.display_name, u.email, p.avatar_path
  order by p.display_name nulls last, p.username nulls last;
$$;
revoke all on function public.get_my_gitmessage_friends() from public, anon;
grant execute on function public.get_my_gitmessage_friends() to authenticated;

create or replace function public.get_gitmessage_public_profile(target_user_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_path text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select p.id, p.username, p.display_name, p.avatar_path
  from public.profiles p
  where auth.uid() is not null and p.id = target_user_id;
$$;
revoke all on function public.get_gitmessage_public_profile(uuid) from public, anon;
grant execute on function public.get_gitmessage_public_profile(uuid) to authenticated;

create or replace function public.get_gitmessage_conversation_profile(target_conversation_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_path text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select p.id, p.username, p.display_name, p.avatar_path
  from public.conversation_members mine
  join public.conversation_members other_member
    on other_member.conversation_id = mine.conversation_id
   and other_member.user_id <> auth.uid()
  join public.profiles p on p.id = other_member.user_id
  where mine.conversation_id = target_conversation_id
    and mine.user_id = auth.uid()
  order by p.display_name nulls last
  limit 1;
$$;
revoke all on function public.get_gitmessage_conversation_profile(uuid) from public, anon;
grant execute on function public.get_gitmessage_conversation_profile(uuid) to authenticated;
