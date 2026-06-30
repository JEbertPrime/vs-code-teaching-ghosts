import { readFile, writeFile } from 'node:fs/promises';

const manifestPath = new URL('../package.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const configuredPublisher = process.env.VSCE_PUBLISHER?.trim();

if (configuredPublisher) {
  validatePublisher(configuredPublisher);
  if (manifest.publisher !== configuredPublisher) {
    manifest.publisher = configuredPublisher;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Prepared package.json for VS Code Marketplace publisher "${configuredPublisher}".`);
  }
} else if (!manifest.publisher || manifest.publisher === 'local') {
  fail(
    'Set a real package.json "publisher" value, or set the VSCE_PUBLISHER repository variable before publishing.'
  );
}

for (const key of ['name', 'displayName', 'description', 'version', 'publisher']) {
  if (!manifest[key]) {
    fail(`package.json is missing required Marketplace field "${key}".`);
  }
}

function validatePublisher(value) {
  if (/\s/.test(value) || value.includes('/') || value.includes('\\')) {
    fail('VSCE_PUBLISHER must be the Marketplace publisher ID, not a display name or URL.');
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
