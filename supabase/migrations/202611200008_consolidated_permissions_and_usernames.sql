-- GitMessage consolidated authenticated table grants and username lookup.
-- RLS remains enabled; grants only allow requests to reach the existing row policies.
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select on public.friend_requests to authenticated;
grant select, insert, update, delete on public.gitmessage_reactions to authenticated;
grant select, insert, update on public.gitmessage_read_receipts to authenticated;
grant select, insert on public.gitmessage_attachments to authenticated;
grant select, insert, update, delete on public.gitmessage_typing to authenticated;
grant select, insert on public.gitmessage_call_signals to authenticated;
grant select, update on public.profiles to authenticated;

drop function if exists public.search_gitmessage_users(text);
create function public.search_gitmessage_users(search_query text)
returns table(user_id uuid, email text, username text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.id, u.email::text, p.username
  from auth.users u
  left join public.profiles p on p.id = u.id
  where auth.uid() is not null
    and u.id <> auth.uid()
    and (
      lower(coalesce(p.username, '')) = lower(ltrim(trim(search_query), '@'))
      or lower(coalesce(u.email, '')) = lower(trim(search_query))
    )
  order by case when lower(coalesce(p.username,'')) = lower(ltrim(trim(search_query), '@')) then 0 else 1 end
  limit 10;
$$;
revoke all on function public.search_gitmessage_users(text) from public, anon;
grant execute on function public.search_gitmessage_users(text) to authenticated;

create or replace function public.create_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  existing_id uuid;
  new_id uuid;
  lock_key text;
begin
  if current_user_id is null then raise exception 'You must be signed in.'; end if;
  if target_user_id is null or target_user_id = current_user_id then raise exception 'Choose another GitMessage user.'; end if;
  if not exists (select 1 from auth.users where id = target_user_id) then raise exception 'That GitMessage account could not be found.'; end if;
  lock_key := least(current_user_id::text, target_user_id::text) || ':' || greatest(current_user_id::text, target_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));
  select c.id into existing_id
  from public.conversations c
  where c.kind = 'direct'
    and exists (select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=current_user_id)
    and exists (select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=target_user_id)
    and (select count(*) from public.conversation_members m where m.conversation_id=c.id)=2
  order by c.updated_at desc nulls last limit 1;
  if existing_id is not null then return existing_id; end if;
  insert into public.conversations(kind,title,created_by) values('direct',null,current_user_id) returning id into new_id;
  insert into public.conversation_members(conversation_id,user_id)
  values(new_id,current_user_id),(new_id,target_user_id) on conflict do nothing;
  return new_id;
end;
$$;
revoke all on function public.create_direct_conversation(uuid) from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
