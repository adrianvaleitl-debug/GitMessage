-- Allow group owners and members granted manage_messages to moderate group messages.
create or replace function public.delete_gitmessage_group_message(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $fn$
declare target_conversation uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select m.conversation_id into target_conversation
  from public.messages m
  join public.conversations c on c.id=m.conversation_id and c.kind='group'
  where m.id=target_message_id;

  if target_conversation is null then raise exception 'Group message not found.'; end if;
  if not public.gitmessage_can_manage_group(target_conversation,'manage_messages') then
    raise exception 'You do not have permission to delete messages in this group.';
  end if;

  update public.messages
  set body='This message was deleted.', deleted_at=now()
  where id=target_message_id;
  if not found then raise exception 'Message not found.'; end if;
end
$fn$;

revoke all on function public.delete_gitmessage_group_message(uuid) from public,anon;
grant execute on function public.delete_gitmessage_group_message(uuid) to authenticated;

-- Ensure the group-avatar bucket exists, is public for image display, and has
-- explicit policies for public reads and authorized group managers to upload.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gitmessage-group-avatars','gitmessage-group-avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists gm_group_avatar_public_read on storage.objects;
create policy gm_group_avatar_public_read on storage.objects
for select to anon,authenticated
using(bucket_id='gitmessage-group-avatars');

drop policy if exists gm_group_avatar_upload on storage.objects;
create policy gm_group_avatar_upload on storage.objects
for insert to authenticated
with check (
  bucket_id='gitmessage-group-avatars'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id=((storage.foldername(name))[1])::uuid
      and cm.user_id=auth.uid()
      and (cm.member_role='owner' or coalesce((cm.member_permissions->>'manage_group')::boolean,false))
  )
);

drop policy if exists gm_group_avatar_update on storage.objects;
create policy gm_group_avatar_update on storage.objects
for update to authenticated
using (
  bucket_id='gitmessage-group-avatars'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id=((storage.foldername(name))[1])::uuid
      and cm.user_id=auth.uid()
      and (cm.member_role='owner' or coalesce((cm.member_permissions->>'manage_group')::boolean,false))
  )
)
with check (
  bucket_id='gitmessage-group-avatars'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id=((storage.foldername(name))[1])::uuid
      and cm.user_id=auth.uid()
      and (cm.member_role='owner' or coalesce((cm.member_permissions->>'manage_group')::boolean,false))
  )
);

drop policy if exists gm_group_avatar_delete on storage.objects;
create policy gm_group_avatar_delete on storage.objects
for delete to authenticated
using (
  bucket_id='gitmessage-group-avatars'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id=((storage.foldername(name))[1])::uuid
      and cm.user_id=auth.uid()
      and (cm.member_role='owner' or coalesce((cm.member_permissions->>'manage_group')::boolean,false))
  )
);
