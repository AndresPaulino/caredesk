-- Operator-wide staff are visible to everyone.
--
-- The audit trail names the staff member behind every change. The staff policy from ticket 02
-- let a nurse see themself and colleagues at their facility, which left the operator-wide
-- admin (no facility) unnamed on a nurse's screen: a change the admin made read as "a staff
-- member outside your scope". Staff with no facility are the operator's own people, and their
-- names are not sensitive, so every signed-in staff member may see them.

drop policy "Staff read colleagues in scope" on public.staff;

create policy "Staff read colleagues in scope"
  on public.staff for select to authenticated
  using (
    (select public.is_admin())
    or id = (select public.current_staff_id())
    or facility_id is null
    or facility_id in (select public.current_facility_ids())
  );
