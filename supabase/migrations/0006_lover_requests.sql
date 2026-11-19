-- Memory Capsule: usernames and "add lover" requests (replaces the invite-link flow).
-- Run after 0001-0005. Safe to re-run on a project that already has the earlier migrations.
--
-- Flow (like a friend request):
--   1. Each person picks a unique username.
--   2. A member of a space searches a username and sends a lover request.
--   3. The other person accepts or declines. Accepting joins them to the space.
--
-- Security model
--   * Requests are written only through RPCs, never directly. The table has no insert/update/delete grant.
--   * Every RPC checks auth.uid() and the one-space-per-person and two-member rules.

-- ---------------------------------------------------------------------------
-- Usernames
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists username text;

-- Existing people get a generated username so they can be found right away. They can change it in Settings.
update public.profiles p
set username = lower(
      left(coalesce(nullif(regexp_replace(p.display_name, '[^a-zA-Z0-9]', '', 'g'), ''), 'user'), 20)
      || '_' || substr(replace(p.id::text, '-', ''), 1, 6)
    )
where p.username is null;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_.]{3,30}$');

create unique index if not exists profiles_username_key on public.profiles (username);

-- Claims or changes the caller's username. Usernames are stored in lowercase.
create or replace function public.set_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := lower(trim(coalesce(p_username, '')));
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_name !~ '^[a-z0-9_.]{3,30}$' then
    raise exception 'USERNAME_INVALID';
  end if;
  begin
    update public.profiles set username = v_name where id = v_uid;
  exception when unique_violation then
    raise exception 'USERNAME_TAKEN';
  end;
  return v_name;
end;
$$;

-- Finds one person by exact username. Returns nothing for the caller's own username.
-- Only public-facing fields are returned: name, username, and whether they already have a space.
create or replace function public.find_user_by_username(p_username text)
returns table (id uuid, display_name text, username text, in_space boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.username,
         exists (select 1 from public.relationship_members m where m.user_id = p.id) as in_space
  from public.profiles p
  where auth.uid() is not null
    and p.username = lower(trim(p_username))
    and p.id <> auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Lover requests
-- ---------------------------------------------------------------------------

create table if not exists public.lover_requests (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  requested_to uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint lover_requests_not_self check (requested_by <> requested_to)
);

-- A person can have only one open request at a time.
create unique index if not exists lover_requests_one_pending_per_person
  on public.lover_requests (requested_to) where status = 'pending';
create index if not exists lover_requests_requested_by_idx on public.lover_requests (requested_by);

alter table public.lover_requests enable row level security;

-- You see requests you sent or received. Nobody else can see them.
drop policy if exists lover_requests_select on public.lover_requests;
create policy lover_requests_select on public.lover_requests for select to authenticated
  using (requested_by = auth.uid() or requested_to = auth.uid());

revoke all on public.lover_requests from anon;
revoke insert, update, delete on public.lover_requests from authenticated;
grant select on public.lover_requests to authenticated;

-- The caller's open requests, in both directions. Names come through this function because
-- profile rules only let partners read each other.
create or replace function public.list_lover_requests()
returns table (id uuid, direction text, other_id uuid, other_name text, other_username text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         case when r.requested_to = auth.uid() then 'incoming' else 'outgoing' end,
         case when r.requested_to = auth.uid() then r.requested_by else r.requested_to end,
         p.display_name,
         p.username,
         r.created_at
  from public.lover_requests r
  join public.profiles p
    on p.id = case when r.requested_to = auth.uid() then r.requested_by else r.requested_to end
  where auth.uid() is not null
    and r.status = 'pending'
    and (r.requested_by = auth.uid() or r.requested_to = auth.uid())
  order by r.created_at desc;
$$;

-- Sends a request from the caller's space to another person, found by username.
create or replace function public.send_lover_request(p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rel uuid;
  v_target public.profiles%rowtype;
  v_req uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select relationship_id into v_rel from public.relationship_members where user_id = v_uid;
  if v_rel is null then
    raise exception 'NO_SPACE';
  end if;
  if (select count(*) from public.relationship_members where relationship_id = v_rel) >= 2 then
    raise exception 'SPACE_FULL';
  end if;

  select * into v_target from public.profiles where username = lower(trim(p_username));
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_target.id = v_uid then
    raise exception 'CANNOT_ADD_SELF';
  end if;
  if exists (select 1 from public.relationship_members where user_id = v_target.id) then
    raise exception 'ALREADY_IN_SPACE';
  end if;
  if exists (select 1 from public.lover_requests where requested_to = v_target.id and status = 'pending') then
    raise exception 'REQUEST_ALREADY_PENDING';
  end if;

  insert into public.lover_requests (relationship_id, requested_by, requested_to)
  values (v_rel, v_uid, v_target.id)
  returning id into v_req;

  select coalesce(display_name, 'Someone') into v_name from public.profiles where id = v_uid;
  insert into public.notifications (user_id, relationship_id, title, message, type, related_id)
  values (
    v_target.id,
    v_rel,
    'Lover request',
    v_name || ' wants to add you as their lover.',
    'lover_request',
    v_req
  );

  return v_req;
end;
$$;

-- Accepts or declines a request sent to the caller. Accepting joins the caller to the sender's space.
create or replace function public.respond_lover_request(p_request_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.lover_requests%rowtype;
  v_name text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_req from public.lover_requests where id = p_request_id for update;
  if not found or v_req.requested_to <> v_uid or v_req.status <> 'pending' then
    raise exception 'REQUEST_INVALID';
  end if;

  if not p_accept then
    update public.lover_requests set status = 'declined', responded_at = now() where id = v_req.id;
    return null;
  end if;

  if exists (select 1 from public.relationship_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_SPACE';
  end if;
  if not exists (
    select 1 from public.relationship_members
    where relationship_id = v_req.relationship_id and user_id = v_req.requested_by
  ) then
    raise exception 'REQUEST_INVALID';
  end if;
  if (select count(*) from public.relationship_members where relationship_id = v_req.relationship_id) >= 2 then
    raise exception 'SPACE_FULL';
  end if;

  insert into public.relationship_members (relationship_id, user_id, role)
  values (v_req.relationship_id, v_uid, 'partner');

  update public.lover_requests set status = 'accepted', responded_at = now() where id = v_req.id;

  select coalesce(display_name, 'Your lover') into v_name from public.profiles where id = v_uid;
  insert into public.notifications (user_id, relationship_id, title, message, type, related_id)
  values (
    v_req.requested_by,
    v_req.relationship_id,
    'Lover request accepted',
    v_name || ' accepted. You are sharing a space now.',
    'lover_request',
    v_req.id
  );

  return v_req.relationship_id;
end;
$$;

-- The sender withdraws a request that is still pending.
create or replace function public.cancel_lover_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.lover_requests
  set status = 'cancelled', responded_at = now()
  where id = p_request_id and requested_by = auth.uid() and status = 'pending';
  if not found then
    raise exception 'REQUEST_INVALID';
  end if;
end;
$$;

-- Only signed-in users can call these. Postgres grants EXECUTE to PUBLIC by default, so revoke that too.
revoke execute on function public.set_username(text) from public, anon;
revoke execute on function public.find_user_by_username(text) from public, anon;
revoke execute on function public.list_lover_requests() from public, anon;
revoke execute on function public.send_lover_request(text) from public, anon;
revoke execute on function public.respond_lover_request(uuid, boolean) from public, anon;
revoke execute on function public.cancel_lover_request(uuid) from public, anon;
grant execute on function public.set_username(text) to authenticated;
grant execute on function public.find_user_by_username(text) to authenticated;
grant execute on function public.list_lover_requests() to authenticated;
grant execute on function public.send_lover_request(text) to authenticated;
grant execute on function public.respond_lover_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_lover_request(uuid) to authenticated;
