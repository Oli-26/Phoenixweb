-- Thumbs up + reports on published designs.
--
-- Counts live denormalised on designs so the community list can order by them
-- under the existing select policy; the vote/report tables themselves stay
-- private (you see your own vote, admins see reports).

alter table public.designs
    add column if not exists vote_count   integer not null default 0,
    add column if not exists report_count integer not null default 0;

-- Reports past this many distinct reporters pull a design out of the list until
-- an admin looks at it.
create or replace function public.report_hide_threshold()
returns integer language sql immutable as $$ select 3 $$;

-- ---------------------------------------------------------------- system writes

-- Vote and report triggers update designs on behalf of someone who is neither
-- the owner nor an admin, so the moderation trigger has to let them through.
create or replace function public.enforce_design_moderation()
returns trigger
language plpgsql
as $$
declare
    admin      boolean := public.is_admin();
    trust      text    := public.current_trust();
    recent     integer;
    content_changed boolean;
    system_write boolean := current_setting('phoenix.system_write', true) = 'on';
begin
    if system_write then
        return new;
    end if;

    if not admin then
        if trust = 'blocked' then
            raise exception 'This account cannot publish designs.';
        end if;

        if tg_op = 'INSERT' then
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

        -- Counts are maintained by the vote/report triggers only.
        new.vote_count   := coalesce(old.vote_count, 0);
        new.report_count := coalesce(old.report_count, 0);
    elsif tg_op = 'UPDATE' and new.moderation_status is distinct from old.moderation_status then
        new.moderated_by := auth.uid();
        new.moderated_at := now();
    end if;

    return new;
end;
$$;

-- A vote should not make a design look freshly edited.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    if new.data is distinct from old.data
       or new.name is distinct from old.name
       or new.visibility is distinct from old.visibility then
        new.updated_at := now();
    end if;
    return new;
end;
$$;

-- ---------------------------------------------------------------- votes

create table if not exists public.design_votes (
    design_id  uuid not null references public.designs on delete cascade,
    voter      uuid not null default auth.uid() references auth.users on delete cascade,
    created_at timestamptz not null default now(),
    primary key (design_id, voter)
);

create index if not exists design_votes_voter_idx on public.design_votes (voter);

alter table public.design_votes enable row level security;

-- Individual votes are private: you see your own, admins see all. The public
-- signal is the aggregate on designs.
drop policy if exists design_votes_select on public.design_votes;
create policy design_votes_select on public.design_votes
    for select using (voter = auth.uid() or public.is_admin());

-- Only votable while the design is actually live.
drop policy if exists design_votes_insert on public.design_votes;
create policy design_votes_insert on public.design_votes
    for insert with check (
        voter = auth.uid()
        and exists (
            select 1 from public.designs d
            where d.id = design_id
              and d.visibility = 'public'
              and d.moderation_status = 'approved'
              and not d.hidden
        )
    );

drop policy if exists design_votes_delete on public.design_votes;
create policy design_votes_delete on public.design_votes
    for delete using (voter = auth.uid() or public.is_admin());

create or replace function public.sync_vote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare target uuid := coalesce(new.design_id, old.design_id);
begin
    perform set_config('phoenix.system_write', 'on', true);
    update public.designs d
    set vote_count = (select count(*) from public.design_votes v where v.design_id = target)
    where d.id = target;
    return coalesce(new, old);
end;
$$;

drop trigger if exists design_votes_sync on public.design_votes;
create trigger design_votes_sync
    after insert or delete on public.design_votes
    for each row execute function public.sync_vote_count();

-- ---------------------------------------------------------------- reports

create table if not exists public.design_reports (
    design_id  uuid not null references public.designs on delete cascade,
    reporter   uuid not null default auth.uid() references auth.users on delete cascade,
    reason     text not null check (length(reason) between 1 and 500),
    created_at timestamptz not null default now(),
    primary key (design_id, reporter)
);

create index if not exists design_reports_design_idx on public.design_reports (design_id);

alter table public.design_reports enable row level security;

-- Reporters cannot read the queue — only admins — so reporting cannot be used
-- to probe what else has been reported.
drop policy if exists design_reports_select on public.design_reports;
create policy design_reports_select on public.design_reports
    for select using (public.is_admin());

drop policy if exists design_reports_insert on public.design_reports;
create policy design_reports_insert on public.design_reports
    for insert with check (reporter = auth.uid());

drop policy if exists design_reports_delete on public.design_reports;
create policy design_reports_delete on public.design_reports
    for delete using (public.is_admin());

create or replace function public.sync_report_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    target uuid    := coalesce(new.design_id, old.design_id);
    total  integer;
begin
    select count(*) into total from public.design_reports r where r.design_id = target;

    perform set_config('phoenix.system_write', 'on', true);
    update public.designs d
    set report_count = total,
        -- Auto-hide only. Clearing reports never un-hides: that is an admin call.
        hidden = case when total >= public.report_hide_threshold() then true else d.hidden end
    where d.id = target;

    return coalesce(new, old);
end;
$$;

drop trigger if exists design_reports_sync on public.design_reports;
create trigger design_reports_sync
    after insert or delete on public.design_reports
    for each row execute function public.sync_report_count();

-- Backfill counts for rows that predate this migration.
do $$
begin
    perform set_config('phoenix.system_write', 'on', true);
    update public.designs d
    set vote_count   = (select count(*) from public.design_votes v where v.design_id = d.id),
        report_count = (select count(*) from public.design_reports r where r.design_id = d.id);
end;
$$;
