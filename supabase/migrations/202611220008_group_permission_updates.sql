-- Repair group member permission updates used by the Manage group panel.
-- Owners can assign roles and permissions. Members with manage_members can
-- manage non-owner members, but cannot promote themselves or assign ownership.

drop function if exists public.set_gitmessage_group_member_permissions(uuid,uuid,jsonb,text);

create function public.set_gitmessage_group_member_permissions(
  target_conversation_id uuid,
  target_user_id uuid,
  new_permissions jsonb,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_role text;
  actor_permissions jsonb;
  target_role text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if new_role not in ('member','moderator','admin') then
    raise exception 'Invalid group role.';
  end if;

  select member_role, coalesce(member_permissions,'{}'::jsonb)
    into actor_role, actor_permissions
  from public.conversation_members
  where conversation_id=target_conversation_id and user_id=auth.uid();

  if not found then
    raise exception 'You are not a member of this group.';
  end if;

  if actor_role <> 'owner' and coalesce((actor_permissions->>'manage_members')::boolean,false) is not true then
    raise exception 'You do not have permission to manage group members.';
  end if;

  select member_role into target_role
  from public.conversation_members
  where conversation_id=target_conversation_id and user_id=target_user_id;

  if not found then
    raise exception 'That user is not a member of this group.';
  end if;

  if target_role='owner' then
    raise exception 'The group owner permissions cannot be changed.';
  end if;

  if actor_role <> 'owner' and new_role='admin' then
    raise exception 'Only the group owner can promote an administrator.';
  end if;

  update public.conversation_members
  set member_role=new_role,
      member_permissions=coalesce(new_permissions,'{}'::jsonb)
  where conversation_id=target_conversation_id
    and user_id=target_user_id;
end;
$$;

revoke all on function public.set_gitmessage_group_member_permissions(uuid,uuid,jsonb,text) from public, anon;
grant execute on function public.set_gitmessage_group_member_permissions(uuid,uuid,jsonb,text) to authenticated;
