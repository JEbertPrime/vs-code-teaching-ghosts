import * as vscode from 'vscode';
import { formatTeachingDirection, getCommentStyle } from './direction';
import { buildDirectionRequest, DirectionRequestOptions } from './llm/context';
import { OpenAiCompatibleDirectionProvider } from './llm/providers';
import { DirectionProviderId, DirectionRequest } from './llm/types';

const defaultLanguages = [
  'javascript',
  'typescript',
  'javascriptreact',
  'typescriptreact',
  'python',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
  'csharp',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'html',
  'css',
  'scss',
  'markdown',
  'json',
  'yaml'
];

const storedApiKeyKey = 'teachingGhosts.openAiCompatible.apiKey';
const llmConsentKey = 'teachingGhosts.llmConsent.v1';
const acceptContinuationCommand = 'teachingGhosts.acceptContinuationChunk';

let runtimeEnabled: boolean | undefined;
let statusBar: vscode.StatusBarItem;
let output: vscode.OutputChannel;
let directionEngine: DirectionEngine;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('Teaching Ghosts');
  directionEngine = new DirectionEngine(context, output);
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'teachingGhosts.toggle';

  context.subscriptions.push(output, statusBar);
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      [
        { scheme: 'file' },
        { scheme: 'untitled' }
      ],
      new TeachingGhostsInlineProvider(directionEngine)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('teachingGhosts.toggle', async () => {
      await setRuntimeEnabled(!isEnabled());
    }),
    vscode.commands.registerCommand('teachingGhosts.enable', async () => {
      await setRuntimeEnabled(true);
    }),
    vscode.commands.registerCommand('teachingGhosts.disable', async () => {
      await setRuntimeEnabled(false);
    }),
    vscode.commands.registerCommand('teachingGhosts.explainNextStep', explainNextStep),
    vscode.commands.registerCommand('teachingGhosts.configureProvider', () => configureProvider(context)),
    vscode.commands.registerCommand('teachingGhosts.clearApiKey', () => clearStoredApiKey(context)),
    vscode.commands.registerCommand(
      acceptContinuationCommand,
      (uri: string, continuation: string[]) => directionEngine.setAcceptedContinuation(uri, continuation)
    ),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('teachingGhosts')) {
        directionEngine.clearCache();
        updateStatusBar();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar)
  );

  updateStatusBar();
}

export function deactivate(): void {
  statusBar?.dispose();
  output?.dispose();
}

class TeachingGhostsInlineProvider implements vscode.InlineCompletionItemProvider {
  constructor(private readonly engine: DirectionEngine) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[]> {
    const hasContinuation = this.engine.hasAcceptedContinuation(document);
    if (token.isCancellationRequested || !shouldOfferDirection(document, position, context, hasContinuation)) {
      return [];
    }

    const direction = await this.engine.getDirection(document, position, token, {
      allowConsentPrompt: false,
      allowLlm: context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke,
      isManualInvocation: context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke
    });

    if (!direction) {
      return [];
    }

    const line = document.lineAt(position.line).text;
    const insertText =
      line.trim().length === 0 ? direction.text : direction.isContinuation ? `\n${direction.text}` : ` ${direction.text}`;
    const item = new vscode.InlineCompletionItem(insertText, new vscode.Range(position, position));
    if (direction.isContinuation || direction.continuation.length > 0) {
      item.command = {
        command: acceptContinuationCommand,
        title: 'Continue Teaching Ghosts response',
        arguments: [document.uri.toString(), direction.continuation]
      };
    }

    return [item];
  }
}

function shouldOfferDirection(
  document: vscode.TextDocument,
  position: vscode.Position,
  context: vscode.InlineCompletionContext,
  hasContinuation = false
): boolean {
  if (!isEnabled() || !isLanguageEnabled(document.languageId)) {
    return false;
  }

  const line = document.lineAt(position.line);
  if (position.character !== line.text.length) {
    return false;
  }

  const isManualInvocation = context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;
  if (!isManualInvocation && getSuggestionMode() === 'on-demand') {
    return false;
  }

  if (hasContinuation) {
    return true;
  }

  const prefix = line.text.slice(0, position.character);
  if (isInsideExistingComment(document.languageId, prefix)) {
    return false;
  }

  if (isManualInvocation) {
    return true;
  }

  return prefix.trim().length === 0 || looksWorthNudging(prefix);
}

async function explainNextStep(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage('Open a file first, then ask Teaching Ghosts for the next step.');
    return;
  }

  const position = editor.selection.active;
  const cancellation = new vscode.CancellationTokenSource();
  const direction = await directionEngine.getDirection(editor.document, position, cancellation.token, {
    allowConsentPrompt: true,
    allowLlm: true,
    isManualInvocation: true
  });
  cancellation.dispose();

  if (!direction) {
    void vscode.window.showInformationMessage('Teaching Ghosts did not find a useful next step here.');
    return;
  }

  const location = `${vscode.workspace.asRelativePath(editor.document.uri)}:${position.line + 1}`;
  output.appendLine(`[${new Date().toLocaleTimeString()}] ${location}`);
  output.appendLine(direction.text);
  if (direction.continuation.length > 0) {
    output.appendLine('');
    output.appendLine(`Continuation available: ${direction.continuation.length} more chunk(s).`);
  }
  output.appendLine('');
  output.show(true);
}

async function configureProvider(context: vscode.ExtensionContext): Promise<void> {
  const consent = await directionEngine.ensureLlmConsent(true);
  if (!consent) {
    return;
  }

  const config = getConfig();
  const baseUrl = await vscode.window.showInputBox({
    title: 'Teaching Ghosts LLM Provider',
    prompt: 'OpenAI-compatible base URL',
    value: config.get<string>('baseUrl', 'https://api.openai.com/v1'),
    ignoreFocusOut: true
  });

  if (baseUrl === undefined) {
    return;
  }

  const model = await vscode.window.showInputBox({
    title: 'Teaching Ghosts LLM Provider',
    prompt: 'Model name',
    value: config.get<string>('model', 'gpt-4.1-mini'),
    ignoreFocusOut: true
  });

  if (model === undefined) {
    return;
  }

  const keyMode = await vscode.window.showQuickPick(
    [
      {
        label: 'Use environment variable',
        detail: `Current setting: ${config.get<string>('apiKeyEnvVar', 'OPENAI_API_KEY')}`
      },
      {
        label: 'Store API key in VS Code Secret Storage',
        detail: 'Stored locally by VS Code, not in settings.json.'
      },
      {
        label: 'No API key',
        detail: 'Use this for local OpenAI-compatible endpoints that do not require authentication.'
      },
      {
        label: 'Skip API key for now',
        detail: 'No suggestions will appear until an API key is available.'
      }
    ],
    {
      title: 'Teaching Ghosts API Key',
      placeHolder: 'Choose how Teaching Ghosts should find the API key',
      ignoreFocusOut: true
    }
  );

  if (!keyMode) {
    return;
  }

  await config.update('baseUrl', baseUrl.trim(), vscode.ConfigurationTarget.Global);
  await config.update('model', model.trim(), vscode.ConfigurationTarget.Global);
  await config.update('provider', 'openai-compatible', vscode.ConfigurationTarget.Global);
  await config.update(
    'requireApiKey',
    keyMode.label !== 'No API key',
    vscode.ConfigurationTarget.Global
  );

  if (keyMode.label === 'Use environment variable') {
    const envVar = await vscode.window.showInputBox({
      title: 'Teaching Ghosts API Key',
      prompt: 'Environment variable name',
      value: config.get<string>('apiKeyEnvVar', 'OPENAI_API_KEY'),
      ignoreFocusOut: true
    });

    if (envVar !== undefined) {
      await config.update('apiKeyEnvVar', envVar.trim() || 'OPENAI_API_KEY', vscode.ConfigurationTarget.Global);
    }
  }

  if (keyMode.label === 'Store API key in VS Code Secret Storage') {
    const apiKey = await vscode.window.showInputBox({
      title: 'Teaching Ghosts API Key',
      prompt: 'Paste API key. It will be stored in VS Code Secret Storage.',
      password: true,
      ignoreFocusOut: true
    });

    if (apiKey) {
      await context.secrets.store(storedApiKeyKey, apiKey.trim());
    }
  }

  if (keyMode.label === 'No API key') {
    await context.secrets.delete(storedApiKeyKey);
  }

  directionEngine.clearCache();
  updateStatusBar();
  void vscode.window.showInformationMessage('Teaching Ghosts LLM provider configured.');
}

async function clearStoredApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(storedApiKeyKey);
  directionEngine.clearCache();
  void vscode.window.showInformationMessage('Teaching Ghosts stored API key cleared.');
}

async function setRuntimeEnabled(value: boolean): Promise<void> {
  runtimeEnabled = value;
  await vscode.commands.executeCommand('setContext', 'teachingGhosts.enabled', value);
  updateStatusBar();
  void vscode.window.showInformationMessage(`Teaching Ghosts ${value ? 'enabled' : 'disabled'} for this window.`);
}

function isEnabled(): boolean {
  return runtimeEnabled ?? getConfig().get<boolean>('enabled', true);
}

function isLanguageEnabled(languageId: string): boolean {
  const languages = getConfig().get<string[]>('languages', defaultLanguages);
  return languages.includes('*') || languages.includes(languageId);
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('teachingGhosts');
}

function updateStatusBar(): void {
  if (!statusBar) {
    return;
  }

  const show = getConfig().get<boolean>('showStatusBar', true);
  if (!show) {
    statusBar.hide();
    return;
  }

  const enabled = isEnabled();
  const provider = getProviderId();
  const mode = getSuggestionMode();
  statusBar.text = enabled ? '$(lightbulb) Teaching Ghosts' : '$(circle-slash) Teaching Ghosts';
  statusBar.tooltip = enabled
    ? `Teaching Ghosts is offering comment-only direction via ${provider} in ${mode} mode. Click to disable.`
    : 'Teaching Ghosts is paused. Click to enable.';
  statusBar.show();
}

function isInsideExistingComment(languageId: string, prefix: string): boolean {
  const trimmed = prefix.trimStart();
  const style = getCommentStyle(languageId);
  return trimmed.startsWith(style.open) || trimmed.startsWith('*') || trimmed.startsWith(style.close ?? '\u0000');
}

function looksWorthNudging(prefix: string): boolean {
  const trimmed = prefix.trim();
  return (
    trimmed.length === 0 ||
    /[{:?]$/.test(trimmed) ||
    /\b(todo|fixme|hack|catch|except|rescue|error|err)\b/i.test(trimmed) ||
    /\b(function|class|interface|type|struct|enum|import|require|from|if|else if|elif|switch|case)\b/i.test(trimmed) ||
    /=>\s*$/.test(trimmed)
  );
}

interface DirectionEngineOptions {
  allowConsentPrompt: boolean;
  allowLlm: boolean;
  isManualInvocation: boolean;
}

interface DirectionChunk {
  suggestion: string;
  continuation: string[];
}

interface RenderedDirection {
  text: string;
  continuation: string[];
  isContinuation: boolean;
}

class DirectionEngine {
  private readonly cache = new Map<string, DirectionChunk>();
  private readonly pending = new Map<string, Promise<DirectionChunk | undefined>>();
  private readonly acceptedContinuations = new Map<string, string[]>();
  private consentNoticeShown = false;
  private missingKeyNoticeShown = false;
  private lastProviderError = '';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly channel: vscode.OutputChannel
  ) {}

  clearCache(): void {
    this.cache.clear();
    this.pending.clear();
    this.acceptedContinuations.clear();
    this.lastProviderError = '';
  }

  hasAcceptedContinuation(document: vscode.TextDocument): boolean {
    return (this.acceptedContinuations.get(document.uri.toString())?.length ?? 0) > 0;
  }

  setAcceptedContinuation(uri: string, continuation: string[]): void {
    const remaining = continuation.filter(Boolean);
    if (remaining.length === 0) {
      this.acceptedContinuations.delete(uri);
      return;
    }

    this.acceptedContinuations.set(uri, remaining);
  }

  async getDirection(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    options: DirectionEngineOptions
  ): Promise<RenderedDirection | undefined> {
    const request = buildDirectionRequest(document, position, getRequestOptions());

    if (!options.isManualInvocation && !(await waitForQuietPeriod(token, getAutomaticSuggestionDelayMs()))) {
      return undefined;
    }

    if (!options.isManualInvocation && !(await waitForQuietPeriod(token, getConfig().get<number>('debounceMs', 400)))) {
      return undefined;
    }

    const continuation = this.getContinuationChunk(document);
    if (continuation) {
      return this.renderChunk(request, continuation, true);
    }

    const key = this.getCacheKey(document, position, request, options);
    const cached = this.cache.get(key);
    if (cached) {
      return this.renderChunk(request, cached, false);
    }

    const pending = this.pending.get(key);
    if (pending) {
      const suggestion = await pending;
      return suggestion ? this.renderChunk(request, suggestion, false) : undefined;
    }

    const work = this.resolveSuggestion(request, token, options).then(suggestion => {
      if (suggestion) {
        this.remember(key, suggestion);
      }

      return suggestion;
    });

    this.pending.set(key, work);
    try {
      const suggestion = await work;
      return suggestion ? this.renderChunk(request, suggestion, false) : undefined;
    } finally {
      this.pending.delete(key);
    }
  }

  async ensureLlmConsent(allowPrompt: boolean): Promise<boolean> {
    if (this.context.globalState.get<boolean>(llmConsentKey, false)) {
      return true;
    }

    if (!allowPrompt) {
      if (!this.consentNoticeShown) {
        this.consentNoticeShown = true;
        this.channel.appendLine(
          'LLM provider is configured but not enabled yet. Run "Teaching Ghosts: Configure LLM Provider" to approve sending bounded editor context.'
        );
      }

      return false;
    }

    const answer = await vscode.window.showWarningMessage(
      'Teaching Ghosts can send nearby editor context, diagnostics, language, and file name to your configured LLM provider. It will not send full files unless you enable full-file context.',
      { modal: true },
      'Continue',
      'Cancel'
    );

    if (answer !== 'Continue') {
      return false;
    }

    await this.context.globalState.update(llmConsentKey, true);
    return true;
  }

  private async resolveSuggestion(
    request: DirectionRequest,
    token: vscode.CancellationToken,
    options: DirectionEngineOptions
  ): Promise<DirectionChunk | undefined> {
    if (getProviderId() !== 'openai-compatible') {
      return undefined;
    }

    const triggerMode = getConfig().get<string>('llmTriggerMode', 'automatic');
    if (triggerMode === 'manual-only' && !options.allowLlm) {
      return undefined;
    }

    if (!(await this.ensureLlmConsent(options.allowConsentPrompt))) {
      return undefined;
    }

    const apiKey = await this.getApiKey();
    const baseUrl = getConfig().get<string>('baseUrl', 'https://api.openai.com/v1').trim();
    const model = getConfig().get<string>('model', 'gpt-4.1-mini').trim();
    const responseTokenLimit = getConfig().get<number>('responseTokenLimit', 256);
    const requireApiKey = getConfig().get<boolean>('requireApiKey', true);
    if ((requireApiKey && !apiKey) || !baseUrl || !model) {
      this.reportMissingKeyOnce();
      return undefined;
    }

    const abort = createAbortSignal(token, getConfig().get<number>('requestTimeoutMs', 3500));
    try {
      const result = await new OpenAiCompatibleDirectionProvider({
        apiKey,
        baseUrl,
        model,
        responseTokenLimit
      }).getDirection(request, abort.signal);
      return result ? { suggestion: result.suggestion, continuation: result.continuation ?? [] } : undefined;
    } catch (error) {
      if (token.isCancellationRequested) {
        return undefined;
      }

      this.reportProviderError(error, abort.timedOut);
      return undefined;
    } finally {
      abort.dispose();
    }
  }

  private async getApiKey(): Promise<string | undefined> {
    const envVar = getConfig().get<string>('apiKeyEnvVar', 'OPENAI_API_KEY').trim();
    const envKey = envVar ? process.env[envVar]?.trim() : undefined;
    if (envKey) {
      return envKey;
    }

    return (await this.context.secrets.get(storedApiKeyKey))?.trim();
  }

  private reportMissingKeyOnce(): void {
    if (this.missingKeyNoticeShown) {
      return;
    }

    this.missingKeyNoticeShown = true;
    this.channel.appendLine(
      'No Teaching Ghosts API key was found. Set the configured env var, run "Teaching Ghosts: Configure LLM Provider", or disable API-key requirements for a local no-auth endpoint.'
    );
  }

  private reportProviderError(error: unknown, timedOut: boolean): void {
    const message = timedOut ? 'LLM request timed out' : error instanceof Error ? error.message : String(error);
    if (message === this.lastProviderError) {
      return;
    }

    this.lastProviderError = message;
    this.channel.appendLine(`${message}. No suggestion was shown.`);
  }

  private remember(key: string, suggestion: DirectionChunk): void {
    this.cache.set(key, suggestion);
    if (this.cache.size <= 100) {
      return;
    }

    const firstKey = this.cache.keys().next().value as string | undefined;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }

  private getContinuationChunk(document: vscode.TextDocument): DirectionChunk | undefined {
    const queue = this.acceptedContinuations.get(document.uri.toString());
    if (!queue || queue.length === 0) {
      return undefined;
    }

    return {
      suggestion: queue[0],
      continuation: queue.slice(1)
    };
  }

  private renderChunk(request: DirectionRequest, chunk: DirectionChunk, isContinuation: boolean): RenderedDirection {
    return {
      text: formatTeachingDirection(request.languageId, chunk.suggestion),
      continuation: chunk.continuation,
      isContinuation
    };
  }

  private getCacheKey(
    document: vscode.TextDocument,
    position: vscode.Position,
    request: DirectionRequest,
    options: DirectionEngineOptions
  ): string {
    return [
      document.uri.toString(),
      document.version,
      position.line,
      position.character,
      request.lineText,
      getProviderId(),
      getConfig().get<string>('model', ''),
      getConfig().get<string>('baseUrl', ''),
      getConfig().get<number>('responseTokenLimit', 256),
      getConfig().get<string>('llmTriggerMode', 'automatic'),
      options.isManualInvocation ? 'manual' : 'auto',
      request.maxSuggestionLength
    ].join('|');
  }
}

function getProviderId(): DirectionProviderId {
  return 'openai-compatible';
}

function getSuggestionMode(): 'automatic' | 'on-demand' {
  return getConfig().get<string>('suggestionMode', 'automatic') === 'on-demand' ? 'on-demand' : 'automatic';
}

function getAutomaticSuggestionDelayMs(): number {
  const configured = getConfig().get<number>('automaticSuggestionDelayMs', 1800);
  if (!Number.isFinite(configured)) {
    return 1800;
  }

  return Math.max(0, Math.min(10000, Math.floor(configured)));
}

function getRequestOptions(): DirectionRequestOptions {
  return {
    sendFullFileContext: getConfig().get<boolean>('sendFullFileContext', false),
    maxContextLines: getConfig().get<number>('maxContextLines', 80),
    maxSuggestionLength: getConfig().get<number>('maxSuggestionLength', 260)
  };
}

async function waitForQuietPeriod(token: vscode.CancellationToken, delayMs: number): Promise<boolean> {
  if (token.isCancellationRequested) {
    return false;
  }

  if (delayMs <= 0) {
    return !token.isCancellationRequested;
  }

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      subscription.dispose();
      resolve(!token.isCancellationRequested);
    }, delayMs);

    const subscription = token.onCancellationRequested(() => {
      clearTimeout(timer);
      subscription.dispose();
      resolve(false);
    });
  });
}

function createAbortSignal(
  token: vscode.CancellationToken,
  timeoutMs: number
): { signal: AbortSignal; timedOut: boolean; dispose(): void } {
  const controller = new AbortController();
  const state = {
    signal: controller.signal,
    timedOut: false,
    dispose: () => {
      clearTimeout(timer);
      subscription.dispose();
    }
  };
  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, timeoutMs);
  const subscription = token.onCancellationRequested(() => controller.abort());

  return state;
}
