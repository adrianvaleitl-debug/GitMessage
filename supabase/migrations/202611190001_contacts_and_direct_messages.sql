-- GitMessage contacts and direct-message foundation
-- Run once in Supabase SQL Editor after deploying this app version.

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_members enable row level security;

drop policy if exists gitmessage_members_read_self on public.conversation_members;
create policy gitmessage_members_read_self
on public.conversation_members for select
to authenticated
using (user_id = auth.uid());

-- Existing conversations remain visible to their creator after membership is introduced.
insert into public.conversation_members (conversation_id, user_id)
select id, created_by
from public.conversations
where created_by is not null
on conflict do nothing;

create or replace function public.search_gitmessage_users(search_email text)
returns table(user_id uuid, email text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.id, u.email::text
  from auth.users u
  where auth.uid() is not null
    and u.id <> auth.uid()
    and u.email is not null
    and lower(u.email) = lower(trim(search_email))
  limit 1;
$$;

create or replace function public.create_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  target_email text;
  existing_id uuid;
  new_id uuid;
  lock_key text;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;
  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Choose another GitMessage user.';
  end if;

  select email into target_email from auth.users where id = target_user_id;
  if target_email is null then
    raise exception 'That GitMessage account could not be found.';
  end if;

  lock_key := least(current_user_id::text, target_user_id::text) || ':' ||
              greatest(current_user_id::text, target_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  select c.id into existing_id
  from public.conversations c
  where c.kind = 'group' = false
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = current_user_id
    )
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = target_user_id
    )
    and (
      select count(*) from public.conversation_members m
      where m.conversation_id = c.id
    ) = 2
  order by c.updated_at desc nulls last
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.conversations (kind, title, created_by)
  values ('direct', null, current_user_id)
  returning id into new_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (new_id, current_user_id), (new_id, target_user_id);

  return new_id;
end;
$$;

create or replace function public.get_my_conversations()
returns table(id uuid, title text, updated_at timestamptz, is_group boolean)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    c.id,
    case
      when c.kind = 'group' then c.title
      else coalesce(other_user.email::text, c.title, 'Direct message')
    end as title,
    c.updated_at,
    (c.kind = 'group') as is_group
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.user_id = auth.uid()
  left join lateral (
    select u.email
    from public.conversation_members other_member
    join auth.users u on u.id = other_member.user_id
    where other_member.conversation_id = c.id
      and other_member.user_id <> auth.uid()
    limit 1
  ) other_user on true
  order by c.updated_at desc nulls last;
$$;

-- Membership is required to read conversations and messages or send a message.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists gitmessage_conversations_member_read on public.conversations;
create policy gitmessage_conversations_member_read
on public.conversations for select
to authenticated
using (
  exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conversations.id
      and m.user_id = auth.uid()
  )
);

drop policy if exists gitmessage_messages_member_read on public.messages;
create policy gitmessage_messages_member_read
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.conversation_members m
    where m.conversation_id = messages.conversation_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists gitmessage_messages_member_insert on public.messages;
create policy gitmessage_messages_member_insert
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversation_members m
    where m.conversation_id = messages.conversation_id
      and m.user_id = auth.uid()
  )
);

-- Keep the conversation list ordered by recent activity.
create or replace function public.gitmessage_touch_conversation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists gitmessage_message_updates_conversation on public.messages;
create trigger gitmessage_message_updates_conversation
after insert on public.messages
for each row execute function public.gitmessage_touch_conversation();

-- Ensure message inserts are delivered to active desktop clients.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

revoke all on function public.search_gitmessage_users(text) from public, anon;
revoke all on function public.create_direct_conversation(uuid) from public, anon;
revoke all on function public.get_my_conversations() from public, anon;
grant execute on function public.search_gitmessage_users(text) to authenticated;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
grant execute on function public.get_my_conversations() to authenticated;
