import { config } from '../config.ts';
import { GCAIError } from '../errors.ts';
import { AnthropicProvider } from './anthropic.ts';
import { GeminiProvider } from './gemini.ts';
import type { AIProvider } from './types.ts';

let cached: AIProvider | null = null;

/**
 * Resolves the configured provider, once per warm instance.
 *
 * Adding a vendor means adding a case here and an implementation beside
 * anthropic.ts — no operation, prompt, or context-building code changes.
 */
export function getProvider(): AIProvider {
  if (cached) return cached;

  switch (config.provider) {
    case 'gemini':
      cached = new GeminiProvider();
      return cached;
    case 'anthropic':
      cached = new AnthropicProvider();
      return cached;
    default:
      throw new GCAIError('internal', `Unknown AI provider: ${config.provider}`);
  }
}

export type { AICompletionRequest, AICompletionResult, AIProvider } from './types.ts';
