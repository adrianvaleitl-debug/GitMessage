-- Repair the profile editor RPC expected by the current web and desktop clients.
-- Apply this migration in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists profile_card_style text not null default 'glass',
  add column if not exists profile_avatar_ring text not null default 'accent',
  add column if not exists profile_show_bio boolean not null default true,
  add column if not exists profile_show_username boolean not null default true;

alter table public.profiles drop constraint if exists profiles_profile_card_style_check;
alter table public.profiles add constraint profiles_profile_card_style_check
  check (profile_card_style in ('glass','solid','minimal'));
alter table public.profiles drop constraint if exists profiles_profile_avatar_ring_check;
alter table public.profiles add constraint profiles_profile_avatar_ring_check
  check (profile_avatar_ring in ('accent','subtle','none'));

drop function if exists public.update_gitmessage_profile(text,text,text,text);
drop function if exists public.update_gitmessage_profile(text,text,text,text,text,text,boolean,boolean);

create function public.update_gitmessage_profile(
  new_username text,
  new_display_name text,
  new_bio text default '',
  new_profile_palette text default 'graphite',
  new_profile_card_style text default 'glass',
  new_profile_avatar_ring text default 'accent',
  new_profile_show_bio boolean default true,
  new_profile_show_username boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;

  if trim(coalesce(new_username,'')) !~ '^[a-zA-Z0-9_]{3,24}$' then
    raise exception 'Username must be 3–24 letters, numbers or underscores.';
  end if;
  if trim(coalesce(new_display_name,'')) = '' then
    raise exception 'Display name is required.';
  end if;
  if char_length(coalesce(new_bio,'')) > 240 then
    raise exception 'About me must be 240 characters or fewer.';
  end if;
  if coalesce(new_profile_palette,'graphite') not in ('graphite','ocean','plum','ember','moss','sand') then
    raise exception 'Choose a valid profile colour.';
  end if;
  if coalesce(new_profile_card_style,'glass') not in ('glass','solid','minimal') then
    raise exception 'Choose a valid profile card style.';
  end if;
  if coalesce(new_profile_avatar_ring,'accent') not in ('accent','subtle','none') then
    raise exception 'Choose a valid photo outline.';
  end if;

  update public.profiles
  set username = lower(trim(new_username)),
      display_name = trim(new_display_name),
      bio = trim(coalesce(new_bio,'')),
      profile_palette = coalesce(new_profile_palette,'graphite'),
      profile_card_style = coalesce(new_profile_card_style,'glass'),
      profile_avatar_ring = coalesce(new_profile_avatar_ring,'accent'),
      profile_show_bio = coalesce(new_profile_show_bio,true),
      profile_show_username = coalesce(new_profile_show_username,true),
      updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found.';
  end if;
end
$fn$;

revoke all on function public.update_gitmessage_profile(text,text,text,text,text,text,boolean,boolean) from public, anon;
grant execute on function public.update_gitmessage_profile(text,text,text,text,text,text,boolean,boolean) to authenticated;
