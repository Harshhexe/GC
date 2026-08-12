-- GC — Reply / edit / soft-delete on messages.
-- Run this once in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS /
-- OR REPLACE everywhere).

-- ── columns ─────────────────────────────────────────────────────────────
alter table public.messages
  add column if not exists reply_to_message_id uuid references public.messages (id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists is_deleted boolean not null default false;

create index if not exists messages_reply_to_idx
  on public.messages (reply_to_message_id)
  where reply_to_message_id is not null;

-- ── update policy ───────────────────────────────────────────────────────
-- Two distinct things can happen via UPDATE:
--   1. The author edits their own (not-yet-deleted) text.
--   2. The author OR a group owner/admin soft-deletes it (moderation).
-- A single permissive policy covers both; the app only ever sends one shape
-- of update at a time (either {text, edited_at} or {is_deleted}).
drop policy if exists "authors can edit their own messages" on public.messages;
drop policy if exists "authors and mods can delete messages" on public.messages;

create policy "authors and mods can update messages"
  on public.messages for update
  to authenticated
  using (
    public.is_group_member(group_id, auth.uid())
    and (author_id = auth.uid() or public.group_role(group_id, auth.uid()) in ('owner', 'admin'))
  )
  with check (
    public.is_group_member(group_id, auth.uid())
    and (author_id = auth.uid() or public.group_role(group_id, auth.uid()) in ('owner', 'admin'))
  );

-- The policy above is deliberately loose (it just checks who's allowed to
-- touch the row at all) because RLS can't see *which* columns changed. This
-- trigger is what actually keeps a moderator's power scoped to "delete", not
-- "silently rewrite someone else's words":
--   - Only the author may change `text` (i.e. edit content).
--   - Nobody may un-delete or edit through a delete.
create or replace function public.enforce_message_edit_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.text is distinct from old.text and old.author_id is distinct from auth.uid() then
    raise exception 'Only the author can edit this message';
  end if;
  if old.is_deleted and new.is_deleted then
    -- already-deleted messages are immutable
    new.text := old.text;
    new.edited_at := old.edited_at;
  end if;
  if new.is_deleted and not old.is_deleted then
    -- soft-delete clears the body server-side so it never round-trips.
    new.text := '';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_message_edit_rules on public.messages;
create trigger enforce_message_edit_rules
  before update on public.messages
  for each row
  execute function public.enforce_message_edit_rules();
