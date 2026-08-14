import type { GCContext } from '../context/buildGCContext.ts';
import type { AIOperation, SourcedInsight } from './types.ts';

export type TestSummaryResult = {
  summary: string;
  highlights: SourcedInsight[];
};

/**
 * The proving operation for the foundation.
 *
 * Exists to exercise the whole path end to end — auth, membership, context
 * building, provider call, structured output, citation validation, caching,
 * usage logging — with the smallest possible feature surface. Real features
 * (What Did I Miss, Tea, Lore) are separate operations added beside this one;
 * this stays as the thing to hit when something breaks.
 */
export const testSummaryOperation: AIOperation<TestSummaryResult> = {
  name: 'test_summary',

  context: {
    maxMessages: 120,
    defaultLookbackHours: 24,
  },

  buildSystemPrompt() {
    return [
      'You summarize group chat conversations for GC, a group-chat app.',
      '',
      'Every line in the transcript is formatted as:',
      '[time] Sender (id:MESSAGE_ID): text',
      '',
      'Rules:',
      '- Cite the message ids that support each highlight, exactly as given.',
      '- Never invent a message id. Only use ids present in the transcript.',
      '- Quote nothing verbatim that looks private; summarize instead.',
      '- If the conversation is small talk with no substance, say so plainly',
      '  rather than inventing significance.',
      '- Match the group’s register: casual and dry, never corporate.',
      '- NO MINIMUM MESSAGE REQUIREMENT: Always summarize the conversation even if it only has 1 or 2 messages.',
    ].join('\n');
  },

  buildPrompt(ctx: GCContext) {
    return [
      `Participants: ${ctx.participants.join(', ')}`,
      `Messages: ${ctx.messages.length}`,
      '',
      'Transcript:',
      ctx.transcript,
      '',
      'Write a two-sentence summary of what this conversation was about, plus',
      'up to three highlights. Each highlight cites the message ids it came from.',
    ].join('\n');
  },

  schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Two sentences on what the conversation was about.',
      },
      highlights: {
        type: 'array',
        description: 'Up to three notable moments, each citing its sources.',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            sourceMessageIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Message ids from the transcript that support this.',
            },
          },
          required: ['text', 'sourceMessageIds'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'highlights'],
    additionalProperties: false,
  },

  validate(raw, ctx) {
    const value = raw as Partial<TestSummaryResult>;
    if (typeof value?.summary !== 'string') {
      throw new Error('summary missing from model output');
    }

    // Citations are dropped unless they name a message that was actually in
    // this context. A hallucinated id would become a tap target that jumps
    // nowhere, so it's filtered here rather than handled in every UI later.
    const known = new Set(ctx.messages.map((m) => m.id));
    const highlights = (value.highlights ?? [])
      .filter((h) => typeof h?.text === 'string')
      .map((h) => ({
        text: h.text,
        sourceMessageIds: (h.sourceMessageIds ?? []).filter((id) => known.has(id)),
      }));

    return { summary: value.summary, highlights };
  },
};
