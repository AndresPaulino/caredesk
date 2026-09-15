-- Assistant threads, messages, and access events.
--
-- A staff member's conversations with the assistant are saved so they can be resumed: one
-- thread per conversation, one message per turn. A thread belongs to the staff member who
-- started it and to nobody else, not even an admin. The accountable record of AI use is the
-- audit trail, not the transcript: every question, and every tool the assistant runs to answer
-- it, is an audit event with operation `access`, attributed to the asking staff member and
-- naming the resident it concerned when it concerned one. Such an event is readable within
-- that resident's scope like any other event; one that concerns no resident (a search, a
-- unit-wide check) is readable by the staff member who asked and by admins.

-- ---------------------------------------------------------------------------------------------
-- Threads and messages
-- ---------------------------------------------------------------------------------------------

create table public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id),
  -- The first question, shortened, so a list of threads reads well.
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.assistant_threads is
  'One saved conversation between a staff member and the assistant. Visible to its owner only.';

create index assistant_threads_owner_recent_idx
  on public.assistant_threads (staff_id, updated_at desc);

create trigger assistant_threads_set_updated_at
  before update on public.assistant_threads
  for each row execute function public.set_updated_at();

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads (id),
  -- Order within the thread. A question and its answer take consecutive positions.
  position integer not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  -- The current resident when the question was asked: the resident whose page the drawer was
  -- opened from, if any.
  resident_id uuid references public.residents (id),
  -- For an answer: each tool it ran, in order, and the sources it relied on, as the drawer
  -- shows them ([{ id, name, label, status }] and [{ residentId, residentName, tab }]).
  steps jsonb not null default '[]',
  sources jsonb not null default '[]',
  -- For an answer: how the turn ended. Null while it runs, and if it never finished.
  ended text check (ended in ('end_turn', 'max_tokens', 'max_iterations', 'stopped', 'error')),
  -- For an answer that ended in an error: { kind, message } as the drawer showed it.
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint assistant_messages_position_unique unique (thread_id, position),
  constraint assistant_messages_position_positive check (position >= 0)
);

comment on table public.assistant_messages is
  'One turn of an assistant thread: a staff member''s question or the assistant''s answer.';
comment on column public.assistant_messages.steps is
  'For an answer, the tools it ran in order: [{ id, name, label, status }].';
comment on column public.assistant_messages.sources is
  'For an answer, the records it relied on: [{ residentId, residentName, tab }].';

create index assistant_messages_thread_idx on public.assistant_messages (thread_id, position);
create index assistant_messages_resident_idx on public.assistant_messages (resident_id);

create trigger assistant_messages_set_updated_at
  before update on public.assistant_messages
  for each row execute function public.set_updated_at();

-- Owner only. Threads are never deleted: an old one is archived.
alter table public.assistant_threads enable row level security;

create policy "Staff read their own threads"
  on public.assistant_threads for select to authenticated
  using (staff_id = (select public.current_staff_id()));

create policy "Staff start their own threads"
  on public.assistant_threads for insert to authenticated
  with check (staff_id = (select public.current_staff_id()));

create policy "Staff update their own threads"
  on public.assistant_threads for update to authenticated
  using (staff_id = (select public.current_staff_id()))
  with check (staff_id = (select public.current_staff_id()));

-- A message is visible exactly when its thread is: the subquery runs under the caller's own
-- thread policy.
alter table public.assistant_messages enable row level security;

create policy "Staff read messages in their own threads"
  on public.assistant_messages for select to authenticated
  using (thread_id in (select t.id from public.assistant_threads t));

create policy "Staff add messages to their own threads"
  on public.assistant_messages for insert to authenticated
  with check (thread_id in (select t.id from public.assistant_threads t));

create policy "Staff update messages in their own threads"
  on public.assistant_messages for update to authenticated
  using (thread_id in (select t.id from public.assistant_threads t))
  with check (thread_id in (select t.id from public.assistant_threads t));

-- ---------------------------------------------------------------------------------------------
-- Access events
-- ---------------------------------------------------------------------------------------------

-- An access event names a resident only when the question or lookup concerned one, so the
-- column may be null for that operation alone. Its details go in new_values, like an insert.
alter table public.audit_events alter column resident_id drop not null;

alter table public.audit_events drop constraint audit_events_values_match_operation;

alter table public.audit_events add constraint audit_events_values_match_operation check (
  (operation = 'insert' and old_values is null and new_values is not null)
  or (operation = 'update' and old_values is not null and new_values is not null)
  or (operation = 'delete' and old_values is not null and new_values is null)
  or (operation = 'access' and old_values is null and new_values is not null)
);

alter table public.audit_events add constraint audit_events_changes_name_a_resident check (
  resident_id is not null or operation = 'access'
);

comment on column public.audit_events.resident_id is
  'The resident the record belongs to. Events are visible within that resident''s scope. Null only for an assistant access event that concerned no resident.';

-- An event about a resident is read within the resident's scope, as before. An access event
-- about no resident is read by the staff member it is attributed to and by admins.
drop policy "Staff read audit events in scope" on public.audit_events;

create policy "Staff read audit events in scope"
  on public.audit_events for select to authenticated
  using (
    resident_id in (select r.id from public.residents r)
    or (
      resident_id is null
      and (actor_id = (select public.current_staff_id()) or (select public.is_admin()))
    )
  );

-- The one way to write an access event: a signed-in staff member records a question or a tool
-- call in one of their own threads, naming a resident only from their own scope. Security
-- definer so the insert succeeds for a caller who may only read events; the checks above are
-- therefore explicit, since the function's owner is not subject to the policies.
create or replace function public.record_assistant_access(
  message_id uuid,
  resident uuid,
  details jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Only a signed-in staff member can record assistant access'
      using hint = 'no_actor';
  end if;

  if details is null or jsonb_typeof(details) <> 'object' or not (details ? 'kind') then
    raise exception 'Assistant access details must be an object with a kind';
  end if;

  if not exists (
    select 1
    from public.assistant_messages m
    join public.assistant_threads t on t.id = m.thread_id
    where m.id = message_id
      and t.staff_id = (select public.current_staff_id())
  ) then
    raise exception 'The message % is not in one of your threads', message_id
      using hint = 'not_owner';
  end if;

  if resident is not null and not exists (
    select 1
    from public.residents r
    where r.id = resident
      and ((select public.is_admin()) or r.unit_id in (select public.current_unit_ids()))
  ) then
    raise exception 'The resident % is not in your scope', resident
      using hint = 'out_of_scope';
  end if;

  insert into public.audit_events (
    actor_id, resident_id, table_name, record_id, operation, old_values, new_values
  ) values (
    public.current_actor_id(), resident, 'assistant_messages', message_id, 'access', null, details
  )
  returning id into event_id;

  return event_id;
end;
$$;

comment on function public.record_assistant_access(uuid, uuid, jsonb) is
  'Writes one assistant access event (a question or a tool call) attributed to the signed-in staff member, for a message in one of their threads.';

revoke all on function public.record_assistant_access(uuid, uuid, jsonb) from public, anon;
grant execute on function public.record_assistant_access(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Reset for the seeder: threads go with the residents they ask about
-- ---------------------------------------------------------------------------------------------

create or replace function public.reset_demo_data()
returns void
language sql
security invoker
set search_path = ''
as $$
  truncate table
    public.assistant_messages,
    public.assistant_threads,
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
