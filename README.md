# Teaching Ghosts

Teaching Ghosts is a VS Code extension experiment: Copilot-shaped inline suggestions that coach your next move instead of writing the code for you.

It starts with a local heuristic provider, and can optionally call an OpenAI-compatible LLM API for richer guidance. Either way, it uses VS Code inline completions to show comment-only direction such as:

```ts
if (user.isAdmin) { // Check the opposite branch before you commit to this condition.
```

Accepting a hint inserts a comment, not implementation code. Ignoring it leaves the file unchanged.

## What it does

- Shows short directional ghost text at useful moments: blank lines, conditionals, functions, TODOs, imports, tests, and error handling.
- Can use an OpenAI-compatible chat completions API, with heuristics as the fallback.
- Sends bounded nearby context by default, not the whole file.
- Stores API keys in VS Code Secret Storage or reads them from an environment variable.
- Uses the right comment syntax for common languages.
- Provides Command Palette actions:
  - `Teaching Ghosts: Toggle Directional Suggestions`
  - `Teaching Ghosts: Enable Directional Suggestions`
  - `Teaching Ghosts: Disable Directional Suggestions`
  - `Teaching Ghosts: Explain Next Step`
  - `Teaching Ghosts: Configure LLM Provider`
  - `Teaching Ghosts: Clear Stored API Key`
  - `Teaching Ghosts: Use Heuristic Provider`
- Adds a status bar toggle.

## Local Testing Setup

1. Install dependencies:

   ```bash
   cd /Users/jebert/Documents/repos/vs-code-teaching-ghosts
   npm install
   ```

2. Compile once:

   ```bash
   npm run compile
   ```

3. Open the extension project in VS Code:

   ```bash
   code /Users/jebert/Documents/repos/vs-code-teaching-ghosts
   ```

4. Press `F5` and choose `Run Extension`.

   VS Code opens a separate Extension Development Host window with Teaching Ghosts loaded.

5. In the Extension Development Host window, open `samples/playground.ts`.

6. Make sure inline suggestions are enabled:

   ```json
   "editor.inlineSuggest.enabled": true
   ```

7. Try any of these:

   - Put the cursor on a blank line.
   - Put the cursor after an `if (...) {` line.
   - Add a `TODO` comment and invoke inline suggestions.
   - Run `Teaching Ghosts: Explain Next Step` from the Command Palette.

8. Pause for the configured quiet period, then accept an inline hint with `Tab`, or ignore it and keep typing.

## LLM Provider Setup

The extension works without an API key by using the local heuristic provider.

To enable LLM-backed direction in the Extension Development Host:

1. Run `Teaching Ghosts: Configure LLM Provider` from the Command Palette.
2. Review the privacy notice and choose `Continue`.
3. Enter an OpenAI-compatible base URL, for example:

   ```text
   https://api.openai.com/v1
   ```

4. Enter a model name.
5. Choose one API key path:
   - Use an environment variable, default `OPENAI_API_KEY`.
   - Store the key in VS Code Secret Storage.

The provider sends:

- Language ID
- Workspace-relative file path or file name
- Current line and nearby context
- Nearby diagnostics

It does not send the whole file unless `teachingGhosts.sendFullFileContext` is enabled.

If the API key is missing, the request times out, the provider errors, or the response looks like implementation code, Teaching Ghosts falls back to local heuristic direction.

## Test Commands

Run the extension test suite:

```bash
npm test
```

The first run downloads a stable VS Code build for the test runner.

Run TypeScript in watch mode while debugging:

```bash
npm run watch
```

## Settings

```json
{
  "teachingGhosts.enabled": true,
  "teachingGhosts.provider": "heuristic",
  "teachingGhosts.baseUrl": "https://api.openai.com/v1",
  "teachingGhosts.model": "gpt-4.1-mini",
  "teachingGhosts.apiKeyEnvVar": "OPENAI_API_KEY",
  "teachingGhosts.languages": ["typescript", "python", "markdown"],
  "teachingGhosts.maxSuggestionLength": 260,
  "teachingGhosts.showStatusBar": true,
  "teachingGhosts.sendFullFileContext": false,
  "teachingGhosts.maxContextLines": 80,
  "teachingGhosts.requestTimeoutMs": 3500,
  "teachingGhosts.responseTokenLimit": 256,
  "teachingGhosts.suggestionMode": "automatic",
  "teachingGhosts.automaticSuggestionDelayMs": 1800,
  "teachingGhosts.debounceMs": 400,
  "teachingGhosts.llmTriggerMode": "automatic"
}
```

Use `["*"]` for `teachingGhosts.languages` if you want hints in every language.

Use `"teachingGhosts.suggestionMode": "on-demand"` if you only want suggestions after manually invoking inline suggestions or running `Teaching Ghosts: Explain Next Step`.

Responses longer than `teachingGhosts.maxSuggestionLength` are split into continuation chunks instead of ending with `...`. Accept one chunk, then trigger the next inline completion to continue.

## Next Build Ideas

- Add per-language coaching packs for testing, refactoring, accessibility, security, and debugging.
- Add a mode that explains why a hint appeared.
- Add telemetry-free local feedback buttons so the extension can learn which hints help.
