export interface TestCase {
  name: string;
  run(): void | Promise<void>;
}
