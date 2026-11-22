-- GitMessage feature-suite data layer.
-- Run this migration in the Supabase SQL editor before using the matching app features.
-- All records are scoped to the signed-in user or conversations they belong to.

alter table public.messages
  add column if not exists parent_message_id uuid references public.messages(id) on delete cascade;

create table if not exists public.gitmessage_message_revisions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete cascade,
  previous_body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gitmessage_message_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,message_id)
);

create table if not exists public.gitmessage_pinned_messages (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(conversation_id,message_id)
);

create table if not exists public.gitmessage_scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check(char_length(trim(body)) between 1 and 10000),
  send_at timestamptz not null,
  sent_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.gitmessage_conversation_preferences (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  theme jsonb not null default '{}'::jsonb,
  notification_level text not null default 'all' check(notification_level in ('all','mentions','muted')),
  disappearing_after_seconds integer check(disappearing_after_seconds is null or disappearing_after_seconds in (3600,86400,604800,2592000)),
  updated_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);

create table if not exists public.gitmessage_drafts (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);

create table if not exists public.gitmessage_user_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status_text text not null default '' check(char_length(status_text)<=120),
  expires_at timestamptz,
  visibility text not null default 'friends' check(visibility in ('everyone','friends','nobody')),
  updated_at timestamptz not null default now()
);

create table if not exists public.gitmessage_notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  enabled boolean not null default true,
  sound text,
  quiet_start time,
  quiet_end time,
  updated_at timestamptz not null default now(),
  unique(user_id,conversation_id)
);

create table if not exists public.gitmessage_polls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  creator_id uuid not null references auth.users(id) on delete cascade,
  question text not null check(char_length(trim(question)) between 1 and 300),
  multiple_choice boolean not null default false,
  anonymous boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.gitmessage_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.gitmessage_polls(id) on delete cascade,
  label text not null check(char_length(trim(label)) between 1 and 120),
  position integer not null default 0
);

create table if not exists public.gitmessage_poll_votes (
  poll_id uuid not null references public.gitmessage_polls(id) on delete cascade,
  option_id uuid not null references public.gitmessage_poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(poll_id,option_id,user_id)
);

create table if not exists public.gitmessage_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 1 and 120),
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists public.gitmessage_event_rsvps (
  event_id uuid not null references public.gitmessage_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response text not null check(response in ('going','maybe','not_going')),
  updated_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

alter table public.gitmessage_message_revisions enable row level security;
alter table public.gitmessage_message_bookmarks enable row level security;
alter table public.gitmessage_pinned_messages enable row level security;
alter table public.gitmessage_scheduled_messages enable row level security;
alter table public.gitmessage_conversation_preferences enable row level security;
alter table public.gitmessage_drafts enable row level security;
alter table public.gitmessage_user_status enable row level security;
alter table public.gitmessage_notification_preferences enable row level security;
alter table public.gitmessage_polls enable row level security;
alter table public.gitmessage_poll_options enable row level security;
alter table public.gitmessage_poll_votes enable row level security;
alter table public.gitmessage_events enable row level security;
alter table public.gitmessage_event_rsvps enable row level security;

-- A user can bookmark only messages in conversations they belong to.
drop policy if exists gm_bookmarks_self on public.gitmessage_message_bookmarks;
create policy gm_bookmarks_self on public.gitmessage_message_bookmarks for all to authenticated
using(user_id=auth.uid() and exists(select 1 from public.messages m join public.conversation_members cm on cm.conversation_id=m.conversation_id where m.id=message_id and cm.user_id=auth.uid()))
with check(user_id=auth.uid() and exists(select 1 from public.messages m join public.conversation_members cm on cm.conversation_id=m.conversation_id where m.id=message_id and cm.user_id=auth.uid()));

drop policy if exists gm_revisions_conversation_read on public.gitmessage_message_revisions;
create policy gm_revisions_conversation_read on public.gitmessage_message_revisions for select to authenticated
using(exists(select 1 from public.messages m join public.conversation_members cm on cm.conversation_id=m.conversation_id where m.id=message_id and cm.user_id=auth.uid()));
drop policy if exists gm_revisions_own_insert on public.gitmessage_message_revisions;
create policy gm_revisions_own_insert on public.gitmessage_message_revisions for insert to authenticated
with check(editor_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and m.sender_id=auth.uid()));

drop policy if exists gm_pins_member_read on public.gitmessage_pinned_messages;
create policy gm_pins_member_read on public.gitmessage_pinned_messages for select to authenticated
using(exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
drop policy if exists gm_pins_member_write on public.gitmessage_pinned_messages;
create policy gm_pins_member_write on public.gitmessage_pinned_messages for all to authenticated
using(pinned_by=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_pinned_messages.conversation_id and cm.user_id=auth.uid()))
with check(pinned_by=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_pinned_messages.conversation_id and cm.user_id=auth.uid()) and exists(select 1 from public.messages m where m.id=message_id and m.conversation_id=conversation_id));

drop policy if exists gm_scheduled_self on public.gitmessage_scheduled_messages;
create policy gm_scheduled_self on public.gitmessage_scheduled_messages for all to authenticated
using(sender_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_scheduled_messages.conversation_id and cm.user_id=auth.uid()))
with check(sender_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_scheduled_messages.conversation_id and cm.user_id=auth.uid()));

drop policy if exists gm_conversation_prefs_self on public.gitmessage_conversation_preferences;
create policy gm_conversation_prefs_self on public.gitmessage_conversation_preferences for all to authenticated
using(user_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_conversation_preferences.conversation_id and cm.user_id=auth.uid()))
with check(user_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_conversation_preferences.conversation_id and cm.user_id=auth.uid()));

drop policy if exists gm_drafts_self on public.gitmessage_drafts;
create policy gm_drafts_self on public.gitmessage_drafts for all to authenticated
using(user_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_drafts.conversation_id and cm.user_id=auth.uid()))
with check(user_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_drafts.conversation_id and cm.user_id=auth.uid()));

drop policy if exists gm_status_read on public.gitmessage_user_status;
create policy gm_status_read on public.gitmessage_user_status for select to authenticated
using(user_id=auth.uid() or visibility='everyone' or (visibility='friends' and exists(select 1 from public.user_contacts uc where uc.user_id=auth.uid() and uc.contact_id=gitmessage_user_status.user_id)));
drop policy if exists gm_status_self_write on public.gitmessage_user_status;
create policy gm_status_self_write on public.gitmessage_user_status for all to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists gm_notification_prefs_self on public.gitmessage_notification_preferences;
create policy gm_notification_prefs_self on public.gitmessage_notification_preferences for all to authenticated
using(user_id=auth.uid() and (conversation_id is null or exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_notification_preferences.conversation_id and cm.user_id=auth.uid())))
with check(user_id=auth.uid() and (gitmessage_notification_preferences.conversation_id is null or exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_notification_preferences.conversation_id and cm.user_id=auth.uid())));

drop policy if exists gm_polls_member_read on public.gitmessage_polls;
create policy gm_polls_member_read on public.gitmessage_polls for select to authenticated
using(exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_polls.conversation_id and cm.user_id=auth.uid());
drop policy if exists gm_polls_member_create on public.gitmessage_polls;
create policy gm_polls_member_create on public.gitmessage_polls for insert to authenticated
with check(creator_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
drop policy if exists gm_poll_options_member_read on public.gitmessage_poll_options;
create policy gm_poll_options_member_read on public.gitmessage_poll_options for select to authenticated
using(exists(select 1 from public.gitmessage_polls p join public.conversation_members cm on cm.conversation_id=p.conversation_id where p.id=poll_id and cm.user_id=auth.uid()));
drop policy if exists gm_poll_options_creator_write on public.gitmessage_poll_options;
create policy gm_poll_options_creator_write on public.gitmessage_poll_options for all to authenticated
using(exists(select 1 from public.gitmessage_polls p where p.id=poll_id and p.creator_id=auth.uid()))
with check(exists(select 1 from public.gitmessage_polls p where p.id=poll_id and p.creator_id=auth.uid()));
drop policy if exists gm_poll_votes_member on public.gitmessage_poll_votes;
create policy gm_poll_votes_member on public.gitmessage_poll_votes for all to authenticated
using(user_id=auth.uid() and exists(select 1 from public.gitmessage_polls p join public.conversation_members cm on cm.conversation_id=p.conversation_id where p.id=poll_id and cm.user_id=auth.uid()))
with check(user_id=auth.uid() and exists(select 1 from public.gitmessage_polls p join public.conversation_members cm on cm.conversation_id=p.conversation_id where p.id=poll_id and cm.user_id=auth.uid()));

drop policy if exists gm_events_member_read on public.gitmessage_events;
create policy gm_events_member_read on public.gitmessage_events for select to authenticated
using(exists(select 1 from public.conversation_members cm where cm.conversation_id=gitmessage_events.conversation_id and cm.user_id=auth.uid()));
drop policy if exists gm_events_member_create on public.gitmessage_events;
create policy gm_events_member_create on public.gitmessage_events for insert to authenticated
with check(creator_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
drop policy if exists gm_event_rsvps_member on public.gitmessage_event_rsvps;
create policy gm_event_rsvps_member on public.gitmessage_event_rsvps for all to authenticated
using(user_id=auth.uid() and exists(select 1 from public.gitmessage_events e join public.conversation_members cm on cm.conversation_id=e.conversation_id where e.id=event_id and cm.user_id=auth.uid()))
with check(user_id=auth.uid() and exists(select 1 from public.gitmessage_events e join public.conversation_members cm on cm.conversation_id=e.conversation_id where e.id=event_id and cm.user_id=auth.uid()));

create index if not exists gm_scheduled_due_idx on public.gitmessage_scheduled_messages(send_at) where sent_message_id is null;
create index if not exists gm_bookmarks_user_idx on public.gitmessage_message_bookmarks(user_id,created_at desc);
create index if not exists gm_pins_conversation_idx on public.gitmessage_pinned_messages(conversation_id,created_at desc);
create index if not exists gm_events_start_idx on public.gitmessage_events(conversation_id,starts_at);
create index if not exists gm_threads_parent_idx on public.messages(parent_message_id);
