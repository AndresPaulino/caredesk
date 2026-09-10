-- Organization and residents.
--
-- The tables ticket 02 needs for sign-in, scope, and the resident list: facilities, units,
-- rooms, staff (with unit assignments and an optional link to an auth user), and residents.
-- Clinical tables arrive in ticket 03 and resolve scope through residents (ADR 0003).
--
-- Scope rule (ADR 0003): a nurse sees residents on their assigned units; an admin sees every
-- resident. It is expressed once here, as Row Level Security, keyed off the signed-in user.

-- ---------------------------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------------------------

create type public.staff_role as enum ('nurse', 'admin', 'physician');
create type public.resident_status as enum ('current', 'former');
create type public.stay_end_reason as enum ('discharged', 'transferred', 'deceased');
create type public.code_status as enum ('full_code', 'dnr', 'dnr_dni', 'comfort_care');
create type public.diet as enum (
  'regular', 'cardiac', 'diabetic', 'renal', 'mechanical_soft', 'pureed', 'thickened_liquids'
);
create type public.mobility as enum (
  'independent', 'cane', 'walker', 'wheelchair', 'one_person_assist', 'two_person_assist', 'bedbound'
);

-- ---------------------------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Organization tables
-- ---------------------------------------------------------------------------------------------

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  city text not null,
  state text not null default 'MA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.facilities is 'One care home run by the operator (Willowbrook Care).';

create table public.units (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id),
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (facility_id, code),
  -- Lets residents reference (unit_id, facility_id) so a resident's unit is always in their facility.
  unique (id, facility_id)
);

comment on table public.units is 'A ward within a facility that residents and nurses are assigned to.';

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id),
  number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (unit_id, number),
  -- Lets residents reference (room_id, unit_id) so a resident's room is always on their unit.
  unique (id, unit_id)
);

comment on table public.rooms is 'A numbered room within a unit where a resident lives.';

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  -- Present only for staff who can sign in (nurses and admins with demo accounts).
  auth_user_id uuid unique references auth.users (id) on delete set null,
  -- Null means operator-wide (the admin). Nurses and physicians belong to one facility.
  facility_id uuid references public.facilities (id),
  role public.staff_role not null,
  first_name text not null,
  last_name text not null,
  credentials text,
  email text unique,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.staff is 'A person employed by the operator: a nurse, an admin, or a physician.';
comment on column public.staff.auth_user_id is 'The Supabase Auth user this staff member signs in as, when they can sign in.';
comment on column public.staff.facility_id is 'Home facility. Null for operator-wide staff such as the admin.';

create table public.staff_unit_assignments (
  staff_id uuid not null references public.staff (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, unit_id)
);

comment on table public.staff_unit_assignments is 'The units a nurse covers. A nurse''s scope is the residents on these units.';

-- ---------------------------------------------------------------------------------------------
-- Residents
-- ---------------------------------------------------------------------------------------------

create table public.residents (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id),
  unit_id uuid not null,
  room_id uuid,
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  sex text not null check (sex in ('female', 'male')),
  admission_date date not null,
  status public.resident_status not null default 'current',
  stay_ended_on date,
  stay_end_reason public.stay_end_reason,
  code_status public.code_status not null default 'full_code',
  diet public.diet not null default 'regular',
  mobility public.mobility not null default 'independent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (unit_id, facility_id) references public.units (id, facility_id),
  foreign key (room_id, unit_id) references public.rooms (id, unit_id),
  constraint residents_stay_end_matches_status check (
    (status = 'current' and stay_ended_on is null and stay_end_reason is null)
    or (status = 'former' and stay_ended_on is not null and stay_end_reason is not null)
  )
);

comment on table public.residents is 'A person who lives in, or formerly lived in, a facility. Former residents keep everything.';
comment on column public.residents.unit_id is 'Current unit, or the last unit for a former resident. Scope is decided by this column.';

create index residents_unit_id_idx on public.residents (unit_id);
create index residents_facility_id_idx on public.residents (facility_id);
create index residents_name_idx on public.residents (last_name, first_name);
create index residents_status_idx on public.residents (status);
create index units_facility_id_idx on public.units (facility_id);
create index rooms_unit_id_idx on public.rooms (unit_id);
create index staff_facility_id_idx on public.staff (facility_id);
create index staff_unit_assignments_unit_id_idx on public.staff_unit_assignments (unit_id);

create trigger facilities_set_updated_at before update on public.facilities
  for each row execute function public.set_updated_at();
create trigger units_set_updated_at before update on public.units
  for each row execute function public.set_updated_at();
create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();
create trigger staff_set_updated_at before update on public.staff
  for each row execute function public.set_updated_at();
create trigger residents_set_updated_at before update on public.residents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Scope helpers
--
-- Security definer so a policy can ask "who is signed in and what do they cover" without
-- recursing into the staff table's own policies. Each one reads only the caller's own rows.
-- ---------------------------------------------------------------------------------------------

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.staff s
  where s.auth_user_id = (select auth.uid())
    and s.archived_at is null
  limit 1;
$$;

comment on function public.current_staff_id() is 'The staff row linked to the signed-in auth user, or null.';

create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff s
  where s.auth_user_id = (select auth.uid())
    and s.archived_at is null
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.current_staff_role()) = 'admin', false);
$$;

comment on function public.is_admin() is 'True when the signed-in staff member has operator-wide scope.';

create or replace function public.current_unit_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.unit_id
  from public.staff_unit_assignments a
  where a.staff_id = (select public.current_staff_id());
$$;

comment on function public.current_unit_ids() is 'Units the signed-in nurse is assigned to. Empty for admins and for staff with no assignments.';

create or replace function public.current_facility_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct u.facility_id
  from public.staff_unit_assignments a
  join public.units u on u.id = a.unit_id
  where a.staff_id = (select public.current_staff_id());
$$;

revoke all on function public.current_staff_id() from public, anon;
revoke all on function public.current_staff_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.current_unit_ids() from public, anon;
revoke all on function public.current_facility_ids() from public, anon;
grant execute on function public.current_staff_id() to authenticated;
grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_unit_ids() to authenticated;
grant execute on function public.current_facility_ids() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
--
-- Every policy is for the authenticated role only; anonymous requests see nothing. Helper
-- calls are wrapped in (select ...) so Postgres evaluates them once per query, not per row.
-- ---------------------------------------------------------------------------------------------

alter table public.facilities enable row level security;
alter table public.units enable row level security;
alter table public.rooms enable row level security;
alter table public.staff enable row level security;
alter table public.staff_unit_assignments enable row level security;
alter table public.residents enable row level security;

create policy "Staff read facilities in scope"
  on public.facilities for select to authenticated
  using (
    (select public.is_admin())
    or id in (select public.current_facility_ids())
  );

create policy "Staff read units in scope"
  on public.units for select to authenticated
  using (
    (select public.is_admin())
    or id in (select public.current_unit_ids())
  );

create policy "Staff read rooms in scope"
  on public.rooms for select to authenticated
  using (
    (select public.is_admin())
    or unit_id in (select public.current_unit_ids())
  );

-- A nurse sees themself and colleagues at their facility (records are attributed to staff);
-- an admin sees everyone.
create policy "Staff read colleagues in scope"
  on public.staff for select to authenticated
  using (
    (select public.is_admin())
    or id = (select public.current_staff_id())
    or facility_id in (select public.current_facility_ids())
  );

create policy "Staff read their own unit assignments"
  on public.staff_unit_assignments for select to authenticated
  using (
    (select public.is_admin())
    or staff_id = (select public.current_staff_id())
  );

create policy "Staff read residents in scope"
  on public.residents for select to authenticated
  using (
    (select public.is_admin())
    or unit_id in (select public.current_unit_ids())
  );

-- Editing arrives in ticket 05; the boundary is the same. A nurse cannot move a resident to a
-- unit they do not cover, and cannot touch a resident they cannot see.
create policy "Staff update residents in scope"
  on public.residents for update to authenticated
  using (
    (select public.is_admin())
    or unit_id in (select public.current_unit_ids())
  )
  with check (
    (select public.is_admin())
    or unit_id in (select public.current_unit_ids())
  );

-- ---------------------------------------------------------------------------------------------
-- Resident directory
--
-- The list and detail pages read this view. security_invoker makes the underlying tables'
-- policies apply to whoever queries it, so it never widens scope.
-- ---------------------------------------------------------------------------------------------

create view public.resident_directory
with (security_invoker = true)
as
select
  r.id,
  r.first_name,
  r.last_name,
  r.first_name || ' ' || r.last_name as full_name,
  r.date_of_birth,
  r.sex,
  r.status,
  r.admission_date,
  r.stay_ended_on,
  r.stay_end_reason,
  r.code_status,
  r.diet,
  r.mobility,
  r.facility_id,
  f.code as facility_code,
  f.name as facility_name,
  r.unit_id,
  u.code as unit_code,
  u.name as unit_name,
  r.room_id,
  rm.number as room_number,
  -- One column the search box matches against: name and room together.
  r.first_name || ' ' || r.last_name || ' ' || coalesce(rm.number, '') as search_text,
  r.archived_at,
  r.updated_at
from public.residents r
join public.facilities f on f.id = r.facility_id
join public.units u on u.id = r.unit_id
left join public.rooms rm on rm.id = r.room_id;

comment on view public.resident_directory is
  'Residents with their facility, unit, and room names, scoped by the caller''s policies.';

grant select on public.resident_directory to authenticated;
