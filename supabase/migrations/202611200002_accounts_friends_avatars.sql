-- GitMessage account, friends and avatar improvements
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_not_self check (sender_id <> recipient_id),
  constraint friend_requests_pair_unique unique(sender_id,recipient_id)
);
alter table public.friend_requests enable row level security;
drop policy if exists gm_friend_requests_read on public.friend_requests;
create policy gm_friend_requests_read on public.friend_requests for select to authenticated
using (sender_id=auth.uid() or recipient_id=auth.uid());
drop policy if exists gm_friend_requests_insert on public.friend_requests;
create policy gm_friend_requests_insert on public.friend_requests for insert to authenticated
with check (sender_id=auth.uid() and status='pending');
drop policy if exists gm_friend_requests_update on public.friend_requests;
create policy gm_friend_requests_update on public.friend_requests for update to authenticated
using (recipient_id=auth.uid() and status='pending')
with check (recipient_id=auth.uid() and status in ('accepted','declined'));

create or replace function public.get_my_gitmessage_profile()
returns table(username text, display_name text, avatar_path text)
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
  return query select p.username,p.display_name,p.avatar_path from public.profiles p where p.id=uid;
end $$;

create or replace function public.send_gitmessage_friend_request(target_user_id uuid)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare result_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 if target_user_id is null or target_user_id=auth.uid() then raise exception 'Choose another user.'; end if;
 insert into public.friend_requests(sender_id,recipient_id,status)
 values(auth.uid(),target_user_id,'pending')
 on conflict(sender_id,recipient_id) do update set status='pending',updated_at=now()
 returning id into result_id;
 return result_id;
end $$;

create or replace function public.respond_gitmessage_friend_request(request_id uuid, accept_request boolean)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
 update public.friend_requests set status=case when accept_request then 'accepted' else 'declined' end,updated_at=now()
 where id=request_id and recipient_id=auth.uid() and status='pending';
 if not found then raise exception 'Friend request not found.'; end if;
 if accept_request then
   insert into public.user_contacts(user_id,contact_id)
   select sender_id,recipient_id from public.friend_requests where id=request_id
   on conflict do nothing;
   insert into public.user_contacts(user_id,contact_id)
   select recipient_id,sender_id from public.friend_requests where id=request_id
   on conflict do nothing;
 end if;
end $$;

revoke all on function public.get_my_gitmessage_profile() from public,anon;
revoke all on function public.send_gitmessage_friend_request(uuid) from public,anon;
revoke all on function public.respond_gitmessage_friend_request(uuid,boolean) from public,anon;
grant execute on function public.get_my_gitmessage_profile() to authenticated;
grant execute on function public.send_gitmessage_friend_request(uuid) to authenticated;
grant execute on function public.respond_gitmessage_friend_request(uuid,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gitmessage-avatars','gitmessage-avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880;
drop policy if exists gm_avatar_upload_own on storage.objects;
create policy gm_avatar_upload_own on storage.objects for insert to authenticated
with check(bucket_id='gitmessage-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists gm_avatar_update_own on storage.objects;
create policy gm_avatar_update_own on storage.objects for update to authenticated
using(bucket_id='gitmessage-avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='gitmessage-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
