-- Publishing + moderation for shared designs.
-- Run in the Supabase SQL editor (or `supabase db push`) on the project in js/config.js.
--
-- Model: designs are private by default. Publishing sets visibility='public' and
-- moderation_status='pending'; only an admin (or the trust system) can approve.
-- Owners can never write their own moderation columns — a trigger reverts them.

create extension if not exists citext;

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
    id           uuid primary key references auth.users on delete cascade,
    handle       citext unique,
    display_name text,
    is_admin     boolean not null default false,
    -- new: publishes go to the review queue. trusted: auto-approved. blocked: cannot publish.
    trust        text not null default 'new' check (trust in ('new', 'trusted', 'blocked')),
    created_at   timestamptz not null default now()
);

-- Reads profiles with RLS bypassed, so profile policies can call it without recursing.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.current_trust()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select trust from public.profiles where id = auth.uid()), 'new');
$$;

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
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Backfill for accounts that already signed in before this migration.
insert into public.profiles (id, display_name)
select id, raw_user_meta_data ->> 'full_name' from auth.users
on conflict (id) do nothing;

-- is_admin and trust are staff-only: revert any self-service change.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
    if not public.is_admin() then
        new.is_admin := old.is_admin;
        new.trust    := old.trust;
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
    before update on public.profiles
    for each row execute function public.protect_profile_columns();

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
    for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
    for update using (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------- designs

create table if not exists public.designs (
    id       uuid primary key default gen_random_uuid(),
    owner    uuid not null default auth.uid() references auth.users on delete cascade,
    kind     text not null check (kind in ('ability', 'mob')),
    -- The client-side custom id, so re-publishing an edited design updates its row.
    local_id text not null,
    name     text not null check (length(name) between 1 and 200),
    world    text,
    data     jsonb not null check (pg_column_size(data) < 64000),

    visibility        text not null default 'private' check (visibility in ('private', 'public')),
    moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
    moderation_reason text,
    moderated_by      uuid references auth.users,
    moderated_at      timestamptz,
    -- Set by report volume or by staff; hides an already-approved design.
    hidden            boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (owner, kind, local_id)
);

create index if not exists designs_owner_idx on public.designs (owner);
create index if not exists designs_queue_idx on public.designs (moderation_status, created_at)
    where visibility = 'public';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists designs_touch_updated_at on public.designs;
create trigger designs_touch_updated_at
    before update on public.designs
    for each row execute function public.touch_updated_at();

-- The whole moderation model lives here: owners propose, staff decide.
create or replace function public.enforce_design_moderation()
returns trigger
language plpgsql
as $$
declare
    admin      boolean := public.is_admin();
    trust      text    := public.current_trust();
    recent     integer;
    content_changed boolean;
begin
    if not admin then
        if trust = 'blocked' then
            raise exception 'This account cannot publish designs.';
        end if;

        if tg_op = 'INSERT' then
            -- 10 new designs per rolling day, so a script can't flood the queue.
            select count(*) into recent
            from public.designs
            where owner = auth.uid() and created_at > now() - interval '1 day';

            if recent >= 10 then
                raise exception 'Publish limit reached (10 per day). Try again tomorrow.';
            end if;

            new.moderation_status := case
                when new.visibility = 'public' and trust = 'trusted' then 'approved'
                else 'pending'
            end;
            new.moderation_reason := null;
            new.moderated_by      := null;
            new.moderated_at      := null;
            new.hidden            := false;
        else
            content_changed := new.data is distinct from old.data
                            or new.name is distinct from old.name;

            -- Edited content has to be re-reviewed; a re-publish of unchanged
            -- content keeps whatever verdict it already had.
            if content_changed and new.visibility = 'public' and trust <> 'trusted' then
                new.moderation_status := 'pending';
                new.moderation_reason := null;
                new.moderated_by      := null;
                new.moderated_at      := null;
            else
                new.moderation_status := old.moderation_status;
                new.moderation_reason := old.moderation_reason;
                new.moderated_by      := old.moderated_by;
                new.moderated_at      := old.moderated_at;
            end if;

            new.hidden := old.hidden;
            new.owner  := old.owner;
        end if;
    elsif tg_op = 'UPDATE' and new.moderation_status is distinct from old.moderation_status then
        new.moderated_by := auth.uid();
        new.moderated_at := now();
    end if;

    return new;
end;
$$;

drop trigger if exists designs_enforce_moderation on public.designs;
create trigger designs_enforce_moderation
    before insert or update on public.designs
    for each row execute function public.enforce_design_moderation();

alter table public.designs enable row level security;

drop policy if exists designs_select on public.designs;
create policy designs_select on public.designs
    for select using (
        owner = auth.uid()
        or public.is_admin()
        or (visibility = 'public' and moderation_status = 'approved' and not hidden)
    );

drop policy if exists designs_insert on public.designs;
create policy designs_insert on public.designs
    for insert with check (owner = auth.uid());

drop policy if exists designs_update on public.designs;
create policy designs_update on public.designs
    for update using (owner = auth.uid() or public.is_admin());

drop policy if exists designs_delete on public.designs;
create policy designs_delete on public.designs
    for delete using (owner = auth.uid() or public.is_admin());

-- Make yourself an admin (run once, with your own account's email):
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
