-- Memory Capsule: let a lover join from an empty solo space.
-- Run after 0001-0009 (or re-run supabase/setup_database.sql, which includes this).
--
-- Rule: a person can belong to one space. A solo space that holds nothing can be
-- closed when its owner accepts a lover request. A space with content (memories,
-- letters, albums, capsules, bucket items, important dates, or messages) is never
-- deleted, because its photos are stored under that space's folder and cannot be
-- moved safely. Those people are told to start from their existing space instead.

-- True when a space holds anything a person would lose if it were closed.
-- Written in PL/pgSQL so it can be created before every table exists; the check runs only when called.
create or replace function public.space_has_content(rid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.memories where relationship_id = rid)
      or exists (select 1 from public.letters where relationship_id = rid)
      or exists (select 1 from public.albums where relationship_id = rid)
      or exists (select 1 from public.capsules where relationship_id = rid)
      or exists (select 1 from public.bucket_items where relationship_id = rid)
      or exists (select 1 from public.important_dates where relationship_id = rid)
      or exists (select 1 from public.messages where relationship_id = rid);
end;
$$;

-- True when the user belongs to a shared space or to a solo space that has content.
create or replace function public.user_is_busy(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.relationship_members m
    where m.user_id = uid
      and ((select count(*) from public.relationship_members x where x.relationship_id = m.relationship_id) > 1
           or public.space_has_content(m.relationship_id))
  );
$$;

revoke execute on function public.space_has_content(uuid) from public, anon;
revoke execute on function public.user_is_busy(uuid) from public, anon;

-- Search result: in_space is true only when the person can't be added right now.
create or replace function public.find_user_by_username(p_username text)
returns table (id uuid, display_name text, username text, in_space boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.username, public.user_is_busy(p.id)
  from public.profiles p
  where auth.uid() is not null
    and p.username = lower(trim(p_username))
    and p.id <> auth.uid();
$$;

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
  if public.user_is_busy(v_target.id) then
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
  values (v_target.id, v_rel, 'Lover request', v_name || ' wants to add you as their lover.', 'lover_request', v_req);

  return v_req;
end;
$$;

create or replace function public.respond_lover_request(p_request_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.lover_requests%rowtype;
  v_old uuid;
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

  if not exists (
    select 1 from public.relationship_members
    where relationship_id = v_req.relationship_id and user_id = v_req.requested_by
  ) then
    raise exception 'REQUEST_INVALID';
  end if;
  if (select count(*) from public.relationship_members where relationship_id = v_req.relationship_id) >= 2 then
    raise exception 'SPACE_FULL';
  end if;

  -- Close the caller's own solo space, but only if it is empty.
  select relationship_id into v_old from public.relationship_members where user_id = v_uid;
  if v_old is not null then
    if (select count(*) from public.relationship_members where relationship_id = v_old) > 1 then
      raise exception 'ALREADY_IN_SPACE';
    end if;
    if public.space_has_content(v_old) then
      raise exception 'OLD_SPACE_HAS_CONTENT';
    end if;
    delete from public.relationships where id = v_old;  -- cascades the caller's membership
  end if;

  insert into public.relationship_members (relationship_id, user_id, role)
  values (v_req.relationship_id, v_uid, 'partner');

  update public.lover_requests set status = 'accepted', responded_at = now() where id = v_req.id;

  select coalesce(display_name, 'Your lover') into v_name from public.profiles where id = v_uid;
  insert into public.notifications (user_id, relationship_id, title, message, type, related_id)
  values (v_req.requested_by, v_req.relationship_id, 'Lover request accepted',
          v_name || ' accepted. You are sharing a space now.', 'lover_request', v_req.id);

  return v_req.relationship_id;
end;
$$;

-- Errors raised here for the app: OLD_SPACE_HAS_CONTENT, ALREADY_IN_SPACE, USER_NOT_FOUND, REQUEST_ALREADY_PENDING.
notify pgrst, 'reload schema';
