-- Typing presence and reliable contact status visibility.
create table if not exists public.gitmessage_typing (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);
alter table public.gitmessage_typing enable row level security;
drop policy if exists gm_typing_conversation_members on public.gitmessage_typing;
create policy gm_typing_conversation_members on public.gitmessage_typing
for all to authenticated
using (
  exists(select 1 from public.conversation_members cm
    where cm.conversation_id=gitmessage_typing.conversation_id and cm.user_id=auth.uid())
)
with check (
  user_id=auth.uid() and exists(select 1 from public.conversation_members cm
    where cm.conversation_id=gitmessage_typing.conversation_id and cm.user_id=auth.uid())
);
grant select, insert, update, delete on public.gitmessage_typing to authenticated;
create index if not exists gm_typing_updated_idx on public.gitmessage_typing(conversation_id,updated_at desc);

-- A person sharing a conversation can see the other participant's status,
-- even if an older one-way contact edge is missing.
drop policy if exists gm_status_read on public.gitmessage_user_status;
create policy gm_status_read on public.gitmessage_user_status for select to authenticated
using (
  user_id=auth.uid()
  or visibility='everyone'
  or (
    visibility='friends'
    and (
      exists(select 1 from public.user_contacts uc
        where uc.user_id=auth.uid() and uc.contact_id=gitmessage_user_status.user_id)
      or exists(
        select 1 from public.conversation_members mine
        join public.conversation_members theirs
          on theirs.conversation_id=mine.conversation_id
        where mine.user_id=auth.uid()
          and theirs.user_id=gitmessage_user_status.user_id
      )
    )
  )
);

-- Explicit grants for read receipts (RLS policies from migration 007 remain active).
grant select, insert, update on public.gitmessage_message_read_receipts to authenticated;
