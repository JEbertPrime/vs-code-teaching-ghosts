export interface TeachingDirectionContext {
  languageId: string;
  fileName: string;
  lineText: string;
  prefixText: string;
  documentText: string;
  lineNumber: number;
}

export interface CommentStyle {
  open: string;
  close?: string;
  spacing: 'line' | 'block';
}

const hashLanguages = new Set([
  'python',
  'ruby',
  'shellscript',
  'bash',
  'zsh',
  'fish',
  'perl',
  'r',
  'yaml',
  'dockerfile',
  'makefile'
]);

const dashLanguages = new Set(['sql', 'plsql', 'lua', 'haskell']);
const htmlCommentLanguages = new Set(['html', 'xml', 'markdown', 'mdx', 'vue']);
const blockCommentLanguages = new Set(['css', 'scss', 'less']);

export function buildTeachingDirection(
  context: TeachingDirectionContext,
  maxLength = 260
): string {
  return formatTeachingDirection(context.languageId, buildTeachingAdvice(context, maxLength));
}

export function buildTeachingAdvice(context: TeachingDirectionContext, maxLength = 260): string {
  return truncateAdvice(pickAdvice(context), maxLength);
}

export function formatTeachingDirection(
  languageId: string,
  advice: string
): string {
  return formatComment(getCommentStyle(languageId), advice);
}

export function getCommentStyle(languageId: string): CommentStyle {
  const normalized = languageId.toLowerCase();

  if (hashLanguages.has(normalized)) {
    return { open: '#', spacing: 'line' };
  }

  if (dashLanguages.has(normalized)) {
    return { open: '--', spacing: 'line' };
  }

  if (htmlCommentLanguages.has(normalized)) {
    return { open: '<!--', close: '-->', spacing: 'block' };
  }

  if (blockCommentLanguages.has(normalized)) {
    return { open: '/*', close: '*/', spacing: 'block' };
  }

  return { open: '//', spacing: 'line' };
}

function pickAdvice(context: TeachingDirectionContext): string {
  const fileName = context.fileName.toLowerCase();
  const line = context.prefixText.trim();
  const documentText = context.documentText.trim();
  const lowerLine = line.toLowerCase();
  const lowerDocument = documentText.toLowerCase();

  if (!documentText) {
    return 'Sketch the behavior you want before naming the first symbol.';
  }

  if (isTestFile(fileName)) {
    return 'Name the behavior, arrange only the needed data, then watch it fail.';
  }

  if (/\b(todo|fixme|hack)\b/i.test(line)) {
    return 'Turn the TODO into a specific success condition with scope, location, and verification.';
  }

  if (/^(if|else if|elif|guard|switch|case)\b/.test(lowerLine) || lowerLine.includes('?')) {
    return 'Check the opposite branch before you commit to this condition.';
  }

  if (/\b(catch|except|rescue|error|err)\b/i.test(line)) {
    return 'Decide what the caller should learn from this failure before handling it.';
  }

  if (looksLikeFunction(line)) {
    return 'List the inputs, side effects, and one failure case before filling the body.';
  }

  if (/\b(class|interface|type|struct|enum|record)\b/i.test(line)) {
    return 'Name the responsibility this shape owns, then remove anything outside that boundary.';
  }

  if (/\b(import|require|from)\b/i.test(line)) {
    return 'Add the dependency only after you know which abstraction owns the behavior.';
  }

  if (lowerDocument.includes('throw new error') || lowerDocument.includes('not implemented')) {
    return 'Replace the placeholder with the smallest observable behavior first.';
  }

  if (context.lineText.length > 100) {
    return 'Split the decision from the mechanics so the next reader can scan it.';
  }

  if (context.lineNumber === 0) {
    return 'Write the file purpose in one sentence, then make the first useful move.';
  }

  return 'Write the smallest observable change, then make only that change.';
}

function looksLikeFunction(line: string): boolean {
  return (
    /\bfunction\b/.test(line) ||
    /=>\s*$/.test(line) ||
    /^(async\s+)?def\b/.test(line) ||
    /^(public|private|protected|static|final|async)\b.*\(/.test(line) ||
    /^[A-Za-z_$][\w$]*\s*\([^)]*\)\s*[{:]?$/.test(line)
  );
}

function isTestFile(fileName: string): boolean {
  return (
    fileName.includes('.test.') ||
    fileName.includes('.spec.') ||
    fileName.endsWith('_test.go') ||
    fileName.endsWith('_test.py') ||
    fileName.includes('/test/') ||
    fileName.includes('/tests/')
  );
}

function truncateAdvice(advice: string, maxLength: number): string {
  if (advice.length <= maxLength) {
    return advice;
  }

  return advice.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
}

function formatComment(style: CommentStyle, advice: string): string {
  const lines = advice
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return '';
  }

  if (style.spacing === 'block' && style.close) {
    return formatBlockComment(style, lines);
  }

  return lines.map(line => `${style.open} ${line}`).join('\n');
}

function formatBlockComment(style: CommentStyle, lines: string[]): string {
  if (lines.length === 1) {
    return `${style.open} ${lines[0]} ${style.close}`;
  }

  if (style.open === '/*') {
    return [`${style.open} ${lines[0]}`, ...lines.slice(1).map(line => ` * ${line}`), ` ${style.close}`].join('\n');
  }

  return [`${style.open} ${lines[0]}`, ...lines.slice(1), `${style.close}`].join('\n');
}
