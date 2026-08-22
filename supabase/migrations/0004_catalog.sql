-- Official catalogue (base abilities + mobs), hosted instead of shipped in data/*.json.
-- Run in the Supabase SQL editor (or `supabase db push`) on the project in js/config.js.
--
-- Model: anyone may read published rows; only admins write. Every write bumps
-- catalog_meta.revision, which the client uses to decide whether its cached copy
-- is stale — so a normal visit costs one tiny revision read, not the full 600 KB.

-- ---------------------------------------------------------------- catalog

create table if not exists public.catalog (
    -- Text, not uuid: the seeded ids ("barb-001", and the Wix uuids) are already
    -- referenced by saved-library entries in visitors' localStorage.
    id        text primary key,
    kind      text not null check (kind in ('ability', 'mob')),
    -- Mobs belong to a world ('barbarus' | 'rifts' | 'city'); abilities never do.
    world     text,
    name      text not null check (length(name) between 1 and 200),
    data      jsonb not null check (pg_column_size(data) < 64000),
    published boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint catalog_world_matches_kind check (
        (kind = 'mob' and world is not null) or (kind = 'ability' and world is null)
    )
);

create index if not exists catalog_kind_world_idx on public.catalog (kind, world)
    where published;

-- Its own function: public.touch_updated_at() reads new.visibility, which only
-- designs has, so reusing it here fails every catalogue update.
create or replace function public.catalog_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    if new.data is distinct from old.data
       or new.name is distinct from old.name
       or new.published is distinct from old.published then
        new.updated_at := now();
    end if;
    return new;
end;
$$;

drop trigger if exists catalog_touch_updated_at on public.catalog;
create trigger catalog_touch_updated_at
    before update on public.catalog
    for each row execute function public.catalog_touch_updated_at();

-- ---------------------------------------------------------------- revision stamp

create table if not exists public.catalog_meta (
    -- Single-row table; the check pins it to exactly one row.
    id         boolean primary key default true check (id),
    revision   bigint not null default 1,
    updated_at timestamptz not null default now()
);

insert into public.catalog_meta (id) values (true) on conflict (id) do nothing;

-- security definer: the trigger writes catalog_meta on behalf of an admin whose
-- own role has no write policy there.
create or replace function public.bump_catalog_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.catalog_meta
       set revision = revision + 1, updated_at = now()
     where id = true;
    return null;
end;
$$;

drop trigger if exists catalog_bump_revision on public.catalog;
create trigger catalog_bump_revision
    after insert or update or delete on public.catalog
    for each statement execute function public.bump_catalog_revision();

-- ---------------------------------------------------------------- policies

alter table public.catalog enable row level security;

drop policy if exists catalog_select on public.catalog;
create policy catalog_select on public.catalog
    for select using (published or public.is_admin());

drop policy if exists catalog_insert on public.catalog;
create policy catalog_insert on public.catalog
    for insert with check (public.is_admin());

drop policy if exists catalog_update on public.catalog;
create policy catalog_update on public.catalog
    for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists catalog_delete on public.catalog;
create policy catalog_delete on public.catalog
    for delete using (public.is_admin());

alter table public.catalog_meta enable row level security;

-- Readable by everyone, written only by the trigger above.
drop policy if exists catalog_meta_select on public.catalog_meta;
create policy catalog_meta_select on public.catalog_meta
    for select using (true);
