-- 🎭 Anonymous messages: /anon <text>, capped at 3 per person per group per day.
--
-- The message itself carries no author: author_id is NULL and is_anonymous is
-- true, so there is nothing for a member to read, join against, or infer from.
-- Hiding the name in the UI while leaving author_id populated would have been
-- far easier and completely dishonest — anyone with an access token can query
-- the table directly, and a feature that promises anonymity while shipping the
-- sender's id to every client is worse than not having the feature at all.
alter table public.messages
  add column if not exists is_anonymous boolean not null default false;

-- Who actually sent it, kept apart from the message.
--
-- RLS is enabled with NO policies, and the grants are revoked: no client can
-- read this under any circumstances — not the sender, not an admin, not the
-- group owner. Only the service role reaches it.
--
-- It exists for two reasons. The daily limit has to count per person, which is
-- impossible without knowing who sent what. And an anonymous channel with no
-- record whatsoever inside a social app is an abuse vector with no remedy: if
-- someone is harassed anonymously, "nobody can ever know" means the report
-- cannot be acted on. This keeps the group genuinely in the dark while leaving
-- the operator able to answer a safety report.
create table if not exists public.anonymous_messages (
  message_id uuid primary key references public.messages (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists anonymous_messages_sender_day_idx
  on public.anonymous_messages (sender_id, group_id, created_at desc);

alter table public.anonymous_messages enable row level security;
revoke all on public.anonymous_messages from anon, authenticated;

/**
 * Sends one anonymous message, enforcing the daily allowance.
 *
 * SECURITY DEFINER because the messages insert policy pins author_id to
 * auth.uid(); an anonymous message has no author by design, so it cannot be
 * written by the client under that policy. Every check the policy would have
 * made is repeated here — membership above all — so this is not a way around
 * the rules, only a way to write a row the rules cannot express.
 *
 * The day boundary is passed in by the client because "today" is
 * timezone-dependent and the server's midnight is not the user's.
 *
 * The advisory lock is what makes the limit real: FOR UPDATE cannot be used
 * with an aggregate, so without it two sends racing each other could both read
 * "2 used" and both be allowed through. Keyed on (sender, group, day), so
 * different people never contend.
 */
create or replace function public.send_anonymous_message(
  p_group_id uuid,
  p_text text,
  p_day_start timestamptz,
  p_day_end timestamptz,
  p_daily_limit integer default 3
)
returns table (message_id uuid, remaining integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_used integer;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  if not public.is_group_member(p_group_id, v_user) then
    raise exception 'Not a member of this group';
  end if;

  if p_text is null or length(btrim(p_text)) = 0 then
    raise exception 'Message is empty';
  end if;

  if length(p_text) > 2000 then
    raise exception 'Message is too long';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_group_id::text || ':' || p_day_start::text, 0)
  );

  select count(*)::integer into v_used
  from public.anonymous_messages
  where sender_id = v_user
    and group_id = p_group_id
    and created_at >= p_day_start
    and created_at < p_day_end;

  if v_used >= p_daily_limit then
    raise exception 'ANON_LIMIT_REACHED';
  end if;

  insert into public.messages (group_id, author_id, text, is_anonymous)
  values (p_group_id, null, btrim(p_text), true)
  returning id into v_id;

  insert into public.anonymous_messages (message_id, sender_id, group_id)
  values (v_id, v_user, p_group_id);

  return query select v_id, (p_daily_limit - v_used - 1);
end;
$function$;

revoke all on function public.send_anonymous_message(uuid, text, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.send_anonymous_message(uuid, text, timestamptz, timestamptz, integer) to authenticated;

/**
 * How many the caller has left today, for the composer. Reads only the
 * caller's own rows — it can never reveal anyone else's count, which would
 * leak who has been sending anonymously.
 */
create or replace function public.anonymous_messages_remaining(
  p_group_id uuid,
  p_day_start timestamptz,
  p_day_end timestamptz,
  p_daily_limit integer default 3
)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select greatest(
    0,
    p_daily_limit - (
      select count(*)::integer
      from public.anonymous_messages
      where sender_id = auth.uid()
        and group_id = p_group_id
        and created_at >= p_day_start
        and created_at < p_day_end
    )
  );
$function$;

revoke all on function public.anonymous_messages_remaining(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.anonymous_messages_remaining(uuid, timestamptz, timestamptz, integer) to authenticated;
