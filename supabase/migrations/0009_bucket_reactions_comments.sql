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

create trigger bucket_items_notify after update on public.bucket_items
  for each row execute function public.notify_bucket_completed();

alter table public.bucket_items enable row level security;

create policy bucket_items_select on public.bucket_items for select to authenticated
  using (public.is_relationship_member(relationship_id));

create policy bucket_items_insert on public.bucket_items for insert to authenticated
  with check (created_by = auth.uid() and public.is_relationship_member(relationship_id));

create policy bucket_items_update on public.bucket_items for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));

-- Either member can remove an item from the shared list.
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

create policy memory_reactions_select on public.memory_reactions for select to authenticated
  using (public.is_relationship_member(public.memory_relationship_id(memory_id)));

create policy memory_reactions_insert on public.memory_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.is_relationship_member(public.memory_relationship_id(memory_id)));

-- You can only take back your own reactions. There is no update policy, so reactions cannot be edited.
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

create trigger memory_comments_notify after insert on public.memory_comments
  for each row execute function public.notify_memory_comment();

alter table public.memory_comments enable row level security;

create policy memory_comments_select on public.memory_comments for select to authenticated
  using (public.is_relationship_member(relationship_id));

create policy memory_comments_insert on public.memory_comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_relationship_member(relationship_id));

-- Authors can delete their own comments. Comments can't be edited, which keeps the record honest.
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
