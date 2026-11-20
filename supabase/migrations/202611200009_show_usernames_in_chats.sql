-- Show usernames for direct conversations, including phone-only accounts.
create or replace function public.get_my_conversations()
returns table(id uuid, title text, updated_at timestamptz, is_group boolean)
language sql
security definer
set search_path = public, auth
stable
as $$
  select c.id,
    case when c.kind = 'group' then c.title
      else coalesce(other_profile.display_name, other_profile.username, other_user.email::text, c.title, 'Direct message')
    end as title,
    c.updated_at,
    (c.kind = 'group') as is_group
  from public.conversations c
  join public.conversation_members mine on mine.conversation_id=c.id and mine.user_id=auth.uid()
  left join lateral (
    select u.id, u.email
    from public.conversation_members m
    join auth.users u on u.id=m.user_id
    where m.conversation_id=c.id and m.user_id<>auth.uid()
    limit 1
  ) other_user on true
  left join public.profiles other_profile on other_profile.id=other_user.id
  order by c.updated_at desc nulls last;
$$;
revoke all on function public.get_my_conversations() from public, anon;
grant execute on function public.get_my_conversations() to authenticated;
