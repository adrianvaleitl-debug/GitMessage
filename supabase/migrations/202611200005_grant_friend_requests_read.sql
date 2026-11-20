-- Allow signed-in users to read only friend requests covered by the existing RLS policy.
grant select on table public.friend_requests to authenticated;
