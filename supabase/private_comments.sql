-- 🔒 Private comments: a one-to-one side conversation attached to a public
-- group message. Visible ONLY to the two participants — never to other
-- members, and never to group owners/admins either.
--
-- Thread identity is (message_id, thread_user_id), where thread_user_id is the
-- participant who is NOT the original message's author. That single column is
-- what keeps Riya↔Harsh and Arjun↔Harsh separate threads on the same message,
-- and it is derived server-side so a client cannot forge its way into someone
-- else's thread.
create table if not exists public.private_comments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  -- The non-message-author participant. Both directions of one conversation
  -- carry the same value, which is what makes it a thread key.
  thread_user_id uuid not null references public.profiles (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint private_comments_no_self check (author_id <> recipient_id),
  constraint private_comments_text_len check (char_length(text) <= 4000)
);

-- The two hot paths: "every comment in this thread" and "how many on this
-- message for me". Both always run under RLS, so they are already scoped.
create index if not exists private_comments_thread_idx
  on public.private_comments (message_id, thread_user_id, created_at);
create index if not exists private_comments_author_idx on public.private_comments (author_id);
create index if not exists private_comments_recipient_idx
  on public.private_comments (recipient_id, created_at desc);

alter table public.private_comments enable row level security;

/**
 * Derives recipient and thread from the message being commented on, so the
 * client never gets to choose who a private comment is addressed to.
 *
 * Two directions:
 *   - Someone comments on M's message  -> recipient is forced to M.
 *   - M replies inside a thread        -> recipient is the outsider, and must
 *                                         be someone who is actually in that
 *                                         thread's group.
 */
create or replace function public.prepare_private_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_msg_author uuid;
  v_msg_group uuid;
begin
  select author_id, group_id into v_msg_author, v_msg_group
  from public.messages where id = new.message_id;

  if v_msg_author is null then
    raise exception 'Cannot comment on this message';
  end if;

  -- group_id always follows the message, never the client.
  new.group_id := v_msg_group;

  if not public.is_group_member(v_msg_group, new.author_id) then
    raise exception 'Not a member of this group';
  end if;

  if new.author_id = v_msg_author then
    -- The message author replying inside an existing thread. The counterpart
    -- has to be named, has to be someone else, and has to be in the group.
    if new.recipient_id is null or new.recipient_id = v_msg_author then
      raise exception 'A reply must name the other participant';
    end if;
    if not public.is_group_member(v_msg_group, new.recipient_id) then
      raise exception 'That participant is not in this group';
    end if;
    new.thread_user_id := new.recipient_id;
  else
    -- Anyone else commenting: the recipient is the message author, full stop.
    -- Whatever the client sent is discarded.
    new.recipient_id := v_msg_author;
    new.thread_user_id := new.author_id;
  end if;

  return new;
end;
$function$;

drop trigger if exists private_comments_prepare on public.private_comments;
create trigger private_comments_prepare
  before insert on public.private_comments
  for each row execute function public.prepare_private_comment();

-- ── RLS: the whole feature rests on these four ──────────────────────────
--
-- Note there is deliberately no owner/admin escape hatch. A group admin who
-- is not one of the two participants is treated exactly like any other member.
drop policy if exists "participants can read private comments" on public.private_comments;
create policy "participants can read private comments"
  on public.private_comments for select
  using (
    (select auth.uid()) = author_id
    or (select auth.uid()) = recipient_id
  );

drop policy if exists "members can write their own private comments" on public.private_comments;
create policy "members can write their own private comments"
  on public.private_comments for insert
  with check (
    author_id = (select auth.uid())
    and public.is_group_member(group_id, (select auth.uid()))
  );

-- Covers edit and soft-delete; only ever your own comment.
drop policy if exists "authors can edit their own private comments" on public.private_comments;
create policy "authors can edit their own private comments"
  on public.private_comments for update
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- No hard deletes from the client: removal is deleted_at via the update policy,
-- which keeps the tombstone ("This comment was deleted") for the counterpart.


-- ── Notifications ───────────────────────────────────────────────────────
-- Reuse the existing notifications table rather than a parallel system, but
-- with its own kind so the UI can phrase and route it differently.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['mention'::text, 'mention_everyone'::text, 'private_comment'::text]));

/**
 * In-app notification for the counterpart, plus a push via the existing
 * send-push function. Only ever the one recipient — never the group.
 */
create or replace function public.notify_private_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
  v_url text;
begin
  insert into public.notifications (user_id, actor_id, group_id, message_id, kind)
  values (new.recipient_id, new.author_id, new.group_id, new.message_id, 'private_comment');

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'gc_ai_cron_secret';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url';

  if v_secret is null or v_url is null then
    raise warning '[notify_private_comment] push secret or URL missing from vault — skipping';
    return new;
  end if;

  -- Only the comment id travels; send-push looks the rest up with the service
  -- role so no comment text is ever put on the wire by the database.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('eventType', 'private_comment', 'commentId', new.id),
    timeout_milliseconds := 10000
  );

  return new;
end;
$function$;

drop trigger if exists private_comments_notify on public.private_comments;
create trigger private_comments_notify
  after insert on public.private_comments
  for each row execute function public.notify_private_comment();

-- Realtime for the two participants. Supabase applies RLS per subscriber on
-- postgres_changes, so a non-participant receives nothing.
alter publication supabase_realtime add table public.private_comments;


-- ── Counts for the bubble indicator ─────────────────────────────────────
-- PERF-003: the client was pulling every private-comment row in a group just
-- to render "N private comments" under a bubble. This returns only the counts.
--
-- SECURITY INVOKER (the default) is load-bearing here: the function must run
-- under the caller's RLS so the counts stay scoped per viewer exactly as the
-- raw query was — the message author sees the total across their threads, a
-- commenter sees only their own, and a non-participant gets no row at all.
create or replace function public.private_comment_counts(p_group_id uuid)
returns table(message_id uuid, comment_count bigint)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select c.message_id, count(*)::bigint
  from public.private_comments c
  where c.group_id = p_group_id
    and c.deleted_at is null
  group by c.message_id;
$function$;

grant execute on function public.private_comment_counts(uuid) to authenticated;
