import * as assert from 'assert';
import { buildTeachingDirection, formatTeachingDirection } from '../direction';
import { TestCase } from './testCase';

export const directionTests: TestCase[] = [
  {
    name: 'coaches the opposite branch for conditionals',
    run: () => {
      const direction = buildTeachingDirection({
        languageId: 'typescript',
        fileName: '/tmp/example.ts',
        lineText: 'if (user.isAdmin) {',
        prefixText: 'if (user.isAdmin) {',
        documentText: 'if (user.isAdmin) {',
        lineNumber: 3
      });

      assert.match(direction, /^\/\/ Check the opposite branch/);
    }
  },
  {
    name: 'uses hash comments for Python',
    run: () => {
      const direction = buildTeachingDirection({
        languageId: 'python',
        fileName: '/tmp/example.py',
        lineText: 'def load_user(id):',
        prefixText: 'def load_user(id):',
        documentText: 'def load_user(id):',
        lineNumber: 0
      });

      assert.match(direction, /^# List the inputs/);
    }
  },
  {
    name: 'uses block comments for Markdown',
    run: () => {
      const direction = buildTeachingDirection({
        languageId: 'markdown',
        fileName: '/tmp/notes.md',
        lineText: '',
        prefixText: '',
        documentText: '',
        lineNumber: 0
      });

      assert.match(direction, /^<!-- Sketch the behavior .* -->$/);
    }
  },
  {
    name: 'formats multiline line comments',
    run: () => {
      const direction = formatTeachingDirection(
        'typescript',
        'Check the opposite branch.\nName the assertion before editing the branch.'
      );

      assert.strictEqual(
        direction,
        '// Check the opposite branch.\n// Name the assertion before editing the branch.'
      );
    }
  },
  {
    name: 'does not wrap formatted comments locally',
    run: () => {
      const direction = formatTeachingDirection(
        'typescript',
        'Use the failing test name to pin down the behavior before touching the implementation path.'
      );

      assert.strictEqual(
        direction,
        '// Use the failing test name to pin down the behavior before touching the implementation path.'
      );
    }
  }
];
