import { ChatMessage, DirectionRequest } from './types';

interface DirectionPromptOptions {
  includeJsonFormatInstruction?: boolean;
}

export function buildDirectionPrompt(request: DirectionRequest, options: DirectionPromptOptions = {}): ChatMessage[] {
  const includeJsonFormatInstruction = options.includeJsonFormatInstruction ?? true;
  const systemInstructions = [
    'You are Teaching Ghosts, a VS Code assistant that coaches programmers without writing code for them.',
    'Return a concise guidance response for the user.',
    'Do not provide implementation code, code blocks, identifiers to paste, or a numbered list.',
    getHintDetailInstruction(request),
    'Prefer constraints, tests to write, edge cases to check, or the next design decision.',
    'Do not manually wrap text; use newlines only when separating distinct ideas.',
    'Do not use a fixed prefix.'
  ];

  if (includeJsonFormatInstruction) {
    systemInstructions.push('Respond with JSON only: {"suggestion":"guidance text"}');
  }

  return [
    {
      role: 'system',
      content: systemInstructions.join(' ')
    },
    {
      role: 'user',
      content: [
        `Language: ${request.languageId}`,
        `File: ${request.relativeFilePath || request.fileName}`,
        `Cursor line: ${request.lineNumber + 1}`,
        `Current line prefix: ${sanitizeForPrompt(request.prefixText) || '(blank)'}`,
        '',
        'Code before cursor:',
        sanitizeForPrompt(request.contextBefore) || '(none)',
        '',
        'Current line:',
        sanitizeForPrompt(request.lineText) || '(blank)',
        '',
        'Code after cursor:',
        sanitizeForPrompt(request.contextAfter) || '(none)',
        '',
        'Diagnostics near cursor:',
        formatDiagnostics(request),
      ].join('\n')
    }
  ];
}

function getHintDetailInstruction(request: DirectionRequest): string {
  switch (request.hintDetail) {
    case 'detailed':
      return 'Use detailed guidance and include pseudocode only when it helps clarify the next move; keep it non-pasteable and instructional.';
    case 'vague':
      return 'Use a vague hint that points in the right direction without naming exact steps, APIs, or implementation details.';
    case 'general':
    default:
      return 'Use general direction without being too specific; avoid pseudocode and avoid naming exact implementation steps.';
  }
}

function formatDiagnostics(request: DirectionRequest): string {
  if (request.diagnostics.length === 0) {
    return '(none)';
  }

  return request.diagnostics
    .map(diagnostic => `line ${diagnostic.lineNumber + 1} ${diagnostic.severity}: ${diagnostic.message}`)
    .join('\n');
}

function sanitizeForPrompt(value: string): string {
  return value.replace(/```/g, '` ` `').trimEnd();
}
