-- GC — custom stickers.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- A sticker is a user-owned asset (photo + baked-in text, rendered once by
-- the render-sticker edge function into a flat PNG) that lives independently
-- of any one message — the same sticker can be sent into many chats, and
-- anyone who has seen it in a group can favorite it into their own tray.
-- Sending it is just another media message; `messages.sticker_id` is the
-- pointer that makes the specific sticker identifiable for favoriting.

-- ── stickers ────────────────────────────────────────────────────────────
create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete cascade,
  image_url text not null,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists stickers_created_by_idx on public.stickers (created_by, created_at desc);

alter table public.stickers enable row level security;

-- Visible to its creator, to anyone who has favorited it (so a fav survives
-- even if you later leave every group it was sent in), and to anyone who
-- shares a group with a message that sent it — the same "you had to have
-- actually seen this" rule the rest of the app uses for cross-member data.
drop policy if exists "stickers visible to creator, favoriters, and recipients" on public.stickers;
create policy "stickers visible to creator, favoriters, and recipients"
  on public.stickers for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.sticker_favorites f
      where f.sticker_id = stickers.id and f.user_id = auth.uid()
    )
    or exists (
      select 1 from public.messages m
      where m.sticker_id = stickers.id and public.is_group_member(m.group_id, auth.uid())
    )
  );

-- Inserts happen exclusively through the render-sticker edge function
-- (service role, after verifying the caller's session) — never directly from
-- the client — but the policy is kept as defense in depth rather than left
-- to RLS being off.
drop policy if exists "users create their own stickers" on public.stickers;
create policy "users create their own stickers"
  on public.stickers for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "creators delete their own stickers" on public.stickers;
create policy "creators delete their own stickers"
  on public.stickers for delete
  to authenticated
  using (created_by = auth.uid());

-- ── sticker favorites ───────────────────────────────────────────────────
-- Deliberately not owner-scoped: any member who has legitimately seen a
-- sticker (via the visibility rule above) can favorite it into their own
-- personal tray, whether or not they created it.
create table if not exists public.sticker_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sticker_id uuid not null references public.stickers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, sticker_id)
);

create index if not exists sticker_favorites_user_idx
  on public.sticker_favorites (user_id, created_at desc);

alter table public.sticker_favorites enable row level security;

drop policy if exists "users manage their own sticker favorites" on public.sticker_favorites;
create policy "users see their own sticker favorites"
  on public.sticker_favorites for select
  to authenticated
  using (user_id = auth.uid());

create policy "users add their own sticker favorites"
  on public.sticker_favorites for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users remove their own sticker favorites"
  on public.sticker_favorites for delete
  to authenticated
  using (user_id = auth.uid());

-- ── messages: sending a sticker ────────────────────────────────────────
-- A sticker message reuses the whole media pipeline (media_url/media_type
-- etc, media_type = 'sticker') plus this pointer back to the sticker row,
-- which is what a long-press "Favorite" action and other members' fav
-- actions key off of. Set null (not cascaded) on sticker deletion — the
-- message itself, and its already-sent image, stays put.
alter table public.messages
  add column if not exists sticker_id uuid references public.stickers (id) on delete set null;

alter table public.messages drop constraint if exists messages_media_type_check;
alter table public.messages
  add constraint messages_media_type_check
  check (media_type in ('image', 'video', 'gif', 'file', 'voice', 'sticker'));

-- ── storage bucket ──────────────────────────────────────────────────────
-- Public read like every other media bucket. Writes are service-role only
-- (the edge function), scoped to `<user_id>/<filename>` by convention —
-- there's no client-side insert policy because the client never uploads
-- here directly.
insert into storage.buckets (id, name, public)
values ('stickers', 'stickers', true)
on conflict (id) do nothing;

drop policy if exists "stickers are publicly readable" on storage.objects;
create policy "stickers are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'stickers');
