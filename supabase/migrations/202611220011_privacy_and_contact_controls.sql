-- User-controlled privacy rules for friend requests and group additions.
create table if not exists public.gitmessage_privacy_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  friend_request_policy text not null default 'everyone'
    check (friend_request_policy in ('everyone','friends_of_friends','friends','nobody')),
  group_invite_policy text not null default 'everyone'
    check (group_invite_policy in ('everyone','friends_of_friends','friends','nobody')),
  updated_at timestamptz not null default now()
);
alter table public.gitmessage_privacy_settings enable row level security;
drop policy if exists gitmessage_privacy_read_own on public.gitmessage_privacy_settings;
create policy gitmessage_privacy_read_own on public.gitmessage_privacy_settings
for select to authenticated using (user_id=auth.uid());
drop policy if exists gitmessage_privacy_insert_own on public.gitmessage_privacy_settings;
create policy gitmessage_privacy_insert_own on public.gitmessage_privacy_settings
for insert to authenticated with check (user_id=auth.uid());
drop policy if exists gitmessage_privacy_update_own on public.gitmessage_privacy_settings;
create policy gitmessage_privacy_update_own on public.gitmessage_privacy_settings
for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
grant select,insert,update on public.gitmessage_privacy_settings to authenticated;

create or replace function public.send_gitmessage_friend_request(target_user_id uuid)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare
  sender uuid := auth.uid();
  policy text;
  mutual_count integer := 0;
  result_id uuid;
begin
  if sender is null then raise exception 'Sign in required.'; end if;
  if target_user_id is null or target_user_id=sender then raise exception 'Choose another user.'; end if;
  select friend_request_policy into policy from public.gitmessage_privacy_settings where user_id=target_user_id;
  policy := coalesce(policy,'everyone');
  if policy='nobody' then raise exception 'This user is not accepting friend requests.'; end if;
  if policy='friends' and not exists(select 1 from public.user_contacts where user_id=target_user_id and contact_id=sender) then
    raise exception 'This user only accepts requests from friends.';
  end if;
  if policy='friends_of_friends' then
    select count(*) into mutual_count
    from public.user_contacts a join public.user_contacts b on b.contact_id=a.contact_id
    where a.user_id=sender and b.user_id=target_user_id;
    if mutual_count=0 then raise exception 'You need a mutual friend to send this request.'; end if;
  end if;
  insert into public.friend_requests(sender_id,recipient_id,status)
  values(sender,target_user_id,'pending')
  on conflict(sender_id,recipient_id) do update set status='pending',updated_at=now()
  returning id into result_id;
  return result_id;
end $$;
revoke all on function public.send_gitmessage_friend_request(uuid) from public,anon;
grant execute on function public.send_gitmessage_friend_request(uuid) to authenticated;

create or replace function public.enforce_gitmessage_group_invite_privacy()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare
  inviter uuid := auth.uid();
  policy text;
  is_group boolean;
  mutual_count integer := 0;
begin
  if inviter is null or new.user_id=inviter then return new; end if;
  select (c.kind='group') into is_group from public.conversations c where c.id=new.conversation_id;
  if not coalesce(is_group,false) then return new; end if;
  select group_invite_policy into policy from public.gitmessage_privacy_settings where user_id=new.user_id;
  policy := coalesce(policy,'everyone');
  if policy='nobody' then raise exception 'A member has disabled group invitations.'; end if;
  if policy='friends' and not exists(select 1 from public.user_contacts where user_id=new.user_id and contact_id=inviter) then
    raise exception 'A member only accepts group additions from friends.';
  end if;
  if policy='friends_of_friends' then
    select count(*) into mutual_count
    from public.user_contacts a join public.user_contacts b on b.contact_id=a.contact_id
    where a.user_id=inviter and b.user_id=new.user_id;
    if mutual_count=0 then raise exception 'A mutual friend is required to add this member to a group.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists gitmessage_group_invite_privacy on public.conversation_members;
create trigger gitmessage_group_invite_privacy
before insert on public.conversation_members
for each row execute function public.enforce_gitmessage_group_invite_privacy();
