-- Recording care.
--
-- Ticket 05 lets a nurse do the work of a shift from the resident page. The policies that let
-- them write within scope already exist (tickets 02 and 03). This migration adds what the write
-- flows need from the database itself, so the rules hold however a change is made:
--
--   * Room occupancy: a resident can only be placed in a room with a free bed, and a former
--     resident holds no room. Occupancy therefore stays consistent for the UI, the simulator,
--     and any future path.
--   * Attribution: a nurse records vitals, administrations, notes, incidents, and appointments
--     in their own name, never a colleague's. Medication orders are the exception, because the
--     prescriber is a physician and the nurse enters the order on their behalf.

-- ---------------------------------------------------------------------------------------------
-- Room occupancy
-- ---------------------------------------------------------------------------------------------

create index residents_room_id_idx on public.residents (room_id);

alter table public.residents
  add constraint residents_former_holds_no_room check (status = 'current' or room_id is null);

comment on constraint residents_former_holds_no_room on public.residents is
  'A stay that has ended frees the bed.';

-- Security definer so the count is complete whatever the caller''s scope, and so the room can
-- be locked; the function reads nothing it returns except the room number in an error.
create or replace function public.enforce_room_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  room record;
  occupants integer;
begin
  if new.room_id is null or new.status <> 'current' or new.archived_at is not null then
    return new;
  end if;
  -- Staying in the same bed changes nothing.
  if tg_op = 'UPDATE'
     and new.room_id = old.room_id
     and old.status = 'current'
     and old.archived_at is null then
    return new;
  end if;

  -- Serialize moves into one room so two nurses cannot both take its last bed.
  select r.number, r.capacity into room
  from public.rooms r
  where r.id = new.room_id
  for update;

  select count(*) into occupants
  from public.residents r
  where r.room_id = new.room_id
    and r.status = 'current'
    and r.archived_at is null
    and r.id <> new.id;

  if occupants >= room.capacity then
    raise exception 'Room % has no free bed', room.number
      using errcode = 'check_violation', hint = 'room_full';
  end if;

  return new;
end;
$$;

comment on function public.enforce_room_capacity() is
  'Rejects placing a current resident in a room whose beds are all taken (hint "room_full").';

create trigger residents_enforce_room_capacity
  before insert or update of room_id, status, archived_at on public.residents
  for each row execute function public.enforce_room_capacity();

-- ---------------------------------------------------------------------------------------------
-- Attribution
--
-- The insert policies from ticket 03 asked only that the resident be in scope. For the tables
-- that name the staff member who did the work, they now also ask that it be the caller. The
-- seeder and the simulator use the service role, which is not subject to policies, and set the
-- actor themselves.
-- ---------------------------------------------------------------------------------------------

do $$
declare
  spec record;
  label text;
begin
  for spec in
    select *
    from (values
      ('administrations', 'administered_by'),
      ('vitals', 'taken_by'),
      ('incidents', 'reported_by'),
      ('progress_notes', 'written_by'),
      ('appointments', 'scheduled_by')
    ) as t (table_name, actor_column)
  loop
    label := replace(spec.table_name, '_', ' ');

    execute format(
      'drop policy %I on public.%I',
      'Staff record ' || label || ' in scope', spec.table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (
           resident_id in (select r.id from public.residents r)
           and %I = (select public.current_staff_id())
         )',
      'Staff record ' || label || ' in their own name', spec.table_name, spec.actor_column
    );
  end loop;
end $$;
