-- What Did I Miss? needs to know where the user was *before* this sitting.
--
-- The problem: mark_group_read stamps last_read_at = now() on focus and again
-- on every new message, so by the time the user taps "What did I miss" the
-- boundary they care about has already been overwritten. Rather than adding a
-- second read-tracking system, group_members remembers one step of history.
--
-- Applied as migration `missed_boundary`.

alter table public.group_members
  add column if not exists prev_read_at timestamptz;

comment on column public.group_members.prev_read_at is
  'Where last_read_at stood before the current viewing session began. Written '
  'only when the user returns after being away (see gc_read_session_gap), so '
  'repeated marks within one sitting do not erode the missed boundary.';

-- One definition of "a sitting", shared by the writer and the reader below.
-- Marks closer together than this are treated as the same continuous session.
create or replace function public.gc_read_session_gap()
returns interval language sql immutable as $$
  select interval '30 minutes'
$$;

/**
 * Advance the read watermark, preserving the pre-session boundary.
 *
 * Replaces the plain `update ... set last_read_at = now()` the client used to
 * issue, which could not reference the existing value. The conditional shift
 * has to happen atomically with the write or a concurrent mark could snapshot
 * a watermark that has already moved.
 */
create or replace function public.mark_group_read(p_group_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.group_members
  set
    prev_read_at = case
      -- Returning after real time away: the old watermark *is* the boundary.
      when last_read_at is not null
       and now() - last_read_at > public.gc_read_session_gap()
        then last_read_at
      -- Same sitting (including the per-message marks while the chat is open):
      -- leave the boundary where it is, or this erases what we are preserving.
      else prev_read_at
    end,
    last_read_at = now()
  where group_id = p_group_id
    and user_id = auth.uid();
$$;

/**
 * The point this user had actually caught up to, for What Did I Miss?.
 *
 * Mirrors the rule above: if the last mark is recent the user is mid-sitting
 * and already had their watermark advanced by simply opening the chat, so the
 * honest boundary is the preserved one. Otherwise last_read_at is still true.
 *
 * Falls back to joined_at so a brand-new member is never handed the group's
 * entire history, and returns null for a non-member (the caller has already
 * checked membership; this is defence in depth, not the gate).
 */
create or replace function public.gc_missed_since(p_group_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when gm.last_read_at is null then gm.joined_at
    when now() - gm.last_read_at <= public.gc_read_session_gap()
      then coalesce(gm.prev_read_at, gm.joined_at)
    else gm.last_read_at
  end
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = auth.uid();
$$;

/**
 * Retire the current boundary — "I have caught up to here".
 *
 * Applied as migration `consume_missed_boundary`.
 *
 * The two functions above gave prev_read_at a writer and a reader but no way
 * to spend it, so within one sitting gc_missed_since returned the same
 * preserved point forever and What Did I Miss? re-answered a question already
 * answered: you read the messages, replied to them, opened the recap, and it
 * recapped what you had just replied to. Opening it again matched the same
 * message set, so ai_cache's context hash matched too and returned the
 * byte-identical recap — the "same recap twice" symptom, same root cause.
 *
 * Called from the client when the user sends a message in the group: you do
 * not reply to a conversation you have not read. This retires the current
 * boundary; it does not disable the mechanism — mark_group_read re-arms it
 * the next time they return after a real absence.
 *
 * Deliberately NOT called when a recap is merely displayed. A recap stays
 * alive for ten minutes and the screen renders a countdown saying so, so
 * leaving and returning inside that window must show the same recap. Spending
 * the boundary on view made the next resolve return "you're caught up" and
 * the recap disappeared while its own timer was still ticking.
 */
create or replace function public.gc_consume_missed_boundary(p_group_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.group_members
  set prev_read_at = last_read_at
  where group_id = p_group_id
    and user_id = auth.uid()
    -- Nothing read yet means no boundary to spend; gc_missed_since correctly
    -- falls back to joined_at in that case.
    and last_read_at is not null;
$$;

revoke all on function public.mark_group_read(uuid) from public;
revoke all on function public.gc_missed_since(uuid) from public;
revoke all on function public.gc_consume_missed_boundary(uuid) from public;
grant execute on function public.mark_group_read(uuid) to authenticated;
grant execute on function public.gc_missed_since(uuid) to authenticated;
grant execute on function public.gc_consume_missed_boundary(uuid) to authenticated;
grant execute on function public.gc_read_session_gap() to authenticated;

-- Existing rows have no preserved boundary. Seed it from the current watermark
-- so the first What Did I Miss? after deploy uses a sane point rather than
-- falling all the way back to joined_at.
update public.group_members
set prev_read_at = last_read_at
where prev_read_at is null and last_read_at is not null;
