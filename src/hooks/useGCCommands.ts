import { useCallback, useState } from 'react';
import { invokeGCAI, type AIError, type GCCommandResult } from '../lib/ai';

/**
 * One @gc exchange, as the chat renders it.
 *
 * Local-only and never written to Supabase. An @gc answer is built from the
 * asker's own RLS-filtered view of the conversation, so persisting it as a
 * group message would publish one member's personalised view to everyone —
 * and the messages table is for what people said to each other, not for a
 * per-viewer AI reply. ChatScreen weaves these into the feed the same way it
 * weaves the daily recap card, rather than duplicating the message system.
 */
export type GCCommandEntry = {
  id: string;
  question: string;
  status: 'loading' | 'done' | 'error';
  createdAt: string;
  /**
   * The message this was asked about, when the user swiped-to-reply first.
   * The id goes to the server to anchor the context; the preview is kept
   * purely so the card can show which message the answer is about.
   */
  replyTo?: { id: string; authorName: string; preview: string };
  result?: GCCommandResult;
  error?: AIError;
};

/**
 * Survives ChatScreen remounts (leaving to Group Info and coming back)
 * without persisting anything: answers stay for the session, disappear on
 * app restart. Keyed by group so two chats never show each other's replies.
 */
const SESSION_ENTRIES = new Map<string, GCCommandEntry[]>();

/** Keeps one GC's thread from growing without bound over a long session. */
const MAX_ENTRIES_PER_GROUP = 30;

export function useGCCommands(groupId: string) {
  const [entries, setEntries] = useState<GCCommandEntry[]>(
    () => SESSION_ENTRIES.get(groupId) ?? []
  );

  const write = useCallback(
    (next: (prev: GCCommandEntry[]) => GCCommandEntry[]) => {
      setEntries((prev) => {
        const value = next(prev).slice(-MAX_ENTRIES_PER_GROUP);
        SESSION_ENTRIES.set(groupId, value);
        return value;
      });
    },
    [groupId]
  );

  /** Runs one question, updating its entry in place from loading → done/error. */
  const run = useCallback(
    async (entryId: string, question: string, replyToMessageId?: string) => {
      const response = await invokeGCAI<GCCommandResult>(groupId, 'gc_command', {
        question,
        replyToMessageId,
      });

      write((prev) =>
        prev.map((e) =>
          e.id !== entryId
            ? e
            : response.ok
              ? { ...e, status: 'done', result: response.result, error: undefined }
              : { ...e, status: 'error', error: response.error, result: undefined }
        )
      );
    },
    [groupId, write]
  );

  const ask = useCallback(
    (question: string, replyTo?: GCCommandEntry['replyTo']) => {
      const id = `gc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      write((prev) => [
        ...prev,
        { id, question, replyTo, status: 'loading', createdAt: new Date().toISOString() },
      ]);
      run(id, question, replyTo?.id);
    },
    [run, write]
  );

  /** Re-runs a failed entry in place, so a retry doesn't stack a duplicate
   *  question in the feed. Re-sends the same anchor, or the retry would
   *  quietly answer a different question than the one that failed. */
  const retry = useCallback(
    (entryId: string) => {
      let target: GCCommandEntry | null = null;
      write((prev) =>
        prev.map((e) => {
          if (e.id !== entryId) return e;
          target = e;
          return { ...e, status: 'loading', error: undefined };
        })
      );
      const entry = target as GCCommandEntry | null;
      if (entry) run(entryId, entry.question, entry.replyTo?.id);
    },
    [run, write]
  );

  return { entries, ask, retry };
}
