-- GitMessage conversation controls: receipts and automatic message expiry.
alter table public.gitmessage_conversation_preferences
  add column if not exists read_receipts boolean not null default true;
alter table public.messages
  add column if not exists expires_at timestamptz;

create table if not exists public.gitmessage_message_read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(message_id,user_id)
);
alter table public.gitmessage_message_read_receipts enable row level security;
drop policy if exists gm_read_receipts_member_read on public.gitmessage_message_read_receipts;
create policy gm_read_receipts_member_read on public.gitmessage_message_read_receipts
for select to authenticated using (
  exists(select 1 from public.messages m join public.conversation_members cm
    on cm.conversation_id=m.conversation_id
    where m.id=message_id and cm.user_id=auth.uid())
);
drop policy if exists gm_read_receipts_self_insert on public.gitmessage_message_read_receipts;
create policy gm_read_receipts_self_insert on public.gitmessage_message_read_receipts
for insert to authenticated with check (
  user_id=auth.uid() and exists(
    select 1 from public.messages m join public.conversation_members cm
      on cm.conversation_id=m.conversation_id
    where m.id=message_id and cm.user_id=auth.uid()
  )
);
create index if not exists gm_read_receipts_message_idx
  on public.gitmessage_message_read_receipts(message_id,read_at desc);

create or replace function public.gitmessage_apply_temporary_chat_expiry()
returns trigger language plpgsql security definer set search_path=public
as $$
declare ttl integer;
begin
  select disappearing_after_seconds into ttl
  from public.gitmessage_conversation_preferences
  where conversation_id=new.conversation_id and user_id=new.sender_id;
  if ttl is not null and ttl > 0 then
    new.expires_at := now() + make_interval(secs => ttl);
  end if;
  -- Purge expired messages in this conversation whenever a new message arrives.
  delete from public.messages
  where conversation_id=new.conversation_id and expires_at is not null and expires_at<=now();
  return new;
end;
$$;
drop trigger if exists gm_temporary_chat_expiry on public.messages;
create trigger gm_temporary_chat_expiry
before insert on public.messages
for each row execute function public.gitmessage_apply_temporary_chat_expiry();
