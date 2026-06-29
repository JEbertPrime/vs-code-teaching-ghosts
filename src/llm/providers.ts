import { buildTeachingAdvice } from '../direction';
import { buildDirectionPrompt } from './prompt';
import { parseDirectionResponseParts } from './response';
import {
  DirectionProvider,
  DirectionRequest,
  DirectionResult,
  OpenAiCompatibleConfig
} from './types';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export class HeuristicDirectionProvider implements DirectionProvider {
  readonly id = 'heuristic' as const;

  async getDirection(request: DirectionRequest): Promise<DirectionResult> {
    return {
      suggestion: buildTeachingAdvice(
        {
          languageId: request.languageId,
          fileName: request.fileName,
          lineText: request.lineText,
          prefixText: request.prefixText,
          documentText: request.documentText,
          lineNumber: request.lineNumber
        },
        request.maxSuggestionLength
      ),
      source: this.id
    };
  }
}

export class OpenAiCompatibleDirectionProvider implements DirectionProvider {
  readonly id = 'openai-compatible' as const;

  constructor(
    private readonly config: OpenAiCompatibleConfig,
    private readonly fetcher: Fetcher = fetch
  ) {}

  async getDirection(request: DirectionRequest, signal: AbortSignal): Promise<DirectionResult | undefined> {
    const response = await this.fetcher(toChatCompletionsUrl(this.config.baseUrl), {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: buildDirectionPrompt(request),
        temperature: 0.2,
        max_tokens: this.config.responseTokenLimit
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM request failed with ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return undefined;
    }

    const parsed = parseDirectionResponseParts(content, request.maxSuggestionLength);
    return parsed ? { ...parsed, source: this.id } : undefined;
  }
}

export function toChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }

  return `${trimmed}/chat/completions`;
}
