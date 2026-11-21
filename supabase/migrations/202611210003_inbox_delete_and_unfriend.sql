-- Inbox removal and friend management for GitMessage.
-- Safe to run more than once. Existing accounts, messages and conversations are preserved.

create or replace function public.get_my_gitmessage_friends()
returns table(user_id uuid, username text, display_name text, email text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select distinct u.id, p.username, p.display_name, u.email::text
  from public.user_contacts uc
  join auth.users u on u.id = uc.contact_id
  left join public.profiles p on p.id = u.id
  where uc.user_id = auth.uid()
  order by p.username nulls last, u.email;
$$;

create or replace function public.unfriend_gitmessage_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'Choose another user.';
  end if;

  delete from public.user_contacts
  where (user_id = auth.uid() and contact_id = target_user_id)
     or (user_id = target_user_id and contact_id = auth.uid());
end;
$$;

create or replace function public.leave_gitmessage_conversation(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if target_conversation_id is null then raise exception 'Choose a conversation.'; end if;

  delete from public.conversation_members
  where conversation_id = target_conversation_id
    and user_id = auth.uid();

  if not found then raise exception 'Conversation not found in your inbox.'; end if;

  -- If nobody remains (for example, the last member left a group), remove the
  -- now-empty conversation and its dependent messages. Otherwise other members
  -- keep their own copy and history.
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = target_conversation_id
  ) then
    delete from public.conversations where id = target_conversation_id;
  end if;
end;
$$;

revoke all on function public.get_my_gitmessage_friends() from public, anon;
revoke all on function public.unfriend_gitmessage_user(uuid) from public, anon;
revoke all on function public.leave_gitmessage_conversation(uuid) from public, anon;
grant execute on function public.get_my_gitmessage_friends() to authenticated;
grant execute on function public.unfriend_gitmessage_user(uuid) to authenticated;
grant execute on function public.leave_gitmessage_conversation(uuid) to authenticated;
