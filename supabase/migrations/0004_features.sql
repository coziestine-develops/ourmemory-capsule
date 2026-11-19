-- Memory Capsule: albums, love letters, time capsules, important dates, notifications, on this day.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.albums (
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
create table public.album_memories (
  album_id uuid not null references public.albums (id) on delete cascade,
  memory_id uuid not null references public.memories (id) on delete cascade,
  display_order integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (album_id, memory_id)
);

create table public.letters (
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

create table public.capsules (
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

create table public.capsule_memories (
  capsule_id uuid not null references public.capsules (id) on delete cascade,
  memory_id uuid not null references public.memories (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (capsule_id, memory_id)
);

create table public.capsule_messages (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table public.important_dates (
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

create table public.notifications (
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
create index albums_relationship_idx on public.albums (relationship_id);
create index album_memories_memory_idx on public.album_memories (memory_id);
create index letters_relationship_idx on public.letters (relationship_id, open_at);
create index capsules_relationship_idx on public.capsules (relationship_id, open_at);
create index capsule_memories_memory_idx on public.capsule_memories (memory_id);
create index capsule_messages_capsule_idx on public.capsule_messages (capsule_id);
create index important_dates_relationship_idx on public.important_dates (relationship_id, event_date);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger albums_touch before update on public.albums
  for each row execute function public.touch_updated_at();
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
create policy albums_select on public.albums for select to authenticated
  using (public.is_relationship_member(relationship_id));
create policy albums_insert on public.albums for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));
create policy albums_update on public.albums for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));
create policy albums_delete on public.albums for delete to authenticated
  using (public.is_relationship_member(relationship_id));

create policy album_memories_select on public.album_memories for select to authenticated
  using (exists (select 1 from public.albums a where a.id = album_id and public.is_relationship_member(a.relationship_id)));
create policy album_memories_insert on public.album_memories for insert to authenticated
  with check (exists (
    select 1 from public.albums a
    join public.memories m on m.id = memory_id
    where a.id = album_id
      and public.is_relationship_member(a.relationship_id)
      and m.relationship_id = a.relationship_id
  ));
create policy album_memories_delete on public.album_memories for delete to authenticated
  using (exists (select 1 from public.albums a where a.id = album_id and public.is_relationship_member(a.relationship_id)));

-- Letters: a letter with a future opening date is visible only to its author until that date.
create policy letters_select on public.letters for select to authenticated
  using (
    public.is_relationship_member(relationship_id)
    and (created_by = auth.uid() or open_at is null or open_at <= now())
  );
create policy letters_insert on public.letters for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));
create policy letters_update on public.letters for update to authenticated
  using (created_by = auth.uid() and public.is_relationship_member(relationship_id))
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));
create policy letters_delete on public.letters for delete to authenticated
  using (created_by = auth.uid());

-- Capsules: metadata is visible to members; editing and deleting only while a draft.
create policy capsules_select on public.capsules for select to authenticated
  using (public.is_relationship_member(relationship_id));
create policy capsules_insert on public.capsules for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id) and sealed_at is null);
create policy capsules_update on public.capsules for update to authenticated
  using (public.is_relationship_member(relationship_id) and sealed_at is null)
  with check (public.is_relationship_member(relationship_id));
create policy capsules_delete on public.capsules for delete to authenticated
  using (public.is_relationship_member(relationship_id) and sealed_at is null);

-- Capsule contents are hidden from everyone until the capsule is opened.
create policy capsule_memories_select on public.capsule_memories for select to authenticated
  using (public.capsule_contents_visible(capsule_id));
create policy capsule_memories_insert on public.capsule_memories for insert to authenticated
  with check (
    public.capsule_is_draft_member(capsule_id)
    and exists (
      select 1 from public.memories m
      join public.capsules c on c.id = capsule_id
      where m.id = memory_id and m.relationship_id = c.relationship_id
    )
  );
create policy capsule_memories_delete on public.capsule_memories for delete to authenticated
  using (public.capsule_is_draft_member(capsule_id));

create policy capsule_messages_select on public.capsule_messages for select to authenticated
  using (public.capsule_contents_visible(capsule_id));
create policy capsule_messages_insert on public.capsule_messages for insert to authenticated
  with check (created_by = auth.uid() and public.capsule_is_draft_member(capsule_id));
create policy capsule_messages_delete on public.capsule_messages for delete to authenticated
  using (created_by = auth.uid() and public.capsule_is_draft_member(capsule_id));

-- Important dates: shared within the space.
create policy important_dates_select on public.important_dates for select to authenticated
  using (public.is_relationship_member(relationship_id));
create policy important_dates_insert on public.important_dates for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));
create policy important_dates_update on public.important_dates for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));
create policy important_dates_delete on public.important_dates for delete to authenticated
  using (public.is_relationship_member(relationship_id));

-- Notifications: each person sees only their own. Inserts come from triggers.
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
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
