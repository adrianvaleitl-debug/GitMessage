-- Enforce friend-request privacy for every insert path, including direct table writes.
-- The RPC check alone is insufficient because authenticated clients also have INSERT access.

create or replace function public.enforce_gitmessage_friend_request_privacy()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  recipient_policy text;
  mutual_count integer := 0;
begin
  if new.status <> 'pending' then return new; end if;
  if new.sender_id is null or new.recipient_id is null or new.sender_id = new.recipient_id then
    raise exception 'Choose another user.';
  end if;
  select friend_request_policy into recipient_policy
  from public.gitmessage_privacy_settings where user_id = new.recipient_id;
  recipient_policy := coalesce(recipient_policy, 'everyone');
  if recipient_policy = 'nobody' then
    raise exception 'This user is not accepting friend requests.';
  elsif recipient_policy = 'friends' and not exists (
    select 1 from public.user_contacts
    where user_id = new.recipient_id and contact_id = new.sender_id
  ) then
    raise exception 'This user only accepts requests from friends.';
  elsif recipient_policy = 'friends_of_friends' then
    select count(*) into mutual_count
    from public.user_contacts a join public.user_contacts b on b.contact_id = a.contact_id
    where a.user_id = new.sender_id and b.user_id = new.recipient_id;
    if mutual_count = 0 then raise exception 'You need a mutual friend to send this request.'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists gitmessage_friend_request_privacy on public.friend_requests;
create trigger gitmessage_friend_request_privacy
before insert or update of sender_id, recipient_id, status on public.friend_requests
for each row execute function public.enforce_gitmessage_friend_request_privacy();

-- Clear pending requests when an account switches to No one.
create or replace function public.clear_pending_requests_when_private()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.friend_request_policy = 'nobody'
     and (tg_op = 'INSERT' or old.friend_request_policy is distinct from new.friend_request_policy) then
    delete from public.friend_requests where recipient_id = new.user_id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists gitmessage_clear_pending_requests_when_private on public.gitmessage_privacy_settings;
create trigger gitmessage_clear_pending_requests_when_private
after insert or update of friend_request_policy on public.gitmessage_privacy_settings
for each row execute function public.clear_pending_requests_when_private();

delete from public.friend_requests fr
using public.gitmessage_privacy_settings ps
where ps.user_id = fr.recipient_id and ps.friend_request_policy = 'nobody' and fr.status = 'pending';
