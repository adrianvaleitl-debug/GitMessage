-- GitMessage feature expansion: groups, profiles, reactions, receipts, attachments, typing and call signalling.
-- Run in Supabase SQL Editor after the contacts/direct-message migration.

create table if not exists public.gitmessage_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create table if not exists public.gitmessage_read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.gitmessage_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  created_at timestamptz not null default now()
);

create table if not exists public.gitmessage_typing (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.gitmessage_call_signals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer','answer','ice','hangup','reject')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

alter table public.profiles enable row level security;
alter table public.gitmessage_reactions enable row level security;
alter table public.gitmessage_read_receipts enable row level security;
alter table public.gitmessage_attachments enable row level security;
alter table public.gitmessage_typing enable row level security;
alter table public.gitmessage_call_signals enable row level security;

drop policy if exists gm_reactions_read on public.gitmessage_reactions;
create policy gm_reactions_read on public.gitmessage_reactions for select to authenticated
using (exists (select 1 from public.messages msg join public.conversation_members cm on cm.conversation_id=msg.conversation_id where msg.id=message_id and cm.user_id=auth.uid()));
drop policy if exists gm_reactions_insert on public.gitmessage_reactions;
create policy gm_reactions_insert on public.gitmessage_reactions for insert to authenticated
with check (user_id=auth.uid() and exists (select 1 from public.messages msg join public.conversation_members cm on cm.conversation_id=msg.conversation_id where msg.id=message_id and cm.user_id=auth.uid()));
drop policy if exists gm_reactions_delete on public.gitmessage_reactions;
create policy gm_reactions_delete on public.gitmessage_reactions for delete to authenticated using (user_id=auth.uid());

drop policy if exists gm_receipts_read on public.gitmessage_read_receipts;
create policy gm_receipts_read on public.gitmessage_read_receipts for select to authenticated
using (exists (select 1 from public.messages msg join public.conversation_members cm on cm.conversation_id=msg.conversation_id where msg.id=message_id and cm.user_id=auth.uid()));
drop policy if exists gm_receipts_insert on public.gitmessage_read_receipts;
create policy gm_receipts_insert on public.gitmessage_read_receipts for insert to authenticated
with check (user_id=auth.uid() and exists (select 1 from public.messages msg join public.conversation_members cm on cm.conversation_id=msg.conversation_id where msg.id=message_id and cm.user_id=auth.uid() and msg.sender_id<>auth.uid()));
drop policy if exists gm_receipts_update on public.gitmessage_read_receipts;
create policy gm_receipts_update on public.gitmessage_read_receipts for update to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists gm_attachments_read on public.gitmessage_attachments;
create policy gm_attachments_read on public.gitmessage_attachments for select to authenticated
using (exists (select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
drop policy if exists gm_attachments_insert on public.gitmessage_attachments;
create policy gm_attachments_insert on public.gitmessage_attachments for insert to authenticated
with check (user_id=auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));

drop policy if exists gm_typing_read on public.gitmessage_typing;
create policy gm_typing_read on public.gitmessage_typing for select to authenticated
using (exists (select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
drop policy if exists gm_typing_write on public.gitmessage_typing;
create policy gm_typing_write on public.gitmessage_typing for all to authenticated
using (user_id=auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()))
with check (user_id=auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));

drop policy if exists gm_calls_read on public.gitmessage_call_signals;
create policy gm_calls_read on public.gitmessage_call_signals for select to authenticated
using (sender_id=auth.uid() or recipient_id=auth.uid());
drop policy if exists gm_calls_insert on public.gitmessage_call_signals;
create policy gm_calls_insert on public.gitmessage_call_signals for insert to authenticated
with check (sender_id=auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()) and exists (select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=recipient_id));

drop policy if exists gm_messages_update_own on public.messages;
create policy gm_messages_update_own on public.messages for update to authenticated
using (sender_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()))
with check (sender_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()));

drop policy if exists gm_messages_delete_own on public.messages;
create policy gm_messages_delete_own on public.messages for delete to authenticated
using (sender_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()));

drop policy if exists gm_profiles_read_authenticated on public.profiles;
create policy gm_profiles_read_authenticated on public.profiles for select to authenticated using (true);
drop policy if exists gm_profiles_update_own on public.profiles;
create policy gm_profiles_update_own on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create or replace function public.create_group_conversation(group_title text, member_ids uuid[])
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare new_id uuid; member_id uuid; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Sign in required.'; end if;
  if nullif(trim(group_title),'') is null then raise exception 'Enter a group name.'; end if;
  if coalesce(array_length(member_ids,1),0) < 1 then raise exception 'Choose at least one other member.'; end if;
  insert into public.conversations(kind,title,created_by) values('group',trim(group_title),current_user_id) returning id into new_id;
  insert into public.conversation_members(conversation_id,user_id) values(new_id,current_user_id);
  foreach member_id in array member_ids loop
    if member_id <> current_user_id and exists(select 1 from auth.users where id=member_id) then
      insert into public.conversation_members(conversation_id,user_id) values(new_id,member_id) on conflict do nothing;
    end if;
  end loop;
  if (select count(*) from public.conversation_members where conversation_id=new_id) < 2 then
    raise exception 'Choose at least one valid member.';
  end if;
  return new_id;
end $$;

create or replace function public.update_gitmessage_profile(new_username text, new_display_name text)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if trim(coalesce(new_username,'')) !~ '^[a-zA-Z0-9_]{3,24}$' then raise exception 'Username must be 3–24 letters, numbers or underscores.'; end if;
  if trim(coalesce(new_display_name,'')) = '' then raise exception 'Display name is required.'; end if;
  update public.profiles set username=lower(trim(new_username)), display_name=trim(new_display_name), updated_at=now() where id=auth.uid();
  if not found then raise exception 'Profile not found.'; end if;
end $$;

revoke all on function public.create_group_conversation(text,uuid[]) from public,anon;
revoke all on function public.update_gitmessage_profile(text,text) from public,anon;
grant execute on function public.create_group_conversation(text,uuid[]) to authenticated;
grant execute on function public.update_gitmessage_profile(text,text) to authenticated;

-- Private attachment bucket. Files are limited to 25 MB and conversation members only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gitmessage-attachments','gitmessage-attachments',false,26214400,
 array['image/jpeg','image/png','image/gif','image/webp','video/mp4','audio/webm','audio/ogg','audio/mpeg','application/pdf','text/plain'])
on conflict(id) do update set public=false,file_size_limit=26214400;

drop policy if exists gm_storage_read on storage.objects;
create policy gm_storage_read on storage.objects for select to authenticated
using (bucket_id='gitmessage-attachments' and exists (
 select 1 from public.conversation_members cm
 where cm.user_id=auth.uid() and (storage.foldername(name))[1]=cm.conversation_id::text
));
drop policy if exists gm_storage_insert on storage.objects;
create policy gm_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='gitmessage-attachments' and exists (
 select 1 from public.conversation_members cm
 where cm.user_id=auth.uid() and (storage.foldername(name))[1]=cm.conversation_id::text
));

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gitmessage_reactions') then alter publication supabase_realtime add table public.gitmessage_reactions; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gitmessage_read_receipts') then alter publication supabase_realtime add table public.gitmessage_read_receipts; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gitmessage_typing') then alter publication supabase_realtime add table public.gitmessage_typing; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gitmessage_call_signals') then alter publication supabase_realtime add table public.gitmessage_call_signals; end if;
end $$;
