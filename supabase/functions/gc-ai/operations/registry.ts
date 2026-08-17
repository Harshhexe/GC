import { GCAIError } from '../errors.ts';
import { testSummaryOperation } from './testSummary.ts';
import { whatDidIMissOperation } from './whatDidIMiss.ts';
import { dailyRecapOperation } from './dailyRecap.ts';
import { gcCommandOperation } from './gcCommand.ts';
import { teaReportOperation } from './teaReport.ts';
import { weeklyAwardsOperation } from './weeklyAwards.ts';
import { groupDNAOperation } from './groupDNA.ts';
import { pollDraftOperation } from './pollDraft.ts';
import type { AIOperation } from './types.ts';

/**
 * The operation table.
 *
 * Adding a feature is: write the operation file, add one line here. Nothing
 * else in the function changes — the runner already handles auth, membership,
 * context, caching, rate limiting, and usage logging for whatever is in this
 * map, which is what stops each new feature from re-implementing (or
 * forgetting) a security check.
 *
 * Planned, not yet built:
 *   explain_lore · find_receipt · member_personality
 */
const OPERATIONS = new Map<string, AIOperation<unknown>>([
  [testSummaryOperation.name, testSummaryOperation as AIOperation<unknown>],
  [whatDidIMissOperation.name, whatDidIMissOperation as AIOperation<unknown>],
  [dailyRecapOperation.name, dailyRecapOperation as AIOperation<unknown>],
  [gcCommandOperation.name, gcCommandOperation as AIOperation<unknown>],
  [teaReportOperation.name, teaReportOperation as AIOperation<unknown>],
  [weeklyAwardsOperation.name, weeklyAwardsOperation as AIOperation<unknown>],
  [groupDNAOperation.name, groupDNAOperation as AIOperation<unknown>],
  [pollDraftOperation.name, pollDraftOperation as AIOperation<unknown>],
]);

export function getOperation(name: unknown): AIOperation<unknown> {
  if (typeof name !== 'string' || !name) {
    throw new GCAIError('invalid_request', 'operation is required');
  }
  const operation = OPERATIONS.get(name);
  if (!operation) {
    throw new GCAIError('unknown_operation', `No such operation: ${name}`);
  }
  return operation;
}

export function listOperations(): string[] {
  return Array.from(OPERATIONS.keys());
}
