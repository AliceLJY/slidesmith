import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../lib/converter.mjs';

test('programmatic API rejects unknown modes before opening files', async () => {
  await assert.rejects(
    convert('unused.html', 'unused.pptx', { mode: 'video' }),
    /mode must be 'editable' or 'screenshots'/,
  );
});

test('programmatic API rejects non-finite screenshot scales', async () => {
  await assert.rejects(
    convert('unused.html', 'unused.pptx', { mode: 'screenshots', scale: Infinity }),
    /scale must be a finite positive number/,
  );
});
