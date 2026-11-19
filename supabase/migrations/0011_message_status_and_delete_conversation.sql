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
