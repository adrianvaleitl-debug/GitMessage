-- Let authenticated clients read their own conversation membership rows.
-- Existing RLS policy limits visible rows to user_id = auth.uid().
grant select on table public.conversation_members to authenticated;
