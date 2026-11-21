-- GitMessage servers, blocking/reporting and group moderation foundations.
-- Apply after the profile migration. All actions are checked server-side by RLS/RPCs.

create table if not exists public.gitmessage_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.gitmessage_blocks enable row level security;
drop policy if exists gm_blocks_read_own on public.gitmessage_blocks;
create policy gm_blocks_read_own on public.gitmessage_blocks for select to authenticated using (blocker_id=auth.uid());
drop policy if exists gm_blocks_insert_own on public.gitmessage_blocks;
create policy gm_blocks_insert_own on public.gitmessage_blocks for insert to authenticated with check (blocker_id=auth.uid());
drop policy if exists gm_blocks_delete_own on public.gitmessage_blocks;
create policy gm_blocks_delete_own on public.gitmessage_blocks for delete to authenticated using (blocker_id=auth.uid());

create table if not exists public.gitmessage_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null check (char_length(trim(reason)) between 5 and 1000),
  created_at timestamptz not null default now()
);
alter table public.gitmessage_reports enable row level security;
drop policy if exists gm_reports_insert_own on public.gitmessage_reports;
create policy gm_reports_insert_own on public.gitmessage_reports for insert to authenticated
with check (reporter_id=auth.uid() and (reported_user_id is null or reported_user_id<>auth.uid()));
-- Reports are intentionally not readable by ordinary users.

-- Staff roles are assigned to immutable auth user IDs, not trusted client-side usernames.
create table if not exists public.gitmessage_staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  staff_role text not null check (staff_role in ('creator','admin')),
  assigned_at timestamptz not null default now()
);
alter table public.gitmessage_staff_roles enable row level security;

insert into public.gitmessage_staff_roles(user_id,staff_role)
select p.id, case when lower(p.username)='adrianvaleitl' then 'creator' else 'admin' end
from public.profiles p
where lower(p.username) in ('adrianvaleitl','tw23')
on conflict(user_id) do update set staff_role=excluded.staff_role;

create or replace function public.gitmessage_is_staff()
returns boolean language sql security definer stable set search_path=public,auth as $
 select exists(select 1 from public.gitmessage_staff_roles where user_id=auth.uid());
$;
revoke all on function public.gitmessage_is_staff() from public,anon;
grant execute on function public.gitmessage_is_staff() to authenticated;

drop policy if exists gm_reports_read_staff on public.gitmessage_reports;
create policy gm_reports_read_staff on public.gitmessage_reports for select to authenticated
using (public.gitmessage_is_staff());

alter table public.conversation_members
  add column if not exists member_role text not null default 'member',
  add column if not exists member_permissions jsonb not null default '{"manage_group":false,"manage_members":false,"manage_messages":false}'::jsonb;
create or replace function public.gitmessage_assign_group_owner_role()
returns trigger language plpgsql security definer set search_path=public,auth as $
begin
  if exists(select 1 from public.conversations c where c.id=new.conversation_id and c.created_by=new.user_id and c.kind='group') then
    new.member_role := 'owner';
    new.member_permissions := '{"manage_group":true,"manage_members":true,"manage_messages":true}'::jsonb;
  end if;
  return new;
end $;
drop trigger if exists gm_assign_group_owner_role on public.conversation_members;
create trigger gm_assign_group_owner_role before insert on public.conversation_members
for each row execute function public.gitmessage_assign_group_owner_role();

update public.conversation_members cm
set member_role='owner',
    member_permissions='{"manage_group":true,"manage_members":true,"manage_messages":true}'::jsonb
from public.conversations c
where c.id=cm.conversation_id and c.created_by=cm.user_id;

create or replace function public.gitmessage_can_manage_group(target_conversation_id uuid, permission_key text default 'manage_group')
returns boolean language sql security definer stable set search_path=public,auth as $$
  select public.gitmessage_is_staff() or exists(
    select 1 from public.conversation_members cm
    where cm.conversation_id=target_conversation_id and cm.user_id=auth.uid()
      and (cm.member_role='owner' or coalesce((cm.member_permissions->>permission_key)::boolean,false))
  );
$$;

create or replace function public.update_gitmessage_group(
  target_conversation_id uuid, new_title text, new_avatar_path text default null
) returns void language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.gitmessage_can_manage_group(target_conversation_id,'manage_group') then raise exception 'You do not have permission to manage this group.'; end if;
  if nullif(trim(new_title),'') is null or char_length(trim(new_title))>80 then raise exception 'Group name must be 1–80 characters.'; end if;
  update public.conversations set title=trim(new_title), avatar_path=coalesce(new_avatar_path,avatar_path), updated_at=now()
  where id=target_conversation_id and kind='group';
  if not found then raise exception 'Group not found.'; end if;
end $$;

create or replace function public.set_gitmessage_group_member_permissions(
  target_conversation_id uuid, target_user_id uuid, new_permissions jsonb, new_role text default 'member'
) returns void language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.gitmessage_can_manage_group(target_conversation_id,'manage_members') then raise exception 'You do not have permission to manage members.'; end if;
  if new_role not in ('member','moderator','admin') then raise exception 'Invalid group role.'; end if;
  if target_user_id=auth.uid() then raise exception 'You cannot change your own permissions.'; end if;
  if exists(select 1 from public.conversation_members where conversation_id=target_conversation_id and user_id=target_user_id and member_role='owner') then
    raise exception 'The group owner cannot be demoted.';
  end if;
  update public.conversation_members
  set member_role=new_role,
      member_permissions=jsonb_build_object(
        'manage_group',coalesce((new_permissions->>'manage_group')::boolean,false),
        'manage_members',coalesce((new_permissions->>'manage_members')::boolean,false),
        'manage_messages',coalesce((new_permissions->>'manage_messages')::boolean,false)
      )
  where conversation_id=target_conversation_id and user_id=target_user_id;
  if not found then raise exception 'Group member not found.'; end if;
end $$;

create or replace function public.kick_gitmessage_group_member(target_conversation_id uuid, target_user_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.gitmessage_can_manage_group(target_conversation_id,'manage_members') then raise exception 'You do not have permission to remove members.'; end if;
  if target_user_id=auth.uid() then raise exception 'Use Leave group to remove yourself.'; end if;
  delete from public.conversation_members
  where conversation_id=target_conversation_id and user_id=target_user_id and member_role<>'owner';
  if not found then raise exception 'Member not found or cannot be removed.'; end if;
end $$;

revoke all on function public.gitmessage_can_manage_group(uuid,text) from public,anon;
revoke all on function public.update_gitmessage_group(uuid,text,text) from public,anon;
revoke all on function public.set_gitmessage_group_member_permissions(uuid,uuid,jsonb,text) from public,anon;
revoke all on function public.kick_gitmessage_group_member(uuid,uuid) from public,anon;
grant execute on function public.gitmessage_can_manage_group(uuid,text) to authenticated;
grant execute on function public.update_gitmessage_group(uuid,text,text) to authenticated;
grant execute on function public.set_gitmessage_group_member_permissions(uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.kick_gitmessage_group_member(uuid,uuid) to authenticated;

-- Server spaces are separate from conversations and use their own channels/messages.
create table if not exists public.gitmessage_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 64),
  description text not null default '' check (char_length(description)<=500),
  avatar_path text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default replace(gen_random_uuid()::text,'-',''),
  created_at timestamptz not null default now()
);
create table if not exists public.gitmessage_server_members (
  server_id uuid not null references public.gitmessage_servers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner','admin','moderator','member')),
  permissions jsonb not null default '{"manage_server":false,"manage_channels":false,"manage_members":false,"send_messages":true}'::jsonb,
  joined_at timestamptz not null default now(),
  primary key(server_id,user_id)
);
create table if not exists public.gitmessage_server_channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.gitmessage_servers(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 48),
  created_at timestamptz not null default now(),
  unique(server_id,name),
  unique(id,server_id)
);
create table if not exists public.gitmessage_server_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null,
  server_id uuid not null references public.gitmessage_servers(id) on delete cascade,
  foreign key(channel_id,server_id) references public.gitmessage_server_channels(id,server_id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
alter table public.gitmessage_servers enable row level security;
alter table public.gitmessage_server_members enable row level security;
alter table public.gitmessage_server_channels enable row level security;
alter table public.gitmessage_server_messages enable row level security;

create or replace function public.gitmessage_is_server_member(target_server_id uuid)
returns boolean language sql security definer stable set search_path=public,auth as $$
 select public.gitmessage_is_staff() or exists(select 1 from public.gitmessage_server_members where server_id=target_server_id and user_id=auth.uid());
$$;
create or replace function public.gitmessage_server_has_permission(target_server_id uuid, permission_key text)
returns boolean language sql security definer stable set search_path=public,auth as $$
 select public.gitmessage_is_staff() or exists(select 1 from public.gitmessage_server_members m where m.server_id=target_server_id and m.user_id=auth.uid()
   and (m.member_role='owner' or coalesce((m.permissions->>permission_key)::boolean,false)));
$$;

drop policy if exists gm_servers_read_member on public.gitmessage_servers;
create policy gm_servers_read_member on public.gitmessage_servers for select to authenticated using (public.gitmessage_is_server_member(id));
drop policy if exists gm_servers_update_manager on public.gitmessage_servers;
create policy gm_servers_update_manager on public.gitmessage_servers for update to authenticated using (public.gitmessage_server_has_permission(id,'manage_server')) with check (public.gitmessage_server_has_permission(id,'manage_server'));
drop policy if exists gm_server_members_read on public.gitmessage_server_members;
create policy gm_server_members_read on public.gitmessage_server_members for select to authenticated using (public.gitmessage_is_server_member(server_id));
drop policy if exists gm_server_members_manage on public.gitmessage_server_members;
create policy gm_server_members_manage on public.gitmessage_server_members for all to authenticated
using (public.gitmessage_server_has_permission(server_id,'manage_members'))
with check (public.gitmessage_server_has_permission(server_id,'manage_members'));
drop policy if exists gm_server_channels_read on public.gitmessage_server_channels;
create policy gm_server_channels_read on public.gitmessage_server_channels for select to authenticated using (public.gitmessage_is_server_member(server_id));
drop policy if exists gm_server_channels_manage on public.gitmessage_server_channels;
create policy gm_server_channels_manage on public.gitmessage_server_channels for all to authenticated
using (public.gitmessage_server_has_permission(server_id,'manage_channels'))
with check (public.gitmessage_server_has_permission(server_id,'manage_channels'));
drop policy if exists gm_server_messages_read on public.gitmessage_server_messages;
create policy gm_server_messages_read on public.gitmessage_server_messages for select to authenticated using (public.gitmessage_is_server_member(server_id));
drop policy if exists gm_server_messages_insert on public.gitmessage_server_messages;
create policy gm_server_messages_insert on public.gitmessage_server_messages for insert to authenticated
with check (sender_id=auth.uid() and public.gitmessage_is_server_member(server_id)
  and exists(select 1 from public.gitmessage_server_members m where m.server_id=server_id and m.user_id=auth.uid()
    and coalesce((m.permissions->>'send_messages')::boolean,true)));

create or replace function public.create_gitmessage_server(server_name text, server_description text default '')
returns table(server_id uuid, invite_code text) language plpgsql security definer set search_path=public,auth as $$
declare sid uuid; code text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 if char_length(trim(coalesce(server_name,''))) not between 2 and 64 then raise exception 'Server name must be 2–64 characters.'; end if;
 insert into public.gitmessage_servers(name,description,owner_id) values(trim(server_name),left(coalesce(server_description,''),500),auth.uid())
 returning id,gitmessage_servers.invite_code into sid,code;
 insert into public.gitmessage_server_members(server_id,user_id,member_role,permissions)
 values(sid,auth.uid(),'owner','{"manage_server":true,"manage_channels":true,"manage_members":true,"send_messages":true}'::jsonb);
 insert into public.gitmessage_server_channels(server_id,name) values(sid,'general');
 return query select sid,code;
end $$;

create or replace function public.join_gitmessage_server(server_invite_code text)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare sid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select id into sid from public.gitmessage_servers where invite_code=trim(server_invite_code);
 if sid is null then raise exception 'Invite code not found.'; end if;
 insert into public.gitmessage_server_members(server_id,user_id) values(sid,auth.uid()) on conflict do nothing;
 return sid;
end $$;

create or replace function public.get_my_gitmessage_servers()
returns table(server_id uuid,name text,description text,avatar_path text,invite_code text,member_role text)
language sql security definer stable set search_path=public,auth as $$
 select s.id,s.name,s.description,s.avatar_path,s.invite_code,m.member_role
 from public.gitmessage_server_members m join public.gitmessage_servers s on s.id=m.server_id
 where m.user_id=auth.uid() order by s.created_at desc;
$$;

revoke all on function public.gitmessage_is_server_member(uuid) from public,anon;
revoke all on function public.gitmessage_server_has_permission(uuid,text) from public,anon;
revoke all on function public.create_gitmessage_server(text,text) from public,anon;
revoke all on function public.join_gitmessage_server(text) from public,anon;
revoke all on function public.get_my_gitmessage_servers() from public,anon;
grant execute on function public.gitmessage_is_server_member(uuid) to authenticated;
grant execute on function public.gitmessage_server_has_permission(uuid,text) to authenticated;
grant execute on function public.create_gitmessage_server(text,text) to authenticated;
grant execute on function public.join_gitmessage_server(text) to authenticated;
grant execute on function public.get_my_gitmessage_servers() to authenticated;

-- SECURITY DEFINER helper lets the guard see blocks created by either participant.
create or replace function public.gitmessage_is_blocked_between(user_a uuid,user_b uuid)
returns boolean language sql security definer stable set search_path=public,auth as $
 select exists(select 1 from public.gitmessage_blocks b
   where (b.blocker_id=user_a and b.blocked_id=user_b)
      or (b.blocker_id=user_b and b.blocked_id=user_a));
$;
revoke all on function public.gitmessage_is_blocked_between(uuid,uuid) from public,anon;
grant execute on function public.gitmessage_is_blocked_between(uuid,uuid) to authenticated;

-- Prevent direct-message inserts between users who have blocked one another.
drop policy if exists gm_messages_block_guard on public.messages;
create policy gm_messages_block_guard on public.messages as restrictive for insert to authenticated
with check (
 not exists (
  select 1 from public.conversation_members other_member
  where other_member.conversation_id=messages.conversation_id and other_member.user_id<>auth.uid()
    and public.gitmessage_is_blocked_between(auth.uid(),other_member.user_id)
 )
);


-- Public group avatar images. Only members with group-management permission can upload.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gitmessage-group-avatars','gitmessage-group-avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880;
drop policy if exists gm_group_avatar_upload on storage.objects;
create policy gm_group_avatar_upload on storage.objects for insert to authenticated
with check (
 bucket_id='gitmessage-group-avatars'
 and exists (
   select 1 from public.conversation_members cm
   where cm.conversation_id=((storage.foldername(name))[1])::uuid
     and cm.user_id=auth.uid()
     and (cm.member_role='owner' or coalesce((cm.member_permissions->>'manage_group')::boolean,false))
 )
);
