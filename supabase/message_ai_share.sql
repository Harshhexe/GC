-- An @gc exchange a member chose to share into the group.
--
-- Kept as a column on messages rather than a separate table or a fake bot
-- account: the shared thing IS a real message — it has a sender (whoever
-- shared it), it can be replied to, reacted to, pinned, and deleted, and all
-- of that already works. Only the rendering differs, so only the payload
-- needed somewhere to live.
--
-- Shape: { question, answer, sourceMessageIds[] }. Null on every ordinary
-- message, so existing rows and every existing query are unaffected.
--
-- Applied as migration `message_ai_share`.

alter table public.messages
  add column if not exists ai_share jsonb;

comment on column public.messages.ai_share is
  'Set only on messages that share a GC AI answer into the chat: '
  '{ question, answer, sourceMessageIds }. The row''s text column still holds '
  'a readable plain-text fallback so previews, search and notifications need '
  'no special-casing.';
