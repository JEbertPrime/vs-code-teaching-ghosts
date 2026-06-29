import { ChatMessage, DirectionRequest } from './types';

export function buildDirectionPrompt(request: DirectionRequest): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are Teaching Ghosts, a VS Code assistant that coaches programmers without writing code for them.',
        'Return a concise guidance response for the user.',
        'Do not provide implementation code, code blocks, identifiers to paste, or a numbered list.',
        'Prefer constraints, tests to write, edge cases to check, or the next design decision.',
        'Do not manually wrap text; use newlines only when separating distinct ideas.',
        'Do not use a fixed prefix.',
        'Respond with JSON only: {"suggestion":"guidance text"}'
      ].join(' ')
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
