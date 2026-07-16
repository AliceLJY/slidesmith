import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cli.mjs');

async function run(args) {
  try {
    const { stdout, stderr } = await execFileP('node', [CLI, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

test('rejects unknown options before conversion', async () => {
  const result = await run(['missing.html', '--bogus']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /unknown option: --bogus/);
});

test('rejects output flags without a value', async () => {
  const result = await run(['missing.html', '-o']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /-o needs a value/);
});

test('rejects extra positional arguments', async () => {
  const result = await run(['one.html', 'two.pptx', 'three.pptx']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /unexpected extra arguments/);
});

test('rejects invalid modes', async () => {
  const result = await run(['missing.html', '--mode', 'video']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /--mode must be/);
});

test('quiet mode suppresses non-error CLI output', async () => {
  const result = await run(['missing.html', '--no-fallback', '--quiet']);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /File not found/);
});

test('version reflects the current implementation', async () => {
  const result = await run(['--version']);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), 'slidesmith v1.1.0');
});
