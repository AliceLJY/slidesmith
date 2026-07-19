import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const repoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoDir, 'bin', 'cli.mjs');

async function runCli(args) {
  return execFileP(process.execPath, [cli, ...args], {
    cwd: repoDir,
    timeout: 120_000,
  });
}

async function assertPptx(filePath, expectedSlides) {
  const contents = await readFile(filePath);
  assert.equal(contents.subarray(0, 2).toString('ascii'), 'PK', 'output must be a ZIP archive');

  // ZIP entry names are stored uncompressed in the file and provide a
  // dependency-free check for the minimum OOXML presentation structure.
  const archiveText = contents.toString('latin1');
  for (const entry of ['[Content_Types].xml', 'ppt/presentation.xml']) {
    assert.ok(archiveText.includes(entry), `output must contain ${entry}`);
  }

  const slides = new Set(
    [...archiveText.matchAll(/ppt\/slides\/slide(\d+)\.xml/g)].map((match) => match[1]),
  );
  assert.equal(slides.size, expectedSlides, 'output must contain the expected slide count');
}

async function withTempDir(run) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'slidesmith-e2e-'));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('CLI produces a structurally valid PPTX with every expected slide', async () => {
  await withTempDir(async (tempDir) => {
    const output = path.join(tempDir, 'pitch-deck.pptx');
    const { stdout } = await runCli([
      path.join(repoDir, 'examples', 'pitch-deck.html'),
      output,
      '--no-fallback',
    ]);

    assert.match(stdout, /Done in .* 5 slides/);
    await assertPptx(output, 5);
  });
});

test('malformed percent-encoded asset URL does not crash conversion', async () => {
  await withTempDir(async (tempDir) => {
    // Browsers can request a literal '%' from an asset URL. This used to throw
    // URIError in the HTTP request callback and terminate the whole process.
    const input = path.join(tempDir, 'malformed-asset.html');
    const output = path.join(tempDir, 'malformed-asset.pptx');
    await writeFile(
      input,
      '<div class="slide" style="width:1920px;height:1080px"><img src="100%.png"></div>',
    );

    await runCli([input, output, '--screenshots', '--quiet']);
    await assertPptx(output, 1);
  });
});
