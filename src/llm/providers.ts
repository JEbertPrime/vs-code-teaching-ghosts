import { buildDirectionPrompt } from './prompt';
import { parseDirectionResponseParts } from './response';
import {
  ChatMessage,
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

interface ChatCompletionRequestBody {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_completion_tokens: number;
  response_format?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      strict: boolean;
      schema: {
        type: 'object';
        additionalProperties: false;
        properties: {
          suggestion: {
            type: 'string';
            description: string;
          };
        };
        required: ['suggestion'];
      };
    };
  };
}

const directionResponseFormat: ChatCompletionRequestBody['response_format'] = {
  type: 'json_schema',
  json_schema: {
    name: 'teaching_ghosts_direction',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        suggestion: {
          type: 'string',
          description: 'A concise teaching hint for the programmer. It must not include implementation code.'
        }
      },
      required: ['suggestion']
    }
  }
};

export class OpenAiCompatibleDirectionProvider implements DirectionProvider {
  readonly id = 'openai-compatible' as const;

  constructor(
    private readonly config: OpenAiCompatibleConfig,
    private readonly fetcher: Fetcher = fetch
  ) {}

  async getDirection(request: DirectionRequest, signal: AbortSignal): Promise<DirectionResult | undefined> {
    const useStructuredOutputs = shouldUseStructuredOutputs(this.config);
    const response = await this.fetchDirection(request, signal, useStructuredOutputs);

    if (!response.ok) {
      const body = await response.text();
      if (
        useStructuredOutputs &&
        this.config.structuredOutputMode === 'auto' &&
        isStructuredOutputsUnsupported(response.status, body)
      ) {
        return this.readDirectionResponse(await this.fetchDirection(request, signal, false), request);
      }

      throw new Error(`LLM request failed with ${response.status}: ${body.slice(0, 300)}`);
    }

    return this.readDirectionResponse(response, request);
  }

  private async fetchDirection(
    request: DirectionRequest,
    signal: AbortSignal,
    useStructuredOutputs: boolean
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const body: ChatCompletionRequestBody = {
      model: this.config.model,
      messages: buildDirectionPrompt(request, {
        includeJsonFormatInstruction: !useStructuredOutputs
      }),
      temperature: 0.2,
      max_completion_tokens: this.config.responseTokenLimit
    };

    if (useStructuredOutputs) {
      body.response_format = directionResponseFormat;
    }

    return this.fetcher(toChatCompletionsUrl(this.config.baseUrl), {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify(body)
    });
  }

  private async readDirectionResponse(
    response: Response,
    request: DirectionRequest
  ): Promise<DirectionResult | undefined> {
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

export function shouldUseStructuredOutputs(config: OpenAiCompatibleConfig): boolean {
  switch (config.structuredOutputMode) {
    case 'enabled':
      return true;
    case 'disabled':
      return false;
    case 'auto':
    default:
      return supportsStructuredOutputs(config.model);
  }
}

export function supportsStructuredOutputs(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return [
    /^gpt-5(?:[.-]|$)/,
    /^gpt-4\.1(?:[.-]|$)/,
    /^gpt-4o(?:[.-]|$)/,
    /^chatgpt-4o(?:[.-]|$)/,
    /^o\d+(?:[.-]|$)/
  ].some(pattern => pattern.test(normalized));
}

function isStructuredOutputsUnsupported(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) {
    return false;
  }

  return /response_format|json_schema|structured output/i.test(body) &&
    /unsupported|not supported|unknown|invalid|unrecognized/i.test(body);
}

export function toChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }

  return `${trimmed}/chat/completions`;
}
