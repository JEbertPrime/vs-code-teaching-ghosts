export type DirectionProviderId = 'openai-compatible';
export type HintDetail = 'detailed' | 'general' | 'vague';
export type StructuredOutputMode = 'auto' | 'enabled' | 'disabled';

export interface DirectionDiagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  lineNumber: number;
}

export interface DirectionRequest {
  languageId: string;
  fileName: string;
  relativeFilePath: string;
  lineNumber: number;
  lineText: string;
  prefixText: string;
  documentText: string;
  contextBefore: string;
  contextAfter: string;
  diagnostics: DirectionDiagnostic[];
  maxSuggestionLength: number;
  hintDetail: HintDetail;
}

export interface DirectionResult {
  suggestion: string;
  continuation?: string[];
  source: DirectionProviderId;
}

export interface DirectionProvider {
  readonly id: DirectionProviderId;
  getDirection(request: DirectionRequest, signal: AbortSignal): Promise<DirectionResult | undefined>;
}

export interface OpenAiCompatibleConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  responseTokenLimit: number;
  structuredOutputMode: StructuredOutputMode;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}
