-- Memory Capsule database setup. Paste this whole file into Supabase > SQL Editor and click Run.
-- Safe to run on a fresh project. Creates all tables, triggers, RLS policies, functions, grants, storage buckets,
-- private messaging, usernames and lover requests, the allowed-accounts list, albums, letters, time capsules,
-- important dates, notifications, the shared bucket list, memory reactions, and memory comments.

-- Memory Capsule: core schema, helper functions, triggers, and row level security.
-- Run in the Supabase SQL editor or via `supabase db push`.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_path text,
  birthday date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  cover_path text,
  start_date date,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationship_members (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'partner' check (role in ('owner', 'partner')),
  joined_at timestamptz not null default now(),
  constraint relationship_members_unique unique (relationship_id, user_id),
  -- Each person belongs to one shared space.
  constraint relationship_members_one_space_per_user unique (user_id)
);

create table if not exists public.relationship_invitations (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
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

create table if not exists public.memory_media (
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

create index if not exists memories_relationship_date_idx on public.memories (relationship_id, memory_date desc);
create index if not exists memories_relationship_created_idx on public.memories (relationship_id, created_at desc);
create index if not exists memories_favorite_idx on public.memories (relationship_id) where is_favorite;
create index if not exists memory_media_memory_order_idx on public.memory_media (memory_id, display_order);
create index if not exists memory_media_relationship_idx on public.memory_media (relationship_id);
create index if not exists relationship_members_relationship_idx on public.relationship_members (relationship_id);
create index if not exists relationship_invitations_relationship_idx on public.relationship_invitations (relationship_id);

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

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists relationships_touch on public.relationships;
create trigger relationships_touch before update on public.relationships
  for each row execute function public.touch_updated_at();
drop trigger if exists memories_touch on public.memories;
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

drop trigger if exists on_auth_user_created on auth.users;
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

drop trigger if exists relationship_members_max_two on public.relationship_members;
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
drop policy if exists profiles_select on public.profiles;
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

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Relationships: members only. Creation goes through create_relationship().
drop policy if exists relationships_select on public.relationships;
create policy relationships_select on public.relationships for select to authenticated
  using (public.is_relationship_member(id));

drop policy if exists relationships_update on public.relationships;
create policy relationships_update on public.relationships for update to authenticated
  using (public.is_relationship_member(id))
  with check (public.is_relationship_member(id));

-- Membership: members can see the roster; anyone can leave their own space.
drop policy if exists relationship_members_select on public.relationship_members;
create policy relationship_members_select on public.relationship_members for select to authenticated
  using (public.is_relationship_member(relationship_id));

drop policy if exists relationship_members_leave on public.relationship_members;
create policy relationship_members_leave on public.relationship_members for delete to authenticated
  using (user_id = auth.uid());

-- Invitations: members can see their space's invitations. Writes go through RPCs.
drop policy if exists relationship_invitations_select on public.relationship_invitations;
create policy relationship_invitations_select on public.relationship_invitations for select to authenticated
  using (public.is_relationship_member(relationship_id));

-- Memories: any member of the space can read and manage shared memories.
drop policy if exists memories_select on public.memories;
create policy memories_select on public.memories for select to authenticated
  using (public.is_relationship_member(relationship_id));

drop policy if exists memories_insert on public.memories;
create policy memories_insert on public.memories for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));

drop policy if exists memories_update on public.memories;
create policy memories_update on public.memories for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));

drop policy if exists memories_delete on public.memories;
create policy memories_delete on public.memories for delete to authenticated
  using (public.is_relationship_member(relationship_id));

-- Media rows: must belong to a memory in the same space.
drop policy if exists memory_media_select on public.memory_media;
create policy memory_media_select on public.memory_media for select to authenticated
  using (public.is_relationship_member(relationship_id));

drop policy if exists memory_media_insert on public.memory_media;
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

drop policy if exists memory_media_update on public.memory_media;
create policy memory_media_update on public.memory_media for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));

drop policy if exists memory_media_delete on public.memory_media;
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

-- Memory Capsule: private storage buckets and access policies.
-- Object paths start with the relationship id: <relationship_id>/memories/<memory_id>/<file>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('relationship-media', 'relationship-media', false, 524288000,
    array['image/jpeg','image/png','video/mp4','video/quicktime']),
  ('relationship-covers', 'relationship-covers', false, 20971520,
    array['image/jpeg','image/png']),
  ('relationship-letters', 'relationship-letters', false, 20971520,
    array['image/jpeg','image/png']),
  ('relationship-avatars', 'relationship-avatars', false, 5242880,
    array['image/jpeg','image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Safely extracts the relationship id from the first folder of an object path.
create or replace function public.storage_relationship_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

-- Members of a relationship may read, upload, and delete objects under its folder.
do $$
declare
  b text;
begin
  foreach b in array array['relationship-media', 'relationship-covers', 'relationship-letters'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_select');
    execute format('drop policy if exists %I on storage.objects', b || '_insert');
    execute format('drop policy if exists %I on storage.objects', b || '_delete');

    execute format(
      'create policy %I on storage.objects for select to authenticated using (
         bucket_id = %L and public.is_relationship_member(public.storage_relationship_id(name)))',
      b || '_select', b);

    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (
         bucket_id = %L and public.is_relationship_member(public.storage_relationship_id(name)))',
      b || '_insert', b);

    execute format(
      'create policy %I on storage.objects for delete to authenticated using (
         bucket_id = %L and public.is_relationship_member(public.storage_relationship_id(name)))',
      b || '_delete', b);
  end loop;
end
$$;

-- Avatars: each person manages their own; a partner may view it.
drop policy if exists relationship_avatars_select on storage.objects;
drop policy if exists relationship_avatars_insert on storage.objects;
drop policy if exists relationship_avatars_delete on storage.objects;

drop policy if exists relationship_avatars_select on storage.objects;
create policy relationship_avatars_select on storage.objects for select to authenticated
  using (
    bucket_id = 'relationship-avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.relationship_members me
        join public.relationship_members them on them.relationship_id = me.relationship_id
        where me.user_id = auth.uid()
          and them.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists relationship_avatars_insert on storage.objects;
create policy relationship_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'relationship-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists relationship_avatars_delete on storage.objects;
create policy relationship_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'relationship-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

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

-- Memory Capsule: albums, love letters, time capsules, important dates, notifications, on this day.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  cover_memory_id uuid references public.memories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deleting an album removes only these links, never the memories.
create table if not exists public.album_memories (
  album_id uuid not null references public.albums (id) on delete cascade,
  memory_id uuid not null references public.memories (id) on delete cascade,
  display_order integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (album_id, memory_id)
);

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  recipient text,
  content text not null check (char_length(content) between 1 and 20000),
  category text not null default 'Love Letters',
  open_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capsules (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text,
  open_at timestamptz not null,
  sealed_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.capsule_memories (
  capsule_id uuid not null references public.capsules (id) on delete cascade,
  memory_id uuid not null references public.memories (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (capsule_id, memory_id)
);

create table if not exists public.capsule_messages (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.important_dates (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  event_date date not null,
  event_type text not null default 'custom' check (event_type in ('anniversary', 'birthday', 'milestone', 'custom')),
  is_recurring boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  title text not null,
  message text,
  type text not null default 'general',
  related_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists albums_relationship_idx on public.albums (relationship_id);
create index if not exists album_memories_memory_idx on public.album_memories (memory_id);
create index if not exists letters_relationship_idx on public.letters (relationship_id, open_at);
create index if not exists capsules_relationship_idx on public.capsules (relationship_id, open_at);
create index if not exists capsule_memories_memory_idx on public.capsule_memories (memory_id);
create index if not exists capsule_messages_capsule_idx on public.capsule_messages (capsule_id);
create index if not exists important_dates_relationship_idx on public.important_dates (relationship_id, event_date);
create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists albums_touch on public.albums;
create trigger albums_touch before update on public.albums
  for each row execute function public.touch_updated_at();
drop trigger if exists letters_touch on public.letters;
create trigger letters_touch before update on public.letters
  for each row execute function public.touch_updated_at();

-- Sealed capsules: title, description, and opening date are locked.
create or replace function public.capsule_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.sealed_at is not null then
    if new.title <> old.title
      or new.description is distinct from old.description
      or new.open_at <> old.open_at
      or new.sealed_at is distinct from old.sealed_at then
      raise exception 'CAPSULE_SEALED';
    end if;
  end if;
  if old.opened_at is not null and new.opened_at is distinct from old.opened_at then
    raise exception 'CAPSULE_ALREADY_OPENED';
  end if;
  if old.sealed_at is null and new.sealed_at is not null and new.open_at <= now() then
    raise exception 'OPEN_DATE_MUST_BE_FUTURE';
  end if;
  return new;
end;
$$;

drop trigger if exists capsules_guard on public.capsules;
create trigger capsules_guard before update on public.capsules
  for each row execute function public.capsule_guard();

-- Notify the partner when a memory is added.
create or replace function public.notify_memory_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, relationship_id, title, message, type, related_id)
  select m.user_id, new.relationship_id,
         'New memory added',
         coalesce(p.display_name, 'Your partner') || ' added "' || new.title || '".',
         'memory', new.id
  from public.relationship_members m
  left join public.profiles p on p.id = new.created_by
  where m.relationship_id = new.relationship_id
    and m.user_id <> new.created_by;
  return new;
end;
$$;

drop trigger if exists memories_notify on public.memories;
create trigger memories_notify after insert on public.memories
  for each row execute function public.notify_memory_created();

-- Notify the partner when a letter is written. The content stays private.
create or replace function public.notify_letter_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, relationship_id, title, message, type, related_id)
  select m.user_id, new.relationship_id,
         'A new letter for you',
         coalesce(p.display_name, 'Your partner') || ' wrote you a letter.',
         'letter', new.id
  from public.relationship_members m
  left join public.profiles p on p.id = new.created_by
  where m.relationship_id = new.relationship_id
    and m.user_id <> new.created_by;
  return new;
end;
$$;

drop trigger if exists letters_notify on public.letters;
create trigger letters_notify after insert on public.letters
  for each row execute function public.notify_letter_created();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A capsule's contents are visible only once it is a draft or has been opened.
create or replace function public.capsule_contents_visible(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.capsules c
    where c.id = cid
      and public.is_relationship_member(c.relationship_id)
      and (c.sealed_at is null or c.opened_at is not null)
  );
$$;

create or replace function public.capsule_is_draft_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.capsules c
    where c.id = cid
      and public.is_relationship_member(c.relationship_id)
      and c.sealed_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.albums enable row level security;
alter table public.album_memories enable row level security;
alter table public.letters enable row level security;
alter table public.capsules enable row level security;
alter table public.capsule_memories enable row level security;
alter table public.capsule_messages enable row level security;
alter table public.important_dates enable row level security;
alter table public.notifications enable row level security;

-- Albums: shared within the space.
drop policy if exists albums_select on public.albums;
create policy albums_select on public.albums for select to authenticated
  using (public.is_relationship_member(relationship_id));
drop policy if exists albums_insert on public.albums;
create policy albums_insert on public.albums for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));
drop policy if exists albums_update on public.albums;
create policy albums_update on public.albums for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));
drop policy if exists albums_delete on public.albums;
create policy albums_delete on public.albums for delete to authenticated
  using (public.is_relationship_member(relationship_id));

drop policy if exists album_memories_select on public.album_memories;
create policy album_memories_select on public.album_memories for select to authenticated
  using (exists (select 1 from public.albums a where a.id = album_id and public.is_relationship_member(a.relationship_id)));
drop policy if exists album_memories_insert on public.album_memories;
create policy album_memories_insert on public.album_memories for insert to authenticated
  with check (exists (
    select 1 from public.albums a
    join public.memories m on m.id = memory_id
    where a.id = album_id
      and public.is_relationship_member(a.relationship_id)
      and m.relationship_id = a.relationship_id
  ));
drop policy if exists album_memories_delete on public.album_memories;
create policy album_memories_delete on public.album_memories for delete to authenticated
  using (exists (select 1 from public.albums a where a.id = album_id and public.is_relationship_member(a.relationship_id)));

-- Letters: a letter with a future opening date is visible only to its author until that date.
drop policy if exists letters_select on public.letters;
create policy letters_select on public.letters for select to authenticated
  using (
    public.is_relationship_member(relationship_id)
    and (created_by = auth.uid() or open_at is null or open_at <= now())
  );
drop policy if exists letters_insert on public.letters;
create policy letters_insert on public.letters for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));
drop policy if exists letters_update on public.letters;
create policy letters_update on public.letters for update to authenticated
  using (created_by = auth.uid() and public.is_relationship_member(relationship_id))
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));
drop policy if exists letters_delete on public.letters;
create policy letters_delete on public.letters for delete to authenticated
  using (created_by = auth.uid());

-- Capsules: metadata is visible to members; editing and deleting only while a draft.
drop policy if exists capsules_select on public.capsules;
create policy capsules_select on public.capsules for select to authenticated
  using (public.is_relationship_member(relationship_id));
drop policy if exists capsules_insert on public.capsules;
create policy capsules_insert on public.capsules for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id) and sealed_at is null);
drop policy if exists capsules_update on public.capsules;
create policy capsules_update on public.capsules for update to authenticated
  using (public.is_relationship_member(relationship_id) and sealed_at is null)
  with check (public.is_relationship_member(relationship_id));
drop policy if exists capsules_delete on public.capsules;
create policy capsules_delete on public.capsules for delete to authenticated
  using (public.is_relationship_member(relationship_id) and sealed_at is null);

-- Capsule contents are hidden from everyone until the capsule is opened.
drop policy if exists capsule_memories_select on public.capsule_memories;
create policy capsule_memories_select on public.capsule_memories for select to authenticated
  using (public.capsule_contents_visible(capsule_id));
drop policy if exists capsule_memories_insert on public.capsule_memories;
create policy capsule_memories_insert on public.capsule_memories for insert to authenticated
  with check (
    public.capsule_is_draft_member(capsule_id)
    and exists (
      select 1 from public.memories m
      join public.capsules c on c.id = capsule_id
      where m.id = memory_id and m.relationship_id = c.relationship_id
    )
  );
drop policy if exists capsule_memories_delete on public.capsule_memories;
create policy capsule_memories_delete on public.capsule_memories for delete to authenticated
  using (public.capsule_is_draft_member(capsule_id));

drop policy if exists capsule_messages_select on public.capsule_messages;
create policy capsule_messages_select on public.capsule_messages for select to authenticated
  using (public.capsule_contents_visible(capsule_id));
drop policy if exists capsule_messages_insert on public.capsule_messages;
create policy capsule_messages_insert on public.capsule_messages for insert to authenticated
  with check (created_by = auth.uid() and public.capsule_is_draft_member(capsule_id));
drop policy if exists capsule_messages_delete on public.capsule_messages;
create policy capsule_messages_delete on public.capsule_messages for delete to authenticated
  using (created_by = auth.uid() and public.capsule_is_draft_member(capsule_id));

-- Important dates: shared within the space.
drop policy if exists important_dates_select on public.important_dates;
create policy important_dates_select on public.important_dates for select to authenticated
  using (public.is_relationship_member(relationship_id));
drop policy if exists important_dates_insert on public.important_dates;
create policy important_dates_insert on public.important_dates for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));
drop policy if exists important_dates_update on public.important_dates;
create policy important_dates_update on public.important_dates for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));
drop policy if exists important_dates_delete on public.important_dates;
create policy important_dates_delete on public.important_dates for delete to authenticated
  using (public.is_relationship_member(relationship_id));

-- Notifications: each person sees only their own. Inserts come from triggers.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Seals a draft capsule. After this, its contents and dates are locked.
create or replace function public.seal_capsule(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.capsules%rowtype;
  v_name text;
begin
  select * into c from public.capsules where id = p_id for update;
  if not found or not public.is_relationship_member(c.relationship_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if c.sealed_at is not null then
    raise exception 'ALREADY_SEALED';
  end if;
  if c.open_at <= now() then
    raise exception 'OPEN_DATE_MUST_BE_FUTURE';
  end if;

  update public.capsules set sealed_at = now() where id = p_id;

  select coalesce(display_name, 'Your partner') into v_name from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, relationship_id, title, message, type, related_id)
  select m.user_id, c.relationship_id, 'A time capsule was sealed',
         v_name || ' sealed "' || c.title || '".', 'capsule', c.id
  from public.relationship_members m
  where m.relationship_id = c.relationship_id and m.user_id <> auth.uid();
end;
$$;

-- Opens a sealed capsule once its opening date has arrived.
create or replace function public.open_capsule(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.capsules%rowtype;
begin
  select * into c from public.capsules where id = p_id for update;
  if not found or not public.is_relationship_member(c.relationship_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if c.sealed_at is null then
    raise exception 'NOT_SEALED';
  end if;
  if now() < c.open_at then
    raise exception 'NOT_YET_OPEN';
  end if;
  if c.opened_at is null then
    update public.capsules set opened_at = now() where id = p_id;
  end if;
end;
$$;

-- Memories from this calendar day in earlier years.
create or replace function public.on_this_day(p_relationship_id uuid)
returns setof public.memories
language sql
stable
as $$
  select m.* from public.memories m
  where m.relationship_id = p_relationship_id
    and to_char(m.memory_date, 'MM-DD') = to_char(current_date, 'MM-DD')
    and m.memory_date < current_date
  order by m.memory_date desc;
$$;

revoke execute on function public.seal_capsule(uuid) from anon;
revoke execute on function public.open_capsule(uuid) from anon;
revoke execute on function public.on_this_day(uuid) from anon;

-- Grants for new tables and functions.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- Memory Capsule: private messaging between the members of a shared space.
-- Run in the Supabase SQL editor (or `supabase db push`) after 0001-0004.
--
-- Security model
--   * Row level security: only members of a relationship can read its messages.
--   * Insert: you can only send as yourself, into a space you belong to.
--   * Update: members can update rows in their space, but the guard trigger below limits
--     the sender to "unsend" and the recipient to "mark as read" (server-set timestamp).
--   * Delete: no policy and no grant, so clients can never hard-delete messages.
--   * Column-level grants add a second layer on top of the policies.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_at timestamptz,
  -- An unsent message keeps its row (so the chat shows "unsent") but its text is erased.
  constraint messages_body_check check (
    (deleted_at is null and char_length(btrim(body)) between 1 and 2000)
    or (deleted_at is not null and body = '')
  )
);

create index if not exists messages_relationship_created_idx on public.messages (relationship_id, created_at desc);
create index if not exists messages_unread_idx on public.messages (relationship_id, sender_id)
  where read_at is null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Guard trigger: fine-grained rules RLS cannot express
-- ---------------------------------------------------------------------------

create or replace function public.messages_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Trusted server-side callers (service role, SQL editor) have no auth.uid().
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.relationship_id is distinct from old.relationship_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at then
    raise exception 'MESSAGE_IMMUTABLE: message identity cannot be changed.';
  end if;

  if old.deleted_at is not null then
    raise exception 'MESSAGE_DELETED: an unsent message cannot be changed.';
  end if;

  if auth.uid() = old.sender_id then
    -- Sender: may only unsend. Cannot edit text or touch read receipts.
    if new.read_at is distinct from old.read_at then
      raise exception 'MESSAGE_FORBIDDEN: you cannot change read receipts on your own message.';
    end if;
    if new.deleted_at is null then
      if new.body is distinct from old.body then
        raise exception 'MESSAGE_FORBIDDEN: messages cannot be edited.';
      end if;
    else
      new.deleted_at := now();
      new.body := '';
    end if;
  else
    -- Recipient: may only mark as read, and the timestamp is set by the server.
    if new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at then
      raise exception 'MESSAGE_FORBIDDEN: you can only mark this message as read.';
    end if;
    new.read_at := coalesce(old.read_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists messages_guard_trg on public.messages;
create trigger messages_guard_trg before update on public.messages
  for each row execute function public.messages_guard();

-- Normalise inserts: server-side timestamp, clean text, no pre-set receipts.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.body := btrim(new.body);
  new.created_at := now();
  new.read_at := null;
  new.deleted_at := null;
  return new;
end;
$$;

drop trigger if exists messages_before_insert_trg on public.messages;
create trigger messages_before_insert_trg before insert on public.messages
  for each row execute function public.messages_before_insert();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.is_relationship_member(relationship_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_relationship_member(relationship_id)
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));

-- ---------------------------------------------------------------------------
-- Grants (defence in depth on top of RLS)
-- ---------------------------------------------------------------------------

revoke all on public.messages from anon;
revoke all on public.messages from authenticated;
grant select on public.messages to authenticated;
grant insert (relationship_id, sender_id, body) on public.messages to authenticated;
grant update (read_at, deleted_at) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (respects the select policy above)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;


-- ===========================================================================
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


-- ===========================================================================
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

-- ===========================================================================
-- Memory Capsule: shared bucket list, memory reactions, and memory comments.
-- Run after 0001-0008 (in the SQL editor or with `supabase db push`).
--
-- Security model (same shape as the rest of the app)
--   * Every table is readable and writable only by members of the space it belongs to.
--   * Reactions and comments are always written as yourself (author_id / user_id = auth.uid()).
--   * Completion of a bucket item is stamped by the server, so nobody can fake who ticked it or when.

-- ---------------------------------------------------------------------------
-- Bucket list
-- ---------------------------------------------------------------------------

create table if not exists public.bucket_items (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  category text not null default 'Dream'
    check (category in ('Dream', 'Travel', 'Experience', 'Food', 'Home', 'Goal')),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  completed_memory_id uuid references public.memories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bucket_items_relationship_idx
  on public.bucket_items (relationship_id, completed_at, created_at desc);

drop trigger if exists bucket_items_touch on public.bucket_items;
create trigger bucket_items_touch before update on public.bucket_items
  for each row execute function public.touch_updated_at();

create or replace function public.bucket_items_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Trusted server-side callers (service role, SQL editor) have no auth.uid().
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.relationship_id is distinct from old.relationship_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'BUCKET_ITEM_IMMUTABLE: item identity cannot be changed.';
  end if;

  if new.completed_at is distinct from old.completed_at then
    -- Ticking off or un-ticking: the server decides the time and the person.
    if new.completed_at is null then
      new.completed_by := null;
      new.completed_memory_id := null;
    else
      new.completed_at := now();
      new.completed_by := auth.uid();
      if new.completed_memory_id is not null and not exists (
        select 1 from public.memories m
        where m.id = new.completed_memory_id and m.relationship_id = new.relationship_id
      ) then
        raise exception 'BUCKET_LINK_INVALID: the linked memory must belong to this space.';
      end if;
    end if;
  elsif new.completed_memory_id is distinct from old.completed_memory_id then
    -- A memory link is only chosen at the moment the item is ticked off.
    raise exception 'BUCKET_LINK_LOCKED: choose a memory when you tick the item off.';
  end if;

  return new;
end;
$$;

drop trigger if exists bucket_items_guard_trg on public.bucket_items;
create trigger bucket_items_guard_trg before update on public.bucket_items
  for each row execute function public.bucket_items_guard();

-- Tell the partner when something on the list is ticked off.
create or replace function public.notify_bucket_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.completed_at is null and new.completed_at is not null then
    insert into public.notifications (user_id, relationship_id, title, message, type, related_id)
    select m.user_id, new.relationship_id,
           'Ticked off your list',
           coalesce(p.display_name, 'Your partner') || ' ticked off "' || new.title || '".',
           'bucket', new.id
    from public.relationship_members m
    left join public.profiles p on p.id = new.completed_by
    where m.relationship_id = new.relationship_id
      and m.user_id is distinct from new.completed_by;
  end if;
  return new;
end;
$$;

drop trigger if exists bucket_items_notify on public.bucket_items;
create trigger bucket_items_notify after update on public.bucket_items
  for each row execute function public.notify_bucket_completed();

alter table public.bucket_items enable row level security;

drop policy if exists bucket_items_select on public.bucket_items;
create policy bucket_items_select on public.bucket_items for select to authenticated
  using (public.is_relationship_member(relationship_id));

drop policy if exists bucket_items_insert on public.bucket_items;
create policy bucket_items_insert on public.bucket_items for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));

drop policy if exists bucket_items_update on public.bucket_items;
create policy bucket_items_update on public.bucket_items for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));

-- Either member can remove an item from the shared list.
drop policy if exists bucket_items_delete on public.bucket_items;
create policy bucket_items_delete on public.bucket_items for delete to authenticated
  using (public.is_relationship_member(relationship_id));

-- ---------------------------------------------------------------------------
-- Memory reactions: one row per person per reaction type
-- ---------------------------------------------------------------------------

create table if not exists public.memory_reactions (
  memory_id uuid not null references public.memories (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null
    check (reaction in ('love', 'laugh', 'touched', 'fire', 'sparkle', 'heart_eyes')),
  created_at timestamptz not null default now(),
  primary key (memory_id, user_id, reaction)
);

-- Looks up the space a memory belongs to. Returns only an id, never memory content.
create or replace function public.memory_relationship_id(mid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select relationship_id from public.memories where id = mid;
$$;

alter table public.memory_reactions enable row level security;

drop policy if exists memory_reactions_select on public.memory_reactions;
create policy memory_reactions_select on public.memory_reactions for select to authenticated
  using (public.is_relationship_member(public.memory_relationship_id(memory_id)));

drop policy if exists memory_reactions_insert on public.memory_reactions;
create policy memory_reactions_insert on public.memory_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.is_relationship_member(public.memory_relationship_id(memory_id)));

-- You can only take back your own reactions. There is no update policy, so reactions cannot be edited.
drop policy if exists memory_reactions_delete on public.memory_reactions;
create policy memory_reactions_delete on public.memory_reactions for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Memory comments
-- ---------------------------------------------------------------------------

create table if not exists public.memory_comments (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists memory_comments_memory_idx on public.memory_comments (memory_id, created_at);

-- The space is always taken from the memory, so a comment can't be filed under the wrong space.
create or replace function public.memory_comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.relationship_id := public.memory_relationship_id(new.memory_id);
  if new.relationship_id is null then
    raise exception 'COMMENT_INVALID: that memory does not exist.';
  end if;
  return new;
end;
$$;

drop trigger if exists memory_comments_fill_space on public.memory_comments;
create trigger memory_comments_fill_space before insert on public.memory_comments
  for each row execute function public.memory_comments_before_insert();

-- Tell the partner a comment was left. The comment text stays out of the notification.
create or replace function public.notify_memory_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, relationship_id, title, message, type, related_id)
  select m.user_id, new.relationship_id,
         'New comment on a memory',
         coalesce(p.display_name, 'Your partner') || ' left a comment on "' || mem.title || '".',
         'comment', new.memory_id
  from public.relationship_members m
  join public.memories mem on mem.id = new.memory_id
  left join public.profiles p on p.id = new.author_id
  where m.relationship_id = new.relationship_id
    and m.user_id <> new.author_id;
  return new;
end;
$$;

drop trigger if exists memory_comments_notify on public.memory_comments;
create trigger memory_comments_notify after insert on public.memory_comments
  for each row execute function public.notify_memory_comment();

alter table public.memory_comments enable row level security;

drop policy if exists memory_comments_select on public.memory_comments;
create policy memory_comments_select on public.memory_comments for select to authenticated
  using (public.is_relationship_member(relationship_id));

drop policy if exists memory_comments_insert on public.memory_comments;
create policy memory_comments_insert on public.memory_comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_relationship_member(relationship_id));

-- Authors can delete their own comments. Comments can't be edited, which keeps the record honest.
drop policy if exists memory_comments_delete on public.memory_comments;
create policy memory_comments_delete on public.memory_comments for delete to authenticated
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants (same explicit approach as 0003) and realtime
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.bucket_items to authenticated;
grant select, insert, delete on public.memory_reactions to authenticated;
grant select, insert, delete on public.memory_comments to authenticated;
revoke all on public.bucket_items, public.memory_reactions, public.memory_comments from anon;
grant execute on function public.memory_relationship_id(uuid) to authenticated;

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['bucket_items', 'memory_reactions', 'memory_comments'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ===========================================================================
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


-- ===========================================================================
-- Memory Capsule: Messenger-style message status (Sent, Delivered, Seen) and "Delete conversation".
-- Run after 0001-0010. Safe to re-run.
--
--   * messages.delivered_at: stamped by the server when the recipient's app receives the message.
--   * read_at (Seen) is stamped by the server when the recipient opens the chat; it also implies delivered.
--   * Delete conversation works like Messenger's "Delete chat": it clears the chat for the person who
--     deletes it and leaves the other person's copy untouched. Messages are never hard-deleted.

-- ---------------------------------------------------------------------------
-- Delivered receipts
-- ---------------------------------------------------------------------------

alter table public.messages add column if not exists delivered_at timestamptz;

-- Messages that already exist count as delivered (and seen ones as delivered when they were created).
update public.messages set delivered_at = coalesce(read_at, created_at) where delivered_at is null;

create or replace function public.messages_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Trusted server-side callers (service role, SQL editor) have no auth.uid().
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.relationship_id is distinct from old.relationship_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at then
    raise exception 'MESSAGE_IMMUTABLE: message identity cannot be changed.';
  end if;

  if old.deleted_at is not null then
    raise exception 'MESSAGE_DELETED: an unsent message cannot be changed.';
  end if;

  if auth.uid() = old.sender_id then
    -- Sender: may only unsend. Cannot edit text or touch receipts.
    if new.read_at is distinct from old.read_at or new.delivered_at is distinct from old.delivered_at then
      raise exception 'MESSAGE_FORBIDDEN: you cannot change receipts on your own message.';
    end if;
    if new.deleted_at is null then
      if new.body is distinct from old.body then
        raise exception 'MESSAGE_FORBIDDEN: messages cannot be edited.';
      end if;
    else
      new.deleted_at := now();
      new.body := '';
    end if;
  else
    -- Recipient: may only record delivered / seen. Timestamps are set by the server and only move forward.
    if new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at then
      raise exception 'MESSAGE_FORBIDDEN: you can only mark this message as delivered or read.';
    end if;

    if old.read_at is not null then
      new.read_at := old.read_at;
    elsif new.read_at is not null then
      new.read_at := now();
    end if;

    if old.delivered_at is not null then
      new.delivered_at := old.delivered_at;
    elsif new.delivered_at is not null or new.read_at is not null then
      new.delivered_at := now();
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.body := btrim(new.body);
  new.created_at := now();
  new.delivered_at := null;
  new.read_at := null;
  new.deleted_at := null;
  return new;
end;
$$;

grant update (read_at, delivered_at, deleted_at) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Delete conversation (for the person who deletes it)
-- ---------------------------------------------------------------------------

create table if not exists public.conversation_clears (
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (relationship_id, user_id)
);

alter table public.conversation_clears enable row level security;

drop policy if exists conversation_clears_select on public.conversation_clears;
create policy conversation_clears_select on public.conversation_clears for select to authenticated
  using (user_id = auth.uid());

revoke all on public.conversation_clears from anon;
revoke all on public.conversation_clears from authenticated;
grant select on public.conversation_clears to authenticated;

-- The only way to write a clear marker: the server stamps the time for the signed-in member.
create or replace function public.clear_conversation(p_relationship_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not public.is_relationship_member(p_relationship_id) then
    raise exception 'NOT_ALLOWED: you are not a member of this space.';
  end if;

  insert into public.conversation_clears (relationship_id, user_id, cleared_at)
  values (p_relationship_id, auth.uid(), v_now)
  on conflict (relationship_id, user_id) do update set cleared_at = excluded.cleared_at;

  return v_now;
end;
$$;

revoke execute on function public.clear_conversation(uuid) from public, anon;
grant execute on function public.clear_conversation(uuid) to authenticated;

-- Members only see messages sent after the last time they cleared the conversation.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (
    public.is_relationship_member(relationship_id)
    and created_at > coalesce(
      (select c.cleared_at
         from public.conversation_clears c
        where c.relationship_id = messages.relationship_id
          and c.user_id = auth.uid()),
      '-infinity'::timestamptz
    )
  );

notify pgrst, 'reload schema';
