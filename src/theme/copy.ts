// Centralized "GC voice". Nothing in this app should ever say "No messages" or "Loading".
//
// Where there are multiple variants, pick() one — but pick it ONCE per mount
// (useState(() => pick(...))), never inline in render, or it flickers on every
// re-render and reads as a glitch instead of a personality.

export function pick<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

export const copy = {
  emptyChat: [
    'It’s suspiciously quiet in here.',
    'Nothing but crickets and bad intentions.',
    'This is where the lore would go, if anyone spoke.',
  ],
  emptyGroups: [
    'No GCs yet. Kinda giving lonely.',
    'Zero group chats. Zero drama. Suspicious.',
    'It’s just you in here. Start something.',
  ],
  caughtUp: [
    'You’re caught up. Go touch grass. 🌱',
    'Nothing new. Shocking, honestly.',
    'Itna vella hai ki you are caught up.'
  ],
  loading: [
    'Gathering the lore…',
    'Retrieving the receipts…',
    'Loading the drama…',
    'Ruko jara sabar karo.'
  ],
  loadingGroups: [
    'Rounding up your GCs…',
    'Finding your people…',
  ],
  error: [
    'Something went wrong. Blame the Wi-Fi.',
    'That broke. Not our fault (it is).',
  ],
  sendFailed: 'That didn’t send. The Wi-Fi is guilty.',
  composerPlaceholder: [
    'say something unhinged…',
    'start the drama…',
    'drop your hot take…',
    'go on then…',
  ],
  deadChat: 'this GC is dead 🪦',
} as const;

/** "👀 Harsh is cooking…" — never a boring "is typing". */
export function typingText(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `👀 ${names[0]} is cooking…`;
  if (names.length === 2) return `👀 ${names[0]} and ${names[1]} are cooking…`;
  return '🍿 everyone is cooking. brace yourself.';
}

/** Late-night stamp: "It's 2:43 AM. Nobody should be here." */
export function afterHoursText(now: Date): string {
  const hours = now.getHours();
  const mins = now.getMinutes().toString().padStart(2, '0');
  const display = hours === 0 ? 12 : hours;
  return `It’s ${display}:${mins} AM. Nobody should be here.`;
}
