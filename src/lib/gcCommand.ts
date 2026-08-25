import type { Ionicons } from '@expo/vector-icons';

export const GC_TOKEN = 'gc';
const GC_TOKEN_RE = new RegExp(`(^|\\s)@${GC_TOKEN}(?=[\\s.,!?:;]|$)`, 'i');

/** What kind of intent was parsed out of the draft. */
export type GCCommand = {
  /** The question to send to the edge function, with the @gc token stripped. */
  question: string;
};

/**
 * Does this draft start with (or prominently feature) the `@gc` token?
 *
 * Case-insensitive, requires word boundaries so "@gclover" doesn't match, and
 * preserves whatever other text the user typed so it can be sent as the
 * question.
 */
export function parseGCCommand(text: string): GCCommand | null {
  if (!GC_TOKEN_RE.test(text)) return null;

  const question = text
    // Keep the leading whitespace group's spacing intact so words either side
    // of the token don't get glued together.
    .replace(GC_TOKEN_RE, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return { question };
}

export type SlashCommandFeature =
  | 'wordy'
  | 'poll'
  | 'missed'
  | 'dna'
  | 'tea'
  | 'awards'
  | 'pinned'
  | 'media'
  | 'clear'
  | 'anonymous';

export type SlashCommand = {
  feature: SlashCommandFeature;
  command: string;
};

export type SlashCommandDef = {
  command: string;
  aliases: string[];
  feature: SlashCommandFeature;
  title: string;
  subtitle: string;
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  color: string;
};

export const SLASH_COMMAND_DEFS: SlashCommandDef[] = [
  {
    command: '/anon',
    aliases: ['/anonymous'],
    feature: 'anonymous',
    title: 'Send Anonymously',
    subtitle: 'Type your message after the command — nobody sees who sent it',
    emoji: '🎭',
    color: '#94A3B8',
  },
  {
    command: '/poll',
    aliases: ['/p'],
    feature: 'poll',
    title: 'Create Poll',
    subtitle: 'Create a group poll with custom options',
    icon: 'stats-chart',
    color: '#06B6D4',
  },
  {
    command: '/wordy',
    aliases: ['/w', '/word', '/wordle'],
    feature: 'wordy',
    title: 'Wordy',
    subtitle: "Play today's daily 5-letter word puzzle",
    emoji: '🟩',
    color: '#10B981',
  },
  {
    command: '/missed',
    aliases: ['/recap', '/catchup'],
    feature: 'missed',
    title: 'What Did I Miss',
    subtitle: 'AI recap of the chat while you were AFK',
    icon: 'sparkles',
    color: '#A855F7',
  },
  {
    command: '/dna',
    aliases: [],
    feature: 'dna',
    title: 'GC DNA',
    subtitle: "View your group's personality archetype",
    emoji: '🧬',
    color: '#6366F1',
  },
  {
    command: '/tea',
    aliases: [],
    feature: 'tea',
    title: 'Start Tea',
    subtitle: 'Record spicy drama in real-time',
    emoji: '🍵',
    color: '#14B8A6',
  },
  {
    command: '/awards',
    aliases: ['/trophies'],
    feature: 'awards',
    title: 'GC Awards',
    subtitle: 'View claimed awards and weekly superlatives',
    emoji: '🏆',
    color: '#F59E0B',
  },
  {
    command: '/pinned',
    aliases: ['/pins'],
    feature: 'pinned',
    title: 'Pinned Messages',
    subtitle: 'Browse all pinned messages in this chat',
    icon: 'pin',
    color: '#EC4899',
  },
  {
    command: '/media',
    aliases: ['/files', '/links'],
    feature: 'media',
    title: 'Media & Files',
    subtitle: 'Browse photos, videos, links & documents',
    icon: 'images',
    color: '#3B82F6',
  },
  {
    command: '/clear',
    aliases: [],
    feature: 'clear',
    title: 'Clear Chat',
    subtitle: 'Clear all message bubbles for you only',
    icon: 'trash-outline',
    color: '#EF4444',
  },
];

const SLASH_COMMANDS_MAP = new Map<string, SlashCommand>();
for (const def of SLASH_COMMAND_DEFS) {
  SLASH_COMMANDS_MAP.set(def.command.toLowerCase(), { feature: def.feature, command: def.command });
  for (const alias of def.aliases) {
    SLASH_COMMANDS_MAP.set(alias.toLowerCase(), { feature: def.feature, command: def.command });
  }
}

/** Check if draft is an exact slash command */
export function parseSlashCommand(text: string): SlashCommand | null {
  const trimmed = text.trim().toLowerCase();
  return SLASH_COMMANDS_MAP.get(trimmed) ?? null;
}

/**
 * Splits "/anon <message>" into the command and its text.
 *
 * Every other slash command is a navigation with nothing after it, so
 * parseSlashCommand only matches an exact whole-string command. This one
 * carries the message itself, which means matching a prefix instead — and
 * matching it here rather than in the composer so the command spellings stay
 * in one place.
 *
 * Returns null for a bare "/anon" with no text: that should open the hint,
 * not send an empty message.
 */
export function parseAnonymousCommand(text: string): { body: string } | null {
  const match = text.trim().match(/^\/(anon|anonymous)\s+([\s\S]+)$/i);
  if (!match) return null;
  const body = match[2].trim();
  return body ? { body } : null;
}

/** True for a bare "/anon" with nothing after it. */
export function isBareAnonymousCommand(text: string): boolean {
  return /^\/(anon|anonymous)\s*$/i.test(text.trim());
}

export type ActiveSlashQuery = { query: string };

/**
 * Finds the slash command query under the cursor if draft starts with `/`
 */
export function findActiveSlashQuery(text: string, cursor: number): ActiveSlashQuery | null {
  if (cursor < 0 || cursor > text.length) return null;
  const trimmedLeft = text.slice(0, cursor);
  if (!trimmedLeft.startsWith('/')) return null;
  // If user has already typed spaces and parameters (e.g. "/wordle hello"), don't popup
  if (/\s/.test(trimmedLeft)) return null;
  return { query: trimmedLeft.slice(1) };
}

/** Filter slash commands matching query */
export function filterSlashCommands(query: string): SlashCommandDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMAND_DEFS;
  return SLASH_COMMAND_DEFS.filter(
    (def) =>
      def.command.slice(1).startsWith(q) ||
      def.aliases.some((a) => a.slice(1).startsWith(q)) ||
      def.title.toLowerCase().includes(q)
  );
}

/**
 * Is this @gc message just asking to open Wordy?
 */
const WORDY_INTENT_RE =
  /^(?:(?:can (?:we|i)|let'?s|i want to|wanna)\s+)?(?:play|open|start|launch|show(?: me)?|gimme|give me)?\s*(?:the\s+|today'?s\s+|daily\s+)?(?:wordy|wordle|word)(?:\s+(?:please|pls|na|yaar|bhai))?[!.?]*$/i;

export function matchesWordyIntent(question: string): boolean {
  return WORDY_INTENT_RE.test(question.trim());
}

/** Backward compatibility alias */
export const matchesWordleIntent = matchesWordyIntent;

/** Does what the user has typed after "@" look like they're reaching for GC? */
export function matchesGCQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length > 0 ? GC_TOKEN.startsWith(q) : true;
}

/**
 * Is this @gc message asking for a poll?
 *
 * Looser than the Wordle matcher on purpose: "make a poll for dinner" carries
 * its own subject, so the whole message is the request and there is no risk of
 * swallowing an unrelated question. It still has to *ask* for a poll, though —
 * "what did the poll say" is a question about an existing one and belongs to
 * the AI.
 */
const POLL_INTENT_RE =
  /^(?:(?:can (?:you|we)|could you|please|pls)\s+)?(?:make|create|start|set ?up|do|run|add)\s+(?:a|an|the)?\s*poll\b/i;

export function matchesPollIntent(question: string): boolean {
  return POLL_INTENT_RE.test(question.trim());
}
