import * as assert from 'assert';
import { buildDirectionPrompt } from '../llm/prompt';
import { parseDirectionResponse, parseDirectionResponseParts } from '../llm/response';
import { OpenAiCompatibleDirectionProvider, toChatCompletionsUrl } from '../llm/providers';
import { DirectionRequest } from '../llm/types';
import { TestCase } from './testCase';

const baseRequest: DirectionRequest = {
  languageId: 'typescript',
  fileName: 'example.ts',
  relativeFilePath: 'src/example.ts',
  lineNumber: 4,
  lineText: 'if (user.isAdmin) {',
  prefixText: 'if (user.isAdmin) {',
  documentText: 'const user = getUser();\nif (user.isAdmin) {',
  contextBefore: 'const user = getUser();',
  contextAfter: 'return user.name;',
  diagnostics: [
    {
      severity: 'warning',
      message: 'Condition may be too broad',
      lineNumber: 4
    }
  ],
  maxSuggestionLength: 260
};

export const llmTests: TestCase[] = [
  {
    name: 'builds a direction-only prompt',
    run: () => {
      const messages = buildDirectionPrompt(baseRequest);
      assert.strictEqual(messages.length, 2);
      assert.match(messages[0].content, /without writing code/);
      assert.match(messages[0].content, /Respond with JSON only/);
      assert.doesNotMatch(messages[0].content, /questions/);
      assert.doesNotMatch(messages[0].content, /guidance lines/);
      assert.match(messages[0].content, /Do not manually wrap text/);
      assert.doesNotMatch(messages[1].content, /must start with "Next:"/);
      assert.match(messages[1].content, /File: src\/example\.ts/);
      assert.match(messages[1].content, /Diagnostics near cursor/);
    }
  },
  {
    name: 'parses JSON direction responses',
    run: () => {
      const suggestion = parseDirectionResponse('{"suggestion":"Check the empty list case first."}', 260);
      assert.strictEqual(suggestion, 'Check the empty list case first.');
    }
  },
  {
    name: 'does not add a fixed prefix to plain direction responses',
    run: () => {
      const suggestion = parseDirectionResponse('Name the behavior before choosing the abstraction.', 260);
      assert.strictEqual(suggestion, 'Name the behavior before choosing the abstraction.');
    }
  },
  {
    name: 'preserves multiline direction responses',
    run: () => {
      const suggestion = parseDirectionResponse(
        '{"suggestion":"Check the empty list case first.\\nThen decide what the caller should see."}',
        260
      );
      assert.strictEqual(
        suggestion,
        'Check the empty list case first.\nThen decide what the caller should see.'
      );
    }
  },
  {
    name: 'does not wrap sanitized LLM responses locally',
    run: () => {
      const suggestion = parseDirectionResponse(
        '{"suggestion":"Use the failing test name to pin down the behavior before touching the implementation path."}',
        260
      );

      assert.strictEqual(
        suggestion,
        'Use the failing test name to pin down the behavior before touching the implementation path.'
      );
    }
  },
  {
    name: 'splits long LLM responses into continuation chunks without ellipses',
    run: () => {
      const parsed = parseDirectionResponseParts(
        '{"suggestion":"Start with the smallest observable behavior before widening the branch. Then use the failing test name to decide whether this belongs in the parser, validator, or caller boundary."}',
        82
      );

      assert.ok(parsed);
      assert.doesNotMatch(parsed.suggestion, /\.\.\.$/);
      assert.ok(parsed.continuation.length > 0);
      assert.ok(parsed.continuation.every(chunk => !chunk.endsWith('...')));
      assert.match(parsed.continuation.join(' '), /parser, validator, or caller boundary/);
    }
  },
  {
    name: 'strips legacy Next prefixes when a model still returns them',
    run: () => {
      const suggestion = parseDirectionResponse('{"suggestion":"Next: name the behavior before editing."}', 260);
      assert.strictEqual(suggestion, 'name the behavior before editing.');
    }
  },
  {
    name: 'rejects implementation-looking responses',
    run: () => {
      const suggestion = parseDirectionResponse('{"suggestion":"const total = items.reduce((sum, item) => sum + item.price, 0);"}', 260);
      assert.strictEqual(suggestion, undefined);
    }
  },
  {
    name: 'normalizes OpenAI-compatible chat completions URLs',
    run: () => {
      assert.strictEqual(toChatCompletionsUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
      assert.strictEqual(
        toChatCompletionsUrl('https://api.example.com/v1/chat/completions'),
        'https://api.example.com/v1/chat/completions'
      );
    }
  },
  {
    name: 'uses fake fetch for OpenAI-compatible provider tests',
    run: async () => {
      let capturedUrl = '';
      let capturedBody = '';
      const provider = new OpenAiCompatibleDirectionProvider(
        {
          apiKey: 'test-key',
          baseUrl: 'https://api.example.com/v1',
          model: 'test-model',
          responseTokenLimit: 256
        },
        async (url, init) => {
          capturedUrl = url;
          capturedBody = String(init.body);
          return {
            ok: true,
            status: 200,
            text: async () => '',
            json: async () => ({
              choices: [
                {
                  message: {
                    content: '{"suggestion":"Write the failure case before changing the branch.\\nThen make the smallest branch change."}'
                  }
                }
              ]
            })
          } as Response;
        }
      );

      const result = await provider.getDirection(baseRequest, new AbortController().signal);
      assert.strictEqual(capturedUrl, 'https://api.example.com/v1/chat/completions');
      assert.match(capturedBody, /"model":"test-model"/);
      assert.match(capturedBody, /"max_tokens":256/);
      assert.strictEqual(
        result?.suggestion,
        'Write the failure case before changing the branch.\nThen make the smallest branch change.'
      );
    }
  },
  {
    name: 'omits authorization header when no API key is configured',
    run: async () => {
      let capturedHeaders: unknown;
      const provider = new OpenAiCompatibleDirectionProvider(
        {
          baseUrl: 'http://localhost:11434/v1',
          model: 'local-model',
          responseTokenLimit: 256
        },
        async (_url, init) => {
          capturedHeaders = init.headers;
          return {
            ok: true,
            status: 200,
            text: async () => '',
            json: async () => ({
              choices: [
                {
                  message: {
                    content: '{"suggestion":"Check the boundary the local model identified."}'
                  }
                }
              ]
            })
          } as Response;
        }
      );

      const result = await provider.getDirection(baseRequest, new AbortController().signal);
      assert.ok(result);
      assert.deepStrictEqual(capturedHeaders, {
        'Content-Type': 'application/json'
      });
    }
  },
  {
    name: 'provider returns continuation chunks for oversized responses',
    run: async () => {
      const request: DirectionRequest = {
        ...baseRequest,
        maxSuggestionLength: 82
      };
      const provider = new OpenAiCompatibleDirectionProvider(
        {
          apiKey: 'test-key',
          baseUrl: 'https://api.example.com/v1',
          model: 'test-model',
          responseTokenLimit: 256
        },
        async () =>
          ({
            ok: true,
            status: 200,
            text: async () => '',
            json: async () => ({
              choices: [
                {
                  message: {
                    content:
                      '{"suggestion":"Start with the smallest observable behavior before widening the branch. Then use the failing test name to decide whether this belongs in the parser, validator, or caller boundary."}'
                  }
                }
              ]
            })
          }) as Response
      );

      const result = await provider.getDirection(request, new AbortController().signal);
      assert.ok(result);
      assert.ok(result.continuation);
      assert.ok(result.continuation.length > 0);
      assert.doesNotMatch(result.suggestion, /\.\.\.$/);
    }
  }
];
