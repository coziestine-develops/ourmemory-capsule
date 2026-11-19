-- Memory Capsule: only two accounts may use this space.
-- Run after 0001-0006. The app checks the same list in src/lib/access.ts; this table is what the server enforces.
--
-- Effect: creating an account, or changing an account's email, is refused for any address not in the list.
-- Accounts that already exist with other addresses are not deleted here (see the note in the README).

create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email))
);

insert into public.allowed_emails (email) values
  ('rectojustine84@gmail.com'),
  ('gucelamary21@gmail.com')
on conflict (email) do nothing;

-- Nobody in the browser may read or change this list. Edit it in the SQL editor (service role).
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;

create or replace function public.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or not exists (
    select 1 from public.allowed_emails where email = lower(trim(new.email))
  ) then
    raise exception 'EMAIL_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_allowed_email_insert on auth.users;
create trigger enforce_allowed_email_insert
  before insert on auth.users
  for each row execute function public.enforce_allowed_email();

drop trigger if exists enforce_allowed_email_update on auth.users;
create trigger enforce_allowed_email_update
  before update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public.enforce_allowed_email();
