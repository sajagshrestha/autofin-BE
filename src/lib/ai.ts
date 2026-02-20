import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

export type AIProviderName = 'openai' | 'anthropic' | 'google';
const DEFAULT_PROVIDER: AIProviderName = 'google';

/**
 * Get the configured AI provider based on environment variable.
 * Defaults to OpenAI if not specified.
 *
 * Set AI_PROVIDER environment variable to switch:
 * - 'openai' (default) - requires OPENAI_API_KEY
 * - 'anthropic' - requires ANTHROPIC_API_KEY
 * - 'google' - requires GOOGLE_GENERATIVE_AI_API_KEY
 */
export function getAIProvider() {
  const provider = (process.env.AI_PROVIDER || DEFAULT_PROVIDER) as AIProviderName;

  switch (provider) {
    case 'anthropic':
      return createAnthropic();
    case 'google':
      return createGoogleGenerativeAI();
    default:
      return createOpenAI();
  }
}

/**
 * Get the default model ID for the configured provider.
 * These are cost-effective models suitable for structured extraction tasks.
 */
export function getDefaultModelId(): string {
  const provider = (process.env.AI_PROVIDER || DEFAULT_PROVIDER) as AIProviderName;

  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'google':
      return 'gemini-2.5-flash-lite';
    default:
      return 'gpt-4o-mini';
  }
}

/**
 * Get the AI model instance ready for use with generateObject/generateText
 */
export function getAIModel() {
  const provider = getAIProvider();
  const modelId = getDefaultModelId();

  return provider(modelId);
}

/** Model ID for Gemini 2.5 Flash (full model, not lite) - used for insights generation */
const GEMINI_2_5_FLASH_MODEL_ID = 'gemini-2.5-flash';

/**
 * Get the Gemini 2.5 Flash model for insights generation.
 * Uses the full Flash model for better reasoning on financial advice.
 */
export function getInsightsModel() {
  const provider = getAIProvider();
  return provider(GEMINI_2_5_FLASH_MODEL_ID);
}
