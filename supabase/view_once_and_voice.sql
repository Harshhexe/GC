-- GC — view-once media and voice notes.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- ── voice notes ────────────────────────────────────────────────────────
-- A fifth media kind rather than a separate table: a voice note is an
-- attachment like any other (url, mime, size, duration), so everything that
-- already handles media — upload, reply previews, the media grid, deletion —
-- keeps working without a parallel code path. MessageKind in src/types
-- already had 'voice' reserved for exactly this.
alter table public.messages drop constraint if exists messages_media_type_check;
alter table public.messages
  add constraint messages_media_type_check
  check (media_type in ('image', 'video', 'gif', 'file', 'voice'));

-- ── view-once media ────────────────────────────────────────────────────
alter table public.messages
  add column if not exists media_view_once boolean not null default false;

-- Who has already burned their one look. Per (message, viewer), because in a
-- group each member gets their own single view — a boolean on the message
-- would let the first opener consume it for everybody.
create table if not exists public.media_views (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists media_views_user_idx on public.media_views (user_id);

alter table public.media_views enable row level security;

-- Everyone in the group can see who has opened it (that's what powers the
-- sender's "Opened" state), but you can only ever record your own view.
drop policy if exists "members see views in their groups" on public.media_views;
create policy "members see views in their groups"
  on public.media_views for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_group_member(m.group_id, auth.uid())
    )
  );

drop policy if exists "users record their own views" on public.media_views;
create policy "users record their own views"
  on public.media_views for insert
  to authenticated
  with check (user_id = auth.uid());

-- Deliberately no UPDATE or DELETE policy: a view, once burned, is not
-- something the client gets to take back.
--
-- Note this is a UI-level guarantee, not a cryptographic one. The media URL
-- itself stays readable (the bucket is public, same as every other
-- attachment), so a determined member could keep the link. View-once here
-- means "the app will not show it to you twice", in the same spirit as every
-- other messenger's version of the feature — none of which can stop a second
-- device pointed at the screen either.

alter publication supabase_realtime add table public.media_views;
