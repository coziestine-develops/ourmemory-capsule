-- Memory Capsule: explicit table and function grants.
-- Newer Supabase projects don't grant the API roles access to new tables automatically.
-- Row level security still decides which rows each user can see; these grants only allow the role to try.

grant usage on schema public to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Apply the same grants to anything created later.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

-- Anonymous visitors get nothing from the data tables.
revoke all on all tables in schema public from anon;
