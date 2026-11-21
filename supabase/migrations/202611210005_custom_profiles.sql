-- GitMessage customizable profiles and reserved profile cosmetics.
-- Safe to run after 202611210004_public_profiles_and_display_names.sql.

alter table public.profiles
  add column if not exists bio text not null default '',
  add column if not exists profile_palette text not null default 'graphite',
  add column if not exists profile_frame text,
  add column if not exists profile_badge text;

alter table public.profiles drop constraint if exists profiles_profile_palette_check;
alter table public.profiles add constraint profiles_profile_palette_check
  check (profile_palette in ('graphite','ocean','plum','ember','moss','sand'));
alter table public.profiles drop constraint if exists profiles_bio_length_check;
alter table public.profiles add constraint profiles_bio_length_check check (char_length(bio) <= 240);

-- Assign the two limited cosmetics only to the matching existing accounts.
-- This does not grant database/admin permissions.
update public.profiles
set profile_frame='gold', profile_badge='creator'
where lower(username)='adrianvaleitl';
update public.profiles
set profile_frame='silver', profile_badge='admin'
where lower(username)='tw23';

drop function if exists public.get_my_gitmessage_profile();
create function public.get_my_gitmessage_profile()
returns table(username text, display_name text, avatar_path text, bio text, profile_palette text, profile_frame text, profile_badge text)
language plpgsql security definer set search_path=public,auth as $$
declare uid uuid := auth.uid(); mail text; base_name text;
begin
  if uid is null then raise exception 'Sign in required.'; end if;
  select email into mail from auth.users where id=uid;
  base_name := lower(regexp_replace(split_part(coalesce(mail,'friend'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  if length(base_name)<3 then base_name := 'user'; end if;
  insert into public.profiles(id,username,display_name)
  values(uid, left(base_name,16)||'_'||left(replace(uid::text,'-',''),6), coalesce(nullif(split_part(coalesce(mail,'Friend'),'@',1),''),'Friend'))
  on conflict(id) do nothing;
  return query
  select p.username,p.display_name,p.avatar_path,p.bio,p.profile_palette,p.profile_frame,p.profile_badge
  from public.profiles p where p.id=uid;
end $$;
revoke all on function public.get_my_gitmessage_profile() from public,anon;
grant execute on function public.get_my_gitmessage_profile() to authenticated;

create or replace function public.update_gitmessage_profile(
  new_username text,
  new_display_name text,
  new_bio text default '',
  new_profile_palette text default 'graphite'
)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if trim(coalesce(new_username,'')) !~ '^[a-zA-Z0-9_]{3,24}$' then
    raise exception 'Username must be 3–24 letters, numbers or underscores.';
  end if;
  if trim(coalesce(new_display_name,'')) = '' then raise exception 'Display name is required.'; end if;
  if char_length(coalesce(new_bio,'')) > 240 then raise exception 'About me must be 240 characters or fewer.'; end if;
  if coalesce(new_profile_palette,'graphite') not in ('graphite','ocean','plum','ember','moss','sand') then
    raise exception 'Choose a valid profile colour.';
  end if;
  update public.profiles
  set username=lower(trim(new_username)),
      display_name=trim(new_display_name),
      bio=trim(coalesce(new_bio,'')),
      profile_palette=coalesce(new_profile_palette,'graphite'),
      updated_at=now()
  where id=auth.uid();
  if not found then raise exception 'Profile not found.'; end if;
end $$;
revoke all on function public.update_gitmessage_profile(text,text,text,text) from public,anon;
grant execute on function public.update_gitmessage_profile(text,text,text,text) to authenticated;

drop function if exists public.get_gitmessage_public_profile(uuid);
create function public.get_gitmessage_public_profile(target_user_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_path text, bio text, profile_palette text, profile_frame text, profile_badge text)
language sql security definer set search_path=public,auth stable as $$
  select p.id,p.username,p.display_name,p.avatar_path,p.bio,p.profile_palette,p.profile_frame,p.profile_badge
  from public.profiles p
  where auth.uid() is not null and p.id=target_user_id;
$$;
revoke all on function public.get_gitmessage_public_profile(uuid) from public,anon;
grant execute on function public.get_gitmessage_public_profile(uuid) to authenticated;

drop function if exists public.get_gitmessage_conversation_profile(uuid);
create function public.get_gitmessage_conversation_profile(target_conversation_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_path text, bio text, profile_palette text, profile_frame text, profile_badge text)
language sql security definer set search_path=public,auth stable as $$
  select p.id,p.username,p.display_name,p.avatar_path,p.bio,p.profile_palette,p.profile_frame,p.profile_badge
  from public.conversation_members mine
  join public.conversation_members other_member
    on other_member.conversation_id=mine.conversation_id and other_member.user_id<>auth.uid()
  join public.profiles p on p.id=other_member.user_id
  where mine.conversation_id=target_conversation_id and mine.user_id=auth.uid()
  order by p.display_name nulls last limit 1;
$$;
revoke all on function public.get_gitmessage_conversation_profile(uuid) from public,anon;
grant execute on function public.get_gitmessage_conversation_profile(uuid) to authenticated;
