-- GitMessage fixes: idempotent conversation membership and friend requests.
-- Safe to run more than once. Does not delete existing accounts or conversations.

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
  where c.kind = 'direct'
    and exists (select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=current_user_id)
    and exists (select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=target_user_id)
    and (select count(*) from public.conversation_members m where m.conversation_id=c.id) = 2
  order by c.updated_at desc nulls last
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.conversations (kind, title, created_by)
  values ('direct', null, current_user_id)
  returning id into new_id;

  -- Some installations also add created_by through a trigger. Ignore that duplicate safely.
  insert into public.conversation_members (conversation_id, user_id)
  values (new_id, current_user_id), (new_id, target_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return new_id;
end;
$$;

create or replace function public.create_group_conversation(group_title text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_id uuid;
  member_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Sign in required.'; end if;
  if nullif(trim(group_title), '') is null then raise exception 'Enter a group name.'; end if;
  if coalesce(array_length(member_ids, 1), 0) < 1 then raise exception 'Choose at least one other member.'; end if;

  insert into public.conversations(kind, title, created_by)
  values ('group', trim(group_title), current_user_id)
  returning id into new_id;

  insert into public.conversation_members(conversation_id, user_id)
  values (new_id, current_user_id)
  on conflict (conversation_id, user_id) do nothing;

  foreach member_id in array member_ids loop
    if member_id is not null
       and member_id <> current_user_id
       and exists (select 1 from auth.users where id = member_id) then
      insert into public.conversation_members(conversation_id, user_id)
      values (new_id, member_id)
      on conflict (conversation_id, user_id) do nothing;
    end if;
  end loop;

  if (select count(*) from public.conversation_members where conversation_id = new_id) < 2 then
    raise exception 'Choose at least one valid member.';
  end if;
  return new_id;
end;
$$;

create or replace function public.send_gitmessage_friend_request(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if target_user_id is null or target_user_id = auth.uid() then raise exception 'Choose another user.'; end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'That GitMessage account could not be found.';
  end if;

  insert into public.friend_requests(sender_id, recipient_id, status, updated_at)
  values (auth.uid(), target_user_id, 'pending', now())
  on conflict (sender_id, recipient_id)
  do update set status = 'pending', updated_at = now()
  returning id into result_id;

  return result_id;
end;
$$;

create or replace function public.respond_gitmessage_friend_request(request_id uuid, accept_request boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  request_row public.friend_requests%rowtype;
begin
  update public.friend_requests
  set status = case when accept_request then 'accepted' else 'declined' end,
      updated_at = now()
  where id = request_id
    and recipient_id = auth.uid()
    and status = 'pending'
  returning * into request_row;

  if not found then raise exception 'Friend request not found or already handled.'; end if;

  if accept_request then
    insert into public.user_contacts(user_id, contact_id)
    values (request_row.sender_id, request_row.recipient_id)
    on conflict do nothing;

    insert into public.user_contacts(user_id, contact_id)
    values (request_row.recipient_id, request_row.sender_id)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.create_direct_conversation(uuid) from public, anon;
revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
revoke all on function public.send_gitmessage_friend_request(uuid) from public, anon;
revoke all on function public.respond_gitmessage_friend_request(uuid, boolean) from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
grant execute on function public.send_gitmessage_friend_request(uuid) to authenticated;
grant execute on function public.respond_gitmessage_friend_request(uuid, boolean) to authenticated;
