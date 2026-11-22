-- Group descriptions, group member avatar metadata in inbox, and editable group details.
alter table public.conversations
  add column if not exists description text not null default '';

create or replace function public.create_group_conversation(
  group_title text,
  member_ids uuid[],
  group_description text
)
returns uuid
language plpgsql
security definer
set search_path=public,auth
as $fn$
declare new_id uuid; member_id uuid; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Sign in required.'; end if;
  if nullif(trim(group_title),'') is null then raise exception 'Enter a group name.'; end if;
  if char_length(trim(group_title))>80 then raise exception 'Group name must be 1–80 characters.'; end if;
  if char_length(coalesce(group_description,''))>500 then raise exception 'Group description must be 500 characters or fewer.'; end if;
  if coalesce(array_length(member_ids,1),0)<1 then raise exception 'Choose at least one other member.'; end if;
  insert into public.conversations(kind,title,description,created_by)
  values('group',trim(group_title),trim(coalesce(group_description,'')),current_user_id)
  returning id into new_id;
  insert into public.conversation_members(conversation_id,user_id) values(new_id,current_user_id);
  foreach member_id in array member_ids loop
    if member_id<>current_user_id and exists(select 1 from auth.users where id=member_id) then
      insert into public.conversation_members(conversation_id,user_id) values(new_id,member_id) on conflict do nothing;
    end if;
  end loop;
  if (select count(*) from public.conversation_members where conversation_id=new_id)<2 then
    raise exception 'Choose at least one valid member.';
  end if;
  return new_id;
end
$fn$;

create or replace function public.update_gitmessage_group_details(
  target_conversation_id uuid,
  new_title text,
  new_avatar_path text,
  new_description text
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $fn$
begin
  if not public.gitmessage_can_manage_group(target_conversation_id,'manage_group') then
    raise exception 'You do not have permission to manage this group.';
  end if;
  if nullif(trim(new_title),'') is null or char_length(trim(new_title))>80 then
    raise exception 'Group name must be 1–80 characters.';
  end if;
  if char_length(coalesce(new_description,''))>500 then
    raise exception 'Group description must be 500 characters or fewer.';
  end if;
  update public.conversations
  set title=trim(new_title),
      avatar_path=new_avatar_path,
      description=trim(coalesce(new_description,'')),
      updated_at=now()
  where id=target_conversation_id and kind='group';
  if not found then raise exception 'Group not found.'; end if;
end
$fn$;

drop function if exists public.get_my_conversations();
create function public.get_my_conversations()
returns table(
  id uuid,
  title text,
  updated_at timestamptz,
  is_group boolean,
  avatar_path text,
  description text,
  members jsonb
)
language sql
security definer
set search_path=public,auth
stable
as $fn$
  select
    c.id,
    case when c.kind='group' then c.title
      else coalesce(other_profile.display_name,other_profile.username,other_user.email::text,c.title,'Direct message')
    end as title,
    c.updated_at,
    (c.kind='group') as is_group,
    case when c.kind='group' then c.avatar_path else other_profile.avatar_path end as avatar_path,
    coalesce(c.description,'') as description,
    coalesce(group_members.members,'[]'::jsonb) as members
  from public.conversations c
  join public.conversation_members mine on mine.conversation_id=c.id and mine.user_id=auth.uid()
  left join lateral (
    select u.id,u.email
    from public.conversation_members m
    join auth.users u on u.id=m.user_id
    where m.conversation_id=c.id and m.user_id<>auth.uid()
    order by m.joined_at
    limit 1
  ) other_user on true
  left join public.profiles other_profile on other_profile.id=other_user.id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'user_id',p.id,
      'username',p.username,
      'display_name',p.display_name,
      'avatar_path',p.avatar_path
    ) order by cm.joined_at) as members
    from public.conversation_members cm
    join public.profiles p on p.id=cm.user_id
    where cm.conversation_id=c.id and c.kind='group'
  ) group_members on true
  order by c.updated_at desc nulls last;
$fn$;

revoke all on function public.create_group_conversation(text,uuid[],text) from public,anon;
grant execute on function public.create_group_conversation(text,uuid[],text) to authenticated;
revoke all on function public.update_gitmessage_group_details(uuid,text,text,text) from public,anon;
grant execute on function public.update_gitmessage_group_details(uuid,text,text,text) to authenticated;
revoke all on function public.get_my_conversations() from public,anon;
grant execute on function public.get_my_conversations() to authenticated;
