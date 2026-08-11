// The GC reaction vocabulary. These aren't emoji — they're *statements*.
// Label is the point; the emoji is just the handle.
export type ReactionDef = { emoji: string; label: string };

export const reactionCatalog: ReactionDef[] = [
  { emoji: '❤️', label: 'LOVE' },
  { emoji: '👍', label: 'LIKE' },
  { emoji: '👎', label: 'DISLIKE' },
  { emoji: '😂', label: 'LAUGH' },
  { emoji: '🔥', label: 'FIRE' },
  { emoji: '💀', label: 'DEAD' },
  { emoji: '‼️', label: 'EXCLAMATION' },
  { emoji: '⚡️', label: 'HYPE' },
  { emoji: '👀', label: 'SUS' },
  { emoji: '😭', label: 'CRYING' },
  { emoji: '✨', label: 'MAGIC' },
  { emoji: '💯', label: 'HUNDRED' },
];

const byEmoji = new Map(reactionCatalog.map((r) => [r.emoji, r]));

export function labelFor(emoji: string, fallback = ''): string {
  return byEmoji.get(emoji)?.label ?? fallback;
}
