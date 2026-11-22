-- Fix permission denied errors when reading and managing a user's contacts.
-- Each signed-in user may only access contact rows where they are the owner.
grant usage on schema public to authenticated;
grant select, insert, delete on table public.user_contacts to authenticated;

alter table public.user_contacts enable row level security;

drop policy if exists gitmessage_user_contacts_select_own on public.user_contacts;
create policy gitmessage_user_contacts_select_own
on public.user_contacts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists gitmessage_user_contacts_insert_own on public.user_contacts;
create policy gitmessage_user_contacts_insert_own
on public.user_contacts
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists gitmessage_user_contacts_delete_own on public.user_contacts;
create policy gitmessage_user_contacts_delete_own
on public.user_contacts
for delete
to authenticated
using (user_id = auth.uid());
