-- Health check used by the /health page and GET /api/health.
-- Returns the database's current time so the app can prove the hosted project is reachable
-- and responding, without touching any resident data.

create or replace function public.health_check()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

comment on function public.health_check() is
  'Returns the database clock. Called by the app health page to confirm connectivity.';

revoke all on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;
