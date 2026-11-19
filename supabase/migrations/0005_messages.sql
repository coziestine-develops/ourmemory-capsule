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
