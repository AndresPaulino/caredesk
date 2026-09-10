-- Audit trail.
--
-- Every change to a tracked record becomes an audit event: who made it, when, and the values
-- before and after. Capture is a database trigger on each tracked table, so a nurse's edit in
-- the UI, the simulator's service-role write, and any future path are recorded identically.
-- The tracked tables are the ones that hold resident data: residents and the thirteen clinical
-- tables. The organization tables have no write path in the product and are not tracked.
--
-- The actor is resolved from the signed-in user when there is one. A service-role caller has no
-- user, so it names the acting staff member on each request: over the API, the
-- `x-caredesk-actor` header (PostgREST exposes request headers as a setting); in a direct SQL
-- session, the `app.actor_id` setting. A write with neither is rejected, so nothing changes
-- anonymously.
--
-- The seed is the starting state, not a change, and is not audited: the seeder marks each
-- request with `x-caredesk-audit: skip` (`app.audit` in SQL). Only a caller without a user
-- session can skip; on a user's request the header is ignored.

-- ---------------------------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------------------------

create type public.audit_operation as enum ('insert', 'update', 'delete');

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid not null references public.staff (id),
  -- The resident the record belongs to (the row itself for the residents table). Scope for
  -- reading an event is the scope of this resident.
  resident_id uuid not null references public.residents (id),
  table_name text not null,
  record_id uuid not null,
  operation public.audit_operation not null,
  -- The whole row before and after. Inserts have no "before"; deletes have no "after".
  old_values jsonb,
  new_values jsonb,
  -- For an update, the columns whose value changed (updated_at excluded). Empty otherwise.
  changed_columns text[] not null default '{}',
  constraint audit_events_values_match_operation check (
    (operation = 'insert' and old_values is null and new_values is not null)
    or (operation = 'update' and old_values is not null and new_values is not null)
    or (operation = 'delete' and old_values is not null and new_values is null)
  )
);

comment on table public.audit_events is
  'One change to a tracked record: who made it, when, and the values before and after.';
comment on column public.audit_events.actor_id is
  'The staff member, real or simulated, who made the change.';
comment on column public.audit_events.resident_id is
  'The resident the changed record belongs to. Events are visible within that resident''s scope.';
comment on column public.audit_events.changed_columns is
  'On an update, the columns whose value changed. updated_at is never listed.';

create index audit_events_resident_time_idx on public.audit_events (resident_id, occurred_at desc);
create index audit_events_time_idx on public.audit_events (occurred_at desc);
create index audit_events_record_idx on public.audit_events (table_name, record_id);
create index audit_events_actor_id_idx on public.audit_events (actor_id);

-- Append-only, and only through the trigger below: signed-in staff read events in scope and
-- nothing else. The trigger function is security definer, so it inserts whatever the caller's
-- own privileges are.
alter table public.audit_events enable row level security;

revoke insert, update, delete on public.audit_events from anon, authenticated;

create policy "Staff read audit events in scope"
  on public.audit_events for select to authenticated
  using (resident_id in (select r.id from public.residents r));

-- The activity feed (ticket 07) subscribes to new events through Realtime, which applies the
-- policy above to each subscriber.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.audit_events';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Actor resolution
-- ---------------------------------------------------------------------------------------------

-- Security definer so it can check that a claimed actor is a staff member whatever the
-- caller's scope. It returns nothing but the id it was given or the caller's own.
create or replace function public.current_actor_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claimed text;
  actor uuid;
begin
  -- A signed-in user acts as themself, whatever else the request says.
  if (select auth.uid()) is not null then
    actor := (select public.current_staff_id());
    if actor is null then
      raise exception 'The signed-in user has no staff record, so the change cannot be attributed'
        using hint = 'no_actor';
    end if;
    return actor;
  end if;

  claimed := coalesce(
    nullif(current_setting('app.actor_id', true), ''),
    nullif(current_setting('request.headers', true), '')::json ->> 'x-caredesk-actor'
  );
  if claimed is null then
    raise exception 'No actor for the audit trail: sign in, or name the acting staff member in the x-caredesk-actor header (app.actor_id in SQL)'
      using hint = 'no_actor';
  end if;

  begin
    actor := claimed::uuid;
  exception when invalid_text_representation then
    raise exception 'The audit actor "%" is not a staff id', claimed using hint = 'no_actor';
  end;

  if not exists (
    select 1 from public.staff s where s.id = actor and s.archived_at is null
  ) then
    raise exception 'The audit actor % is not a staff member', actor using hint = 'no_actor';
  end if;
  return actor;
end;
$$;

comment on function public.current_actor_id() is
  'The staff member a change is attributed to: the signed-in user, or the actor a service-role request names. Raises (hint "no_actor") when there is neither.';

revoke all on function public.current_actor_id() from public, anon;
grant execute on function public.current_actor_id() to authenticated, service_role;

-- True when a request without a user session asked not to be audited (the seeder). A user's
-- request can never skip.
create or replace function public.audit_skipped()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is null
    and coalesce(
      nullif(current_setting('app.audit', true), ''),
      nullif(current_setting('request.headers', true), '')::json ->> 'x-caredesk-audit'
    ) = 'skip';
$$;

comment on function public.audit_skipped() is
  'True when a service-role request carries x-caredesk-audit: skip (app.audit in SQL). The seeder uses it; a user session cannot.';

-- ---------------------------------------------------------------------------------------------
-- The trigger
-- ---------------------------------------------------------------------------------------------

-- Security definer so the insert into audit_events succeeds for a caller who may only read it.
create or replace function public.record_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  changed text[] := '{}';
  resident uuid;
begin
  if (select public.audit_skipped()) then
    return null;
  end if;

  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}')
    into changed
    from jsonb_each(new_row) as n
    where n.key <> 'updated_at'
      and n.value is distinct from (old_row -> n.key);
    -- Saving a form without changing anything is not a change.
    if changed = '{}' then
      return null;
    end if;
  end if;

  resident := (
    coalesce(new_row, old_row) ->> case when tg_table_name = 'residents' then 'id' else 'resident_id' end
  )::uuid;

  insert into public.audit_events (
    actor_id, resident_id, table_name, record_id, operation, old_values, new_values, changed_columns
  ) values (
    public.current_actor_id(),
    resident,
    tg_table_name::text,
    (coalesce(new_row, old_row) ->> 'id')::uuid,
    lower(tg_op)::public.audit_operation,
    old_row,
    new_row,
    changed
  );
  return null;
end;
$$;

comment on function public.record_audit_event() is
  'Row trigger on every tracked table: writes one audit event per insert, update, or delete.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'conditions', 'allergies', 'medication_orders', 'administrations', 'vitals', 'assessments',
    'lab_results', 'care_plans', 'care_plan_goals', 'incidents', 'progress_notes', 'appointments',
    'family_contacts'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.record_audit_event()',
      t || '_audit', t
    );
  end loop;
end $$;

-- A resident row is never deleted (a stay ends; the record stays), and an event must reference
-- its resident, so the residents trigger covers inserts and updates only. The foreign key
-- stops a hard delete of any resident with a trail.
create trigger residents_audit
  after insert or update on public.residents
  for each row execute function public.record_audit_event();

-- ---------------------------------------------------------------------------------------------
-- Reset for the seeder: the trail goes with the data it describes
-- ---------------------------------------------------------------------------------------------

create or replace function public.reset_demo_data()
returns void
language sql
security invoker
set search_path = ''
as $$
  truncate table
    public.audit_events,
    public.seed_runs,
    public.administrations,
    public.medication_orders,
    public.care_plan_goals,
    public.care_plans,
    public.lab_results,
    public.assessments,
    public.conditions,
    public.allergies,
    public.vitals,
    public.incidents,
    public.progress_notes,
    public.appointments,
    public.family_contacts,
    public.residents,
    public.staff_unit_assignments,
    public.staff,
    public.rooms,
    public.units,
    public.facilities
  cascade;
$$;
