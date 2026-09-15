-- Assistant access is an audit operation.
--
-- The assistant's questions and the lookups it runs on a staff member's behalf are audit
-- events too (ticket 11): they are reads, not changes, so the operation enum gains a value.
-- Postgres will not let a new enum value be used in the transaction that adds it, and every
-- migration runs in its own transaction, so the value is added here and used in the next one.

alter type public.audit_operation add value if not exists 'access';
