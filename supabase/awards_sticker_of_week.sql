-- 🏷️ Sticker of the Week — adds `stickerOfWeek` to compute_weekly_stats().
--
-- The full function is restated here rather than just the delta, because
-- `create or replace function` has no partial form: anything less than the
-- whole body would silently drop every other statistic this feeds. Applied to
-- the database as migration `weekly_stats_sticker_of_week`.
--
-- The award this feeds is the only one whose subject is an object rather than
-- a member, which is why the payload carries image_url: the card renders the
-- sticker where every other award renders the winner's avatar, and names the
-- top sender underneath it.
--
-- Counting is by `messages.sticker_id`, not by media url — sticker_id points
-- at the reusable `stickers` row, so one sticker sent by four people counts as
-- four uses of a single sticker rather than four unrelated attachments. That
-- is the whole point of the award.
--
-- The 3-use floor lives in weeklyAwards.ts (MIN_STICKER_USES), alongside the
-- other per-category floors, rather than here — SQL reports what happened,
-- TypeScript decides whether it's worth an award.

create or replace function public.compute_weekly_stats(
  p_group_id uuid,
  p_week_start timestamp with time zone,
  p_week_end timestamp with time zone
)
returns jsonb
language sql
stable
as $function$
  with week_messages as (
    select *
    from public.messages
    where group_id = p_group_id
      and is_deleted = false
      and created_at >= p_week_start
      and created_at <= p_week_end
  ),
  per_user as (
    select
      author_id as user_id,
      count(*) as message_count,
      count(*) filter (where reply_to_message_id is not null) as reply_count,
      count(*) filter (where media_type is not null) as media_count,
      count(*) filter (where media_type = 'voice') as voice_count,
      -- Night Owl: 11 PM–5 AM IST. IST is a fixed UTC+5:30 offset (India has
      -- no DST), so shifting by the interval is exact and cheap — no zone
      -- table lookup needed for a single fixed offset.
      count(*) filter (
        where extract(hour from (created_at + interval '5:30')) >= 23
           or extract(hour from (created_at + interval '5:30')) < 5
      ) as night_owl_count,
      -- Most Reliable: distinct IST calendar days with at least one message —
      -- showing up most days, not sending the most messages on one day.
      count(distinct date(created_at + interval '5:30')) as active_days,
      -- One-Liner King: short messages, not just message count — a group of
      -- one-word "lol"s is a distinct habit from a group of paragraphs.
      count(*) filter (
        where text is not null and length(trim(text)) between 1 and 15
      ) as short_message_count
    from week_messages
    where author_id is not null
    group by author_id
  ),
  reactions_received as (
    select wm.author_id as user_id, count(*) as reactions_received
    from public.message_reactions mr
    join week_messages wm on wm.id = mr.message_id
    where wm.author_id is not null
    group by wm.author_id
  ),
  reactions_given as (
    select mr.user_id, count(*) as reactions_given
    from public.message_reactions mr
    join week_messages wm on wm.id = mr.message_id
    group by mr.user_id
  ),
  combined as (
    select
      coalesce(pu.user_id, rr.user_id, rg.user_id) as user_id,
      coalesce(pu.message_count, 0) as message_count,
      coalesce(pu.reply_count, 0) as reply_count,
      coalesce(pu.media_count, 0) as media_count,
      coalesce(pu.voice_count, 0) as voice_count,
      coalesce(pu.night_owl_count, 0) as night_owl_count,
      coalesce(pu.active_days, 0) as active_days,
      coalesce(pu.short_message_count, 0) as short_message_count,
      coalesce(rr.reactions_received, 0) as reactions_received,
      coalesce(rg.reactions_given, 0) as reactions_given
    from per_user pu
    full outer join reactions_received rr on rr.user_id = pu.user_id
    full outer join reactions_given rg on rg.user_id = coalesce(pu.user_id, rr.user_id)
  ),
  message_of_week as (
    select wm.id, wm.author_id, wm.text, wm.created_at, count(mr.id) as reaction_count
    from week_messages wm
    join public.message_reactions mr on mr.message_id = wm.id
    group by wm.id, wm.author_id, wm.text, wm.created_at
    order by count(mr.id) desc, wm.created_at desc
    limit 1
  ),
  sticker_of_week as (
    select
      wm.sticker_id,
      s.image_url,
      count(*) as use_count,
      count(distinct wm.author_id) as sender_count,
      -- Ordered-set aggregate: the single most frequent sender, for the name
      -- line under the sticker.
      mode() within group (order by wm.author_id) as top_sender_id
    from week_messages wm
    join public.stickers s on s.id = wm.sticker_id
    where wm.sticker_id is not null
    group by wm.sticker_id, s.image_url
    order by count(*) desc, max(wm.created_at) desc
    limit 1
  ),
  reply_deltas as (
    select
      wm.author_id as user_id,
      extract(epoch from (wm.created_at - parent.created_at)) as delta_seconds
    from week_messages wm
    join public.messages parent on parent.id = wm.reply_to_message_id
    where wm.reply_to_message_id is not null
      and wm.author_id is not null
      and wm.author_id <> parent.author_id
      and wm.created_at > parent.created_at
      and extract(epoch from (wm.created_at - parent.created_at)) <= 1800
  ),
  fastest as (
    select user_id, avg(delta_seconds) as avg_seconds, count(*) as sample_size
    from reply_deltas
    group by user_id
    having count(*) >= 3
    order by avg(delta_seconds) asc
    limit 1
  )
  select jsonb_build_object(
    'perUser', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'userId', user_id,
        'messageCount', message_count,
        'replyCount', reply_count,
        'mediaCount', media_count,
        'voiceCount', voice_count,
        'nightOwlCount', night_owl_count,
        'activeDays', active_days,
        'shortMessageCount', short_message_count,
        'reactionsReceived', reactions_received,
        'reactionsGiven', reactions_given
      )) from combined),
      '[]'::jsonb
    ),
    'messageOfWeek', (
      select jsonb_build_object(
        'messageId', id, 'authorId', author_id, 'text', text, 'reactionCount', reaction_count
      ) from message_of_week
    ),
    'stickerOfWeek', (
      select jsonb_build_object(
        'stickerId', sticker_id,
        'imageUrl', image_url,
        'useCount', use_count,
        'senderCount', sender_count,
        'topSenderId', top_sender_id
      ) from sticker_of_week
    ),
    'fastestReplier', (
      select jsonb_build_object(
        'userId', user_id, 'avgReplySeconds', round(avg_seconds), 'sampleSize', sample_size
      ) from fastest
    ),
    'totalMessages', (select count(*) from week_messages)
  );
$function$;
