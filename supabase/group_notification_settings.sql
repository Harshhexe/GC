-- 🔔 GC — Group Notification Controls
-- Table: group_notification_settings

create table if not exists public.group_notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  notification_mode text not null default 'all' check (notification_mode in ('all', 'mentions_replies', 'off')),
  muted_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_notification_settings_user_group_key unique (user_id, group_id)
);

create index if not exists group_notification_settings_user_idx
  on public.group_notification_settings (user_id);

create index if not exists group_notification_settings_group_idx
  on public.group_notification_settings (group_id);

alter table public.group_notification_settings enable row level security;

drop policy if exists "users can read their own group notification settings" on public.group_notification_settings;
create policy "users can read their own group notification settings"
  on public.group_notification_settings for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users can insert their own group notification settings" on public.group_notification_settings;
create policy "users can insert their own group notification settings"
  on public.group_notification_settings for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_group_member(group_id, (select auth.uid()))
  );

drop policy if exists "users can update their own group notification settings" on public.group_notification_settings;
create policy "users can update their own group notification settings"
  on public.group_notification_settings for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_group_member(group_id, (select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    and public.is_group_member(group_id, (select auth.uid()))
  );

drop policy if exists "users can delete their own group notification settings" on public.group_notification_settings;
create policy "users can delete their own group notification settings"
  on public.group_notification_settings for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Realtime replication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_notification_settings'
  ) then
    alter publication supabase_realtime add table public.group_notification_settings;
  end if;
end $$;

-- ── Notifications table update for replies ──────────────────────────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['mention'::text, 'mention_everyone'::text, 'private_comment'::text, 'reply'::text]));

-- Trigger to create notification on reply
create or replace function public.notify_message_replies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig_author_id uuid;
begin
  if new.is_deleted or new.reply_to_message_id is null or new.author_id is null then
    return new;
  end if;

  select author_id into v_orig_author_id
  from public.messages
  where id = new.reply_to_message_id;

  if v_orig_author_id is not null and v_orig_author_id <> new.author_id then
    insert into public.notifications (user_id, actor_id, group_id, message_id, kind)
    values (v_orig_author_id, new.author_id, new.group_id, new.id, 'reply')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_message_replies on public.messages;
create trigger notify_message_replies
  after insert on public.messages
  for each row
  execute function public.notify_message_replies();
