-- Grant the table privileges required by GitMessage messaging operations.
-- Row-level security policies continue to restrict which messages users can access.
grant select, insert, update on table public.messages to authenticated;
