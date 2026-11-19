-- Memory Capsule: core schema, helper functions, triggers, and row level security.
-- Run in the Supabase SQL editor or via `supabase db push`.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_path text,
  birthday date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  cover_path text,
  start_date date,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.relationship_members (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'partner' check (role in ('owner', 'partner')),
  joined_at timestamptz not null default now(),
  constraint relationship_members_unique unique (relationship_id, user_id),
  -- Each person belongs to one shared space.
  constraint relationship_members_one_space_per_user unique (user_id)
);

create table public.relationship_invitations (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text,
  memory_date date not null,
  memory_time time,
  location text,
  category text not null default 'Everyday Moments',
  mood text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memory_media (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  original_filename text not null,
  file_size bigint not null check (file_size > 0),
  mime_type text not null,
  display_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index memories_relationship_date_idx on public.memories (relationship_id, memory_date desc);
create index memories_relationship_created_idx on public.memories (relationship_id, created_at desc);
create index memories_favorite_idx on public.memories (relationship_id) where is_favorite;
create index memory_media_memory_order_idx on public.memory_media (memory_id, display_order);
create index memory_media_relationship_idx on public.memory_media (relationship_id);
create index relationship_members_relationship_idx on public.relationship_members (relationship_id);
create index relationship_invitations_relationship_idx on public.relationship_invitations (relationship_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger relationships_touch before update on public.relationships
  for each row execute function public.touch_updated_at();
create trigger memories_touch before update on public.memories
  for each row execute function public.touch_updated_at();

-- Creates a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enforces the two-member limit even under concurrent inserts.
create or replace function public.enforce_max_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.relationships where id = new.relationship_id for update;
  if (select count(*) from public.relationship_members where relationship_id = new.relationship_id) >= 2 then
    raise exception 'SPACE_FULL' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger relationship_members_max_two
  before insert on public.relationship_members
  for each row execute function public.enforce_max_members();

-- ---------------------------------------------------------------------------
-- Security helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_relationship_member(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.relationship_members m
    where m.relationship_id = rid
      and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.relationships enable row level security;
alter table public.relationship_members enable row level security;
alter table public.relationship_invitations enable row level security;
alter table public.memories enable row level security;
alter table public.memory_media enable row level security;

-- Profiles: read yourself and your partner; edit only yourself.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.relationship_members me
      join public.relationship_members them on them.relationship_id = me.relationship_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
    )
  );

create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Relationships: members only. Creation goes through create_relationship().
create policy relationships_select on public.relationships for select to authenticated
  using (public.is_relationship_member(id));

create policy relationships_update on public.relationships for update to authenticated
  using (public.is_relationship_member(id))
  with check (public.is_relationship_member(id));

-- Membership: members can see the roster; anyone can leave their own space.
create policy relationship_members_select on public.relationship_members for select to authenticated
  using (public.is_relationship_member(relationship_id));

create policy relationship_members_leave on public.relationship_members for delete to authenticated
  using (user_id = auth.uid());

-- Invitations: members can see their space's invitations. Writes go through RPCs.
create policy relationship_invitations_select on public.relationship_invitations for select to authenticated
  using (public.is_relationship_member(relationship_id));

-- Memories: any member of the space can read and manage shared memories.
create policy memories_select on public.memories for select to authenticated
  using (public.is_relationship_member(relationship_id));

create policy memories_insert on public.memories for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));

create policy memories_update on public.memories for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));

create policy memories_delete on public.memories for delete to authenticated
  using (public.is_relationship_member(relationship_id));

-- Media rows: must belong to a memory in the same space.
create policy memory_media_select on public.memory_media for select to authenticated
  using (public.is_relationship_member(relationship_id));

create policy memory_media_insert on public.memory_media for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.is_relationship_member(relationship_id)
    and exists (
      select 1 from public.memories m
      where m.id = memory_media.memory_id
        and m.relationship_id = memory_media.relationship_id
    )
  );

create policy memory_media_update on public.memory_media for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));

create policy memory_media_delete on public.memory_media for delete to authenticated
  using (public.is_relationship_member(relationship_id));

-- ---------------------------------------------------------------------------
-- RPC functions (security definer, so the client never writes membership directly)
-- ---------------------------------------------------------------------------

create or replace function public.create_relationship(p_name text, p_start_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if exists (select 1 from public.relationship_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_SPACE';
  end if;

  insert into public.relationships (name, start_date, created_by)
  values (trim(p_name), p_start_date, v_uid)
  returning id into v_id;

  insert into public.relationship_members (relationship_id, user_id, role)
  values (v_id, v_uid, 'owner');

  return v_id;
end;
$$;

create or replace function public.create_invitation(p_relationship_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if not public.is_relationship_member(p_relationship_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if (select count(*) from public.relationship_members where relationship_id = p_relationship_id) >= 2 then
    raise exception 'SPACE_FULL';
  end if;

  -- 256-bit random token. Only its SHA-256 hash is stored.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.relationship_invitations (relationship_id, invited_by, token_hash, expires_at)
  values (
    p_relationship_id,
    auth.uid(),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + interval '7 days'
  );

  return v_token;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.relationship_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if exists (select 1 from public.relationship_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_SPACE';
  end if;

  select * into v_inv
  from public.relationship_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or v_inv.accepted_at is not null then
    raise exception 'INVITATION_INVALID';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'INVITATION_EXPIRED';
  end if;

  insert into public.relationship_members (relationship_id, user_id, role)
  values (v_inv.relationship_id, v_uid, 'partner');

  update public.relationship_invitations
  set accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;

  return v_inv.relationship_id;
end;
$$;

revoke execute on function public.create_relationship(text, date) from anon;
revoke execute on function public.create_invitation(uuid) from anon;
revoke execute on function public.accept_invitation(text) from anon;
revoke execute on function public.is_relationship_member(uuid) from anon;
