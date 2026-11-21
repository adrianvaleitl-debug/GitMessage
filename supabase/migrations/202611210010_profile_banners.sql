-- Add public profile cover/banner image support.
-- Reuses the existing gitmessage-avatars storage bucket and its per-user folder policy.
update storage.buckets set file_size_limit=8388608 where id='gitmessage-avatars';

alter table public.profiles
  add column if not exists banner_path text;

drop function if exists public.get_my_gitmessage_profile();
create function public.get_my_gitmessage_profile()
returns table(
  username text, display_name text, avatar_path text, bio text,
  profile_palette text, profile_frame text, profile_badge text,
  profile_card_style text, profile_avatar_ring text,
  profile_show_bio boolean, profile_show_username boolean,
  banner_path text
)
language plpgsql security definer set search_path=public,auth as $fn$
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
  select p.username,p.display_name,p.avatar_path,p.bio,p.profile_palette,p.profile_frame,p.profile_badge,
         p.profile_card_style,p.profile_avatar_ring,p.profile_show_bio,p.profile_show_username,p.banner_path
  from public.profiles p where p.id=uid;
end
$fn$;
revoke all on function public.get_my_gitmessage_profile() from public,anon;
grant execute on function public.get_my_gitmessage_profile() to authenticated;

drop function if exists public.get_gitmessage_public_profile(uuid);
create function public.get_gitmessage_public_profile(target_user_id uuid)
returns table(
  user_id uuid, username text, display_name text, avatar_path text, bio text,
  profile_palette text, profile_frame text, profile_badge text,
  profile_card_style text, profile_avatar_ring text,
  profile_show_bio boolean, profile_show_username boolean,
  banner_path text
)
language sql security definer set search_path=public,auth stable as $fn$
  select p.id,p.username,p.display_name,p.avatar_path,p.bio,p.profile_palette,p.profile_frame,p.profile_badge,
         p.profile_card_style,p.profile_avatar_ring,p.profile_show_bio,p.profile_show_username,p.banner_path
  from public.profiles p
  where auth.uid() is not null and p.id=target_user_id;
$fn$;
revoke all on function public.get_gitmessage_public_profile(uuid) from public,anon;
grant execute on function public.get_gitmessage_public_profile(uuid) to authenticated;

drop function if exists public.get_gitmessage_conversation_profile(uuid);
create function public.get_gitmessage_conversation_profile(target_conversation_id uuid)
returns table(
  user_id uuid, username text, display_name text, avatar_path text, bio text,
  profile_palette text, profile_frame text, profile_badge text,
  profile_card_style text, profile_avatar_ring text,
  profile_show_bio boolean, profile_show_username boolean,
  banner_path text
)
language sql security definer set search_path=public,auth stable as $fn$
  select p.id,p.username,p.display_name,p.avatar_path,p.bio,p.profile_palette,p.profile_frame,p.profile_badge,
         p.profile_card_style,p.profile_avatar_ring,p.profile_show_bio,p.profile_show_username,p.banner_path
  from public.conversation_members mine
  join public.conversation_members other_member
    on other_member.conversation_id=mine.conversation_id and other_member.user_id<>auth.uid()
  join public.profiles p on p.id=other_member.user_id
  where mine.conversation_id=target_conversation_id and mine.user_id=auth.uid()
  order by p.display_name nulls last limit 1;
$fn$;
revoke all on function public.get_gitmessage_conversation_profile(uuid) from public,anon;
grant execute on function public.get_gitmessage_conversation_profile(uuid) to authenticated;
