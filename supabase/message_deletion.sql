-- GC — two-tier message deletion.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- "Delete for everyone" is the existing soft delete (is_deleted), now also
-- recording *who* did it so a moderator takedown can be labelled as such.
-- "Delete for me" is a per-viewer hide, which is a different thing entirely:
-- the message is untouched for everyone else, so it can't live on the message
-- row. Hence a join table keyed by (message, viewer).

alter table public.messages
  add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

create table if not exists public.hidden_messages (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists hidden_messages_user_idx on public.hidden_messages (user_id);

alter table public.hidden_messages enable row level security;

-- Deliberately only ever your own rows: hiding is private, and nobody should
-- be able to see (or create) a hide on someone else's behalf.
drop policy if exists "users see their own hides" on public.hidden_messages;
create policy "users see their own hides"
  on public.hidden_messages for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "users can hide messages for themselves" on public.hidden_messages;
create policy "users can hide messages for themselves"
  on public.hidden_messages for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users can unhide their own" on public.hidden_messages;
create policy "users can unhide their own"
  on public.hidden_messages for delete
  to authenticated
  using (user_id = auth.uid());

-- Note there is no new policy for "delete for everyone": the existing
-- "authors and mods can update messages" policy already scopes it correctly
-- (author, or owner/admin of the group). The client's menu mirrors that rule,
-- but this is what actually enforces it.

-- Stamp deleted_by server-side rather than trusting the client to report who
-- did it — it's the value the "deleted by admin" label is derived from.
create or replace function public.enforce_message_edit_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
      new.text is distinct from old.text
      or new.mentions is distinct from old.mentions
      or new.mention_everyone is distinct from old.mention_everyone
    )
    and old.author_id is distinct from auth.uid() then
    raise exception 'Only the author can edit this message';
  end if;
  if old.is_deleted and new.is_deleted then
    new.text := old.text;
    new.edited_at := old.edited_at;
    new.media_url := old.media_url;
    new.media_type := old.media_type;
    new.media_thumb_url := old.media_thumb_url;
    new.deleted_by := old.deleted_by;
  end if;
  if new.is_deleted and not old.is_deleted then
    new.deleted_by := auth.uid();
    new.text := '';
    new.media_url := null;
    new.media_type := null;
    new.media_mime := null;
    new.media_name := null;
    new.media_size := null;
    new.media_width := null;
    new.media_height := null;
    new.media_duration_ms := null;
    new.media_thumb_url := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_message_edit_rules() from anon, authenticated;

alter publication supabase_realtime add table public.hidden_messages;
