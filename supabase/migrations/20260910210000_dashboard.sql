-- Dashboard tiles.
--
-- The six tiles on the dashboard are counts over the signed-in staff member's scope: census
-- and occupancy, medications due this shift and overdue administrations, residents overdue for
-- an assessment, residents with out-of-range vitals in the last 24 hours, incidents in the
-- last seven days, and appointments today and tomorrow. Each number is also a set of residents
-- the list page can show, so the rules live once, here: `resident_dashboard_at(as_of)` is the
-- resident directory with one flag per tile, computed as of an instant the caller passes (the
-- app passes now; the tests pass the seed's anchor so the answer is deterministic), and
-- `dashboard_tiles_at(as_of)` counts it. Both are security invoker, so every table is read
-- through the caller's own policies and a nurse's numbers cover their units alone (ADR 0003).
--
-- The thresholds the rules use are reference data, like assessment_kinds: the normal range of
-- each vital reading, the standard dose times of each medication frequency, and the three
-- shifts. src/lib/clinical/ keeps a copy of each and the policy test checks they agree.

-- ---------------------------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------------------------

create table public.vital_ranges (
  reading text primary key,
  low numeric not null,
  high numeric not null,
  sort_order integer not null unique,
  constraint vital_ranges_low_below_high check (low < high)
);

comment on table public.vital_ranges is
  'The normal range of each vital reading. A reading outside it is what the dashboard calls out of range.';

insert into public.vital_ranges (reading, low, high, sort_order) values
  ('systolic', 90, 140, 1),
  ('diastolic', 55, 90, 2),
  ('pulse', 55, 100, 3),
  ('temperature_f', 96.5, 100.4, 4),
  ('respiratory_rate', 10, 22, 5),
  ('oxygen_saturation', 90, 100, 6);

create table public.medication_dose_times (
  frequency public.medication_frequency not null,
  hour integer not null check (hour between 0 and 23),
  -- Day of the week (0 = Sunday) for a frequency given on one day; null for every day.
  weekday integer check (weekday between 0 and 6),
  primary key (frequency, hour)
);

comment on table public.medication_dose_times is
  'The standard times a medication of each frequency is given, as hours in the facilities'' time zone. As-needed medications have none.';

insert into public.medication_dose_times (frequency, hour, weekday) values
  ('once_daily', 9, null),
  ('twice_daily', 9, null),
  ('twice_daily', 21, null),
  ('three_times_daily', 9, null),
  ('three_times_daily', 13, null),
  ('three_times_daily', 21, null),
  ('four_times_daily', 9, null),
  ('four_times_daily', 13, null),
  ('four_times_daily', 17, null),
  ('four_times_daily', 21, null),
  ('at_bedtime', 21, null),
  ('weekly', 9, 1);

create table public.shifts (
  key text primary key,
  name text not null unique,
  start_hour integer not null check (start_hour between 0 and 23),
  -- The hour the shift ends; earlier than start_hour for the shift that crosses midnight.
  end_hour integer not null check (end_hour between 0 and 23),
  sort_order integer not null unique
);

comment on table public.shifts is
  'The three nursing shifts, as wall-clock hours in the facilities'' time zone.';

insert into public.shifts (key, name, start_hour, end_hour, sort_order) values
  ('day', 'Day shift', 7, 15, 1),
  ('evening', 'Evening shift', 15, 23, 2),
  ('night', 'Night shift', 23, 7, 3);

alter table public.vital_ranges enable row level security;
alter table public.medication_dose_times enable row level security;
alter table public.shifts enable row level security;

create policy "Staff read vital ranges"
  on public.vital_ranges for select to authenticated
  using (true);

create policy "Staff read medication dose times"
  on public.medication_dose_times for select to authenticated
  using (true);

create policy "Staff read shifts"
  on public.shifts for select to authenticated
  using (true);

-- The tiles look back over a window of time across every resident in scope, which the
-- per-resident indexes from ticket 03 do not serve.
create index vitals_time_idx on public.vitals (taken_at desc);

-- ---------------------------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------------------------

-- True when any reading in a set of vitals falls outside its normal range. Takes the row, so
-- PostgREST also offers it as a computed column on vitals. No search_path setting, against
-- the convention: a SQL function with one is never inlined, and this one runs once per row of
-- a scan, so it has to be. Every name in it is schema-qualified instead.
create or replace function public.vitals_out_of_range(v public.vitals)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.vital_ranges vr
    where (vr.reading = 'systolic' and (v.systolic < vr.low or v.systolic > vr.high))
       or (vr.reading = 'diastolic' and (v.diastolic < vr.low or v.diastolic > vr.high))
       or (vr.reading = 'pulse' and (v.pulse < vr.low or v.pulse > vr.high))
       or (vr.reading = 'temperature_f' and (v.temperature_f < vr.low or v.temperature_f > vr.high))
       or (vr.reading = 'respiratory_rate' and (v.respiratory_rate < vr.low or v.respiratory_rate > vr.high))
       or (vr.reading = 'oxygen_saturation' and (v.oxygen_saturation < vr.low or v.oxygen_saturation > vr.high))
  );
$$;

comment on function public.vitals_out_of_range(public.vitals) is
  'True when any reading in the set is outside its normal range (vital_ranges).';

-- The shift an instant falls in, with the instants it starts and ends, in the facilities' time
-- zone. Each shift is tried on the local day of the instant and on the day before, so the
-- night shift that began yesterday evening is found at two in the morning.
create or replace function public.shift_window(at timestamptz)
returns table (key text, name text, starts_at timestamptz, ends_at timestamptz)
language sql
stable
set search_path = ''
as $$
  with local_time as (
    select (at at time zone 'America/New_York') as t
  ),
  candidate as (
    select
      s.key,
      s.name,
      ((d.day + make_interval(hours => s.start_hour)) at time zone 'America/New_York') as starts_at,
      ((d.day
        + make_interval(hours => s.end_hour)
        + case when s.end_hour <= s.start_hour then interval '1 day' else interval '0' end
      ) at time zone 'America/New_York') as ends_at
    from public.shifts s
    cross join local_time lt
    cross join lateral (values (lt.t::date - 1), (lt.t::date)) as d (day)
  )
  select c.key, c.name, c.starts_at, c.ends_at
  from candidate c
  where at >= c.starts_at and at < c.ends_at
  order by c.starts_at desc
  limit 1;
$$;

comment on function public.shift_window(timestamptz) is
  'The shift an instant falls in: day 7 am to 3 pm, evening 3 pm to 11 pm, night 11 pm to 7 am, Eastern.';

-- The resident directory with one flag per dashboard tile, for current residents in scope,
-- as of `as_of`:
--
--   overdue_assessment    the latest assessment of a kind is older than the kind's due interval
--                         or, for a kind every resident is expected to have, there is none
--                         (the same rule as the assessment summary on the resident page)
--   out_of_range_vitals   a set of vitals taken in the 24 hours before as_of has a reading
--                         outside its normal range
--   recent_incident       an incident occurred in the 7 days before as_of
--   upcoming_appointment  a scheduled appointment falls on as_of's date or the next day
--   medication_due        a scheduled dose of an active order falls in the current shift and
--                         no administration (given, refused, or held) is recorded within two
--                         hours of its time
--   medication_overdue    such an outstanding dose in the last 24 hours is more than an hour
--                         past its time
--
-- As-needed medications have no scheduled doses, so they are never due or overdue.
create or replace function public.resident_dashboard_at(as_of timestamptz default now())
returns table (
  id uuid,
  first_name text,
  last_name text,
  full_name text,
  date_of_birth date,
  sex text,
  status public.resident_status,
  admission_date date,
  stay_ended_on date,
  stay_end_reason public.stay_end_reason,
  code_status public.code_status,
  diet public.diet,
  mobility public.mobility,
  facility_id uuid,
  facility_code text,
  facility_name text,
  unit_id uuid,
  unit_code text,
  unit_name text,
  room_id uuid,
  room_number text,
  search_text text,
  archived_at timestamptz,
  updated_at timestamptz,
  overdue_assessment boolean,
  out_of_range_vitals boolean,
  recent_incident boolean,
  upcoming_appointment boolean,
  medication_due boolean,
  medication_overdue boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with shift as (
    select w.starts_at, w.ends_at from public.shift_window(as_of) w
  ),
  current_residents as (
    select r.id
    from public.residents r
    where r.archived_at is null and r.status = 'current'
  ),
  latest_assessments as (
    select distinct on (a.resident_id, a.kind) a.resident_id, a.kind, a.performed_at
    from public.assessments a
    where a.archived_at is null
    order by a.resident_id, a.kind, a.performed_at desc
  ),
  overdue as (
    select distinct r.id as resident_id
    from current_residents r
    cross join public.assessment_kinds k
    left join latest_assessments la on la.resident_id = r.id and la.kind = k.kind
    where (la.performed_at is null and k.expected_for_everyone)
       or (la.performed_at is not null
           and (la.performed_at at time zone 'America/New_York')::date + k.due_every_days
               < (as_of at time zone 'America/New_York')::date)
  ),
  out_of_range as (
    select distinct v.resident_id
    from public.vitals v
    where v.archived_at is null
      and v.taken_at > as_of - interval '24 hours'
      and v.taken_at <= as_of
      and public.vitals_out_of_range(v)
  ),
  incident as (
    select distinct i.resident_id
    from public.incidents i
    where i.archived_at is null
      and i.occurred_at > as_of - interval '7 days'
      and i.occurred_at <= as_of
  ),
  appointment as (
    select distinct ap.resident_id
    from public.appointments ap
    where ap.archived_at is null
      and ap.status = 'scheduled'
      and (ap.scheduled_at at time zone 'America/New_York')::date
          between (as_of at time zone 'America/New_York')::date
              and (as_of at time zone 'America/New_York')::date + 1
  ),
  doses as (
    -- Every scheduled dose of an active order on as_of's local date and the day before.
    select
      o.id as order_id,
      o.resident_id,
      ((d.day + make_interval(hours => t.hour)) at time zone 'America/New_York') as due_at
    from public.medication_orders o
    join current_residents r on r.id = o.resident_id
    join public.medication_dose_times t on t.frequency = o.frequency
    cross join lateral (
      values
        ((as_of at time zone 'America/New_York')::date - 1),
        ((as_of at time zone 'America/New_York')::date)
    ) as d (day)
    where o.archived_at is null
      and o.status = 'active'
      and o.started_on <= d.day
      and (t.weekday is null or extract(dow from d.day) = t.weekday)
  ),
  outstanding as (
    select d.order_id, d.resident_id, d.due_at
    from doses d
    where not exists (
      select 1
      from public.administrations a
      where a.medication_order_id = d.order_id
        and a.archived_at is null
        and a.administered_at between d.due_at - interval '2 hours' and d.due_at + interval '2 hours'
    )
  ),
  due as (
    select distinct o.resident_id
    from outstanding o
    cross join shift s
    where o.due_at >= s.starts_at and o.due_at < s.ends_at
  ),
  overdue_dose as (
    select distinct o.resident_id
    from outstanding o
    where o.due_at + interval '1 hour' < as_of
      and o.due_at > as_of - interval '24 hours'
  )
  select
    d.id,
    d.first_name,
    d.last_name,
    d.full_name,
    d.date_of_birth,
    d.sex,
    d.status,
    d.admission_date,
    d.stay_ended_on,
    d.stay_end_reason,
    d.code_status,
    d.diet,
    d.mobility,
    d.facility_id,
    d.facility_code,
    d.facility_name,
    d.unit_id,
    d.unit_code,
    d.unit_name,
    d.room_id,
    d.room_number,
    d.search_text,
    d.archived_at,
    d.updated_at,
    (oa.resident_id is not null) as overdue_assessment,
    (oor.resident_id is not null) as out_of_range_vitals,
    (inc.resident_id is not null) as recent_incident,
    (ap.resident_id is not null) as upcoming_appointment,
    (du.resident_id is not null) as medication_due,
    (od.resident_id is not null) as medication_overdue
  from public.resident_directory d
  left join overdue oa on oa.resident_id = d.id
  left join out_of_range oor on oor.resident_id = d.id
  left join incident inc on inc.resident_id = d.id
  left join appointment ap on ap.resident_id = d.id
  left join due du on du.resident_id = d.id
  left join overdue_dose od on od.resident_id = d.id
  where d.status = 'current' and d.archived_at is null;
$$;

comment on function public.resident_dashboard_at(timestamptz) is
  'The resident directory (current residents in scope) with one flag per dashboard tile, as of an instant.';

-- The numbers on the tiles, as of `as_of`, plus the shift they were computed for.
create or replace function public.dashboard_tiles_at(as_of timestamptz default now())
returns table (
  residents integer,
  beds integer,
  medication_due integer,
  medication_overdue integer,
  overdue_assessment integer,
  out_of_range_vitals integer,
  incidents integer,
  incident_residents integer,
  appointments_today integer,
  appointments_tomorrow integer,
  appointment_residents integer,
  shift_key text,
  shift_name text,
  shift_starts_at timestamptz,
  shift_ends_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with flags as (
    select * from public.resident_dashboard_at(as_of)
  ),
  clock as (
    select (as_of at time zone 'America/New_York')::date as today
  ),
  shift as (
    select * from public.shift_window(as_of)
  )
  select
    (select count(*) from flags)::integer as residents,
    (
      select coalesce(sum(rm.capacity), 0)
      from public.rooms rm
      join public.units u on u.id = rm.unit_id
      where rm.archived_at is null and u.archived_at is null
    )::integer as beds,
    (select count(*) from flags f where f.medication_due)::integer as medication_due,
    (select count(*) from flags f where f.medication_overdue)::integer as medication_overdue,
    (select count(*) from flags f where f.overdue_assessment)::integer as overdue_assessment,
    (select count(*) from flags f where f.out_of_range_vitals)::integer as out_of_range_vitals,
    (
      select count(*)
      from public.incidents i
      join flags f on f.id = i.resident_id
      where i.archived_at is null
        and i.occurred_at > as_of - interval '7 days'
        and i.occurred_at <= as_of
    )::integer as incidents,
    (select count(*) from flags f where f.recent_incident)::integer as incident_residents,
    (
      select count(*)
      from public.appointments a
      join flags f on f.id = a.resident_id
      cross join clock c
      where a.archived_at is null
        and a.status = 'scheduled'
        and (a.scheduled_at at time zone 'America/New_York')::date = c.today
    )::integer as appointments_today,
    (
      select count(*)
      from public.appointments a
      join flags f on f.id = a.resident_id
      cross join clock c
      where a.archived_at is null
        and a.status = 'scheduled'
        and (a.scheduled_at at time zone 'America/New_York')::date = c.today + 1
    )::integer as appointments_tomorrow,
    (select count(*) from flags f where f.upcoming_appointment)::integer as appointment_residents,
    (select s.key from shift s) as shift_key,
    (select s.name from shift s) as shift_name,
    (select s.starts_at from shift s) as shift_starts_at,
    (select s.ends_at from shift s) as shift_ends_at;
$$;

comment on function public.dashboard_tiles_at(timestamptz) is
  'The dashboard tile counts for the caller''s scope as of an instant, and the shift they cover.';

revoke all on function public.vitals_out_of_range(public.vitals) from public, anon;
revoke all on function public.shift_window(timestamptz) from public, anon;
revoke all on function public.resident_dashboard_at(timestamptz) from public, anon;
revoke all on function public.dashboard_tiles_at(timestamptz) from public, anon;
grant execute on function public.vitals_out_of_range(public.vitals) to authenticated;
grant execute on function public.shift_window(timestamptz) to authenticated;
grant execute on function public.resident_dashboard_at(timestamptz) to authenticated;
grant execute on function public.dashboard_tiles_at(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Occupancy
-- ---------------------------------------------------------------------------------------------

-- Beds and current residents per unit, for the census tile's chart. A nurse sees their units,
-- an admin every unit; the app rolls units up to facilities for the admin.
create view public.unit_occupancy
with (security_invoker = true)
as
select
  u.id as unit_id,
  u.code as unit_code,
  u.name as unit_name,
  f.id as facility_id,
  f.code as facility_code,
  f.name as facility_name,
  (
    select coalesce(sum(rm.capacity), 0)
    from public.rooms rm
    where rm.unit_id = u.id and rm.archived_at is null
  )::integer as beds,
  (
    select count(*)
    from public.residents r
    where r.unit_id = u.id and r.status = 'current' and r.archived_at is null
  )::integer as residents
from public.units u
join public.facilities f on f.id = u.facility_id
where u.archived_at is null and f.archived_at is null;

comment on view public.unit_occupancy is
  'Beds and current residents per unit in the caller''s scope.';

grant select on public.unit_occupancy to authenticated;
