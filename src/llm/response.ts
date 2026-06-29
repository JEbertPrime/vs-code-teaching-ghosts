export interface ParsedDirectionResponse {
  suggestion: string;
  continuation: string[];
}

export function parseDirectionResponse(
  content: string,
  maxLength: number
): string | undefined {
  return parseDirectionResponseParts(content, maxLength)?.suggestion;
}

export function parseDirectionResponseParts(
  content: string,
  maxLength: number
): ParsedDirectionResponse | undefined {
  const rawSuggestion = extractSuggestion(content);
  if (!rawSuggestion) {
    return undefined;
  }

  const withoutCodeBlocks = rawSuggestion.replace(/```[\s\S]*?```/g, '').trim();
  if (!withoutCodeBlocks) {
    return undefined;
  }

  const cleanedLines = withoutCodeBlocks
    .split(/\r?\n/)
    .map((line, index) => cleanLine(line, index === 0))
    .filter(Boolean);

  if (cleanedLines.length === 0) {
    return undefined;
  }

  if (cleanedLines.some(line => looksLikeImplementation(line))) {
    return undefined;
  }

  const chunks = splitSuggestion(cleanedLines.join('\n'), maxLength);
  const suggestion = chunks[0];
  return suggestion ? { suggestion, continuation: chunks.slice(1) } : undefined;
}

function extractSuggestion(content: string): string | undefined {
  const trimmed = content.trim();
  const parsed = parseJsonObject(trimmed) ?? parseJsonObject(extractJsonLikeObject(trimmed));
  if (parsed && typeof parsed.suggestion === 'string') {
    return parsed.suggestion;
  }

  if (parsed && typeof parsed.direction === 'string') {
    return parsed.direction;
  }

  return trimmed;
}

function parseJsonObject(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function extractJsonLikeObject(value: string): string | undefined {
  const match = value.match(/\{[\s\S]*\}/);
  return match?.[0];
}

function stripCommentSyntax(value: string): string {
  return value
    .replace(/^\/\/\s*/, '')
    .replace(/^#\s*/, '')
    .replace(/^--\s*/, '')
    .replace(/^\/\*\s*/, '')
    .replace(/\s*\*\/$/, '')
    .replace(/^<!--\s*/, '')
    .replace(/\s*-->$/, '');
}

function cleanLine(value: string, allowSuggestionPrefix: boolean): string {
  let cleaned = stripCommentSyntax(value)
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (allowSuggestionPrefix) {
    cleaned = cleaned.replace(/^suggestion\s*:\s*/i, '').trim();
  }

  return cleaned.replace(/^next\s*:\s*/i, '').trim();
}

function looksLikeImplementation(value: string): boolean {
  if (/^(const|let|var|function|class|if|for|while|return|import|export|def)\b/.test(value)) {
    return true;
  }

  return /[{};]/.test(value) && /[=()]/.test(value);
}

function splitSuggestion(value: string, maxLength: number): string[] {
  if (value.length <= maxLength) {
    return [value];
  }

  const chunks: string[] = [];
  let remaining = value.trim();
  const width = Math.max(20, maxLength);

  while (remaining.length > width) {
    const splitAt = findSplitPoint(remaining, width);
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function findSplitPoint(value: string, maxLength: number): number {
  const window = value.slice(0, maxLength + 1);
  const preferredBreak = Math.max(
    window.lastIndexOf('\n'),
    window.lastIndexOf('. '),
    window.lastIndexOf('; '),
    window.lastIndexOf(', ')
  );

  if (preferredBreak >= Math.floor(maxLength * 0.45)) {
    return preferredBreak + (window[preferredBreak] === '\n' ? 0 : 1);
  }

  const whitespaceBreak = window.search(/\s+\S*$/);
  if (whitespaceBreak >= Math.floor(maxLength * 0.45)) {
    return whitespaceBreak;
  }

  return maxLength;
}
