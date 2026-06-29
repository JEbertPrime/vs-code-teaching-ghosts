import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestCase } from './testCase';

export const extensionTests: TestCase[] = [
  {
    name: 'contributes the next-step command',
    run: async () => {
      const extension = vscode.extensions.getExtension('local.teaching-ghosts');
      assert.ok(extension, 'Expected the local.teaching-ghosts extension to be loaded.');
      await extension.activate();

      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes('teachingGhosts.explainNextStep'));
      assert.ok(commands.includes('teachingGhosts.configureProvider'));
      assert.ok(commands.includes('teachingGhosts.clearApiKey'));
    }
  },
  {
    name: 'contributes stuck-delay and on-demand defaults',
    run: () => {
      const config = vscode.workspace.getConfiguration('teachingGhosts');

      assert.strictEqual(config.get<string>('suggestionMode'), 'automatic');
      assert.strictEqual(config.get<number>('automaticSuggestionDelayMs'), 1800);
    }
  }
];
