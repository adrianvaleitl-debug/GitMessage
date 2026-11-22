-- GitHub profile links and isolated shared/private AI histories.
alter table public.profiles add column if not exists github_username text;
alter table public.profiles drop constraint if exists profiles_github_username_check;
alter table public.profiles add constraint profiles_github_username_check
  check (github_username is null or github_username ~ '^[A-Za-z0-9-]{1,39}$');

drop function if exists public.get_my_gitmessage_profile();
create function public.get_my_gitmessage_profile()
returns table(
  username text, display_name text, avatar_path text, bio text, profile_palette text, profile_frame text, profile_badge text,
  profile_card_style text, profile_avatar_ring text, profile_show_bio boolean, profile_show_username boolean,
  banner_path text, avatar_position text, banner_position text, github_username text
)
language plpgsql security definer set search_path=public,auth as $
declare uid uuid := auth.uid(); mail text; base_name text;
begin
  if uid is null then raise exception 'Sign in required.'; end if;
  select email into mail from auth.users where id=uid;
  base_name := lower(regexp_replace(split_part(coalesce(mail,'friend'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  if length(base_name)<3 then base_name := 'user'; end if;
  insert into public.profiles(id,username,display_name)
  values(uid, left(base_name,16)||'_'||left(replace(uid::text,'-',''),6), coalesce(nullif(split_part(coalesce(mail,'Friend'),'@',1),''),'Friend'))
  on conflict(id) do nothing;
  return query select p.username,p.display_name,p.avatar_path,p.bio,p.profile_palette,p.profile_frame,p.profile_badge,
    p.profile_card_style,p.profile_avatar_ring,p.profile_show_bio,p.profile_show_username,
    p.banner_path,p.avatar_position,p.banner_position,p.github_username
  from public.profiles p where p.id=uid;
end $$;
revoke all on function public.get_my_gitmessage_profile() from public,anon;
grant execute on function public.get_my_gitmessage_profile() to authenticated;

drop function if exists public.get_gitmessage_public_profile(uuid);
create function public.get_gitmessage_public_profile(target_user_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_path text, bio text, profile_palette text, profile_frame text, profile_badge text, github_username text, banner_path text, banner_position text, avatar_position text, profile_card_style text, profile_avatar_ring text, profile_show_bio boolean, profile_show_username boolean)
language sql security definer set search_path=public,auth stable as $$
  select p.id,p.username,p.display_name,p.avatar_path,p.bio,p.profile_palette,p.profile_frame,p.profile_badge,p.github_username,p.banner_path,p.banner_position,p.avatar_position,p.profile_card_style,p.profile_avatar_ring,p.profile_show_bio,p.profile_show_username
  from public.profiles p where auth.uid() is not null and p.id=target_user_id;
$$;
revoke all on function public.get_gitmessage_public_profile(uuid) from public,anon;
grant execute on function public.get_gitmessage_public_profile(uuid) to authenticated;

drop function if exists public.get_gitmessage_conversation_profile(uuid);
create function public.get_gitmessage_conversation_profile(target_conversation_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_path text, bio text, profile_palette text, profile_frame text, profile_badge text, github_username text, banner_path text, banner_position text, avatar_position text, profile_card_style text, profile_avatar_ring text, profile_show_bio boolean, profile_show_username boolean)
language sql security definer set search_path=public,auth stable as $$
  select p.id,p.username,p.display_name,p.avatar_path,p.bio,p.profile_palette,p.profile_frame,p.profile_badge,p.github_username,p.banner_path,p.banner_position,p.avatar_position,p.profile_card_style,p.profile_avatar_ring,p.profile_show_bio,p.profile_show_username
  from public.conversation_members mine
  join public.conversation_members other_member on other_member.conversation_id=mine.conversation_id and other_member.user_id<>auth.uid()
  join public.profiles p on p.id=other_member.user_id
  where mine.conversation_id=target_conversation_id and mine.user_id=auth.uid()
  order by p.display_name nulls last limit 1;
$$;
revoke all on function public.get_gitmessage_conversation_profile(uuid) from public,anon;
grant execute on function public.get_gitmessage_conversation_profile(uuid) to authenticated;

create table if not exists public.gitmessage_shared_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text not null check(role in ('user','assistant')),
  content text not null check(char_length(trim(content)) between 1 and 12000),
  created_at timestamptz not null default now()
);
create index if not exists gitmessage_shared_ai_messages_history_idx
  on public.gitmessage_shared_ai_messages(conversation_id,created_at desc);
alter table public.gitmessage_shared_ai_messages enable row level security;
drop policy if exists gm_shared_ai_member_read on public.gitmessage_shared_ai_messages;
create policy gm_shared_ai_member_read on public.gitmessage_shared_ai_messages for select to authenticated
using(exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_shared_ai_messages.conversation_id and cm.user_id=auth.uid()));
drop policy if exists gm_shared_ai_member_insert on public.gitmessage_shared_ai_messages;
create policy gm_shared_ai_member_insert on public.gitmessage_shared_ai_messages for insert to authenticated
with check(user_id=auth.uid() and role='user' and exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_shared_ai_messages.conversation_id and cm.user_id=auth.uid()));
grant select,insert on public.gitmessage_shared_ai_messages to authenticated;

create table if not exists public.gitmessage_private_ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('user','assistant')),
  content text not null check(char_length(trim(content)) between 1 and 12000),
  created_at timestamptz not null default now()
);
create index if not exists gitmessage_private_ai_messages_history_idx
  on public.gitmessage_private_ai_messages(user_id,created_at desc);
alter table public.gitmessage_private_ai_messages enable row level security;
drop policy if exists gm_private_ai_owner_all on public.gitmessage_private_ai_messages;
create policy gm_private_ai_owner_all on public.gitmessage_private_ai_messages for all to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid() and role='user');
grant select,insert on public.gitmessage_private_ai_messages to authenticated;

-- Enable realtime delivery for the two isolated AI histories when available.
do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gitmessage_shared_ai_messages') then
    alter publication supabase_realtime add table public.gitmessage_shared_ai_messages;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gitmessage_private_ai_messages') then
    alter publication supabase_realtime add table public.gitmessage_private_ai_messages;
  end if;
end $$;
