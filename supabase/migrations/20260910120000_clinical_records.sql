-- Clinical records.
--
-- Every clinical table in the spec's data model: conditions, allergies, medication orders and
-- administrations, vitals, assessments (each of a kind, each kind with a due interval), lab
-- results, care plans with goals, incidents, progress notes, appointments, and family contacts.
--
-- Every row belongs to one resident, and scope resolves through that resident (ADR 0003): a
-- clinical row is visible exactly when its resident is, because each policy asks the residents
-- table, whose own policy already encodes "a nurse sees their units, an admin sees everything".
-- Deletes are soft everywhere (archived_at); no policy allows a row removal.
--
-- Also here: rooms gain a bed count so occupancy is computable, and the seeder gets a single
-- reset function so `pnpm db:seed` can rebuild the whole dataset in one call.

-- ---------------------------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------------------------

create type public.assessment_kind as enum (
  'physician_visit', 'nursing_assessment', 'wound_check', 'podiatry', 'dental', 'vision',
  'fall_risk', 'lab_draw'
);
create type public.allergy_category as enum ('food', 'medication', 'environment');
create type public.allergy_type as enum ('allergy', 'intolerance');
create type public.allergy_severity as enum ('mild', 'moderate', 'severe');
create type public.medication_frequency as enum (
  'once_daily', 'twice_daily', 'three_times_daily', 'four_times_daily', 'at_bedtime', 'weekly',
  'as_needed'
);
create type public.medication_order_status as enum ('active', 'discontinued');
create type public.administration_status as enum ('given', 'refused', 'held');
create type public.care_plan_status as enum ('active', 'completed');
create type public.care_plan_goal_status as enum ('in_progress', 'met', 'not_met');
create type public.incident_kind as enum ('fall', 'medication_error', 'behavioral');
create type public.appointment_kind as enum (
  'dialysis', 'specialist', 'hospital', 'imaging', 'dental', 'other'
);
create type public.appointment_status as enum ('scheduled', 'completed', 'cancelled');
create type public.family_relationship as enum (
  'spouse', 'daughter', 'son', 'sibling', 'grandchild', 'niece_or_nephew', 'friend', 'guardian',
  'other'
);

-- ---------------------------------------------------------------------------------------------
-- Rooms: bed count
-- ---------------------------------------------------------------------------------------------

alter table public.rooms
  add column capacity integer not null default 1 check (capacity between 1 and 2);

comment on column public.rooms.capacity is
  'Beds in the room: 1 for a private room, 2 for a semi-private room. Occupancy is residents per bed.';

-- ---------------------------------------------------------------------------------------------
-- Assessment kinds
--
-- Reference data, not resident data: the eight kinds and how often each is due. "Overdue" for a
-- resident and a kind is: the latest assessment of that kind is older than due_every_days, or,
-- for the kinds every resident gets, there is none at all.
-- ---------------------------------------------------------------------------------------------

create table public.assessment_kinds (
  kind public.assessment_kind primary key,
  name text not null unique,
  due_every_days integer not null check (due_every_days > 0),
  -- True for kinds every current resident is expected to have; false for kinds that apply only
  -- once they have been done at least once (a wound check is due only for a resident with a wound).
  expected_for_everyone boolean not null,
  sort_order integer not null unique
);

comment on table public.assessment_kinds is
  'The kinds of assessment and the interval after which the next one is due.';

insert into public.assessment_kinds (kind, name, due_every_days, expected_for_everyone, sort_order) values
  ('physician_visit', 'Physician visit', 60, true, 1),
  ('nursing_assessment', 'Nursing assessment', 90, true, 2),
  ('fall_risk', 'Fall-risk assessment', 90, true, 3),
  ('lab_draw', 'Lab draw', 90, true, 4),
  ('podiatry', 'Podiatry', 90, false, 5),
  ('dental', 'Dental', 365, false, 6),
  ('vision', 'Vision', 365, false, 7),
  ('wound_check', 'Wound check', 7, false, 8);

alter table public.assessment_kinds enable row level security;

create policy "Staff read assessment kinds"
  on public.assessment_kinds for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------------------------
-- Clinical tables
--
-- Composite foreign keys (child_id, resident_id) keep a record's parent on the same resident,
-- the same way a resident's room is kept on their unit.
-- ---------------------------------------------------------------------------------------------

create table public.conditions (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  code text not null,
  code_system text not null default 'SNOMED-CT',
  description text not null,
  onset_date date not null,
  -- Null while the condition is active.
  resolved_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, resident_id),
  constraint conditions_resolved_after_onset check (resolved_on is null or resolved_on >= onset_date)
);

comment on table public.conditions is
  'A diagnosis on a resident''s record, with an onset date and an optional resolution date.';

create table public.allergies (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  code text not null,
  description text not null,
  category public.allergy_category not null,
  allergy_type public.allergy_type not null default 'allergy',
  -- Lowercase ingredient used to match medication orders (a "Penicillin V" allergy conflicts
  -- with any order whose name contains "penicillin"). Null for food and environment allergies.
  substance text,
  reaction text,
  severity public.allergy_severity,
  noted_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.allergies is 'A recorded allergy or intolerance, with its reaction and severity.';

create table public.medication_orders (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  code text not null,
  code_system text not null default 'RxNorm',
  medication text not null,
  frequency public.medication_frequency not null,
  instructions text,
  -- The condition this order treats, when the clinical vocabulary pairs them.
  condition_id uuid,
  prescribed_by uuid not null references public.staff (id),
  started_on date not null,
  ended_on date,
  status public.medication_order_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, resident_id),
  foreign key (condition_id, resident_id) references public.conditions (id, resident_id),
  constraint medication_orders_end_matches_status check (
    (status = 'active' and ended_on is null)
    or (status = 'discontinued' and ended_on is not null and ended_on >= started_on)
  )
);

comment on table public.medication_orders is 'An active or discontinued prescription for a resident.';
comment on column public.medication_orders.frequency is
  'Standard times: once daily 9 am; twice daily 9 am and 9 pm; three times 9 am, 1 pm, 9 pm; four times 9 am, 1 pm, 5 pm, 9 pm; at bedtime 9 pm; weekly Monday 9 am.';

create table public.administrations (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  medication_order_id uuid not null,
  administered_at timestamptz not null,
  administered_by uuid not null references public.staff (id),
  status public.administration_status not null default 'given',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (medication_order_id, resident_id) references public.medication_orders (id, resident_id)
);

comment on table public.administrations is
  'One recorded event of giving (or refusing, or holding) a medication. Together, the medication administration record.';

create table public.vitals (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  taken_at timestamptz not null,
  taken_by uuid not null references public.staff (id),
  systolic integer not null check (systolic between 50 and 260),
  diastolic integer not null check (diastolic between 30 and 160),
  pulse integer not null check (pulse between 25 and 220),
  temperature_f numeric(4, 1) not null check (temperature_f between 90 and 108),
  respiratory_rate integer not null check (respiratory_rate between 4 and 60),
  oxygen_saturation integer not null check (oxygen_saturation between 50 and 100),
  -- Weighed weekly, so most sets carry no weight.
  weight_lb numeric(5, 1) check (weight_lb between 50 and 500),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.vitals is
  'A set of readings taken at one moment: blood pressure, pulse, temperature, respiration, oxygen saturation, and weight.';

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  kind public.assessment_kind not null references public.assessment_kinds (kind),
  performed_at timestamptz not null,
  performed_by uuid not null references public.staff (id),
  findings text not null,
  -- Morse Fall Scale total for fall-risk assessments; null for other kinds.
  score integer check (score between 0 and 125),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, resident_id)
);

comment on table public.assessments is
  'A dated clinical examination or evaluation of one kind. The record behind "when was the last exam".';

create table public.lab_results (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  -- The lab draw this result came from, when known.
  assessment_id uuid,
  code text not null,
  code_system text not null default 'LOINC',
  description text not null,
  value numeric not null,
  units text not null,
  reference_low numeric,
  reference_high numeric,
  abnormal boolean generated always as (
    (reference_low is not null and value < reference_low)
    or (reference_high is not null and value > reference_high)
  ) stored,
  resulted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (assessment_id, resident_id) references public.assessments (id, resident_id)
);

comment on table public.lab_results is 'A resulted laboratory test with a value, units, and reference range.';

create table public.care_plans (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  code text not null,
  description text not null,
  -- The condition the plan addresses, when the clinical vocabulary pairs them.
  condition_id uuid,
  started_on date not null,
  ended_on date,
  status public.care_plan_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, resident_id),
  foreign key (condition_id, resident_id) references public.conditions (id, resident_id),
  constraint care_plans_end_matches_status check (
    (status = 'active' and ended_on is null)
    or (status = 'completed' and ended_on is not null and ended_on >= started_on)
  )
);

comment on table public.care_plans is 'A resident''s set of goals and the interventions meant to reach them.';

create table public.care_plan_goals (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  care_plan_id uuid not null,
  description text not null,
  intervention text not null,
  target_date date,
  status public.care_plan_goal_status not null default 'in_progress',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (care_plan_id, resident_id) references public.care_plans (id, resident_id)
);

comment on table public.care_plan_goals is 'One goal of a care plan and the intervention meant to reach it.';

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  kind public.incident_kind not null,
  occurred_at timestamptz not null,
  description text not null,
  injury_sustained boolean not null default false,
  reported_by uuid not null references public.staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.incidents is
  'An adverse event involving a resident: a fall, a medication error, or a behavioral event.';

create table public.progress_notes (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  written_by uuid not null references public.staff (id),
  written_at timestamptz not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.progress_notes is 'A free-text note written by staff about a resident.';

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  kind public.appointment_kind not null,
  scheduled_at timestamptz not null,
  location text not null,
  purpose text not null,
  status public.appointment_status not null default 'scheduled',
  scheduled_by uuid not null references public.staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.appointments is
  'A scheduled visit outside the facility, such as dialysis, a specialist, or a hospital.';

create table public.family_contacts (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  first_name text not null,
  last_name text not null,
  relationship public.family_relationship not null,
  phone text not null,
  email text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.family_contacts is 'A relative or guardian recorded for a resident.';

-- ---------------------------------------------------------------------------------------------
-- Indexes: every table by resident, and the timeline and dashboard orderings
-- ---------------------------------------------------------------------------------------------

create index conditions_resident_id_idx on public.conditions (resident_id);
create index allergies_resident_id_idx on public.allergies (resident_id);
create index medication_orders_resident_status_idx on public.medication_orders (resident_id, status);
create index medication_orders_condition_id_idx on public.medication_orders (condition_id);
create index administrations_order_time_idx
  on public.administrations (medication_order_id, administered_at desc);
create index administrations_resident_time_idx on public.administrations (resident_id, administered_at desc);
create index vitals_resident_time_idx on public.vitals (resident_id, taken_at desc);
create index assessments_resident_kind_time_idx on public.assessments (resident_id, kind, performed_at desc);
create index lab_results_resident_time_idx on public.lab_results (resident_id, resulted_at desc);
create index lab_results_assessment_id_idx on public.lab_results (assessment_id);
create index care_plans_resident_id_idx on public.care_plans (resident_id);
create index care_plan_goals_resident_id_idx on public.care_plan_goals (resident_id);
create index care_plan_goals_care_plan_id_idx on public.care_plan_goals (care_plan_id);
create index incidents_resident_time_idx on public.incidents (resident_id, occurred_at desc);
create index incidents_time_idx on public.incidents (occurred_at desc);
create index progress_notes_resident_time_idx on public.progress_notes (resident_id, written_at desc);
create index appointments_resident_time_idx on public.appointments (resident_id, scheduled_at);
create index appointments_time_idx on public.appointments (scheduled_at);
create index family_contacts_resident_id_idx on public.family_contacts (resident_id);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security and updated_at, identically on every clinical table
--
-- The scope rule is one expression: the row's resident is visible to the caller. The subquery
-- runs under the residents policies, so an admin matches every resident and a nurse matches the
-- residents on their units. Nurses record care for residents they can see and nowhere else; the
-- with-check clause on inserts and updates is the same expression. There is no delete policy:
-- records are archived, never removed.
-- ---------------------------------------------------------------------------------------------

do $$
declare
  t text;
  label text;
begin
  foreach t in array array[
    'conditions', 'allergies', 'medication_orders', 'administrations', 'vitals', 'assessments',
    'lab_results', 'care_plans', 'care_plan_goals', 'incidents', 'progress_notes', 'appointments',
    'family_contacts'
  ] loop
    label := replace(t, '_', ' ');

    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );

    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using (resident_id in (select r.id from public.residents r))',
      'Staff read ' || label || ' in scope', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (resident_id in (select r.id from public.residents r))',
      'Staff record ' || label || ' in scope', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (resident_id in (select r.id from public.residents r))
         with check (resident_id in (select r.id from public.residents r))',
      'Staff update ' || label || ' in scope', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Seed runs
--
-- One row per `pnpm db:seed`, recording the seed number and the anchor instant the generator
-- used, so a test can rebuild exactly the dataset that is in the database and compare.
-- ---------------------------------------------------------------------------------------------

create table public.seed_runs (
  id uuid primary key default gen_random_uuid(),
  seed_number integer not null,
  anchor timestamptz not null,
  row_counts jsonb not null,
  completed_at timestamptz not null default now()
);

comment on table public.seed_runs is
  'The seed number and anchor instant of each reseed, so tests can rebuild the same dataset.';

alter table public.seed_runs enable row level security;

create policy "Staff read seed runs"
  on public.seed_runs for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------------------------
-- Reset for the seeder
--
-- Empties every demo table in one call so `pnpm db:seed` can rebuild from scratch. Cascade also
-- clears any table added later that references these (an audit trail, assistant threads).
-- Security invoker: the service role owns enough privilege to truncate, and nobody else may
-- call it. Auth users are not touched; the seeder keeps the demo logins itself.
-- ---------------------------------------------------------------------------------------------

create or replace function public.reset_demo_data()
returns void
language sql
security invoker
set search_path = ''
as $$
  truncate table
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

comment on function public.reset_demo_data() is
  'Empties every demo table so the seeder can rebuild the dataset. Callable only by the service role.';

revoke all on function public.reset_demo_data() from public, anon, authenticated;
grant execute on function public.reset_demo_data() to service_role;
