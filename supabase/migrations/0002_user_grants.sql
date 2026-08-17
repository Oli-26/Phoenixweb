-- Pre-grant admin/trust by email, before the account exists.
--
-- profiles.id references auth.users, so there is no row to update until someone
-- signs in. This table holds the intent; the signup trigger applies it, and
-- writes here also apply retroactively to accounts that already exist.

create table if not exists public.user_grants (
    email      citext primary key,
    is_admin   boolean not null default false,
    trust      text not null default 'new' check (trust in ('new', 'trusted', 'blocked')),
    note       text,
    created_at timestamptz not null default now()
);

alter table public.user_grants enable row level security;

-- Admins only. No policy for anyone else, so the anon key cannot read the list
-- of pending admins.
drop policy if exists user_grants_all on public.user_grants;
create policy user_grants_all on public.user_grants
    for all using (public.is_admin()) with check (public.is_admin());

-- Apply a grant to a profile row, matching on the account's email.
create or replace function public.apply_user_grant(target_email citext)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform set_config('phoenix.applying_grant', 'on', true);

    update public.profiles p
    set is_admin = g.is_admin,
        trust    = g.trust
    from public.user_grants g, auth.users u
    where g.email = target_email
      and u.email = g.email
      and p.id = u.id;
end;
$$;

-- security definer + the bypass flag: this must never be callable over the API.
revoke all on function public.apply_user_grant(citext) from public, anon, authenticated;

-- Grant added or changed after the user already signed up.
create or replace function public.user_grants_apply_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.apply_user_grant(new.email);
    return new;
end;
$$;

drop trigger if exists user_grants_apply on public.user_grants;
create trigger user_grants_apply
    after insert or update on public.user_grants
    for each row execute function public.user_grants_apply_trigger();

-- Signup path: create the profile, then apply any grant waiting on that email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, new.raw_user_meta_data ->> 'full_name')
    on conflict (id) do nothing;

    perform set_config('phoenix.applying_grant', 'on', true);

    update public.profiles p
    set is_admin = g.is_admin,
        trust    = g.trust
    from public.user_grants g
    where p.id = new.id and g.email = new.email;

    return new;
end;
$$;

-- The profiles trigger reverts is_admin/trust for non-admin writers, and these
-- functions run as the definer with auth.uid() unset. Both updates above are
-- therefore blocked unless the trigger is bypassed for them.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
    if not public.is_admin() and current_setting('phoenix.applying_grant', true) is distinct from 'on' then
        new.is_admin := old.is_admin;
        new.trust    := old.trust;
    end if;
    return new;
end;
$$;

-- Backfill for grants added before this migration ran.
do $$
declare g record;
begin
    perform set_config('phoenix.applying_grant', 'on', true);
    for g in select email from public.user_grants loop
        perform public.apply_user_grant(g.email);
    end loop;
end;
$$;
