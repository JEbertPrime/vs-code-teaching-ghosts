import { directionTests } from './direction.test';
import { extensionTests } from './extension.test';
import { llmTests } from './llm.test';
import { TestCase } from './testCase';

export async function run(): Promise<void> {
  const tests: TestCase[] = [...extensionTests, ...directionTests, ...llmTests];
  const failures: string[] = [];

  for (const test of tests) {
    try {
      await test.run();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failures.push(test.name);
      console.error(`FAIL ${test.name}`);
      console.error(error);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Failed tests: ${failures.join(', ')}`);
  }
}
