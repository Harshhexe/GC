-- 🔔 GC — push notifications.
--
-- Three pieces, applied as migrations `device_push_tokens` and
-- `push_on_new_message`:
--   1. device_push_tokens — one row per (user, device) Expo push token.
--   2. notify_new_message() — trigger that hands new message ids to the
--      send-push edge function.
--   3. the vault secret holding that function's URL.
--
-- The fan-out itself (who is in the group, who muted it, whose devices to
-- hit, talking to Expo) lives in supabase/functions/send-push/index.ts.
-- Nothing here does that work, on purpose: it would run inside the sender's
-- INSERT transaction and make every message send wait on the network.

-- ── device tokens ───────────────────────────────────────────────────────
--
-- Keyed by the token rather than by user: one person can have the app on a
-- phone and a tablet and should get notified on both, and the same physical
-- device can be handed between accounts — in which case the token must move
-- to the new user rather than be duplicated. `on conflict (token)` does that.
create table if not exists public.device_push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_idx
  on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

-- Only ever your own tokens. The sender is the service role inside the
-- send-push edge function, which bypasses RLS — nobody else has any business
-- reading the set of devices another member owns.
drop policy if exists "users manage their own push tokens" on public.device_push_tokens;
create policy "users manage their own push tokens"
  on public.device_push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── the send-push endpoint ──────────────────────────────────────────────
--
-- In the vault alongside gc_ai_function_url, so the trigger body carries no
-- environment specifics. Direct INSERTs into vault.secrets are not permitted;
-- vault.create_secret() is the supported path.
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/send-push',
  'push_function_url',
  'Endpoint for the new-message push fan-out (see notify_new_message).'
)
where not exists (select 1 from vault.secrets where name = 'push_function_url');

-- ── the trigger ─────────────────────────────────────────────────────────
--
-- net.http_post only *queues* the request — pg_net's background worker does
-- the actual delivery — so this stays cheap even though it talks to the
-- network, and a failed or slow push can never fail a message send.
--
-- Authenticates to the edge function with the same `x-cron-secret` vault
-- secret the weekly-awards job uses. send-push is therefore deployed with
-- --no-verify-jwt (like gc-ai): the platform JWT gate would reject a call
-- carrying no Authorization header, and the constant-time secret check inside
-- the function is the stronger gate anyway — a JWT gate would let any
-- signed-in user trigger a fan-out.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
  v_url text;
begin
  -- Nothing to announce: tombstones and system rows have no author to
  -- attribute a notification to.
  if new.is_deleted or new.author_id is null then
    return new;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'gc_ai_cron_secret';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url';

  if v_secret is null or v_url is null then
    raise warning '[notify_new_message] push secret or URL missing from vault — skipping';
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('messageId', new.id),
    timeout_milliseconds := 10000
  );

  return new;
end;
$function$;

-- AFTER INSERT: the row must be visible to the edge function's own SELECT by
-- the time it runs, and an AFTER trigger cannot affect the insert either way.
drop trigger if exists messages_notify_push on public.messages;
create trigger messages_notify_push
  after insert on public.messages
  for each row
  execute function public.notify_new_message();
